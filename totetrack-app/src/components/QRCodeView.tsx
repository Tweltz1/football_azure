import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { qrMatrix } from '../lib/qr';

export function QRCodeView({ value, size = 160, quiet = 2 }: { value: string; size?: number; quiet?: number }) {
  const { size: n, path } = useMemo(() => qrMatrix(value), [value]);
  const full = n + quiet * 2;
  return (
    <Svg width={size} height={size} viewBox={`${-quiet} ${-quiet} ${full} ${full}`}>
      <Rect x={-quiet} y={-quiet} width={full} height={full} fill="#fff" />
      <Path d={path} fill="#000" />
    </Svg>
  );
}
