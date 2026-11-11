import { requireOptionalNativeModule } from 'expo';

export type TextLine = { text: string; confidence: number; x: number; y: number; w: number; h: number };
export type PhotoAnalysis = {
  /** confidence: best seen in any part of the photo; regions: how many parts it was seen in; whole: seen in the full photo. */
  labels: { label: string; confidence: number; regions?: number; whole?: boolean }[];
  /** Printed text lines with their position (0-1, top-left origin). */
  lines?: TextLine[];
  text: string[];
  /**
   * Each separate thing the object detector outlined, with more specific names from looking at just
   * that spot. Empty when the detector model isn't in the build; older builds leave it out.
   */
  objects?: DetectedObject[];
  /**
   * What ToteTrack's own namer called each spot in the photo, best first: confidence is its best
   * probability, spots how many places it was the top answer. Empty when the namer isn't in the build.
   */
  named?: NamedItem[];
  /** The namer's embedding of every spot it looked at (unit length), for matching your own things. */
  looks?: number[][];
  /** The image model the namer was built from; looks are only comparable within one model. */
  namer?: string;
};
export type NamedItem = {
  name: string;
  confidence: number;
  similarity: number;
  spots: number;
  /** The embedding of the spot where this name scored best. */
  embedding?: number[];
};
export type DetectedObject = {
  label: string;
  confidence: number;
  /** 0-1, origin bottom-left (Vision's). */
  box: { x: number; y: number; width: number; height: number };
  refined: { label: string; confidence: number }[];
};
/** A ToteTrack Pro product as the App Store has it (price already in the person's currency). */
export type StoreProduct = { id: string; price: string; priceValue: number; title: string; period?: string; trial?: string };
/** An active subscription. expires: ms since 1970, 0 when it never expires. */
export type StoreEntitlement = { productId: string; expires: number };
export type SpotlightTote = { id: string; title: string; description: string; keywords: string[] };
export type ScheduledReminder = { id: string; title: string; body: string; at: number; toteId?: string };

type ToteNativeModule = {
  analyzePhoto(uri: string): Promise<PhotoAnalysis>;
  indexTotes(totes: SpotlightTote[]): Promise<void>;
  consumeSpotlightTote(): string | null;
  notificationStatus(): Promise<'granted' | 'denied' | 'undetermined'>;
  requestNotifications(): Promise<boolean>;
  scheduleReminders(reminders: ScheduledReminder[]): Promise<void>;
  nfcAvailable(): boolean;
  /** True when written, null if the person cancelled. */
  writeNfc(url: string): Promise<boolean | null>;
  /** The link on the sticker, or null if cancelled. */
  readNfc(): Promise<string | null>;
  storeProducts(ids: string[]): Promise<StoreProduct[]>;
  storeEntitlements(): Promise<StoreEntitlement[]>;
  storePurchase(id: string): Promise<'purchased' | 'pending' | 'cancelled'>;
  /** Asks the App Store for this Apple ID's purchases, then returns the active ones. */
  storeRestore(): Promise<StoreEntitlement[]>;
  addListener(event: 'onPurchasesChanged', listener: () => void): { remove(): void };
};

/** Null where the native code isn't built in (Expo Go, Android, web). */
export const ToteNative = requireOptionalNativeModule<ToteNativeModule>('ToteNative');
