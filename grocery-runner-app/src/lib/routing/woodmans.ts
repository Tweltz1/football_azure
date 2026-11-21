// Woodman's Markets floor plans, one per store, from the printable store map each store's page on
// woodmans-food.com links (page 1 of its "Store Directory" PDF; page 2, the A-Z aisle list, is in
// store/directories/woodmans-*.csv, rebuilt by tools/woodmans_directories.py). Pure data, no React.
//
// Every Woodman's is drawn on the same plan: numbered aisles from aisle 1 on the produce (right) side,
// short lettered aisles A-Z in front of the checkouts with A on the right, frozen down the left wall
// (numbered just past the last center aisle), and soda & water front-left (numbered from 30). Each store
// below only states what its own map shows differently.
import type { Spot, StorePlan } from './plan';

const STANDARD_WALLS: StorePlan['walls'] = {
  frozen: { at: 'left', label: 'Frozen' },
  dairy: { at: 'back-left', label: 'Dairy' },
  meat: { at: 'back-right', label: 'Meat' },
  produce: { at: 'right-back', label: 'Produce' },
  deli: { at: 'right', label: '' },
  bakery: { at: 'right-front', label: 'Bakery' },
};

type WoodmansStore = {
  name: string;
  lat: number;
  lon: number;
  /** Numbered center aisles on the map. */
  aisles: number;
  /** First and last frozen aisle number (the left wall cases). */
  frozen: [number, number];
  walls?: StorePlan['walls'];
  /** Where the soda & water section is, if not front-left. */
  soda?: Spot;
  sodaLabel?: string;
};

function woodmans(s: WoodmansStore): StorePlan {
  const wallAisles: Record<number, Spot> = {};
  const [lo, hi] = s.frozen;
  const k = hi - lo + 1;
  const sides: Spot[] = ['left-front', 'left', 'left-back'];
  for (let a = lo; a <= hi; a++) wallAisles[a] = sides[Math.floor(((a - lo) * 3) / k)];
  // Soda, water and drink-mix aisles (30-40, or anything else past the frozen cases) are in the soda section.
  const soda = s.soda ?? 'front-left';
  for (let a = s.aisles + 1; a <= 40; a++) if (!wallAisles[a]) wallAisles[a] = soda;
  const walls = s.walls ?? STANDARD_WALLS;
  return {
    name: s.name,
    chain: 'woodmans',
    lat: s.lat,
    lon: s.lon,
    aisles: s.aisles,
    aisleOne: 'right',
    walls,
    wallAisles,
    frontLetters: 'right',
    named: {
      SODA: { at: soda, label: s.sodaLabel ?? 'Soda & Water' },
      DAIRY: { at: walls.dairy?.at ?? 'back-left' },
      MEAT: { at: walls.meat?.at ?? 'back-right' },
      PRODUCE: { at: walls.produce?.at ?? 'right-back' },
    },
    entrance: 'right',
    checkout: 'middle',
  };
}

/** Woodman's Altoona, 2855 Woodman Drive, Altoona, WI 54720. Produce on the right wall, bakery front-right, dairy and meat across the back, frozen down the left wall. */
export const WOODMANS_ALTOONA: StorePlan = woodmans({
  name: "Woodman's Altoona",
  lat: 44.81588,
  lon: -91.45735,
  aisles: 23,
  frozen: [24, 26],
});

/** Woodman's Appleton, 595 North Westhill Blvd, Appleton, WI 54914. Bakery on the right wall with produce in front of it by the checkouts, dairy and meat across the back, frozen left. */
export const WOODMANS_APPLETON: StorePlan = woodmans({
  name: "Woodman's Appleton",
  lat: 44.26749,
  lon: -88.46312,
  aisles: 23,
  frozen: [24, 27],
  walls: { ...STANDARD_WALLS, produce: { at: 'front-right', label: 'Produce' }, bakery: { at: 'right', label: 'Bakery' }, deli: { at: 'back-right', label: '' } },
});

/** Woodman's Beloit, 1877 S Madison Road, Beloit, WI 53511. Produce on the right wall, bakery front-right, dairy and meat across the back, frozen down the left wall, soda & water front-left. */
export const WOODMANS_BELOIT: StorePlan = woodmans({
  name: "Woodman's Beloit",
  lat: 42.52468,
  lon: -89.07122,
  aisles: 16,
  frozen: [17, 19],
});

