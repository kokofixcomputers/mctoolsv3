import { Outlet, NavLink, Link } from 'react-router-dom'
import { Pickaxe, Sun, Moon } from 'lucide-react'
import { useState, useEffect } from 'react'
import { VersionPicker } from './VersionPicker'

const NAV_ITEMS = [
  { to: '/tools',      label: 'Tools' },
  { to: '/gradient',   label: 'Gradient' },
  { to: '/motd',       label: 'MOTD' },
  { to: '/give',       label: '/give' },
  { to: '/ore-finder', label: 'Ore Finder' },
  { to: '/totem',      label: 'Totem' },
  { to: '/circle',     label: 'Circle' },
  { to: '/nbt',        label: 'NBT Editor' },
]

export default function Layout() {
  const [dark, setDark] = useState(() =>
    typeof window !== 'undefined'
      ? document.documentElement.classList.contains('dark') ||
        window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
  )

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'rgb(var(--bg))' }}>
      <header className="navbar-float">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 font-semibold tracking-tight shrink-0">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-violet-500 via-purple-500 to-blue-500 text-white">
              <Pickaxe className="w-4 h-4" />
            </span>
            <span className="hidden sm:block">MCTools</span>
            <span className="badge-muted hidden sm:inline-flex">v3</span>
          </Link>

          {/* Nav */}
          <nav className="hidden md:flex items-center gap-0.5 flex-1 overflow-x-auto">
            {NAV_ITEMS.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  isActive
                    ? 'whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium bg-[rgb(var(--border)/0.7)] text-[rgb(var(--text))]'
                    : 'whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium text-[rgb(var(--muted))] hover:text-[rgb(var(--text))] hover:bg-[rgb(var(--border)/0.3)] transition-colors'
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Right side: version picker + theme toggle */}
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <VersionPicker />
            <button
              onClick={() => setDark((d) => !d)}
              className="grid place-items-center w-8 h-8 rounded-lg transition-colors"
              style={{ color: 'rgb(var(--muted))' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgb(var(--border) / 0.5)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              aria-label="Toggle theme"
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      <main className="pt-14">
        <Outlet />
      </main>

      <footer className="border-t py-6 text-center text-xs mt-8"
        style={{ borderColor: 'rgb(var(--border))', color: 'rgb(var(--muted))' }}>
        Created by kokodev.
      </footer>
    </div>
  )
}
