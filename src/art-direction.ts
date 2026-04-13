import type { Planet } from "./game-state";
import { getPlanetIdentity, type PlanetVisualFamily } from "./planet-generation";

const planetFallback = new URL("./assets/planets/15.png", import.meta.url).href;

export type PlanetArtSlot = PlanetVisualFamily;

export interface PlanetTheme {
  slot: PlanetArtSlot;
  biomeLabel: string;
  empireTone: string;
  classification: string;
  accent: string;
  accentSoft: string;
  headerGradient: string;
  sidebarGradient: string;
  panelGradient: string;
  heroGradient: string;
  nebulaGradient: string;
  artwork?: string;
}

const PLANET_ARTWORK: Partial<Record<PlanetArtSlot, string>> = {
  "hero-temperate": planetFallback,
  "hero-generic": planetFallback,
};

export function getPlanetTheme(planet?: Planet | null): PlanetTheme {
  const identity = getPlanetIdentity(planet);
  const { visualFamily: slot, biomeLabel, empireTone, classification } = identity;

  switch (slot) {
    case "hero-lava":
      return {
        slot,
        biomeLabel,
        empireTone,
        classification,
        accent: "#ff7b39",
        accentSoft: "rgba(255,123,57,0.22)",
        headerGradient: "linear-gradient(90deg, rgba(34,9,7,0.94), rgba(70,17,9,0.86), rgba(10,17,28,0.92))",
        sidebarGradient: "linear-gradient(180deg, rgba(28,8,10,0.96), rgba(11,11,30,0.94))",
        panelGradient: "linear-gradient(180deg, rgba(58,19,15,0.28), rgba(8,10,22,0.94))",
        heroGradient: "radial-gradient(circle at 22% 18%, rgba(255,146,67,0.30), transparent 28%), radial-gradient(circle at 78% 24%, rgba(255,85,35,0.16), transparent 26%), linear-gradient(135deg, rgba(61,14,10,0.96), rgba(14,12,27,0.94))",
        nebulaGradient: "radial-gradient(circle at 16% 18%, rgba(255,121,55,0.30), transparent 22%), radial-gradient(circle at 78% 28%, rgba(255,185,90,0.12), transparent 20%), radial-gradient(circle at 50% 85%, rgba(68,20,18,0.22), transparent 30%)",
        artwork: PLANET_ARTWORK[slot],
      };
    case "hero-arid":
      return {
        slot,
        biomeLabel,
        empireTone,
        classification,
        accent: "#f2c16f",
        accentSoft: "rgba(242,193,111,0.18)",
        headerGradient: "linear-gradient(90deg, rgba(34,23,15,0.94), rgba(68,46,28,0.84), rgba(8,14,24,0.92))",
        sidebarGradient: "linear-gradient(180deg, rgba(28,20,13,0.97), rgba(11,11,30,0.95))",
        panelGradient: "linear-gradient(180deg, rgba(87,59,35,0.22), rgba(9,11,23,0.94))",
        heroGradient: "radial-gradient(circle at 25% 18%, rgba(243,205,142,0.20), transparent 24%), radial-gradient(circle at 72% 22%, rgba(255,171,71,0.16), transparent 20%), linear-gradient(135deg, rgba(61,45,25,0.95), rgba(13,17,30,0.94))",
        nebulaGradient: "radial-gradient(circle at 15% 18%, rgba(255,204,123,0.16), transparent 18%), radial-gradient(circle at 84% 28%, rgba(212,121,51,0.12), transparent 22%), radial-gradient(circle at 50% 82%, rgba(69,41,22,0.22), transparent 26%)",
        artwork: PLANET_ARTWORK[slot] ?? PLANET_ARTWORK["hero-generic"],
      };
    case "hero-oceanic":
      return {
        slot,
        biomeLabel,
        empireTone,
        classification,
        accent: "#59d8ff",
        accentSoft: "rgba(89,216,255,0.20)",
        headerGradient: "linear-gradient(90deg, rgba(8,28,48,0.96), rgba(7,61,90,0.84), rgba(8,14,28,0.94))",
        sidebarGradient: "linear-gradient(180deg, rgba(8,26,40,0.97), rgba(11,11,30,0.95))",
        panelGradient: "linear-gradient(180deg, rgba(18,93,124,0.24), rgba(9,10,24,0.94))",
        heroGradient: "radial-gradient(circle at 20% 18%, rgba(96,222,255,0.22), transparent 26%), radial-gradient(circle at 78% 24%, rgba(73,154,255,0.18), transparent 24%), linear-gradient(135deg, rgba(8,60,79,0.95), rgba(11,14,30,0.94))",
        nebulaGradient: "radial-gradient(circle at 16% 18%, rgba(87,213,255,0.22), transparent 18%), radial-gradient(circle at 82% 28%, rgba(69,132,255,0.12), transparent 22%), radial-gradient(circle at 50% 84%, rgba(12,75,103,0.24), transparent 28%)",
        artwork: PLANET_ARTWORK[slot] ?? PLANET_ARTWORK["hero-generic"],
      };
    case "hero-toxic":
      return {
        slot,
        biomeLabel,
        empireTone,
        classification,
        accent: "#9be65b",
        accentSoft: "rgba(155,230,91,0.20)",
        headerGradient: "linear-gradient(90deg, rgba(18,31,7,0.96), rgba(42,68,12,0.82), rgba(9,15,23,0.94))",
        sidebarGradient: "linear-gradient(180deg, rgba(18,30,8,0.97), rgba(11,11,30,0.95))",
        panelGradient: "linear-gradient(180deg, rgba(58,96,24,0.22), rgba(9,10,24,0.94))",
        heroGradient: "radial-gradient(circle at 22% 18%, rgba(170,238,91,0.24), transparent 26%), radial-gradient(circle at 78% 24%, rgba(110,188,52,0.16), transparent 24%), linear-gradient(135deg, rgba(35,58,11,0.95), rgba(11,14,29,0.94))",
        nebulaGradient: "radial-gradient(circle at 15% 18%, rgba(176,240,98,0.22), transparent 18%), radial-gradient(circle at 84% 28%, rgba(102,190,59,0.10), transparent 22%), radial-gradient(circle at 50% 82%, rgba(42,84,18,0.24), transparent 28%)",
        artwork: PLANET_ARTWORK[slot] ?? PLANET_ARTWORK["hero-generic"],
      };
    case "hero-storm":
      return {
        slot,
        biomeLabel,
        empireTone,
        classification,
        accent: "#9da7ff",
        accentSoft: "rgba(157,167,255,0.20)",
        headerGradient: "linear-gradient(90deg, rgba(18,20,49,0.96), rgba(36,49,92,0.84), rgba(10,13,29,0.94))",
        sidebarGradient: "linear-gradient(180deg, rgba(17,20,46,0.97), rgba(11,11,30,0.95))",
        panelGradient: "linear-gradient(180deg, rgba(54,63,125,0.24), rgba(9,10,24,0.94))",
        heroGradient: "radial-gradient(circle at 20% 18%, rgba(160,170,255,0.22), transparent 26%), radial-gradient(circle at 78% 22%, rgba(104,130,255,0.18), transparent 24%), linear-gradient(135deg, rgba(32,38,89,0.95), rgba(11,14,30,0.94))",
        nebulaGradient: "radial-gradient(circle at 15% 18%, rgba(164,174,255,0.22), transparent 18%), radial-gradient(circle at 84% 28%, rgba(96,119,255,0.12), transparent 22%), radial-gradient(circle at 50% 82%, rgba(34,44,105,0.24), transparent 28%)",
        artwork: PLANET_ARTWORK[slot] ?? PLANET_ARTWORK["hero-generic"],
      };
    case "hero-ice":
      return {
        slot,
        biomeLabel,
        empireTone,
        classification,
        accent: "#94dcff",
        accentSoft: "rgba(148,220,255,0.22)",
        headerGradient: "linear-gradient(90deg, rgba(8,26,45,0.96), rgba(12,51,78,0.82), rgba(8,12,28,0.94))",
        sidebarGradient: "linear-gradient(180deg, rgba(9,25,42,0.97), rgba(11,11,30,0.95))",
        panelGradient: "linear-gradient(180deg, rgba(21,72,111,0.24), rgba(9,10,24,0.94))",
        heroGradient: "radial-gradient(circle at 20% 18%, rgba(180,234,255,0.24), transparent 28%), radial-gradient(circle at 74% 25%, rgba(105,190,255,0.16), transparent 22%), linear-gradient(135deg, rgba(14,44,73,0.95), rgba(11,15,29,0.94))",
        nebulaGradient: "radial-gradient(circle at 18% 18%, rgba(160,223,255,0.22), transparent 18%), radial-gradient(circle at 82% 32%, rgba(111,201,255,0.14), transparent 20%), radial-gradient(circle at 50% 84%, rgba(20,63,93,0.24), transparent 28%)",
        artwork: PLANET_ARTWORK[slot] ?? PLANET_ARTWORK["hero-generic"],
      };
    case "hero-temperate":
    case "hero-generic":
    default:
      return {
        slot,
        biomeLabel,
        empireTone,
        classification,
        accent: "#6cf5cc",
        accentSoft: "rgba(108,245,204,0.18)",
        headerGradient: "linear-gradient(90deg, rgba(8,24,32,0.96), rgba(9,45,58,0.82), rgba(9,11,29,0.94))",
        sidebarGradient: "linear-gradient(180deg, rgba(9,26,34,0.97), rgba(11,11,30,0.95))",
        panelGradient: "linear-gradient(180deg, rgba(23,89,84,0.22), rgba(9,10,23,0.94))",
        heroGradient: "radial-gradient(circle at 22% 18%, rgba(110,255,222,0.20), transparent 28%), radial-gradient(circle at 78% 24%, rgba(125,176,255,0.16), transparent 26%), linear-gradient(135deg, rgba(10,56,64,0.95), rgba(11,14,31,0.94))",
        nebulaGradient: "radial-gradient(circle at 15% 18%, rgba(88,251,213,0.20), transparent 18%), radial-gradient(circle at 84% 28%, rgba(106,124,255,0.10), transparent 22%), radial-gradient(circle at 50% 82%, rgba(24,79,71,0.24), transparent 28%)",
        artwork: PLANET_ARTWORK[slot],
      };
  }
}
