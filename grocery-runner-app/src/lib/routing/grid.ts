import { Cell } from '../types';

/**
 * A store floor as a 2D grid. `true` = walkable floor, `false` = shelf, fixture or wall.
 * x grows to the right, y grows toward the back of the store.
 */
export class StoreGrid {
  readonly width: number;
  readonly height: number;
  private readonly walkable: boolean[];

  constructor(width: number, height: number, fill = true) {
    this.width = width;
    this.height = height;
    this.walkable = new Array(width * height).fill(fill);
  }

  inBounds(c: Cell): boolean {
    return c.x >= 0 && c.y >= 0 && c.x < this.width && c.y < this.height;
  }

  isWalkable(c: Cell): boolean {
    return this.inBounds(c) && this.walkable[c.y * this.width + c.x];
  }

  setBlocked(c: Cell, blocked = true): void {
    if (this.inBounds(c)) this.walkable[c.y * this.width + c.x] = !blocked;
  }

  /** Block a filled rectangle (inclusive corners), e.g. a shelving unit. */
  blockRect(x1: number, y1: number, x2: number, y2: number): void {
    for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
      for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) this.setBlocked({ x, y });
    }
  }

  /** 4-way neighbours that can be walked on. No diagonals, so paths never cut shelf corners. */
  neighbours(c: Cell): Cell[] {
    const out: Cell[] = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const n = { x: c.x + dx, y: c.y + dy };
      if (this.isWalkable(n)) out.push(n);
    }
    return out;
  }

  index(c: Cell): number {
    return c.y * this.width + c.x;
  }
}

export const sameCell = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;
export const manhattan = (a: Cell, b: Cell) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
