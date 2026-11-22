// Backseat View mini camera: Seeed Studio XIAO ESP32S3 Sense.
//
// Joins your phone's Personal Hotspot (or the car's Wi-Fi), announces itself as
// "_backseatview._tcp" and streams to the Backseat View app with the same simple
// messages the iPhone camera uses: [type 1 byte][length 4 bytes big-endian][payload].
//   driver -> camera: 1 hello (any code is accepted; the hotspot password is the lock)
//   camera -> driver: 2 welcome, 5 JPEG picture (~2 a second), 6 sound (16 kHz mono 16-bit little-endian)
// Crying and movement are worked out on the phone.
//
// Wi-Fi setup: the install page (weltzcraft.com/backseatview/camera) sends the
// network name + password over USB (Improv). Or, for 3 minutes after switching on,
// join the "Backseat Camera Setup" Wi-Fi and open http://192.168.4.1

#include <WiFi.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <WebServer.h>
#include "esp_camera.h"
#include "ESP_I2S.h"
#include "ImprovWiFiLibrary.h"

#define FIRMWARE_VERSION "1.0"
#define STREAM_PORT 8765
#define LED_PIN 21  // user LED, on when LOW

// XIAO ESP32S3 Sense camera connector
#define XCLK_GPIO_NUM 10
#define SIOD_GPIO_NUM 40
#define SIOC_GPIO_NUM 39
#define Y9_GPIO_NUM 48
#define Y8_GPIO_NUM 11
#define Y7_GPIO_NUM 12
#define Y6_GPIO_NUM 14
#define Y5_GPIO_NUM 16
#define Y4_GPIO_NUM 18
#define Y3_GPIO_NUM 17
#define Y2_GPIO_NUM 15
#define VSYNC_GPIO_NUM 38
#define HREF_GPIO_NUM 47
#define PCLK_GPIO_NUM 13

// XIAO ESP32S3 Sense microphone (PDM)
#define MIC_CLOCK_PIN 42
#define MIC_DATA_PIN 41
#define MIC_GAIN 4

Preferences prefs;
WebServer setupPage(80);
WiFiServer streamServer(STREAM_PORT);
WiFiClient viewer;
ImprovWiFi improv(&Serial);
I2SClass mic;
StreamBufferHandle_t soundBuffer;

bool cameraReady = false;
bool micReady = false;
bool setupNetworkOn = false;
bool viewerPaired = false;
bool mdnsStarted = false;
uint32_t lastPicture = 0;
uint32_t setupNetworkUntil = 0;

// ---------- sending ----------

bool sendPacket(uint8_t type, const uint8_t *data, size_t length) {
  if (!viewer || !viewer.connected()) return false;
  uint8_t header[5] = {type, (uint8_t)(length >> 24), (uint8_t)(length >> 16), (uint8_t)(length >> 8), (uint8_t)length};
  if (viewer.write(header, 5) != 5) return false;
  size_t sent = 0;
  while (sent < length) {
    size_t n = viewer.write(data + sent, length - sent);
    if (n == 0) return false;
    sent += n;
  }
  return true;
}

// ---------- microphone (runs on its own task so pictures don't make the sound skip) ----------

void soundTask(void *) {
  static int16_t samples[512];
  for (;;) {
    size_t got = mic.readBytes((char *)samples, sizeof(samples));
    if (got == 0) { vTaskDelay(1); continue; }
    size_t count = got / 2;
    for (size_t i = 0; i < count; i++) {
      int32_t louder = (int32_t)samples[i] * MIC_GAIN;
      samples[i] = (int16_t)constrain(louder, -32768, 32767);
    }
    xStreamBufferSend(soundBuffer, samples, count * 2, 0);  // drops if the phone falls behind
  }
}

void startMic() {
  mic.setPinsPdmRx(MIC_CLOCK_PIN, MIC_DATA_PIN);
  if (!mic.begin(I2S_MODE_PDM_RX, 16000, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO)) {
    Serial.println("Microphone did not start");
    return;
  }
  soundBuffer = xStreamBufferCreate(32 * 1024, 1);
  xTaskCreatePinnedToCore(soundTask, "sound", 4096, nullptr, 2, nullptr, 0);
  micReady = true;
}

// ---------- camera ----------

void startCamera() {
  camera_config_t config = {};
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = -1;
  config.pin_reset = -1;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = FRAMESIZE_VGA;
  config.jpeg_quality = 14;
  config.fb_count = 2;
  config.fb_location = CAMERA_FB_IN_PSRAM;
  config.grab_mode = CAMERA_GRAB_LATEST;
  if (esp_camera_init(&config) != ESP_OK) {
    Serial.println("Camera did not start. Is the camera board clipped on?");
    return;
  }
  sensor_t *sensor = esp_camera_sensor_get();
  if (sensor) {
    sensor->set_gain_ctrl(sensor, 1);
    sensor->set_exposure_ctrl(sensor, 1);
    sensor->set_aec2(sensor, 1);  // better in a dim back seat
  }
  cameraReady = true;
}

// ---------- Wi-Fi ----------

void joinSavedNetwork() {
  String ssid = prefs.getString("ssid", "");
  if (ssid.isEmpty()) return;
  WiFi.begin(ssid.c_str(), prefs.getString("pass", "").c_str());
}

bool improvConnect(const char *ssid, const char *password) {
  WiFi.begin(ssid, password);
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) delay(250);
  if (WiFi.status() != WL_CONNECTED) return false;
  prefs.putString("ssid", ssid);
  prefs.putString("pass", password);
  return true;
}

