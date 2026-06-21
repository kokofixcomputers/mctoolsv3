import { Link } from 'react-router-dom'
import { Palette, Radio, Gift, Gem, Wand2, ArrowRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const TOOLS: { to: string; Icon: LucideIcon; title: string; desc: string; badge?: string }[] = [
  {
    to: '/gradient',
    Icon: Palette,
    title: 'Gradient Generator',
    desc: 'Create MiniMessage, legacy §x, and hex gradients for chat, signs, and items.',
    badge: 'Popular',
  },
  {
    to: '/motd',
    Icon: Radio,
    title: 'MOTD Generator',
    desc: 'Server list MOTDs with gradient support — Vanilla, Paper, Velocity & SimpleMOTD formats.',
  },
  {
    to: '/give',
    Icon: Gift,
    title: '/give Generator',
    desc: 'Build /give commands with custom names, lore, enchantments for any Minecraft version.',
  },
  {
    to: '/ore-finder',
    Icon: Gem,
    title: 'Ore Finder',
    desc: 'Find ore clusters in your world by seed and coordinates using WASM.',
  },
  {
    to: '/totem',
    Icon: Wand2,
    title: 'Totem Generator',
    desc: 'Generate a custom Totem of Undying resource pack from any Minecraft skin.',
    badge: 'New',
  },
]

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 chromatic-bg" />
        <div className="pointer-events-none absolute inset-0 bg-grid" />

        <div className="relative section container text-center">
          <div className="inline-flex items-center gap-2 badge-accent mb-6">
            <Wand2 className="w-3 h-3" />
            Browser-based · No sign-up needed
          </div>
          <h1 className="max-w-2xl mx-auto" style={{ color: 'rgb(var(--text))' }}>
            Free Minecraft<br />
            <span style={{
              background: 'linear-gradient(135deg, rgb(var(--accent)), #3b82f6)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              Utility Tools
            </span>
          </h1>
          <p className="mt-5 text-lg max-w-xl mx-auto" style={{ color: 'rgb(var(--muted))' }}>
            Gradient generators, MOTD builders, /give commands, ore finders, totem generators — all free, all in your browser.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link to="/tools" className="btn-primary px-7 py-3 text-base">
              Get Started <ArrowRight className="w-4 h-4" />
            </Link>
            <Link to="/ore-finder" className="btn-secondary px-7 py-3 text-base">
              Ore Finder
            </Link>
          </div>
        </div>
      </div>

      {/* Tools grid */}
      <section className="section container">
        <div className="flex items-end justify-between gap-4 mb-10">
          <div>
            <span className="badge-muted">MCTools</span>
            <h2 className="mt-3" style={{ color: 'rgb(var(--text))' }}>All Tools</h2>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {TOOLS.map(({ to, Icon, title, desc, badge }) => (
            <Link key={to} to={to} className="card-hover group block">
              <div className="flex items-start justify-between mb-4">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: 'rgb(var(--accent) / 0.1)' }}>
                  <Icon className="w-5 h-5" style={{ color: 'rgb(var(--accent))' }} />
                </div>
                {badge === 'Popular' && <span className="badge-accent">{badge}</span>}
                {badge === 'New' && <span className="badge-success">{badge}</span>}
              </div>
              <div className="font-semibold text-lg mb-1.5 group-hover:text-[rgb(var(--accent))] transition-colors"
                style={{ color: 'rgb(var(--text))' }}>
                {title}
              </div>
              <p className="text-sm leading-relaxed" style={{ color: 'rgb(var(--muted))' }}>{desc}</p>
              <div className="mt-4 flex items-center gap-1 text-xs font-medium transition-all group-hover:gap-2"
                style={{ color: 'rgb(var(--accent))' }}>
                Open tool <ArrowRight className="w-3 h-3" />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
