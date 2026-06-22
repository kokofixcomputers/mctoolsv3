import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { VersionProvider } from './contexts/VersionContext'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import ToolsPage from './pages/ToolsPage'
import GradientPage from './pages/GradientPage'
import MotdPage from './pages/MotdPage'
import GivePage from './pages/GivePage'
import OreFinderPage from './pages/OreFinderPage'
import TotemPage from './pages/TotemPage'
import CirclePage from './pages/CirclePage'
import NbtPage from './pages/NbtPage'
import SkinPage from './pages/SkinPage'
import BannerPage from './pages/BannerPage'
import ServerPingerPage from './pages/ServerPingerPage'
import RecipePage from './pages/RecipePage'
import SuperFlatPage from './pages/SuperFlatPage'
import AchievementPage from './pages/AchievementPage'
import MinecraftTextPage from './pages/MinecraftTextPage'
import SeedConverterPage from './pages/SeedConverterPage'
import ResourcePackPage from './pages/ResourcePackPage'
import PlayerLookupPage from './pages/PlayerLookupPage'
import ResourcePackMergerPage from './pages/ResourcePackMergerPage'
import SlimeChunkPage from './pages/SlimeChunkPage'

export default function App() {
  return (
    <VersionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="tools" element={<ToolsPage />} />
            <Route path="gradient" element={<GradientPage />} />
            <Route path="motd" element={<MotdPage />} />
            <Route path="give" element={<GivePage />} />
            <Route path="ore-finder" element={<OreFinderPage />} />
            <Route path="totem" element={<TotemPage />} />
            <Route path="circle" element={<CirclePage />} />
            <Route path="nbt" element={<NbtPage />} />
            <Route path="skin" element={<SkinPage />} />
            <Route path="banner" element={<BannerPage />} />
            <Route path="server" element={<ServerPingerPage />} />
            <Route path="recipes" element={<RecipePage />} />
            <Route path="superflat" element={<SuperFlatPage />} />
            <Route path="achievement" element={<AchievementPage />} />
            <Route path="mc-text" element={<MinecraftTextPage />} />
            <Route path="seed-converter" element={<SeedConverterPage />} />
            <Route path="resource-pack" element={<ResourcePackPage />} />
            <Route path="player" element={<PlayerLookupPage />} />
            <Route path="resource-pack-merger" element={<ResourcePackMergerPage />} />
            <Route path="slime-chunks" element={<SlimeChunkPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </VersionProvider>
  )
}
