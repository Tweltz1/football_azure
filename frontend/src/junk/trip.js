// "I'm on my way": sends the phone's position while a claim is open, so the server can tell the person is
// really heading to the item (supabase/functions/_shared/junkClaims.ts releases it when they aren't).
//
// In the iPhone app the native TripPlugin (ios-junk-app/ios/App/App/HoodViewController.swift) does the
// sending, so it keeps going with the screen locked or Maps open. On the website (local development) the
// page watches the position itself while it is open.

import { API_BASE, freshToken, pingClaim } from './junkApi';

const nativeTrip = () => (typeof window !== 'undefined' && window.Capacitor?.Plugins?.Trip) || null;
const PING_SECONDS = 45;

let webWatch = null;
let webLastSent = 0;
let listener = null;
let notify = null;

/** Starts (or keeps) sending positions. `onUpdate` gets each server answer ({ claim, tracking }). */
export async function startTrip(onUpdate) {
  notify = onUpdate || null;
  const Trip = nativeTrip();
  if (Trip) {
    const t = await freshToken();
    if (!t) return;
    if (!listener && Trip.addListener) {
      try { listener = await Trip.addListener('trip', (data) => notify && notify(data)); } catch (error) { listener = null; }
    }
    await Trip.start({ url: `${API_BASE}/junk/claim/ping`, token: t, minSeconds: PING_SECONDS });
    return;
  }
  if (webWatch !== null || typeof navigator === 'undefined' || !navigator.geolocation) return;
  webWatch = navigator.geolocation.watchPosition(async (pos) => {
    if (Date.now() - webLastSent < PING_SECONDS * 1000) return;
    webLastSent = Date.now();
    try {
      const res = await pingClaim({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      if (notify) notify(res);
      if (res && res.tracking === false) stopTrip();
    } catch (error) { /* try again on the next position */ }
  }, () => { /* the server releases the claim if positions stop */ }, { enableHighAccuracy: true, maximumAge: 15000 });
}

/** Hands the native sender a fresh sign-in token (they last about an hour). */
export async function refreshTripToken() {
  const Trip = nativeTrip();
  if (!Trip) return;
  const t = await freshToken();
  if (t) await Trip.update({ token: t }).catch(() => {});
}

export async function stopTrip() {
  const Trip = nativeTrip();
  if (Trip) {
    await Trip.stop().catch(() => {});
    if (listener) { try { await listener.remove(); } catch (error) { /* gone already */ } listener = null; }
  }
  if (webWatch !== null && typeof navigator !== 'undefined' && navigator.geolocation) navigator.geolocation.clearWatch(webWatch);
  webWatch = null;
  webLastSent = 0;
}
