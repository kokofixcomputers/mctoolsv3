export interface ToolDef {
  id: string
  path: string
  title: string
  desc: string
  category: string
  tags: string[]
  badge?: 'New' | 'Popular' | 'Beta'
}

export const TOOLS: ToolDef[] = [
  {
    id: 'gradient',
    path: '/gradient',
    title: 'Gradient Generator',
    desc: 'Create MiniMessage, legacy §x, and hex gradient text for chat, signs, and items.',
    category: 'Text',
    tags: ['gradient', 'minimessage', 'color', 'chat', 'text', 'legacy'],
    badge: 'Popular',
  },
  {
    id: 'motd',
    path: '/motd',
    title: 'MOTD Generator',
    desc: 'Build server list MOTDs with gradient support. Outputs Vanilla, Paper, Velocity, and SimpleMOTD formats.',
    category: 'Server',
    tags: ['motd', 'server', 'gradient', 'paper', 'velocity', 'simplemotd'],
  },
  {
    id: 'give-item',
    path: '/give',
    title: '/give — Item',
    desc: 'Generate /give commands with custom name, lore, enchantments, and attribute modifiers.',
    category: 'Commands',
    tags: ['give', 'item', 'enchantment', 'attribute', 'command', 'nbt'],
    badge: 'Popular',
  },
  {
    id: 'give-potion',
    path: '/give?tab=potion',
    title: '/give — Potion',
    desc: 'Generate custom potion /give commands with any effect, amplifier, duration, and color.',
    category: 'Commands',
    tags: ['give', 'potion', 'effect', 'command', 'custom'],
  },
  {
    id: 'give-firework',
    path: '/give?tab=firework',
    title: '/give — Firework',
    desc: 'Generate firework rocket /give commands with custom explosion shapes and colors.',
    category: 'Commands',
    tags: ['give', 'firework', 'rocket', 'command', 'explosion'],
  },
  {
    id: 'give-container',
    path: '/give?tab=container',
    title: '/give — Container',
    desc: 'Generate chest/shulker/barrel /give commands pre-filled with items in specific slots.',
    category: 'Commands',
    tags: ['give', 'chest', 'shulker', 'container', 'command'],
  },
  {
    id: 'ore-finder',
    path: '/ore-finder',
    title: 'Ore Finder',
    desc: 'Find ore clusters in your world by seed and coordinates. Supports Java & Bedrock.',
    category: 'World',
    tags: ['ore', 'seed', 'diamond', 'finder', 'world', 'bedrock', 'java'],
  },
  {
    id: 'circle',
    path: '/circle',
    title: 'Circle Generator',
    desc: 'Generate pixel-perfect circles, ellipses, squares and diamonds. Export as WorldEdit schematics.',
    category: 'World',
    tags: ['circle', 'ellipse', 'shape', 'schematic', 'worldedit', 'pixel art'],
    badge: 'New',
  },
  {
    id: 'totem',
    path: '/totem',
    title: 'Totem Generator',
    desc: 'Generate a custom Totem of Undying resource pack from any Minecraft skin.',
    category: 'Resource Packs',
    tags: ['totem', 'skin', 'resource pack', 'texture', 'custom'],
    badge: 'New',
  },
  {
    id: 'skin',
    path: '/skin',
    title: 'Skin Designer',
    desc: 'Paint directly on a 3D Minecraft character. Rotate, zoom, draw on every face, then export a 64×64 PNG skin.',
    category: 'Resource Packs',
    tags: ['skin', '3d', 'paint', 'texture', 'player', 'designer', 'editor'],
    badge: 'New',
  },
  {
    id: 'recipes',
    path: '/recipes',
    title: 'Recipe Viewer',
    desc: 'Browse every Minecraft crafting, smelting, and smithing recipe. 3D block preview powered by WebGL.',
    category: 'Reference',
    tags: ['recipe', 'crafting', 'smelting', 'smithing', 'items', 'blocks', '3d'],
    badge: 'New',
  },
  {
    id: 'server',
    path: '/server',
    title: 'Server Pinger',
    desc: 'Ping any Java or Bedrock Minecraft server. Shows MOTD, player count, version, icon, and history.',
    category: 'Server',
    tags: ['server', 'ping', 'status', 'motd', 'players', 'online', 'bedrock', 'java'],
    badge: 'New',
  },
  {
    id: 'banner',
    path: '/banner',
    title: 'Banner Maker',
    desc: 'Design Minecraft banners with up to 7 pattern layers. Generates /give commands for all versions.',
    category: 'Commands',
    tags: ['banner', 'pattern', 'give', 'command', 'design', 'dye', 'decoration'],
    badge: 'New',
  },
  {
    id: 'achievement',
    path: '/achievement',
    title: 'Achievement Generator',
    desc: 'Create Minecraft-style achievement and advancement toast images with pixel font, custom icon, and multiple styles.',
    category: 'Creative',
    tags: ['achievement', 'advancement', 'toast', 'image', 'generator', 'pixel', 'font', 'meme'],
    badge: 'New' as const,
  },
  {
    id: 'nbt',
    path: '/nbt',
    title: 'NBT Editor',
    desc: 'Parse, explore, and edit binary NBT files entirely in the browser. Supports gzip-compressed files.',
    category: 'Files',
    tags: ['nbt', 'binary', 'editor', 'compound', 'tag', 'minecraft', 'file'],
    badge: 'New',
  },
  {
    id: 'mc-text',
    path: '/mc-text',
    title: '3D Minecraft Text',
    desc: 'Generate 3D Minecraft-style title text with block and cracked textures. Download as a transparent PNG.',
    category: 'Creative',
    tags: ['text', '3d', 'title', 'font', 'texture', 'generator', 'block', 'cracked', 'logo'],
    badge: 'New' as const,
  },
  {
    id: 'superflat',
    path: '/superflat',
    title: 'Superflat Creator',
    desc: 'Design custom Superflat worlds with any combination of layers. Export as a preset or command.',
    category: 'World',
    tags: ['superflat', 'world', 'preset', 'generator', 'command', 'layers', 'creative'],
  }
]

export const CATEGORIES = ['All', ...Array.from(new Set(TOOLS.map((t) => t.category))).sort()]
