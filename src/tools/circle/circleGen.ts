export type ShapeType = 'circle' | 'ellipse' | 'square' | 'rectangle' | 'diamond'
export type FillMode = 'outline' | 'filled'

export interface ShapeOptions {
  shape: ShapeType
  width: number
  height: number
  mode: FillMode
}

// Returns a flat boolean[] of size width*height, row-major (y outer, x inner)
export function generateShape(opts: ShapeOptions): boolean[] {
  const { width: W, height: H, mode, shape } = opts
  const grid = new Array(W * H).fill(false)

  if (shape === 'square' || shape === 'rectangle') {
    if (mode === 'filled') {
      grid.fill(true)
    } else {
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          if (x === 0 || x === W - 1 || y === 0 || y === H - 1) {
            grid[y * W + x] = true
          }
        }
      }
    }
    return grid
  }

  if (shape === 'diamond') {
    const cx = (W - 1) / 2
    const cy = (H - 1) / 2
    const rx = W / 2
    const ry = H / 2
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const nx = Math.abs(x - cx) / rx
        const ny = Math.abs(y - cy) / ry
        const inside = nx + ny <= 1
        if (!inside) continue
        if (mode === 'filled') {
          grid[y * W + x] = true
        } else {
          const onEdge =
            x === 0 || x === W - 1 || y === 0 || y === H - 1 ||
            Math.abs(x - cx + 1) / rx + ny > 1 ||
            Math.abs(x - cx - 1) / rx + ny > 1 ||
            nx + Math.abs(y - cy + 1) / ry > 1 ||
            nx + Math.abs(y - cy - 1) / ry > 1
          if (onEdge) grid[y * W + x] = true
        }
      }
    }
    return grid
  }

  // circle / ellipse — use the scan-line boundary algorithm for crisp outlines
  if (mode === 'filled') {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (insideEllipse(x, y, W, H)) grid[y * W + x] = true
      }
    }
  } else {
    // For each row, mark leftmost & rightmost pixel on the ellipse boundary
    for (let y = 0; y < H; y++) {
      // find the x range for this row
      const { left, right } = rowRange(y, W, H)
      if (left !== -1) grid[y * W + left] = true
      if (right !== -1 && right !== left) grid[y * W + right] = true
    }
    // For each column, mark topmost & bottommost pixel
    for (let x = 0; x < W; x++) {
      const { top, bottom } = colRange(x, W, H)
      if (top !== -1) grid[top * W + x] = true
      if (bottom !== -1 && bottom !== top) grid[bottom * W + x] = true
    }
  }

  return grid
}

// A pixel (x,y) is "inside" the ellipse that fits exactly in [0..W-1]×[0..H-1]
function insideEllipse(x: number, y: number, W: number, H: number): boolean {
  const nx = (2 * x - W + 1)   // range -(W-1) to (W-1)
  const ny = (2 * y - H + 1)
  return nx * nx * H * H + ny * ny * W * W <= W * W * H * H
}

function rowRange(y: number, W: number, H: number): { left: number; right: number } {
  let left = -1, right = -1
  for (let x = 0; x < W; x++) {
    if (insideEllipse(x, y, W, H)) {
      if (left === -1) left = x
      right = x
    }
  }
  return { left, right }
}

function colRange(x: number, W: number, H: number): { top: number; bottom: number } {
  let top = -1, bottom = -1
  for (let y = 0; y < H; y++) {
    if (insideEllipse(x, y, W, H)) {
      if (top === -1) top = y
      bottom = y
    }
  }
  return { top, bottom }
}

// Row/column block counts for the ruler display
export function rowCounts(grid: boolean[], W: number, H: number): number[] {
  return Array.from({ length: H }, (_, y) => {
    let count = 0
    for (let x = 0; x < W; x++) if (grid[y * W + x]) count++
    return count
  })
}

export function colCounts(grid: boolean[], W: number, H: number): number[] {
  return Array.from({ length: W }, (_, x) => {
    let count = 0
    for (let y = 0; y < H; y++) if (grid[y * W + x]) count++
    return count
  })
}

export function totalBlocks(grid: boolean[]): number {
  return grid.filter(Boolean).length
}
