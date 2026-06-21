// Ore placement rules matching Minecraft 1.18+ worldgen data
// Sources: MC wiki, MC source decompiles, and measured generation data

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Dist {
    Uniform,
    Triangle, // peaks at midpoint
    BiasedBottom, // heavily biased toward minY
}

#[derive(Clone)]
pub struct OrePlacement {
    pub min_y: i32,
    pub max_y: i32,
    pub dist: Dist,
    pub count: i32,  // attempts per chunk
    pub size: i32,   // max blob size
    pub discard_air_adj: bool, // skip blocks adjacent to air (buried-only)
}

#[derive(Clone)]
pub struct OreConfig {
    pub id: u8,
    pub name: &'static str,
    pub placements: Vec<OrePlacement>,
    pub nether: bool,
}

pub fn ore_configs() -> Vec<OreConfig> {
    vec![
        // ── Diamond ─────────────────────────────────────────────────────────────
        OreConfig {
            id: 1, name: "Diamond", nether: false,
            placements: vec![
                OrePlacement { min_y: -64, max_y: 16, dist: Dist::Triangle, count: 7,  size: 9, discard_air_adj: true },
                OrePlacement { min_y: -64, max_y: 16, dist: Dist::Triangle, count: 3,  size: 9, discard_air_adj: false },
            ],
        },
        // ── Ancient Debris ───────────────────────────────────────────────────────
        OreConfig {
            id: 2, name: "Ancient Debris", nether: true,
            placements: vec![
                OrePlacement { min_y:  8, max_y:  24, dist: Dist::Triangle, count: 2,  size: 3, discard_air_adj: false },
                OrePlacement { min_y:  8, max_y: 119, dist: Dist::Uniform,  count: 1,  size: 2, discard_air_adj: false },
            ],
        },
        // ── Redstone ────────────────────────────────────────────────────────────
        OreConfig {
            id: 3, name: "Redstone", nether: false,
            placements: vec![
                OrePlacement { min_y: -64, max_y: 15, dist: Dist::Uniform,  count: 4,  size: 8, discard_air_adj: false },
                OrePlacement { min_y: -32, max_y: -1, dist: Dist::Triangle, count: 8,  size: 8, discard_air_adj: false },
            ],
        },
        // ── Iron ─────────────────────────────────────────────────────────────────
        OreConfig {
            id: 4, name: "Iron", nether: false,
            placements: vec![
                OrePlacement { min_y: -64, max_y:  72, dist: Dist::Triangle, count: 10, size: 9, discard_air_adj: false },
                OrePlacement { min_y:  -8, max_y:  56, dist: Dist::Triangle, count: 10, size: 9, discard_air_adj: false },
                OrePlacement { min_y:  80, max_y: 384, dist: Dist::Triangle, count: 10, size: 20, discard_air_adj: false },
            ],
        },
        // ── Emerald ──────────────────────────────────────────────────────────────
        OreConfig {
            id: 5, name: "Emerald", nether: false,
            placements: vec![
                OrePlacement { min_y: -16, max_y: 480, dist: Dist::Triangle, count: 6, size: 3, discard_air_adj: false },
            ],
        },
        // ── Gold ─────────────────────────────────────────────────────────────────
        OreConfig {
            id: 6, name: "Gold", nether: false,
            placements: vec![
                OrePlacement { min_y: -64, max_y:  32, dist: Dist::Uniform,  count: 4,  size: 9, discard_air_adj: false },
                OrePlacement { min_y: -64, max_y:  32, dist: Dist::Triangle, count: 4,  size: 9, discard_air_adj: false },
            ],
        },
        // ── Lapis Lazuli ─────────────────────────────────────────────────────────
        OreConfig {
            id: 7, name: "Lapis Lazuli", nether: false,
            placements: vec![
                OrePlacement { min_y: -64, max_y: 64,  dist: Dist::Triangle, count: 2,  size: 7, discard_air_adj: false },
                OrePlacement { min_y: -64, max_y:  0,  dist: Dist::Uniform,  count: 4,  size: 7, discard_air_adj: true },
            ],
        },
        // ── Coal ─────────────────────────────────────────────────────────────────
        OreConfig {
            id: 8, name: "Coal", nether: false,
            placements: vec![
                OrePlacement { min_y:   0, max_y: 192, dist: Dist::Triangle, count: 20, size: 17, discard_air_adj: false },
                OrePlacement { min_y: 136, max_y: 320, dist: Dist::Uniform,  count: 30, size: 17, discard_air_adj: false },
            ],
        },
        // ── Copper ───────────────────────────────────────────────────────────────
        OreConfig {
            id: 9, name: "Copper", nether: false,
            placements: vec![
                OrePlacement { min_y: -16, max_y: 112, dist: Dist::Triangle, count: 6,  size: 20, discard_air_adj: false },
            ],
        },
    ]
}

