import { useColorScheme } from 'react-native';

const light = {
  bg: '#F4F5F9',
  card: '#FFFFFF',
  cardAlt: '#EEF0F6',
  text: '#11131A',
  textMuted: '#6B7083',
  border: '#E2E4EC',
  primary: '#4F46E5',
  primarySoft: '#E7E6FD',
  onPrimary: '#FFFFFF',
  danger: '#E5484D',
  dangerSoft: '#FDECEC',
  success: '#30A46C',
  overlay: 'rgba(0,0,0,0.55)',
};

const dark: typeof light = {
  bg: '#0C0D12',
  card: '#171922',
  cardAlt: '#20232F',
  text: '#F3F4F8',
  textMuted: '#9A9FB2',
  border: '#2A2D3A',
  primary: '#7C74FF',
  primarySoft: '#25234A',
  onPrimary: '#FFFFFF',
  danger: '#FF6369',
  dangerSoft: '#3A1A1C',
  success: '#3DD68C',
  overlay: 'rgba(0,0,0,0.7)',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Tote accent colors offered in the editor. */
export const TOTE_COLORS = [
  '#4F46E5', // indigo
  '#0EA5E9', // sky
  '#10B981', // emerald
  '#84CC16', // lime
  '#F59E0B', // amber
  '#F97316', // orange
  '#EF4444', // red
  '#EC4899', // pink
  '#8B5CF6', // violet
  '#64748B', // slate
];

/** Ionicons names offered in the editor. */
export const TOTE_ICONS = [
  'cube',
  'shirt',
  'construct',
  'gift',
  'book',
  'football',
  'restaurant',
  'snow',
  'leaf',
  'game-controller',
  'home',
  'briefcase',
  'camera',
  'musical-notes',
  'paw',
  'car',
  'bulb',
  'medkit',
  'color-palette',
  'happy',
] as const;

export const radius = { sm: 10, md: 14, lg: 20, xl: 28 };
