// A 2D top-down redstone simulator.
//
// It models a horizontal slice (the XZ plane seen from above) with believable
// vanilla mechanics: signal strength (0–15) with per-block decay, dust that only
// connects to dust / target blocks, power components (repeaters, comparators,
// torches, levers, buttons), solid blocks carrying strong/weak power, pistons that
// extend & push, TNT priming, and an optional quasi-connectivity rule.
//
// It is faithful in spirit rather than a bit-perfect vanilla replica (true QC is a
// vertical phenomenon; here "north" stands in for "the block above").

export type Dir = 0 | 1 | 2 | 3 // N, E, S, W
export const DIRS: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]]
export const opposite = (d: Dir): Dir => ((d + 2) % 4) as Dir

export const WOOL_COLORS = [
  'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray',
  'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black',
] as const
export type WoolColor = typeof WOOL_COLORS[number]

export type BlockType =
  | 'air'
  | 'redstone_block'
  | 'cobblestone'
  | 'obsidian'
  | 'piston'
  | 'sticky_piston'
  | 'piston_arm'
  | 'target'
  | 'dust'
  | 'repeater'
  | 'comparator'
  | 'lever'
  | 'button'
  | 'torch'
  | 'tnt'
  | 'redstone_lamp'
  | `wool_${WoolColor}`

export interface Cell {
  type: BlockType
  dir: Dir                 // facing/output for repeater, comparator, piston; mount side for torch
  // dynamic state
  leverOn: boolean
  buttonTimer: number
  torchLit: boolean
  repOn: boolean
  repBuf: boolean[]        // delay buffer (length = delay)
  delay: number            // repeater delay 1..4
  cmpMode: 0 | 1           // comparator: 0 compare, 1 subtract
  cmpOut: number
  pistonExtended: boolean
  armDir: Dir
  armSticky: boolean
  tntFuse: number          // -1 = inert
  power: number            // computed wire level (dust/target), for rendering
  blockPowered: boolean    // computed, for rendering
}

export function makeCell(type: BlockType = 'air', dir: Dir = 0): Cell {
  return {
    type, dir,
    leverOn: false, buttonTimer: 0, torchLit: type === 'torch',
    repOn: false, repBuf: [false], delay: 1,
    cmpMode: 0, cmpOut: 0,
    pistonExtended: false, armDir: 0, armSticky: false,
    tntFuse: -1, power: 0, blockPowered: false,
  }
}

// ── Block classification ────────────────────────────────────────────────────────

export const isWool = (t: BlockType): boolean => t.startsWith('wool_')

// Solid conductor blocks: can carry strong/weak power and dust connects onto them.
export function isConductor(t: BlockType): boolean {
  return t === 'cobblestone' || t === 'obsidian' || t === 'target' || isWool(t)
}
// Wire nodes that carry & decay a signal.
const isWire = (t: BlockType): boolean => t === 'dust' || t === 'target'
// Solid (blocks movement / dust connection underneath).
export function isSolid(t: BlockType): boolean {
  return isConductor(t) || t === 'redstone_block' || t === 'piston' ||
    t === 'sticky_piston' || t === 'piston_arm' || t === 'tnt' || t === 'redstone_lamp'
}
// Pushable by a piston.
function isPushable(t: BlockType): boolean {
  return t === 'cobblestone' || t === 'target' || t === 'redstone_block' ||
    t === 'tnt' || t === 'redstone_lamp' || isWool(t)  // obsidian & pistons are not pushable here
}
// "Non-attractive" mechanisms: dust doesn't connect to them as a wire — it must
// point straight into them (or be fed via a target block / direct source).
export function isMechanism(t: BlockType): boolean {
  return t === 'piston' || t === 'sticky_piston' || t === 'tnt' || t === 'redstone_lamp'
}

