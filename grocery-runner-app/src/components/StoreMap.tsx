import { useWindowDimensions } from 'react-native';
import Svg, { Circle, G, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { PlannedRoute } from '../lib/routing/planRoute';
import { useTheme } from '../lib/theme';
import { Cell } from '../lib/types';

const LABEL_GAP = 16; // px between aisle numbers before some are skipped

/**
 * Top-down store map: back wall at the top, entrance and checkouts at the bottom. The map always fills
 * the card's width at a readable height, so a 40-aisle store is squeezed sideways, not shrunk to a strip.
 */
export function StoreMap({ route, done }: { route: PlannedRoute; done: Set<number> }) {
  const t = useTheme();
  const { width: screen } = useWindowDimensions();
  const { grid, zones = [], aisleMarks = [] } = route.layout;
  const W = Math.min(screen - 56, 520);
  const H = Math.round(Math.min(W * 0.78, 360));
  const sx = W / grid.width;
  const sy = H / grid.height;
  const yTop = (y: number) => (grid.height - 1 - y) * sy;
  const px = (c: Cell) => ({ x: (c.x + 0.5) * sx, y: yTop(c.y) + sy / 2 });
  const font = 10;
  const clampX = (x: number, pad = 4) => Math.min(W - pad, Math.max(pad, x));

  // Shelves as runs (one rect per run of blocked cells in a column), walls drawn by the zones/outline.
  const shelves = [];
  for (let x = 0; x < grid.width; x++) {
    let start = -1;
    for (let y = 0; y <= grid.height; y++) {
      const blocked = y < grid.height && !grid.isWalkable({ x, y });
      if (blocked && start < 0) start = y;
      if (!blocked && start >= 0) {
        shelves.push(
          <Rect key={`${x},${start}`} x={x * sx + sx * 0.1} y={yTop(y - 1)} width={sx * 0.8} height={(y - start) * sy} rx={Math.min(2, sx / 3)} fill={t.shelf} />,
        );
        start = -1;
      }
    }
  }

  // Aisle names, thinned out when the aisles are too close to read.
  const step = Math.max(1, Math.ceil(LABEL_GAP / (2 * sx)));
  const numbered = aisleMarks.filter((a) => /^\d+$/.test(a.text));
  const marks = [
    ...numbered.filter((a, i) => i % step === 0 || (i === numbered.length - 1 && i % step > step / 2)),
    ...aisleMarks.filter((a) => !/^\d+$/.test(a.text)),
  ];

  const points = route.path.map((c) => px(c)).map((p) => `${p.x},${p.y}`).join(' ');
  const stopR = Math.max(6, Math.min(9, sx * 0.9));
  const entrance = px(route.layout.entrance);
  const checkout = px(route.layout.checkout);

  return (
    <Svg width={W} height={H + 16} accessibilityLabel="Store map with your walking route">
      <Rect x={0} y={0} width={W} height={H} fill={t.floor} rx={8} stroke={t.wall} strokeWidth={1.5} />
      <G>{shelves}</G>
      {marks.map((a, i) => {
        const p = px(a.at);
        return (
          <SvgText key={`a${i}`} x={clampX(p.x)} y={p.y + 3} fontSize={9} fill={t.textMuted} textAnchor="middle">
            {a.text}
          </SvgText>
        );
      })}
      <Polyline points={points} fill="none" stroke={t.path} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
      {zones.map((z, i) => {
        const x = z.x1 * sx;
        const y = yTop(z.y2);
        const w = (z.x2 - z.x1 + 1) * sx;
        const h = (z.y2 - z.y1 + 1) * sy;
        const cx = x + w / 2;
        const cy = y + h / 2;
        const vertical = z.side === 'left' || z.side === 'right';
        // Centred on the wall band, with a white halo so it stays readable over shelves and the path.
        const tx = vertical ? cx : clampX(cx, 30);
        const ty = cy + 3.5;
        const turn = vertical ? `rotate(${z.side === 'left' ? -90 : 90} ${tx} ${cy})` : undefined;
        const label = { x: tx, y: ty, fontSize: font, fontWeight: '700' as const, textAnchor: 'middle' as const, transform: turn };
        return (
          <G key={`z${i}`}>
            <Rect x={x} y={y} width={w} height={h} fill={t.wall} opacity={0.55} rx={3} />
            <SvgText {...label} stroke={t.floor} strokeWidth={3} strokeLinejoin="round" fill={t.floor}>
              {z.text}
            </SvgText>
            <SvgText {...label} fill={t.text}>
              {z.text}
            </SvgText>
          </G>
        );
      })}
      {route.stops.map((stop, i) => {
        const p = px(stop.cell);
        return (
          <G key={i}>
            <Circle cx={p.x} cy={p.y} r={stopR} fill={done.has(i) ? t.shelf : t.stop} stroke="#fff" strokeWidth={1} />
            <SvgText x={p.x} y={p.y + 3.5} fontSize={10} fontWeight="700" fill="#fff" textAnchor="middle">
              {i + 1}
            </SvgText>
          </G>
        );
      })}
      <SvgText x={clampX(entrance.x)} y={H + 12} fontSize={font} fontWeight="600" fill={t.text} textAnchor={entrance.x > W / 2 ? 'end' : entrance.x < W / 3 ? 'start' : 'middle'}>
        Entrance
      </SvgText>
      {Math.abs(checkout.x - entrance.x) > 70 && (
        <SvgText x={clampX(checkout.x)} y={H + 12} fontSize={font} fontWeight="600" fill={t.text} textAnchor={checkout.x < W / 3 ? 'start' : checkout.x > (2 * W) / 3 ? 'end' : 'middle'}>
          Checkout
        </SvgText>
      )}
    </Svg>
  );
}
