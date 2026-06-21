import type { OreFinderResult } from "./api";
import { ore_finder } from "./api";

export type OreType = {
  id: number;
  name: string;
};

export const ORE_TYPES: OreType[] = [
  { id: 1, name: "Diamond" },
  { id: 2, name: "Ancient Debris" },
  { id: 3, name: "Redstone" },
  { id: 4, name: "Iron" },
  { id: 5, name: "Emerald" },
  { id: 6, name: "Gold" },
  { id: 7, name: "Lapis Lazuli" },
  { id: 8, name: "Coal" },
  { id: 9, name: "Copper" },
];

export type { OreFinderResult };

export async function findOres(
  seed: string,
  x: number,
  z: number,
  radius: number,
  oreType: number,
  edition: "Java" | "Bedrock",
  version: string
): Promise<OreFinderResult> {
  return ore_finder({
    edition,
    version,
    seed,
    x,
    z,
    radius,
    oreIndex: oreType,
  });
}
