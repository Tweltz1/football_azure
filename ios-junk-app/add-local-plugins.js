// `cap sync` lists only npm plugins in the app's capacitor.config.json (packageClassList), and Capacitor
// loads the native plugins named there at startup. Add the app's own sign-in sheet plugin
// (ios/App/App/HoodViewController.swift) too. NearbyPlugin.swift is compiled but not loaded: the Junk App
// doesn't do nearby-phone drafts, so it never asks for Local Network access.
const fs = require('fs');
const path = require('path');

const LOCAL_PLUGINS = ['AuthSessionPlugin', 'TripPlugin', 'ItemVisionPlugin', 'PhotoSafetyPlugin'];
const file = path.join(__dirname, 'ios/App/App/capacitor.config.json');
const config = JSON.parse(fs.readFileSync(file, 'utf8'));
config.packageClassList = [...new Set([...(config.packageClassList || []).filter((c) => c !== 'NearbyPlugin'), ...LOCAL_PLUGINS])];
fs.writeFileSync(file, `${JSON.stringify(config, null, '\t')}\n`);
console.log(`Native plugins: ${config.packageClassList.join(', ')}`);

// The app opens on /junk (server.appStartPath). Capacitor refuses to start unless that path exists in the
// copied website, though the page itself is index.html like every site route. Leave a folder there for the check.
const startDir = path.join(__dirname, 'ios/App/App/public/junk');
fs.mkdirSync(startDir, { recursive: true });
fs.writeFileSync(path.join(startDir, 'README.txt'), 'Placeholder so Capacitor finds the app start path; the page is /index.html.\n');
console.log('App start path: /junk');

// On-phone object detector (see ItemVisionPlugin): the build downloads the Core ML model into models/;
// copy it into the app's bundled files. Without it the app still runs, with Apple's classifier only.
const modelsDir = path.join(__dirname, 'models');
const outDir = path.join(__dirname, 'ios/App/App/public/models');
const models = fs.existsSync(modelsDir) ? fs.readdirSync(modelsDir).filter((f) => f.endsWith('.mlmodel')) : [];
if (models.length) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const m of models) fs.copyFileSync(path.join(modelsDir, m), path.join(outDir, m));
}
console.log(`Object detection models: ${models.join(', ') || 'none'}`);
