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

const cap = typeof window !== 'undefined' ? window.Capacitor : undefined;

export const isAvailable = () =>
  !!(cap && cap.isNativePlatform && cap.isNativePlatform() && cap.isPluginAvailable && cap.isPluginAvailable('Nearby'));

export const Nearby = cap && cap.registerPlugin ? cap.registerPlugin('Nearby') : null;
