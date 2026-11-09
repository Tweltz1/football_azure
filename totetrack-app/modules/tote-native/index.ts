import { requireOptionalNativeModule } from 'expo';

export type PhotoAnalysis = { labels: { label: string; confidence: number }[]; text: string[] };
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