/** Woodman's Bloomingdale, 1 Stratford Drive, Bloomingdale, IL 60108. Produce on the right wall, bakery front-right, dairy and meat across the back, frozen down the left wall, soda & water front-left. */
export const WOODMANS_BLOOMINGDALE: StorePlan = woodmans({
  name: "Woodman's Bloomingdale",
  lat: 41.94982,
  lon: -88.11744,
  aisles: 24,
  frozen: [25, 27],
});

/** Woodman's Buffalo Grove, 1550 Deerfield Pkwy, Buffalo Grove, IL 60089. Produce on the right wall, bakery front-right, dairy and meat across the back, frozen down the left wall, soda & water front-left. */
export const WOODMANS_BUFFALO_GROVE: StorePlan = woodmans({
  name: "Woodman's Buffalo Grove",
  lat: 42.1692,
  lon: -87.92436,
  aisles: 24,
  frozen: [25, 27],
});

/** Woodman's Carpentersville, 2100 Randall Road, Carpentersville, IL 60110. Produce on the right wall, bakery front-right, dairy and meat across the back, frozen down the left wall, soda & water front-left. */
export const WOODMANS_CARPENTERSVILLE: StorePlan = woodmans({
  name: "Woodman's Carpentersville",
  lat: 42.12011,
  lon: -88.33629,
  aisles: 23,
  frozen: [24, 26],
});

/** Woodman's Green Bay, 2400 Duck Creek Parkway, Green Bay, WI 54303. Produce on the right wall, bakery front-right, dairy and meat across the back, frozen down the left wall, soda & water front-left. */
export const WOODMANS_GREEN_BAY: StorePlan = woodmans({
  name: "Woodman's Green Bay",
  lat: 44.54332,
  lon: -88.07649,
  aisles: 21,
  frozen: [22, 24],
});

/** Woodman's Janesville, 2819 N Lexington Drive, Janesville, WI 53545. Soda & water and frozen down the left side, dairy and meat across the back, produce right, bakery front-right. */
export const WOODMANS_JANESVILLE: StorePlan = woodmans({
  name: "Woodman's Janesville",
  lat: 42.71636,
  lon: -88.99612,
  aisles: 23,
  frozen: [24, 26],
  soda: 'left-back',
});

/** Woodman's Kenosha, 7145 120th Avenue, Kenosha, WI 53142. Produce on the right wall, bakery front-right, dairy and meat across the back, frozen down the left wall, soda & water front-left. */
export const WOODMANS_KENOSHA: StorePlan = woodmans({
  name: "Woodman's Kenosha",
  lat: 42.57032,
  lon: -87.94788,
  aisles: 23,
  frozen: [24, 26],
});

/** Woodman's Lakemoor, 27555 IL Route 120, Lakemoor, IL 60051. Produce on the right wall, bakery front-right, dairy and meat across the back, frozen down the left wall, soda & water front-left. */
export const WOODMANS_LAKEMOOR: StorePlan = woodmans({
  name: "Woodman's Lakemoor",
  lat: 42.32084,
  lon: -88.1679,
  aisles: 24,
  frozen: [25, 27],
});

/** Woodman's Madison East, 3817 Milwaukee Street, Madison, WI 53714. Bakery in the back-right corner, meat down the right wall, produce front-right, natural and frozen down the left wall, soda in the lettered aisles. */
export const WOODMANS_MADISON_EAST: StorePlan = woodmans({
  name: "Woodman's Madison East",
  lat: 43.09681,
  lon: -89.31896,
  aisles: 24,
  frozen: [25, 26],
  walls: { ...STANDARD_WALLS, dairy: { at: 'back-left', label: 'Dairy' }, bakery: { at: 'back-right', label: 'Bakery' }, meat: { at: 'right-back', label: 'Meat' }, deli: { at: 'right', label: '' }, produce: { at: 'right-front', label: 'Produce' } },
  soda: 'front-left', sodaLabel: '',
});

/** Woodman's Madison West, 725 South Gammon Road, Madison, WI 53719. Produce on the right wall, bakery front-right, dairy and meat across the back, frozen down the left wall, soda & water front-left. */
export const WOODMANS_MADISON_WEST: StorePlan = woodmans({
  name: "Woodman's Madison West",
  lat: 43.0507,
  lon: -89.50105,
  aisles: 20,
  frozen: [21, 24],
});

/** Woodman's Menomonee Falls, W124N8145 Hwy 145, Menomonee Falls, WI 53051. Produce on the right wall, bakery front-right, dairy and meat across the back, frozen down the left wall, soda & water front-left. */
export const WOODMANS_MENOMONEE_FALLS: StorePlan = woodmans({
  name: "Woodman's Menomonee Falls",
  lat: 43.16471,
  lon: -88.0649,
  aisles: 23,
  frozen: [24, 26],
});

