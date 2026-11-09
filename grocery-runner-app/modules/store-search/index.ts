import { requireOptionalNativeModule } from 'expo';

export type FoundPlace = { name: string; latitude: number; longitude: number; address: string };

type StoreSearchModule = {
  search(query: string, latitude: number, longitude: number, radiusMeters: number): Promise<FoundPlace[]>;
};

// Missing in Expo Go and on web; the map then shows only Kroger and Walmart stores from their APIs.
const native = requireOptionalNativeModule<StoreSearchModule>('StoreSearch');

export const storeSearchAvailable = native != null;

export function searchPlaces(query: string, latitude: number, longitude: number, radiusMeters: number) {
  return native ? native.search(query, latitude, longitude, radiusMeters) : Promise.resolve([]);
}
