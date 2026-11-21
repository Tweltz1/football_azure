import { useWindowDimensions } from 'react-native';
import Svg, { Circle, G, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { PlannedRoute } from '../lib/routing/planRoute';
import { useTheme } from '../lib/theme';
import { Zone } from '../lib/routing/layout';
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

  // Shelves as runs: front-to-back runs per column, then side-to-side runs for what's left (walls, cross shelves).
  const shelves = [];
  const blocked = (x: number, y: number) => y >= 0 && y < grid.height && x >= 0 && x < grid.width && !grid.isWalkable({ x, y });
  const inColumn = (x: number, y: number) => blocked(x, y) && (blocked(x, y - 1) || blocked(x, y + 1));
  for (let x = 0; x < grid.width; x++) {
    let start = -1;
    for (let y = 0; y <= grid.height; y++) {
      const on = y < grid.height && inColumn(x, y);
      if (on && start < 0) start = y;
      if (!on && start >= 0) {
        shelves.push(
          <Rect key={`v${x},${start}`} x={x * sx + sx * 0.1} y={yTop(y - 1)} width={sx * 0.8} height={(y - start) * sy} rx={Math.min(2, sx / 3)} fill={t.shelf} />,
        );
        start = -1;
      }
    }
  }
  for (let y = 0; y < grid.height; y++) {
    let start = -1;
    for (let x = 0; x <= grid.width; x++) {
      const on = x < grid.width && blocked(x, y) && !inColumn(x, y);
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        shelves.push(
          <Rect key={`h${start},${y}`} x={start * sx} y={yTop(y) + sy * 0.1} width={(x - start) * sx} height={sy * 0.8} rx={Math.min(2, sy / 3)} fill={t.shelf} />,
        );
        start = -1;
      }
    }
  }
  const box = (z: Zone) => ({ x: z.x1 * sx, y: yTop(z.y2), w: (z.x2 - z.x1 + 1) * sx, h: (z.y2 - z.y1 + 1) * sy });
  const blocks = zones.filter((z) => z.side === 'block');
  const walls = zones.filter((z) => z.side !== 'block');

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
      {blocks.filter((z) => z.fill === 'area').map((z, i) => {
        const b = box(z);
        return <Rect key={`ar${i}`} x={b.x} y={b.y} width={b.w} height={b.h} fill={t.wall} opacity={0.18} rx={3} />;
      })}
      <G>{shelves}</G>
      {blocks.filter((z) => z.fill === 'void').map((z, i) => {
        const b = box(z);
        return <Rect key={`vo${i}`} x={b.x - 0.5} y={b.y - 0.5} width={b.w + 1} height={b.h + 1} fill={t.card} />;
      })}
      {marks.map((a, i) => {
        const p = px(a.at);
        return (
          <SvgText key={`a${i}`} x={clampX(p.x)} y={p.y + 3} fontSize={9} fill={t.textMuted} textAnchor="middle">
            {a.text}
          </SvgText>
        );
      })}
      <Polyline points={points} fill="none" stroke={t.path} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
      {blocks.map((z, i) => <BlockLabel key={`b${i}`} zone={z} box={box(z)} />)}
      {walls.map((z, i) => {
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
        if (stop.offMap) return null;
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
      {Math.abs(checkout.x - entrance.x) > 70 && !blocks.some((z) => z.text === 'Checkout') && (
        <SvgText x={clampX(checkout.x)} y={H + 12} fontSize={font} fontWeight="600" fill={t.text} textAnchor={checkout.x < W / 3 ? 'start' : checkout.x > (2 * W) / 3 ? 'end' : 'middle'}>
          Checkout
        </SvgText>
      )}
    </Svg>
  );
}

/** A block's name, sized and turned to fit inside it (one line across, two lines, or up the side). */
function BlockLabel({ zone, box }: { zone: Zone; box: { x: number; y: number; w: number; h: number } }) {
  const t = useTheme();
  if (!zone.text) return null;
  const { x, y, w, h } = box;
  const solid = zone.fill === 'solid';
  const per = 0.58; // average bold glyph width per px of font size
  const text = zone.text;
  const words = text.split(' ');
  const mid = Math.ceil(words.length / 2);
  const lines = words.length > 1 ? [words.slice(0, mid).join(' '), words.slice(mid).join(' ')] : [text];
  const longest = Math.max(...lines.map((l) => l.length));
  const across = Math.min(10, (w - 2) / (text.length * per), h - 1);
  const twoLines = words.length > 1 ? Math.min(10, (w - 2) / (longest * per), (h - 1) / 2.2) : 0;
  const upright = Math.min(10, (h - 2) / (text.length * per), w - 1);
  const best = Math.max(across, twoLines, upright);
  const font = Math.max(5.5, best);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const fill = solid ? t.text : t.textMuted;
  const fills = (
    <>
      {solid && <Rect x={x} y={y} width={w} height={h} fill={t.wall} opacity={0.55} rx={3} />}
    </>
  );
  const draw = (props: { x: number; y: number; transform?: string }, s: string, k: string) => (
    <G key={k}>
      <SvgText {...props} fontSize={font} fontWeight="700" textAnchor="middle" stroke={t.floor} strokeWidth={2.5} strokeLinejoin="round" fill={t.floor}>
        {s}
      </SvgText>
      <SvgText {...props} fontSize={font} fontWeight="700" textAnchor="middle" fill={fill}>
        {s}
      </SvgText>
    </G>
  );
  if (best === upright && upright > across && upright > twoLines) {
    return (
      <G>
        {fills}
        {draw({ x: cx, y: cy + font * 0.35, transform: `rotate(-90 ${cx} ${cy})` }, text, 'u')}
      </G>
    );
  }
  if (best === twoLines && twoLines > across) {
    return (
      <G>
        {fills}
        {draw({ x: cx, y: cy - font * 0.2 }, lines[0], 'a')}
        {draw({ x: cx, y: cy + font * 0.95 }, lines[1], 'b')}
      </G>
    );
  }
  return (
    <G>
      {fills}
      {draw({ x: cx, y: cy + font * 0.35 }, text, 'o')}
    </G>
  );
}
