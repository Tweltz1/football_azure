// Location and photos for the Junk App, on the website and in the iPhone app.

const LAST_SPOT = 'junk.lastSpot';

/** True inside the Junk App iPhone app (its web view adds "JunkApp" to the user agent). */
export const inJunkApp = () => typeof navigator !== 'undefined' && /\bJunkApp\b/.test(navigator.userAgent || '');

export const lastSpot = () => {
  try {
    const s = JSON.parse(window.localStorage.getItem(LAST_SPOT) || 'null');
    return s && Number.isFinite(s.lat) && Number.isFinite(s.lng) ? s : null;
  } catch (error) {
    return null;
  }
};
const saveSpot = (s) => {
  try { window.localStorage.setItem(LAST_SPOT, JSON.stringify(s)); } catch (error) { /* private mode */ }
};

/** Where the phone is: { lat, lng }. Uses the app's native location when it has it. */
export async function locate() {
  const native = typeof window !== 'undefined' && window.Capacitor?.Plugins?.Geolocation;
  if (native) {
    try {
      const perm = await native.checkPermissions();
      if (perm.location !== 'granted') await native.requestPermissions({ permissions: ['location'] });
      const pos = await native.getCurrentPosition({ enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
      const spot = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      saveSpot(spot);
      return spot;
    } catch (error) {
      // Fall through to the web version.
    }
  }
  if (!navigator.geolocation) throw new Error('This device can\'t share its location.');
  const pos = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, (err) => {
      reject(new Error(err && err.code === 1
        ? 'Location is off for Curbsy. Turn it on in Settings to see free stuff near you.'
        : 'Couldn\'t find your location. Try again.'));
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
  });
  const spot = { lat: pos.coords.latitude, lng: pos.coords.longitude };
  saveSpot(spot);
  return spot;
}

const MAX_SIDE = 1280;

/** Shrinks a picked photo to a JPEG data URL (about 150-400 KB). */
export async function photoToJpeg(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('That photo couldn\'t be opened. Try another one.'));
      el.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const g = canvas.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const MILES = [1, 5, 10, 25, 50, 100];
export const milesToKm = (mi) => mi * 1.609344;

export function distanceLabel(km) {
  if (typeof km !== 'number') return '';
  const mi = km / 1.609344;
  if (mi < 0.2) return 'Right nearby';
  if (mi < 10) return `${mi.toFixed(1)} mi away`;
  return `${Math.round(mi)} mi away`;
}

export function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  return d < 7 ? `${d}d ago` : new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const CATEGORIES = [
  ['furniture', 'Furniture', '🛋️'], ['appliances', 'Appliances', '🧺'], ['electronics', 'Electronics', '📺'],
  ['home', 'Home & kitchen', '🍳'], ['kids', 'Kids & baby', '🍼'], ['clothing', 'Clothing', '👕'],
  ['books', 'Books & media', '📚'], ['sports', 'Sports & outdoors', '🚲'], ['tools', 'Tools', '🔧'],
  ['garden', 'Yard & garden', '🌱'], ['building', 'Building materials', '🧱'], ['toys', 'Toys & games', '🧸'],
  ['other', 'Other', '📦'],
];
export const categoryLabel = (c) => (CATEGORIES.find(([k]) => k === c) || CATEGORIES[CATEGORIES.length - 1])[1];
export const categoryIcon = (c) => (CATEGORIES.find(([k]) => k === c) || CATEGORIES[CATEGORIES.length - 1])[2];

export const CONDITIONS = [
  ['like_new', 'Like new'], ['good', 'Good'], ['fair', 'Fair'], ['needs_work', 'Needs work'], ['for_parts', 'For parts / scrap'],
];
export const conditionLabel = (c) => (CONDITIONS.find(([k]) => k === c) || CONDITIONS[1])[1];
