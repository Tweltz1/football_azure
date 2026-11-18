import { useColorScheme } from 'react-native';

// "Fresh market" look (2026-11 redesign): warm paper background, deep basil green, tangerine accent.
const light = {
  bg: '#F7F4EC',
  card: '#FFFFFF',
  cardAlt: '#EFEBE0',
  text: '#16201A',
  textMuted: '#6B7268',
  border: '#E6E1D4',
  primary: '#13804C',
  primarySoft: '#DCF0E3',
  onPrimary: '#FFFFFF',
  accent: '#F26A2E',
  accentSoft: '#FDE6D9',
  /** The big bar at the top of the list. */
  hero: '#13804C',
  onHero: '#FFFFFF',
  danger: '#E5484D',
  warn: '#C27C0E',
  // Map colors
  floor: '#FFFFFF',
  shelf: '#C9D1C4',
  wall: '#9FB39A',
  path: '#13804C',
  stop: '#F26A2E',
};

const dark: typeof light = {
  bg: '#0D110E',
  card: '#171C18',
  cardAlt: '#20271F',
  text: '#F2F5EE',
  textMuted: '#9BA597',
  border: '#2A332B',
  primary: '#45D18B',
  primarySoft: '#16351F',
  onPrimary: '#06210F',
  accent: '#FF8A4C',
  accentSoft: '#3A2216',
  hero: '#123B26',
  onHero: '#F2F5EE',
  danger: '#FF6369',
  warn: '#F5B547',
  floor: '#1A201A',
  shelf: '#38433A',
  wall: '#4E6650',
  path: '#45D18B',
  stop: '#FB923C',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const radius = { sm: 12, md: 16, lg: 24 };
