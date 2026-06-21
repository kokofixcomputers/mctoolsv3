/**
 * Vite plugin: serves Minecraft block/item textures from the minecraft-assets
 * npm package instead of the GitHub raw CDN.
 *
 * URL scheme: /mc-assets/{version}/blocks/{name}.png
 *             /mc-assets/{version}/items/{name}.png
 *
 * Dev:   served directly from node_modules via connect middleware (no copying).
 * Build: copies blocks/ + items/ for each supported version into the output dir.
 */
import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'http'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

// Use process.cwd() (project root) + known pnpm path — avoids createRequire /
// import.meta.url issues when Vite bundles the config into a temp .mjs file.
// We resolve the real path so symlinks (pnpm virtual store) are followed.
function findDataRoot(): string {
  // Try the direct node_modules path first (works with npm/yarn/pnpm hoisting)
  const candidates = [
    path.resolve(process.cwd(), 'node_modules/minecraft-assets/minecraft-assets/data'),
    // pnpm non-hoisted — walk up from the symlink target
    ...(() => {
      try {
        const real = fs.realpathSync(
          path.resolve(process.cwd(), 'node_modules/minecraft-assets')
        )
        return [path.join(real, 'minecraft-assets/data')]
      } catch { return [] }
    })(),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  throw new Error('[mc-assets] Cannot find minecraft-assets data directory')
}

const DATA_ROOT = findDataRoot()

// Versions bundled in the package (matches minecraft-assets@1.17.0)
const BUNDLED = fs.readdirSync(DATA_ROOT).filter(d =>
  fs.statSync(path.join(DATA_ROOT, d)).isDirectory()
)

// Map app versions that don't exist in the package to the nearest bundled one
const VERSION_MAP: Record<string, string> = {
  '1.21.11': '1.21.8',
}

function resolveVersion(v: string): string {
  if (BUNDLED.includes(v)) return v
  if (VERSION_MAP[v]) return VERSION_MAP[v]
  return BUNDLED[BUNDLED.length - 1]
}

// Versions our app actually uses (from VersionContext)
const APP_VERSIONS = ['1.21.1', '1.21.5', '1.21.11']

export function mcAssetsPlugin(): Plugin {
  const PREFIX = '/mc-assets/'

  return {
    name: 'mc-assets',

    // Dev server: stream PNGs directly from node_modules
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = req.url ?? ''
        if (!url.startsWith(PREFIX)) return next()

        // /mc-assets/{version}/{type}/{name}.png
        const rel = url.slice(PREFIX.length).split('?')[0]
        const [version, ...rest] = rel.split('/')
        const filePath = path.join(DATA_ROOT, resolveVersion(version), ...rest)

        if (!fs.existsSync(filePath)) {
          res.statusCode = 404
          res.end()
          return
        }

        res.setHeader('Content-Type', 'image/png')
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        fs.createReadStream(filePath).pipe(res)
      })
    },

    // Build: copy blocks/ + items/ per version into the output dir
    async writeBundle(options) {
      const outDir = options.dir ?? 'dist'

      await Promise.all(APP_VERSIONS.map(async appVer => {
        const srcBase = path.join(DATA_ROOT, resolveVersion(appVer))
        const dstBase = path.join(outDir, 'mc-assets', appVer)

        // Flat directories
        for (const type of ['blocks', 'items']) {
          const src = path.join(srcBase, type)
          const dst = path.join(dstBase, type)
          await fsp.mkdir(dst, { recursive: true })
          const files = await fsp.readdir(src)
          await Promise.all(files.map(f => fsp.copyFile(path.join(src, f), path.join(dst, f))))
        }

        // GUI sprite subdirectories needed by the achievement generator
        const guiSpriteDirs = [
          'gui/sprites/toast',
          'gui/sprites/advancements',
        ]
        for (const rel of guiSpriteDirs) {
          const src = path.join(srcBase, rel)
          const dst = path.join(dstBase, rel)
          if (!fs.existsSync(src)) continue
          await fsp.mkdir(dst, { recursive: true })
          const files = await fsp.readdir(src)
          await Promise.all(
            files
              .filter(f => f.endsWith('.png'))
              .map(f => fsp.copyFile(path.join(src, f), path.join(dst, f)))
          )
        }
      }))

      console.log('[mc-assets] textures written to', path.join(outDir, 'mc-assets'))
    },
  }
}
