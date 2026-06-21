// Java Linear Congruential Generator — used by Minecraft pre-1.18 worldgen
pub struct JavaRandom {
    seed: u64,
}

const MULTIPLIER: u64 = 0x5DEECE66D;
const ADDEND: u64 = 0xB;
const MASK: u64 = (1u64 << 48) - 1;

impl JavaRandom {
    pub fn new(seed: i64) -> Self {
        JavaRandom {
            seed: (seed as u64 ^ MULTIPLIER) & MASK,
        }
    }

    fn next(&mut self, bits: u32) -> i32 {
        self.seed = self.seed.wrapping_mul(MULTIPLIER).wrapping_add(ADDEND) & MASK;
        (self.seed >> (48 - bits)) as i32
    }

    pub fn next_long(&mut self) -> i64 {
        ((self.next(32) as i64) << 32).wrapping_add(self.next(32) as i64)
    }

    pub fn next_int_bounded(&mut self, bound: i32) -> i32 {
        debug_assert!(bound > 0);
        if bound & bound.wrapping_neg() == bound {
            return (((bound as i64).wrapping_mul(self.next(31) as i64)) >> 31) as i32;
        }
        loop {
            let bits = self.next(31);
            let val = bits % bound;
            if bits - val + (bound - 1) >= 0 {
                return val;
            }
        }
    }

    pub fn next_float(&mut self) -> f32 {
        self.next(24) as f32 / (1u32 << 24) as f32
    }

    pub fn next_double(&mut self) -> f64 {
        let hi = self.next(26) as i64;
        let lo = self.next(27) as i64;
        ((hi << 27).wrapping_add(lo)) as f64 / (1i64 << 53) as f64
    }
}

// Xoroshiro 128++ — Minecraft 1.18+ worldgen RNG
pub struct Xoroshiro {
    lo: u64,
    hi: u64,
}

fn split_mix(state: &mut u64) -> u64 {
    *state = state.wrapping_add(0x9E3779B97F4A7C15);
    let mut z = *state;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58476D1CE4E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D049BB133111EB);
    z ^ (z >> 31)
}

impl Xoroshiro {
    pub fn from_seed(seed: i64) -> Self {
        let mut s = seed as u64;
        let lo = split_mix(&mut s);
        let hi = split_mix(&mut s);
        Xoroshiro { lo, hi }
    }

    pub fn from_two_seeds(lo: i64, hi: i64) -> Self {
        let mut x = Xoroshiro { lo: lo as u64, hi: hi as u64 };
        // Mix to avoid weak states
        x.lo ^= 0x6C62272E07BB0142;
        x.hi ^= 0x62B821756295C58D;
        x
    }

    pub fn next_long(&mut self) -> i64 {
        let s0 = self.lo;
        let mut s1 = self.hi;
        let result = s0.wrapping_add(s1).rotate_left(17).wrapping_add(s0);
        s1 ^= s0;
        self.lo = s0.rotate_left(49) ^ s1 ^ (s1 << 21);
        self.hi = s1.rotate_left(28);
        result as i64
    }

    pub fn next_int_bounded(&mut self, bound: i32) -> i32 {
        // Matches Minecraft's XoroshiroRandomSource.nextInt(bound):
        // (nextLong() >>> 1) % bound  — simple 63-bit positive modulo
        debug_assert!(bound > 0);
        let bits = (self.next_long() as u64) >> 1;
        (bits % bound as u64) as i32
    }

    pub fn next_float(&mut self) -> f32 {
        // Top 24 bits / 2^24
        let bits = (self.next_long() as u64 >> 40) as u32;
        bits as f32 / (1u32 << 24) as f32
    }

    pub fn next_double(&mut self) -> f64 {
        // Top 53 bits / 2^53
        let bits = (self.next_long() as u64) >> 11;
        bits as f64 / (1u64 << 53) as f64
    }
}
