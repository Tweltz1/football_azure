import { useColorScheme } from 'react-native';

const light = {
  bg: '#F4F6F3',
  card: '#FFFFFF',
  cardAlt: '#EBEFE9',
  text: '#121611',
  textMuted: '#66705F',
  border: '#DFE4DC',
  primary: '#1F9D55',
  primarySoft: '#DDF3E5',
  onPrimary: '#FFFFFF',
  danger: '#E5484D',
  warn: '#C27C0E',
  // Map colors
  floor: '#FFFFFF',
  shelf: '#C9D1C4',
  wall: '#9FB39A',
  path: '#1F9D55',
  stop: '#F97316',
};

const dark: typeof light = {
  bg: '#0C0F0C',
  card: '#161B16',
  cardAlt: '#1F261F',
  text: '#F1F5EF',
  textMuted: '#9AA596',
  border: '#2A332A',
  primary: '#3DD68C',
  primarySoft: '#173524',
  onPrimary: '#06210F',
  danger: '#FF6369',
  warn: '#F5B547',
  floor: '#1A201A',
  shelf: '#38433A',
  wall: '#4E6650',
  path: '#3DD68C',
  stop: '#FB923C',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const radius = { sm: 10, md: 14, lg: 20 };
