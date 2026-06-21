/// <reference lib="webworker" />

console.log("[oreWorker] starting");

// We will fill these from the dynamic import.
let World: any;
let Zone: any;
let OreFinder: any;

type WorkerOreParams = {
  edition: number;
  version: number;
  lo: number;
  hi: number;
  x: number;
  z: number;
  radius: number;
  oreIndex: number;
};

type WorkerRequest = {
  id: number;
  type: "ORE_FINDER";
  payload: WorkerOreParams;
};

type WorkerResponse = {
  id: number;
  ok: boolean;
  result?: any;
  error?: string;
};

const workerSelf = self as unknown as DedicatedWorkerGlobalScope;

// Load glue once at startup and assign exports to local vars.
const glueReady = (async () => {
  try {
    const glue = await import("./glue/wasmGlueFileForOres.mjs");
    console.log("[oreWorker] glue loaded", Object.keys(glue));

    World = glue.World;
    Zone = glue.Zone;
    OreFinder = glue.OreFinder;
  } catch (e) {
    console.error("[oreWorker] failed to load glue", e);
    throw e;
  }
})();

workerSelf.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = event.data;

  if (type !== "ORE_FINDER") {
    return;
  }

  try {
    // Ensure glue has loaded and World/Zone/OreFinder are set.
    await glueReady;

    const {
      edition,
      version,
      lo,
      hi,
      x,
      z,
      radius,
      oreIndex,
    } = payload;

    const world = new World(lo, hi, edition, version, undefined, false);

    const chunkX = Math.floor(x / 16);
    const chunkZ = Math.floor(z / 16);
    const size = 2 * radius + 1;
    const zone = new Zone(chunkX - radius, chunkZ - radius, size, size);

    const finder = new OreFinder(world, oreIndex);
    const clusters: any = finder.find(zone);

    const ores_found = Array.isArray(clusters)
      ? clusters.reduce(
          (sum: number, c: any) => sum + (Number(c.ores) || 0),
          0
        )
      : 0;

    const clusters_found = Array.isArray(clusters) ? clusters.length : 0;

    const fixedClusters = Array.isArray(clusters)
      ? clusters.map((c: any) => ({
          ...c,
          y: Number(c.y) - 1,
        }))
      : [];

    const result = {
      ores_found,
      clusters_found,
      clusters: fixedClusters,
    };

    const msg: WorkerResponse = { id, ok: true, result };
    workerSelf.postMessage(msg);
  } catch (err: any) {
    console.error("[oreWorker] error during ORE_FINDER", err);
    const msg: WorkerResponse = {
      id,
      ok: false,
      error: String(err?.message ?? err),
    };
    workerSelf.postMessage(msg);
  }
};
