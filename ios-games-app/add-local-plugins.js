// `cap sync` lists only npm plugins in the app's capacitor.config.json (packageClassList), and Capacitor
// loads the native plugins named there at startup. Add the app's own plugins (ios/App/App/*.swift) too.
const fs = require('fs');
const path = require('path');

const LOCAL_PLUGINS = ['NearbyPlugin', 'AuthSessionPlugin'];
const file = path.join(__dirname, 'ios/App/App/capacitor.config.json');
const config = JSON.parse(fs.readFileSync(file, 'utf8'));
config.packageClassList = [...new Set([...(config.packageClassList || []), ...LOCAL_PLUGINS])];
fs.writeFileSync(file, `${JSON.stringify(config, null, '\t')}\n`);
console.log(`Native plugins: ${config.packageClassList.join(', ')}`);

// The app opens on the games hub (server.appStartPath "hood-games"). Capacitor refuses to start unless
// that path exists in the copied website, though the page itself is index.html like every site route
// (its router hands paths with no file extension to index.html). So leave a folder there for the check.
const hubDir = path.join(__dirname, 'ios/App/App/public/hood-games');
fs.mkdirSync(hubDir, { recursive: true });
fs.writeFileSync(path.join(hubDir, 'README.txt'), 'Placeholder so Capacitor finds the app start path; the page is /index.html.\n');
console.log('App start path: /hood-games');
