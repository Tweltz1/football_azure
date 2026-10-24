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
