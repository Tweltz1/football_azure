import { useWindowDimensions } from 'react-native';
import Svg, { Circle, G, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { PlannedRoute } from '../lib/routing/planRoute';
import { useTheme } from '../lib/theme';
import { Cell } from '../lib/types';

/** Top-down store map: back wall at the top, entrance at the bottom right. */
export function StoreMap({ route, done }: { route: PlannedRoute; done: Set<number> }) {
  const t = useTheme();
  const { width: screen } = useWindowDimensions();
  const { grid, aisleCount } = route.layout;
  const s = Math.min(22, (screen - 32) / grid.width);
  const W = grid.width * s;
  const H = grid.height * s;
  // Flip y so the back of the store is at the top of the screen.
  const px = (c: Cell) => ({ x: (c.x + 0.5) * s, y: (grid.height - 1 - c.y + 0.5) * s });

  const blocks = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.isWalkable({ x, y })) continue;
      const wall = x === 0 || x === grid.width - 1 || y === grid.height - 1;
      blocks.push(
        <Rect
          key={`${x},${y}`}
          x={x * s}
          y={(grid.height - 1 - y) * s}
          width={s}
          height={s}
          fill={wall ? t.wall : t.shelf}
        />,
      );
    }
  }

  const points = route.path.map((c) => px(c)).map((p) => `${p.x},${p.y}`).join(' ');
  const font = Math.max(8, s * 0.55);

  return (
    <Svg width={W} height={H} accessibilityLabel="Store map with your walking route">
      <Rect x={0} y={0} width={W} height={H} fill={t.floor} rx={8} />
      <G>{blocks}</G>
      {Array.from({ length: aisleCount }, (_, i) => {
        const p = px(route.layout.aisleCell(i + 1, 1));
        return (
          <SvgText key={i} x={p.x} y={p.y + s} fontSize={font} fill={t.textMuted} textAnchor="middle">
            {i + 1}
          </SvgText>
        );
      })}
      <Polyline points={points} fill="none" stroke={t.path} strokeWidth={Math.max(2, s * 0.22)} strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
      {route.stops.map((stop, i) => {
        const p = px(stop.cell);
        return (
          <G key={i}>
            <Circle cx={p.x} cy={p.y} r={s * 0.55} fill={done.has(i) ? t.shelf : t.stop} />
            <SvgText x={p.x} y={p.y + font * 0.35} fontSize={font} fontWeight="700" fill="#fff" textAnchor="middle">
              {i + 1}
            </SvgText>
          </G>
        );
      })}
      <SvgText x={px(route.layout.entrance).x} y={H - 2} fontSize={font} fill={t.text} textAnchor="end">
        In
      </SvgText>
      <SvgText x={px(route.layout.checkout).x} y={H - 2} fontSize={font} fill={t.text} textAnchor="middle">
        Checkout
      </SvgText>
    </Svg>
  );
}
