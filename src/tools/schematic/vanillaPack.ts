// Supplies a vanilla Minecraft resource pack (blockstates + models + textures) to
// the 3D schematic renderer. Without it, Cubane can't resolve block models and every
// block renders as an empty fallback.
//
// Primary source is a trimmed block/item pack shipped as a same-origin static asset
// (public/packs/vanilla-1.21.1.zip, ~2 MB) — reliable, fast, and immune to the CORS /
// browser-extension interception that can break large cross-origin downloads. If that
// asset is ever missing, we fall back to fetching Mojang's full client jar.
//
// The result is cached at module scope so it's only fetched once per session.

const LOCAL_PACK_URL = '/packs/vanilla-1.21.1.zip'
const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'

interface ManifestEntry { id: string; url: string }
interface Manifest { latest: { release: string }; versions: ManifestEntry[] }

let cached: Promise<Blob> | null = null

async function fetchMojangJar(preferVersion?: string): Promise<Blob> {
  const manifest = (await fetch(MANIFEST_URL).then(r => r.json())) as Manifest
  let entry = preferVersion ? manifest.versions.find(v => v.id === preferVersion) : undefined
  if (!entry) entry = manifest.versions.find(v => v.id === manifest.latest.release)
  if (!entry) throw new Error('Could not resolve a Minecraft version from the manifest')
  const pkg = await fetch(entry.url).then(r => r.json()) as { downloads?: { client?: { url?: string } } }
  const clientUrl = pkg.downloads?.client?.url
  if (!clientUrl) throw new Error('Version package has no client download')
  const res = await fetch(clientUrl)
  if (!res.ok) throw new Error(`Failed to download vanilla assets (HTTP ${res.status})`)
  return res.blob()
}

/**
 * Returns a vanilla resource pack Blob for the renderer's `defaultResourcePacks`
 * callback. `preferVersion` is only used for the Mojang-jar fallback path.
 */
export function loadVanillaPack(preferVersion?: string): Promise<Blob> {
  if (cached) return cached
  cached = (async () => {
    try {
      const res = await fetch(LOCAL_PACK_URL)
      if (res.ok) return await res.blob()
      throw new Error(`local pack ${res.status}`)
    } catch {
      // Fall back to Mojang's full client jar if the bundled pack isn't available.
      return fetchMojangJar(preferVersion)
    }
  })()
  cached.catch(() => { cached = null })
  return cached
}