// Which of the 4 neighbours a dust at (x,y) connects to as a wire (for both
// signal-network rendering and the "points into" rule). Connects to: other dust,
// target blocks, block of redstone, levers, buttons, torches, and repeaters/
// comparators along their facing axis. NOT to plain blocks or mechanisms.
export function dustConnectionsOf(sim: RedstoneSim, x: number, y: number): boolean[] {
  const res = [false, false, false, false]
  for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
    const n = sim.at(x + DIRS[d][0], y + DIRS[d][1])
    if (!n) continue
    const t = n.type
    if (t === 'dust' || t === 'target' || t === 'redstone_block' ||
        t === 'lever' || t === 'button' || t === 'torch') {
      res[d] = true
    } else if (t === 'repeater' || t === 'comparator') {
      if (n.dir === d || n.dir === ((d + 2) % 4)) res[d] = true
    }
  }
  return res
}

// A dust "points into" direction `dir` when it has no perpendicular connection —
// i.e. it's a straight line along that axis (or an isolated dot). A bent/branched
// wire has a perpendicular connection and therefore does NOT point.
export function dustPointsInto(sim: RedstoneSim, x: number, y: number, dir: Dir): boolean {
  const c = dustConnectionsOf(sim, x, y)
  return !c[(dir + 1) % 4] && !c[(dir + 3) % 4]
}
// Destroyed (popped off) when something is pushed into it.
function isDestroyable(t: BlockType): boolean {
  return t === 'dust' || t === 'repeater' || t === 'comparator' ||
    t === 'lever' || t === 'button' || t === 'torch'
}

export interface SimOptions {
  quasiConnectivity: boolean
}

export class RedstoneSim {
  W: number
  H: number
  grid: Cell[]
  opts: SimOptions

  constructor(W: number, H: number, opts: SimOptions = { quasiConnectivity: true }) {
    this.W = W
    this.H = H
    this.grid = Array.from({ length: W * H }, () => makeCell())
    this.opts = opts
  }

  idx(x: number, y: number) { return y * this.W + x }
  inB(x: number, y: number) { return x >= 0 && y >= 0 && x < this.W && y < this.H }
  at(x: number, y: number): Cell | null { return this.inB(x, y) ? this.grid[this.idx(x, y)] : null }

  // ── Editing ───────────────────────────────────────────────────────────────────