/** Woodman's North Aurora, 151 Hansen Blvd, North Aurora, IL 60542. Produce on the right wall, bakery front-right, dairy and meat across the back, frozen down the left wall, soda & water front-left. */
export const WOODMANS_NORTH_AURORA: StorePlan = woodmans({
  name: "Woodman's North Aurora",
  lat: 41.80414,
  lon: -88.36976,
  aisles: 23,
  frozen: [24, 26],
});

/** Woodman's Oak Creek, 8131 South Howell Avenue, Oak Creek, WI 53154. Produce on the right wall, bakery front-right, dairy and meat across the back, frozen down the left wall, soda & water front-left. */
export const WOODMANS_OAK_CREEK: StorePlan = woodmans({
  name: "Woodman's Oak Creek",
  lat: 42.89645,
  lon: -87.91466,
  aisles: 23,
  frozen: [24, 26],
});

/** Woodman's Onalaska, 9515 Hwy 16, Onalaska, WI 54650. Produce on the right wall, bakery front-right, dairy and meat across the back, frozen down the left wall, soda & water front-left. */
export const WOODMANS_ONALASKA: StorePlan = woodmans({
  name: "Woodman's Onalaska",
  lat: 43.87906,
  lon: -91.17598,
  aisles: 23,
  frozen: [24, 26],
});

/** Woodman's Plainfield, 11751 S Rt 59, Plainfield, IL 60585. Produce on the right wall, bakery front-right, dairy and meat across the back, frozen down the left wall, soda & water front-left. */
export const WOODMANS_PLAINFIELD: StorePlan = woodmans({
  name: "Woodman's Plainfield",
  lat: 41.66845,
  lon: -88.20121,
  aisles: 24,
  frozen: [25, 27],
});

/** Woodman's Racine, 5430 Durand Ave, Racine, WI 53406. Produce on the right wall, bakery front-right, dairy and meat across the back, frozen down the left wall, soda & water front-left. */
export const WOODMANS_RACINE: StorePlan = woodmans({
  name: "Woodman's Racine",
  lat: 42.69749,
  lon: -87.84497,
  aisles: 24,
  frozen: [25, 27],
});

/** Woodman's Rockford, 3155 McFarland Road, Rockford, IL 61114. Produce on the right wall, bakery front-right, dairy and meat across the back, frozen down the left wall, soda & water front-left. */
export const WOODMANS_ROCKFORD: StorePlan = woodmans({
  name: "Woodman's Rockford",
  lat: 42.3073,
  lon: -88.97473,
  aisles: 20,
  frozen: [21, 23],
});

/** Woodman's Sun Prairie, 1099 South Grand Avenue, Sun Prairie, WI 53590. Produce on the right wall, bakery front-right, dairy and meat across the back, frozen down the left wall, soda & water front-left. */
export const WOODMANS_SUN_PRAIRIE: StorePlan = woodmans({
  name: "Woodman's Sun Prairie",
  lat: 43.16455,
  lon: -89.26692,
  aisles: 23,
  frozen: [24, 26],
});

/** Woodman's Waukesha, 1600 E Main Street, Waukesha, WI 53186. Produce on the right wall, bakery front-right, dairy and meat across the back, frozen down the left wall, soda & water front-left. */
export const WOODMANS_WAUKESHA: StorePlan = woodmans({
  name: "Woodman's Waukesha",
  lat: 43.02215,
  lon: -88.20442,
  aisles: 23,
  frozen: [24, 26],
});

export const WOODMANS_PLANS: StorePlan[] = [
  WOODMANS_ALTOONA,
  WOODMANS_APPLETON,
  WOODMANS_BELOIT,
  WOODMANS_BLOOMINGDALE,
  WOODMANS_BUFFALO_GROVE,
  WOODMANS_CARPENTERSVILLE,
  WOODMANS_GREEN_BAY,
  WOODMANS_JANESVILLE,
  WOODMANS_KENOSHA,
  WOODMANS_LAKEMOOR,
  WOODMANS_MADISON_EAST,
  WOODMANS_MADISON_WEST,
  WOODMANS_MENOMONEE_FALLS,
  WOODMANS_NORTH_AURORA,
  WOODMANS_OAK_CREEK,
  WOODMANS_ONALASKA,
  WOODMANS_PLAINFIELD,
  WOODMANS_RACINE,
  WOODMANS_ROCKFORD,
  WOODMANS_SUN_PRAIRIE,
  WOODMANS_WAUKESHA,
];
