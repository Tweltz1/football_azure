// Nearby phones with no internet, only inside the Hood League iPhone app
// (ios-app/ios/App/App/NearbyPlugin.swift). On the website isAvailable() is false.
//
//   await Nearby.host({ name: 'Tyler', room: '4821' });   // commissioner
//   await Nearby.join({ name: 'Sam', room: '4821' });     // players
//   Nearby.addListener('peerState', ({ peerId, name, state }) => ...);
//   Nearby.addListener('message', ({ peerId, name, data }) => JSON.parse(data));
//   await Nearby.send({ data: JSON.stringify(msg), to: [hostPeerId] });
//
// Keep the auction blind: players send bids to the host only, and the host
// sends everyone just the winning bid after the timer ends.

// The app's native code puts each plugin on window.Capacitor.Plugins (the site doesn't bundle
// @capacitor/core, so there is no Capacitor.registerPlugin to call).
const plugins = () => (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins) || {};

export const isAvailable = () => !!plugins().Nearby;

export const Nearby = plugins().Nearby || null;