  place(x: number, y: number, type: BlockType, dir: Dir = 0) {
    if (!this.inB(x, y)) return
    const cur = this.grid[this.idx(x, y)]
    if (cur.type === 'piston_arm') return // can't build on an extended arm
    const cell = makeCell(type, dir)
    if (type === 'torch') {
      // Mount to an adjacent solid block if there is one (dir = side it's stuck to).
      for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
        const n = this.at(x + DIRS[d][0], y + DIRS[d][1])
        if (n && isSolid(n.type)) { cell.dir = d; break }
      }
    }
    this.grid[this.idx(x, y)] = cell
  }

  remove(x: number, y: number) {
    if (!this.inB(x, y)) return
    const c = this.grid[this.idx(x, y)]
    if (c.type === 'piston_arm') return
    // retracting a piston removes its arm too
    if ((c.type === 'piston' || c.type === 'sticky_piston') && c.pistonExtended) {
      this.retractPiston(x, y, c)
    }
    this.grid[this.idx(x, y)] = makeCell()
  }

  rotate(x: number, y: number) {
    const c = this.at(x, y)
    if (!c) return
    if (['repeater', 'comparator', 'piston', 'sticky_piston', 'torch'].includes(c.type)) {
      c.dir = ((c.dir + 1) % 4) as Dir
    }
  }

  interact(x: number, y: number) {
    const c = this.at(x, y)
    if (!c) return
    if (c.type === 'lever') c.leverOn = !c.leverOn
    else if (c.type === 'button') c.buttonTimer = 12
    else if (c.type === 'repeater') c.delay = (c.delay % 4) + 1
    else if (c.type === 'comparator') c.cmpMode = (c.cmpMode ^ 1) as 0 | 1
  }

  // ── Power solving (combinational, within one tick) ──────────────────────────────

  // Signal a non-wire cell j provides into the neighbouring cell in direction `into`.
  private providerSignal(j: Cell, into: Dir, strong: Uint8Array, ji: number): number {
    switch (j.type) {
      case 'redstone_block': return 15
      case 'lever': return j.leverOn ? 15 : 0
      case 'button': return j.buttonTimer > 0 ? 15 : 0
      case 'torch': return j.torchLit ? 15 : 0
      case 'repeater': return j.repOn && j.dir === into ? 15 : 0
      case 'comparator': return j.cmpOut > 0 && j.dir === into ? j.cmpOut : 0
      default:
        return strong[ji] // strongly powered conductor → 15
    }
  }

  private solve() {
    const { W, H, grid } = this
    const N = W * H
    const strong = new Uint8Array(N)  // conductor strongly powered → emits 15
    const wire = new Int8Array(N).fill(-1)

    // 1. Strong-power conductors that have a repeater/torch/comparator/lever/button
    //    feeding into them.
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = this.idx(x, y)
      if (!isConductor(grid[i].type)) continue
      let s = false
      for (let d = 0 as Dir; d < 4 && !s; d = (d + 1) as Dir) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1]
        if (!this.inB(nx, ny)) continue
        const j = grid[this.idx(nx, ny)]
        const into = opposite(d) // direction from j into i
        if (
          (j.type === 'repeater' && j.repOn && j.dir === into) ||
          (j.type === 'comparator' && j.cmpOut > 0 && j.dir === into) ||
          (j.type === 'torch' && j.torchLit && j.dir !== d) ||  // torch not mounted on i
          (j.type === 'lever' && j.leverOn) ||
          (j.type === 'button' && j.buttonTimer > 0)
        ) s = true
      }
      if (s) strong[i] = 15
    }

    // 2. Seed wire nodes (dust/target) from adjacent non-wire providers.
    for (let i = 0; i < N; i++) if (isWire(grid[i].type)) wire[i] = 0
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = this.idx(x, y)
      if (wire[i] < 0) continue
      let seed = 0
      for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1]
        if (!this.inB(nx, ny)) continue
        const ji = this.idx(nx, ny)
        const j = grid[ji]
        if (isWire(j.type)) continue // wire-to-wire handled by relaxation
        seed = Math.max(seed, this.providerSignal(j, opposite(d), strong, ji))
      }
      wire[i] = seed
    }

    // 3. Relax wire network (dust/target connect orthogonally, −1 per step).
    for (let pass = 0; pass < 16; pass++) {
      let changed = false
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = this.idx(x, y)
        if (wire[i] < 0) continue
        let best = wire[i]
        for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
          const nx = x + DIRS[d][0], ny = y + DIRS[d][1]
          if (!this.inB(nx, ny)) continue
          const ni = this.idx(nx, ny)
          if (wire[ni] > best + 1) best = wire[ni] - 1
        }
        if (best > wire[i]) { wire[i] = best; changed = true }
      }
      if (!changed) break
    }

    // 4. Weak-power conductors touched by an energised wire.
    const weak = new Uint8Array(N)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = this.idx(x, y)
      if (!isConductor(grid[i].type)) continue
      if (strong[i]) { weak[i] = 1; continue }
      for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1]
        if (!this.inB(nx, ny)) continue
        const ni = this.idx(nx, ny)
        if (wire[ni] > 0) { weak[i] = 1; break }
      }
    }

    return { wire, strong, weak }
  }

  // True if a component at (x,y) would be powered by its neighbours.
  private componentPoweredAt(
    x: number, y: number,
    wire: Int8Array, strong: Uint8Array, weak: Uint8Array,
  ): boolean {
    for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1]
      if (!this.inB(nx, ny)) continue
      const ji = this.idx(nx, ny)
      const j = this.grid[ji]
      // Direct sources / strongly-powered blocks
      if (this.providerSignal(j, opposite(d), strong, ji) > 0) return true
      // A powered conductor block (strong or weak)
      if (isConductor(j.type) && (strong[ji] || weak[ji])) return true
      // Target block carrying signal powers components; plain dust does NOT…
      if (j.type === 'target' && wire[ji] > 0) return true
      // …unless the dust is a straight line pointing into this component.
      if (j.type === 'dust' && wire[ji] > 0 && dustPointsInto(this, nx, ny, opposite(d))) return true
    }
    return false
  }

  private pistonPowered(x: number, y: number, wire: Int8Array, strong: Uint8Array, weak: Uint8Array): boolean {
    if (this.componentPoweredAt(x, y, wire, strong, weak)) return true
    // Quasi-connectivity: "the block above" → the cell to the north in this 2D view.
    if (this.opts.quasiConnectivity) {
      const ny = y - 1
      if (this.inB(x, ny) && this.componentPoweredAt(x, ny, wire, strong, weak)) return true
    }
    return false
  }

  // ── Tick ────────────────────────────────────────────────────────────────────────

  step() {
    const { W, H, grid } = this
    const { wire, strong, weak } = this.solve()

    // Snapshot next torch / repeater / comparator states (computed from current power).
    const newTorch: boolean[] = new Array(W * H)
    const newCmp: number[] = new Array(W * H)
    const pistonAct: boolean[] = new Array(W * H)
    const tntAct: boolean[] = new Array(W * H)

    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = this.idx(x, y)
      const c = grid[i]
      // store render info
      c.power = wire[i] > 0 ? wire[i] : 0
      c.blockPowered = isConductor(c.type) ? !!(strong[i] || weak[i]) : false

      if (c.type === 'torch') {
        const mx = x + DIRS[c.dir][0], my = y + DIRS[c.dir][1]
        const m = this.at(mx, my)
        const mPow = m && isConductor(m.type) && (strong[this.idx(mx, my)] || weak[this.idx(mx, my)])
        newTorch[i] = !mPow
      } else if (c.type === 'comparator') {
        const rear = this.signalFrom(x, y, opposite(c.dir), wire, strong)
        const sideA = this.signalFrom(x, y, ((c.dir + 1) % 4) as Dir, wire, strong)
        const sideB = this.signalFrom(x, y, ((c.dir + 3) % 4) as Dir, wire, strong)
        const side = Math.max(sideA, sideB)
        newCmp[i] = c.cmpMode === 1 ? Math.max(0, rear - side) : (rear >= side ? rear : 0)
      } else if (c.type === 'piston' || c.type === 'sticky_piston') {
        pistonAct[i] = this.pistonPowered(x, y, wire, strong, weak)
      } else if (c.type === 'tnt') {
        tntAct[i] = this.componentPoweredAt(x, y, wire, strong, weak)
      } else if (c.type === 'redstone_lamp') {
        c.blockPowered = this.componentPoweredAt(x, y, wire, strong, weak)
      }
    }

    // Commit torches
    for (let i = 0; i < W * H; i++) if (grid[i].type === 'torch') grid[i].torchLit = newTorch[i]
    // Commit comparators (1-tick delay)
    for (let i = 0; i < W * H; i++) if (grid[i].type === 'comparator') grid[i].cmpOut = newCmp[i]

    // Repeaters: shift delay buffer
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = grid[this.idx(x, y)]
      if (c.type !== 'repeater') continue
      const input = this.signalFrom(x, y, opposite(c.dir), wire, strong) > 0
      if (c.repBuf.length !== c.delay) {
        c.repBuf = new Array(c.delay).fill(c.repOn)
      }
      c.repBuf.push(input)
      c.repOn = c.repBuf.shift() ?? false
    }

    // Pistons: extend / retract on state change
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = grid[this.idx(x, y)]
      if (c.type !== 'piston' && c.type !== 'sticky_piston') continue
      const want = pistonAct[this.idx(x, y)]
      if (want && !c.pistonExtended) this.extendPiston(x, y, c)
      else if (!want && c.pistonExtended) this.retractPiston(x, y, c)
    }

    // TNT fuse handling
    const toExplode: [number, number][] = []
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = grid[this.idx(x, y)]
      if (c.type !== 'tnt') continue
      if (c.tntFuse < 0 && tntAct[this.idx(x, y)]) c.tntFuse = 16
      if (c.tntFuse >= 0) { c.tntFuse--; if (c.tntFuse < 0) toExplode.push([x, y]) }
    }
    for (const [x, y] of toExplode) this.explode(x, y)

    // Buttons countdown
    for (const c of grid) if (c.type === 'button' && c.buttonTimer > 0) c.buttonTimer--
  }

  // Signal arriving at (x,y) from the neighbour in direction d.
  private signalFrom(x: number, y: number, d: Dir, wire: Int8Array, strong: Uint8Array): number {
    const nx = x + DIRS[d][0], ny = y + DIRS[d][1]
    if (!this.inB(nx, ny)) return 0
    const ji = this.idx(nx, ny)
    const j = this.grid[ji]
    if (isWire(j.type)) return Math.max(0, wire[ji])
    return this.providerSignal(j, opposite(d), strong, ji)
  }

  // ── Pistons ───────────────────────────────────────────────────────────────────

  private extendPiston(x: number, y: number, c: Cell) {
    const [dx, dy] = DIRS[c.dir]
    const fx = x + dx, fy = y + dy
    if (!this.inB(fx, fy)) return
    // collect the line of pushable blocks in front
    const blocks: number[] = []
    let cx = fx, cy = fy
    for (let k = 0; k < 13; k++) {
      if (!this.inB(cx, cy)) return // pushed out of bounds → can't extend
      const t = this.grid[this.idx(cx, cy)].type
      if (t === 'air') break
      if (isDestroyable(t)) break
      if (isPushable(t)) { blocks.push(this.idx(cx, cy)); cx += dx; cy += dy; continue }
      return // immovable (obsidian, another piston, arm)
    }
    // destination of the furthest block
    const endX = fx + dx * blocks.length, endY = fy + dy * blocks.length
    if (!this.inB(endX, endY) && blocks.length > 0) return
    // shift blocks forward (far → near)
    for (let k = blocks.length - 1; k >= 0; k--) {
      const sx = fx + dx * k, sy = fy + dy * k
      this.grid[this.idx(sx + dx, sy + dy)] = this.grid[this.idx(sx, sy)]
    }
    // place arm in the front cell
    const arm = makeCell('piston_arm')
    arm.armDir = c.dir
    arm.armSticky = c.type === 'sticky_piston'
    this.grid[this.idx(fx, fy)] = arm
    c.pistonExtended = true
  }

  private retractPiston(x: number, y: number, c: Cell) {
    const [dx, dy] = DIRS[c.dir]
    const fx = x + dx, fy = y + dy
    if (this.inB(fx, fy) && this.grid[this.idx(fx, fy)].type === 'piston_arm') {
      this.grid[this.idx(fx, fy)] = makeCell()
      // sticky: pull the block in front of the arm back
      if (c.type === 'sticky_piston') {
        const bx = fx + dx, by = fy + dy
        if (this.inB(bx, by)) {
          const b = this.grid[this.idx(bx, by)]
          if (isPushable(b.type)) {
            this.grid[this.idx(fx, fy)] = b
            this.grid[this.idx(bx, by)] = makeCell()
          }
        }
      }
    }
    c.pistonExtended = false
  }

  private explode(x: number, y: number) {
    const R = 2
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > R * R + 1) continue
      const nx = x + dx, ny = y + dy
      if (!this.inB(nx, ny)) continue
      const c = this.grid[this.idx(nx, ny)]
      if (c.type === 'obsidian') continue // blast-resistant
      if (c.type === 'piston_arm') continue
      if (c.type === 'tnt' && (dx || dy) && c.tntFuse < 0) { c.tntFuse = 4; continue } // chain
      this.grid[this.idx(nx, ny)] = makeCell()
    }
  }
}