const char SETUP_HTML[] PROGMEM = R"HTML(<!doctype html><html><head><meta name=viewport content="width=device-width,initial-scale=1">
<title>Backseat Camera</title><style>body{font-family:-apple-system,sans-serif;background:#0f1c33;color:#fff;padding:24px;max-width:420px;margin:auto}
input,button{width:100%;font-size:18px;padding:12px;margin:6px 0 14px;border-radius:10px;border:0;box-sizing:border-box}button{background:#82deba;font-weight:700}</style></head>
<body><h2>Backseat Camera</h2><p>Type your iPhone's Personal Hotspot name and password (Settings &gt; Personal Hotspot). Turn on <b>Maximize Compatibility</b> there too.</p>
<form method=post action=/save><label>Wi-Fi name</label><input name=ssid autocapitalize=none required><label>Password</label><input name=pass type=password><button>Save</button></form></body></html>)HTML";

void startSetupNetwork() {
  WiFi.softAP("Backseat Camera Setup");
  setupPage.on("/", []() { setupPage.send_P(200, "text/html", SETUP_HTML); });
  setupPage.on("/save", HTTP_POST, []() {
    prefs.putString("ssid", setupPage.arg("ssid"));
    prefs.putString("pass", setupPage.arg("pass"));
    setupPage.send(200, "text/html", "<meta name=viewport content='width=device-width'><body style='font-family:sans-serif;padding:24px'><h2>Saved</h2><p>The camera is restarting and will join that network. You can close this page.</p>");
    delay(800);
    ESP.restart();
  });
  setupPage.begin();
  setupNetworkOn = true;
  setupNetworkUntil = millis() + 3 * 60 * 1000;
}

void stopSetupNetwork() {
  setupPage.stop();
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  setupNetworkOn = false;
}

// ---------- viewer ----------

void acceptViewer() {
  WiFiClient incoming = streamServer.accept();
  if (!incoming) return;
  if (viewer && viewer.connected()) viewer.stop();  // newest phone wins
  viewer = incoming;
  viewer.setNoDelay(true);
  viewerPaired = false;
  if (micReady) xStreamBufferReset(soundBuffer);
}

void readFromViewer() {
  if (!viewer || !viewer.connected() || viewer.available() < 5) return;
  uint8_t header[5];
  viewer.read(header, 5);
  uint32_t length = (uint32_t)header[1] << 24 | (uint32_t)header[2] << 16 | (uint32_t)header[3] << 8 | header[4];
  uint32_t until = millis() + 500;
  while (length > 0 && millis() < until) {
    if (viewer.available()) { viewer.read(); length--; } else delay(1);
  }
  if (header[0] == 1) {  // hello
    viewerPaired = true;
    sendPacket(2, nullptr, 0);
  }
}

void streamToViewer() {
  if (!viewerPaired) return;
  if (micReady) {
    static uint8_t sound[2048];
    size_t got = xStreamBufferReceive(soundBuffer, sound, sizeof(sound), 0);
    if (got > 0 && !sendPacket(6, sound, got)) { viewer.stop(); return; }
  }
  if (cameraReady && millis() - lastPicture >= 500) {
    lastPicture = millis();
    camera_fb_t *picture = esp_camera_fb_get();
    if (picture) {
      bool ok = sendPacket(5, picture->buf, picture->len);
      esp_camera_fb_return(picture);
      if (!ok) viewer.stop();
    }
  }
}

// ---------- main ----------

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);
  prefs.begin("backseat", false);

  startCamera();
  startMic();

  WiFi.mode(WIFI_AP_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  WiFi.setHostname("backseat-camera");
  joinSavedNetwork();
  startSetupNetwork();

  improv.setDeviceInfo(ImprovTypes::ChipFamily::CF_ESP32_S3, "Backseat Camera", FIRMWARE_VERSION, "Backseat Camera",
                       "https://weltzcraft.com/backseatview/camera/ready.html");
  improv.setCustomConnectWiFi(improvConnect);

  streamServer.begin();
  streamServer.setNoDelay(true);
}

void loop() {
  improv.handleSerial();

  if (setupNetworkOn) {
    setupPage.handleClient();
    // Keep the setup Wi-Fi only for the first 3 minutes once a network is saved.
    if (millis() > setupNetworkUntil && !prefs.getString("ssid", "").isEmpty() && WiFi.softAPgetStationNum() == 0) stopSetupNetwork();
  }

  bool online = WiFi.status() == WL_CONNECTED;
  if (online && !mdnsStarted) {
    if (MDNS.begin("backseat-camera")) {
      MDNS.setInstanceName("Backseat Camera");
      MDNS.addService("backseatview", "tcp", STREAM_PORT);
      mdnsStarted = true;
    }
  } else if (!online && mdnsStarted) {
    MDNS.end();
    mdnsStarted = false;
  }

  // LED: slow blink = looking for Wi-Fi, short flash every 3 s = streaming, off = waiting for the phone.
  uint32_t now = millis();
  if (!online) digitalWrite(LED_PIN, (now / 500) % 2 ? LOW : HIGH);
  else if (viewerPaired) digitalWrite(LED_PIN, (now % 3000) < 60 ? LOW : HIGH);
  else digitalWrite(LED_PIN, HIGH);

  if (online) {
    if (streamServer.hasClient()) acceptViewer();
    readFromViewer();
    streamToViewer();
    if (viewer && !viewer.connected()) { viewer.stop(); viewerPaired = false; }
  }
  delay(1);
}
