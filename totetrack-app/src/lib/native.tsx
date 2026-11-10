import { router } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { ScheduledReminder, ToteNative } from '../../modules/tote-native';
import { SEASONS } from './extras';
import { useTotes } from './store';
import { Tote } from './types';

const REMIND_HOUR = 9;
const SEASON_LEAD_DAYS = 14;
const EXPIRY_LEAD_DAYS = 7;

function at9(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), REMIND_HOUR).getTime();
}

/** The local notifications ToteTrack should have scheduled for these totes. */
export function plannedReminders(totes: Tote[], now = new Date()): ScheduledReminder[] {
  const out: ScheduledReminder[] = [];
  const bySeason = new Map<string, Tote[]>();
  for (const t of totes) if (t.season) bySeason.set(t.season, [...(bySeason.get(t.season) ?? []), t]);
  for (const [season, list] of bySeason) {
    const s = SEASONS.find((x) => x.name === season);
    if (!s) continue;
    for (const year of [now.getFullYear(), now.getFullYear() + 1]) {
      const start = new Date(year, s.month - 1, s.day);
      const when = at9(new Date(start.getTime() - SEASON_LEAD_DAYS * 86400000));
      if (when <= now.getTime()) continue;
      const names = list.map((t) => t.name).filter(Boolean);
      out.push({
        id: `season.${season}.${year}`,
        title: `${season} is coming up`,
        body:
          list.length === 1
            ? `Your “${names[0]}” tote is in ${list[0].location || 'storage'}.`
            : `${list.length} totes are ready to come out: ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}.`,
        at: when,
        toteId: list.length === 1 ? list[0].id : undefined,
      });
      break;
    }
  }
  for (const tote of totes) {
    for (const item of tote.items) {
      if (!item.expires) continue;
      const [y, m, d] = item.expires.split('-').map(Number);
      const day = new Date(y, m - 1, d);
      const soon = at9(new Date(day.getTime() - EXPIRY_LEAD_DAYS * 86400000));
      if (soon > now.getTime()) {
        out.push({ id: `exp.${item.id}.soon`, title: `${item.name} expires in a week`, body: `It's in ${tote.name || 'a tote'}.`, at: soon, toteId: tote.id });
      }
      if (at9(day) > now.getTime()) {
        out.push({ id: `exp.${item.id}.day`, title: `${item.name} expires today`, body: `It's in ${tote.name || 'a tote'}.`, at: at9(day), toteId: tote.id });
      }
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

function spotlightEntries(totes: Tote[]) {
  return totes.map((t) => ({
    id: t.id,
    title: t.name || 'Untitled tote',
    description: [t.location, t.items.map((i) => i.name).join(', ')].filter(Boolean).join(' · '),
    keywords: [...t.items.map((i) => i.name), t.location, t.season ?? ''].filter(Boolean),
  }));
}

/** Keeps iPhone search (Spotlight) and the local reminder notifications in step with the totes. */
export function NativeBridge() {
  const { totes, ready } = useTotes();

  // Spotlight result tapped while the app was closed.
  useEffect(() => {
    if (!ToteNative || !ready) return;
    const open = () => {
      const id = ToteNative?.consumeSpotlightTote();
      if (id) router.navigate(`/tote/${id}`);
    };
    open();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && open());
    return () => sub.remove();
  }, [ready]);

  useEffect(() => {
    if (!ToteNative || !ready) return;
    const timer = setTimeout(async () => {
      try {
        await ToteNative?.indexTotes(spotlightEntries(totes));
      } catch {
        // Spotlight is a nice-to-have.
      }
      try {
        const reminders = plannedReminders(totes);
        if (!reminders.length) return ToteNative?.scheduleReminders([]);
        let status = await ToteNative!.notificationStatus();
        // Ask the first time there's something to remind about (right after a season or date is set).
        if (status === 'undetermined') status = (await ToteNative!.requestNotifications()) ? 'granted' : 'denied';
        if (status === 'granted') await ToteNative!.scheduleReminders(reminders);
      } catch {
        // Reminders still show on the Reminders screen.
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [totes, ready]);

  return null;
}
