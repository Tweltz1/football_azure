// Asks for an App Store rating at a happy moment: right after a shopper finishes a trip.
// Apple shows its own rating sheet (at most 3 times a year, and maybe not at all); we ask at most once every
// 120 days so it never nags.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';

const KEY = 'stride-review-asked-at';
const GAP_MS = 120 * 24 * 60 * 60 * 1000;

export async function maybeAskForReview(): Promise<void> {
  try {
    const last = Number(await AsyncStorage.getItem(KEY)) || 0;
    if (Date.now() - last < GAP_MS) return;
    if (!(await StoreReview.isAvailableAsync()) || !(await StoreReview.hasAction())) return;
    await AsyncStorage.setItem(KEY, String(Date.now()));
    await StoreReview.requestReview();
  } catch {
    // A rating prompt is never worth an error.
  }
}
