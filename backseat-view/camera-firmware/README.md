# Backseat View mini camera firmware

Hardware: Seeed Studio XIAO ESP32S3 **Sense** (camera + microphone board), a 3.7 V LiPo battery
(JST 1.25 or soldered to the BAT pads; 1000-2000 mAh), and a small case. Charges over USB-C.

- Built by `.github/workflows/backseat-camera-firmware.yml` (arduino-cli, esp32 core 3.x,
  library "ImprovWiFiLibrary"). Output: `BackseatCam.ino.merged.bin` (flash at offset 0).
- Installed from https://weltzcraft.com/backseatview/camera/ (ESP Web Tools, Chrome/Edge on a computer),
  which also sends the Wi-Fi name and password (Improv Serial).
- Wi-Fi can be changed later: for 3 minutes after switching on, join "Backseat Camera Setup" and open http://192.168.4.1
- Protocol: same framed TCP messages as the iPhone camera (see `../App/Link.swift`), port 8765,
  Bonjour `_backseatview._tcp`. The phone also tries 172.20.10.2-14 (iPhone hotspot addresses) directly.