// ── Ore blob placement ────────────────────────────────────────────────────────
//
// Faithful reproduction of net.minecraft.world.level.levelgen.feature.OreFeature
// The blob is a chain of overlapping spheres along a randomly-oriented spine.

#[derive(Clone)]
pub struct BlockPos {
    pub x: i32,
    pub y: i32,
    pub z: i32,
}

fn lerp(t: f64, a: f64, b: f64) -> f64 {
    a + t * (b - a)
}

/// Place one ore blob. Returns the set of block positions (relative to world).
/// `rng` must implement `next_float()`, `next_double()`, `next_int_bounded(n)`.
pub fn place_blob<R: OreRng>(
    rng: &mut R,
    center_x: i32,
    center_y: i32,
    center_z: i32,
    size: i32,
    discard_air_adj: bool,
) -> Vec<BlockPos> {
    let angle = rng.next_float() as f64 * std::f64::consts::PI;
    let half = size as f64 / 8.0;
    let x1 = center_x as f64 + angle.sin() * half;
    let x2 = center_x as f64 - angle.sin() * half;
    let z1 = center_z as f64 + angle.cos() * half;
    let z2 = center_z as f64 - angle.cos() * half;
    let y1 = center_y as f64 + rng.next_int_bounded(3) as f64 - 2.0;
    let y2 = center_y as f64 + rng.next_int_bounded(3) as f64 - 2.0;

    let n = size as usize;

    // MC uses a BitSet to deduplicate blocks across overlapping spheres.
    use std::collections::HashSet;
    let mut seen: HashSet<(i32, i32, i32)> = HashSet::new();
    let mut out = Vec::new();

    for i in 0..n {
        // MC: f = (float)i / (float)size  — NOT i/(size-1)
        let f = i as f64 / n as f64;
        let cx = lerp(f, x1, x2);
        let cy = lerp(f, y1, y2);
        let cz = lerp(f, z1, z2);

        // d = random * size / 16
        // sr = ((sin(PI * f) + 1) * d + 1) / 2     ← the /2 was missing before
        let d = rng.next_double() * n as f64 / 16.0;
        let sr = (((std::f64::consts::PI * f).sin() + 1.0) * d + 1.0) / 2.0;

        if sr <= 0.0 { continue; }

        // Exact MC bounding box: floor(center ± sr) — no extra padding
        let min_x = (cx - sr).floor() as i32;
        let max_x = (cx + sr).floor() as i32;
        let min_y = (cy - sr).floor() as i32;
        let max_y = (cy + sr).floor() as i32;
        let min_z = (cz - sr).floor() as i32;
        let max_z = (cz + sr).floor() as i32;

        for bx in min_x..=max_x {
            let dx = (bx as f64 + 0.5 - cx) / sr;
            if dx * dx >= 1.0 { continue; }
            for by in min_y..=max_y {
                let dy = (by as f64 + 0.5 - cy) / sr;
                if dx * dx + dy * dy >= 1.0 { continue; }
                for bz in min_z..=max_z {
                    let dz = (bz as f64 + 0.5 - cz) / sr;
                    if dx * dx + dy * dy + dz * dz < 1.0 {
                        // discard_air_adj approximation: skip blocks at high Y (likely exposed)
                        if discard_air_adj && by > 0 { continue; }
                        if seen.insert((bx, by, bz)) {
                            out.push(BlockPos { x: bx, y: by, z: bz });
                        }
                    }
                }
            }
        }
    }
    out
}

// Trait abstracting over JavaRandom / Xoroshiro
pub trait OreRng {
    fn next_int_bounded(&mut self, n: i32) -> i32;
    fn next_float(&mut self) -> f32;
    fn next_double(&mut self) -> f64;
}

impl OreRng for crate::rng::JavaRandom {
    fn next_int_bounded(&mut self, n: i32) -> i32 { self.next_int_bounded(n) }
    fn next_float(&mut self) -> f32 { self.next_float() }
    fn next_double(&mut self) -> f64 { self.next_double() }
}

impl OreRng for crate::rng::Xoroshiro {
    fn next_int_bounded(&mut self, n: i32) -> i32 { self.next_int_bounded(n) }
    fn next_float(&mut self) -> f32 { self.next_float() }
    fn next_double(&mut self) -> f64 { self.next_double() }
}
