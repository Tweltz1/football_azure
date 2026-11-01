// The four answer tiles share a color and icon on the TV and on phones, so players can match them at a glance.
export const ANSWER_STYLE = [
  { icon: '🦇', color: '#9b7bff', name: 'Bat' },
  { icon: '🎃', color: '#ff8a2a', name: 'Pumpkin' },
  { icon: '👻', color: '#3ddc97', name: 'Ghost' },
  { icon: '🕷️', color: '#ff5fa2', name: 'Spider' },
];

export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};
