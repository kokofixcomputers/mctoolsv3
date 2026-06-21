mod rng;
mod ores;

use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};
use rng::{JavaRandom, Xoroshiro};
use ores::{ore_configs, place_blob, Dist, OreConfig, OrePlacement};

// ── Seed utilities ────────────────────────────────────────────────────────────

fn java_string_hash(s: &str) -> i64 {
    let mut h: i32 = 0;
    for ch in s.chars() {
        h = h.wrapping_mul(31).wrapping_add(ch as i32);
    }
    h as i64
}

fn parse_seed(s: &str) -> i64 {
    let trimmed = s.trim();
    if let Ok(n) = trimmed.parse::<i64>() { return n; }
    java_string_hash(trimmed)
}

// ── Chunk RNG seeding — 1.18+ Xoroshiro path ─────────────────────────────────
//
// Matches net.minecraft.world.level.levelgen.WorldgenRandom.setDecorationSeed
// which Minecraft uses to seed each chunk's feature placement.

fn decoration_seed(world_seed: i64, chunk_x: i32, chunk_z: i32) -> i64 {
    world_seed
        .wrapping_add((chunk_x as i64).wrapping_mul(341873128712))
        .wrapping_add((chunk_z as i64).wrapping_mul(132897987541))
}

fn feature_seed(decoration_seed: i64, feature_index: i32) -> i64 {
    // Minecraft mixes the decoration seed with the feature index
    // In 1.18+ this uses xxhash-style mixing per-feature; we approximate with a simple mix
    decoration_seed
        .wrapping_add((feature_index as i64).wrapping_mul(0x4a3b195e6d3c5f7b_u64 as i64))
}

// ── Y distribution sampling ───────────────────────────────────────────────────

fn sample_y<R: ores::OreRng>(rng: &mut R, placement: &OrePlacement) -> i32 {
    let range = (placement.max_y - placement.min_y).max(1);
    match placement.dist {
        Dist::Uniform => placement.min_y + rng.next_int_bounded(range),
        Dist::Triangle => {
            // Triangle distribution: pick two uniform samples and average
            let a = rng.next_int_bounded(range);
            let b = rng.next_int_bounded(range);
            placement.min_y + (a + b) / 2
        }
        Dist::BiasedBottom => {
            let a = rng.next_int_bounded(range);
            let b = rng.next_int_bounded(range);
            let c = rng.next_int_bounded(range);
            placement.min_y + a.min(b).min(c)
        }
    }
}

// ── Search result types ───────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct OreCluster {
    pub x: i32,
    pub y: i32,
    pub z: i32,
    pub ores: u32,
}

#[derive(Serialize)]
pub struct SearchResult {
    pub clusters_found: u32,
    pub ores_found: u32,
    pub clusters: Vec<OreCluster>,
    pub seed_used: i64,
    pub center_x: i32,
    pub center_z: i32,
    pub radius: i32,
}

// ── Core search ──────────────────────────────────────────────────────────────

fn search_chunk(world_seed: i64, chunk_x: i32, chunk_z: i32, config: &OreConfig) -> Vec<OreCluster> {
    let decor = decoration_seed(world_seed, chunk_x, chunk_z);
    let block_x = chunk_x * 16;
    let block_z = chunk_z * 16;

    let mut clusters = Vec::new();

    for (pi, placement) in config.placements.iter().enumerate() {
        let fseed = feature_seed(decor, pi as i32);
        let mut rng = Xoroshiro::from_seed(fseed);

        // Consume two longs per feature the way Minecraft does before feature use
        let _skip1 = rng.next_long();
        let _skip2 = rng.next_long();

        let count = placement.count.max(1);
        for _ in 0..count {
            let cx = block_x + rng.next_int_bounded(16);
            let cy = sample_y(&mut rng, placement);
            let cz = block_z + rng.next_int_bounded(16);

            let blocks = place_blob(&mut rng, cx, cy, cz, placement.size, placement.discard_air_adj);

            if !blocks.is_empty() {
                // Centroid
                let sum_x: i32 = blocks.iter().map(|b| b.x).sum();
                let sum_y: i32 = blocks.iter().map(|b| b.y).sum();
                let sum_z: i32 = blocks.iter().map(|b| b.z).sum();
                let n = blocks.len() as i32;
                clusters.push(OreCluster {
                    x: sum_x / n,
                    y: sum_y / n,
                    z: sum_z / n,
                    ores: blocks.len() as u32,
                });
            }
        }
    }

    clusters
}

// ── WASM export ──────────────────────────────────────────────────────────────

#[wasm_bindgen]
pub fn find_ores_beta(
    seed_str: &str,
    center_x: i32,
    center_z: i32,
    radius: i32,
    ore_id: u8,
) -> JsValue {
    let world_seed = parse_seed(seed_str);
    let configs = ore_configs();
    let config = match configs.iter().find(|c| c.id == ore_id) {
        Some(c) => c.clone(),
        None => return serde_wasm_bindgen::to_value(&SearchResult {
            clusters_found: 0, ores_found: 0, clusters: vec![],
            seed_used: world_seed, center_x, center_z, radius,
        }).unwrap_or(JsValue::NULL),
    };

    let radius = radius.max(1).min(20);
    let chunk_cx = center_x >> 4;
    let chunk_cz = center_z >> 4;

    let mut all_clusters: Vec<OreCluster> = Vec::new();

    for dz in -radius..=radius {
        for dx in -radius..=radius {
            let chunk_clusters = search_chunk(world_seed, chunk_cx + dx, chunk_cz + dz, &config);
            all_clusters.extend(chunk_clusters);
        }
    }

    // Sort by Y desc (highest ore count first), then by distance from center
    let cx_f = center_x as f64;
    let cz_f = center_z as f64;
    all_clusters.sort_by(|a, b| {
        let da = (a.x as f64 - cx_f).powi(2) + (a.z as f64 - cz_f).powi(2);
        let db = (b.x as f64 - cx_f).powi(2) + (b.z as f64 - cz_f).powi(2);
        b.ores.cmp(&a.ores).then(da.partial_cmp(&db).unwrap_or(std::cmp::Ordering::Equal))
    });

    let ores_found: u32 = all_clusters.iter().map(|c| c.ores).sum();

    let result = SearchResult {
        clusters_found: all_clusters.len() as u32,
        ores_found,
        clusters: all_clusters,
        seed_used: world_seed,
        center_x,
        center_z,
        radius,
    };

    serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
}

/// List available ore types from the engine
#[wasm_bindgen]
pub fn list_ore_types() -> JsValue {
    #[derive(Serialize)]
    struct OreType { id: u8, name: String }
    let types: Vec<OreType> = ore_configs()
        .iter()
        .map(|c| OreType { id: c.id, name: c.name.to_string() })
        .collect();
    serde_wasm_bindgen::to_value(&types).unwrap_or(JsValue::NULL)
}
