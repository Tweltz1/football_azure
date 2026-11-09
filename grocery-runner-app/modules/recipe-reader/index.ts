import { requireOptionalNativeModule } from 'expo';

/** One line of text found in a photo. Box values are 0..1 of the photo, origin at the top left. */
export type TextLine = { text: string; x: number; y: number; width: number; height: number };

type RecipeReaderModule = { recognizeText(uri: string): Promise<TextLine[]> };

// Missing in Expo Go and on web; photo reading then says it needs the App Store build.
const native = requireOptionalNativeModule<RecipeReaderModule>('RecipeReader');

export const photoReadingAvailable = native != null;

export function recognizeText(uri: string): Promise<TextLine[]> {
  if (!native) return Promise.reject(new Error('Reading photos needs the iPhone app from TestFlight.'));
  return native.recognizeText(uri);
}
