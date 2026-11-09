import { requireOptionalNativeModule } from 'expo';

export type PhotoAnalysis = {
  labels: { label: string; confidence: number }[];
  text: string[];
  /** Same lines as `text` with how sure Vision was and how tall the print is (share of the photo). Older builds leave it out. */
  textInfo?: { text: string; confidence: number; height: number }[];
  /**
   * Each separate thing the object detector outlined, with more specific names from looking at just
   * that spot. Empty when the detector model isn't in the build; older builds leave it out.
   */
  objects?: DetectedObject[];
};
export type DetectedObject = {
  label: string;
  confidence: number;
  box: { x: number; y: number; width: number; height: number };
  refined: { label: string; confidence: number }[];
};
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
};

/** Null where the native code isn't built in (Expo Go, Android, web). */
export const ToteNative = requireOptionalNativeModule<ToteNativeModule>('ToteNative');
