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
import PixelArtPage from './pages/PixelArtPage'
import SchematicViewerPage from './pages/SchematicViewerPage'
import SchematicConverterPage from './pages/SchematicConverterPage'
import RedstonePlaygroundPage from './pages/RedstonePlaygroundPage'
import XpCalculatorPage from './pages/XpCalculatorPage'
import PortalCalculatorPage from './pages/PortalCalculatorPage'
import PiglinBarterPage from './pages/PiglinBarterPage'
import SeedMapPage from './pages/SeedMapPage'
import SeedFinderPage from './pages/SeedFinderPage'
import SummonPage from './pages/SummonPage'
import ArmorTrimPage from './pages/ArmorTrimPage'
import BrewingPage from './pages/BrewingPage'
import HardcoreReviverPage from './pages/HardcoreReviverPage'
import DatapackPage from './pages/DatapackPage'
import CmdConvertPage from './pages/CmdConvertPage'
import CapeDesignerPage from './pages/CapeDesignerPage'

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
            <Route path="pixel-art" element={<PixelArtPage />} />
            <Route path="schematic-viewer" element={<SchematicViewerPage />} />
            <Route path="schematic-converter" element={<SchematicConverterPage />} />
            <Route path="redstone" element={<RedstonePlaygroundPage />} />
            <Route path="xp" element={<XpCalculatorPage />} />
            <Route path="portal" element={<PortalCalculatorPage />} />
            <Route path="piglin" element={<PiglinBarterPage />} />
            <Route path="seed-map" element={<SeedMapPage />} />
            <Route path="seed-finder" element={<SeedFinderPage />} />
            <Route path="summon" element={<SummonPage />} />
            <Route path="armor-trim" element={<ArmorTrimPage />} />
            <Route path="hardcore-reviver" element={<HardcoreReviverPage />} />
            <Route path="brewing" element={<BrewingPage />} />
            <Route path="datapack" element={<DatapackPage />} />
            <Route path="cmd-convert" element={<CmdConvertPage />} />
            <Route path="cape" element={<CapeDesignerPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </VersionProvider>
  )
}
