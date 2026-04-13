import type { Planet } from "./game-state";

export type PlanetVisualFamily =
  | "hero-temperate"
  | "hero-arid"
  | "hero-ice"
  | "hero-lava"
  | "hero-oceanic"
  | "hero-toxic"
  | "hero-storm"
  | "hero-generic";

export interface PlanetIdentity {
  visualFamily: PlanetVisualFamily;
  biomeLabel: string;
  empireTone: string;
  classification: string;
  orbitBand: string;
  surfaceArchetype: string;
  atmosphere: string;
  weather: string;
  palette: string;
  geology: string;
  strategicRole: string;
  anomaly: string;
  signature: string;
  variantCode: string;
}

interface FamilyConfig {
  titles: string[];
  surfaceArchetypes: string[];
  atmosphere: string[];
  weather: string[];
  palettes: string[];
  geology: string[];
  strategicRoles: string[];
  anomalies: string[];
  chains: string[];
}

const FAMILY_CONFIG: Record<PlanetVisualFamily, FamilyConfig> = {
  "hero-lava": {
    titles: ["Ash Crown", "Cinder Reach", "Pyre Bastion", "Magma Front", "Obsidian Throne", "Inferno Gate", "Scoria March", "Basalt Command"],
    surfaceArchetypes: ["rift furnace", "molten shield shelf", "volcanic trench lattice", "basalt kiln basin", "lava plateau chain", "ember fault crown"],
    atmosphere: ["sulfur flare veil", "heat-scarred ash canopy", "dense ember haze", "magnetized smoke bands", "burning mineral mist", "pressure-forged thermal shroud"],
    weather: ["magma geyser bursts", "constant ash cyclones", "shockwave eruptions", "ember rainfall fronts", "tectonic thunder tides", "caldera flare storms"],
    palettes: ["obsidian orange", "ember gold", "copper ash", "molten crimson", "sulfur bronze", "charcoal flare"],
    geology: ["fractured forge crust", "superheated ore mantle", "igneous trench web", "volatile alloy seams", "pressure-cooked continental plates", "furnace-grade canyon systems"],
    strategicRoles: ["siege industry", "heavy alloy output", "warship foundry staging", "frontline resource pressure", "late-game production concentration", "hazard-backed logistics command"],
    anomalies: ["orbital fire halo", "molten ring debris", "subsurface titan plume", "volatile magma lens", "flare scar hemisphere", "resonant furnace arc"],
    chains: ["Infernal Forge", "Ashline Sector", "Pyre Corridor", "Scoria Span", "Obsidian Crown", "Thermal Crown"],
  },
  "hero-temperate": {
    titles: ["Emerald Nexus", "Aurora Haven", "Viridian Crown", "Halcyon Reach", "Azure Command", "Solace Harbor", "Lumen Dominion", "Cedar Circuit"],
    surfaceArchetypes: ["continental garden mantle", "river-fed industrial plain", "fertile archipelago network", "orbital-capital basin", "high-canopy frontier shelf", "measured civic grid"],
    atmosphere: ["clear oxygen-rich skies", "balanced moisture belts", "gentle aurora bands", "stable upper-air lanes", "temperate cloud crown", "calm ion-light horizon"],
    weather: ["predictable seasonal fronts", "soft electrical rain cycles", "wide monsoon corridors", "calm jetstream tides", "temperate cloud bloom", "stable polar drift"],
    palettes: ["viridian teal", "emerald cyan", "aurora blue", "canopy jade", "solace mint", "cobalt grove"],
    geology: ["balanced continental strata", "resource-rich mountain arcs", "deep agricultural shelves", "stable tectonic lattice", "broad development plateaus", "civilized basin geometry"],
    strategicRoles: ["capital growth", "balanced empire planning", "science and industry parity", "fleet sustainment", "administrative command", "multi-role expansion"],
    anomalies: ["orbital aurora crown", "twin moon reflection", "equatorial light ring", "ion bloom horizon", "resonant forest band", "mirror-ocean crescent"],
    chains: ["Prime Habitat", "Emerald Arc", "Viridian Span", "Aurora Ring", "Orbital Heartland", "Canopy Verge"],
  },
  "hero-arid": {
    titles: ["Dustline Meridian", "Amber Spur", "Sirocco Gate", "Mirage Exchange", "Redglass Basin", "Sunscar Causeway", "Rustwind Reach", "Dune Crown"],
    surfaceArchetypes: ["desert freight lattice", "wind-cut mesa grid", "crystal dune corridor", "salt plain command shelf", "rock basin convoy route", "sun-baked storage frontier"],
    atmosphere: ["dry particulate veil", "thin amber haze", "heat-shimmer shell", "dust-swept upper air", "desiccated sky band", "sunlit cargo horizon"],
    weather: ["knife-edge sandstorms", "rolling dust walls", "heatburst squalls", "mirage pressure tides", "electrostatic dune surges", "long-range desert gales"],
    palettes: ["amber rust", "saffron bronze", "dune gold", "redglass ochre", "sunscar tan", "mirage copper"],
    geology: ["wind-carved canyon fields", "glass desert shelves", "salt trench mineral veins", "buried convoy plateaus", "high-friction stone ridges", "market-grade ore flats"],
    strategicRoles: ["trade lane control", "warehouse scaling", "convoy logistics", "market throughput", "frontier customs routing", "lean industrial staging"],
    anomalies: ["glass storm halo", "desert moon fracture", "triple dune scar", "sun pillar crown", "mirage belt shimmer", "electrostatic ridge ring"],
    chains: ["Dust Crown", "Trade Meridian", "Sunscar Route", "Amber Spur", "Mirage Belt", "Rustwind Lane"],
  },
  "hero-ice": {
    titles: ["Cryo Bastion", "Boreal Reach", "Rime Vault", "Glacier Horizon", "Polar Relay", "White Citadel", "Blue Frontier", "Frostline Spire"],
    surfaceArchetypes: ["subsurface glacier vault", "polar trench archive", "frozen relay shelf", "ice-crust reserve basin", "cryogenic command mantle", "white desert defense grid"],
    atmosphere: ["thin blue frost haze", "crystalline cold shell", "hard vacuum edge veil", "aurora-lit ice canopy", "silent upper-air frost band", "deep cryogenic mist"],
    weather: ["glittering snow cyclones", "silent whiteout tides", "needle-ice storms", "aurora blizzards", "frozen pressure cracks", "polar drift walls"],
    palettes: ["frost blue", "glacier white", "boreal cyan", "polar silver", "rime sapphire", "pale azure"],
    geology: ["buried cryo reservoirs", "permafrost plate lattices", "icebound mountain chains", "subsurface mineral shelves", "cold-locked reserve caverns", "glacial fracture seams"],
    strategicRoles: ["vault security", "deep reserve planning", "sensor command", "outer-sector resilience", "research continuity", "defensive logistics"],
    anomalies: ["polar light crown", "frozen moon ring", "subsurface glow rift", "cryo halo arc", "aurora fracture belt", "glacial mirror line"],
    chains: ["Cryo Chain", "Polar Reach", "Frostline Sector", "Blue Expanse", "Glacier Crown", "Boreal Span"],
  },
  "hero-oceanic": {
    titles: ["Cerulean Harbor", "Pelagic Haven", "Tidal Reach", "Abyss Crown", "Nereid Nexus", "Bluewater Drift", "Lagoon Expanse", "Mariner Anchor"],
    surfaceArchetypes: ["deep-ocean convoy lattice", "storm-tide archipelago shelf", "blue trench capital basin", "water-rich growth mantle", "island chain command web", "submerged industrial rise"],
    atmosphere: ["dense maritime cloud shell", "salt-bright upper-air veil", "calm blue vapor bands", "ocean-reflective sky dome", "moist ion horizon", "glossy stormglass canopy"],
    weather: ["monsoon surge cycles", "tide-born storm fronts", "calm equatorial rain belts", "deep-pressure ocean squalls", "jetstream mist arcs", "mirror-sea thunder tides"],
    palettes: ["abyss cyan", "cerulean blue", "lagoon teal", "sapphire tide", "marine azure", "ocean glass"],
    geology: ["tectonic island ridges", "submerged ore shelves", "tidal continental plates", "trench-spanning thermal vents", "coral-metal coastlines", "hydrothermal reserve seams"],
    strategicRoles: ["fleet sustainment", "balanced civil growth", "ocean trade routing", "lift-efficient expansion", "regional command planning", "resource-secure development"],
    anomalies: ["bioluminescent tide ring", "mirror-sea crescent", "deep-trench glow", "orbital foam halo", "twin storm eye arc", "luminous reef band"],
    chains: ["Tidal Reach", "Bluewater Span", "Cerulean Verge", "Pelagic Chain", "Abyssal Crown", "Mariner Arc"],
  },
  "hero-toxic": {
    titles: ["Miasma Front", "Caustic Breach", "Verdigris Reach", "Viper Crown", "Fume Corridor", "Corrode March", "Acid Span", "Tarnish Gate"],
    surfaceArchetypes: ["acid marsh containment grid", "poison-rain trench shelf", "corrosive mining front", "green haze frontier basin", "hazard-locked refinery mantle", "caustic siege platform"],
    atmosphere: ["chlorine burn canopy", "toxic vapor shell", "caustic green haze", "corroded cloud belt", "fume-heavy upper air", "radioactive mist crown"],
    weather: ["acid rain barrages", "toxin lightning fronts", "chemical dust cyclones", "corrosive pressure storms", "poison mist surges", "green static squalls"],
    palettes: ["acid green", "verdigris lime", "toxic amber", "fume olive", "corrode chartreuse", "venom brass"],
    geology: ["corroded trench seams", "hazmat ore beds", "reactive mineral shelves", "rotted basalt lattices", "chemical vent plains", "caustic canyon veins"],
    strategicRoles: ["hazard extraction", "ruthless frontier pressure", "war-economy development", "containment-heavy industry", "high-risk logistics", "survivability-led expansion"],
    anomalies: ["green eclipse halo", "chemical ring shard", "acid fog moon", "caustic flare scar", "reactive vent crown", "toxin glow hemisphere"],
    chains: ["Caustic Frontier", "Miasma Belt", "Verdigris Reach", "Acid Crown", "Fume Corridor", "Viper Span"],
  },
  "hero-storm": {
    titles: ["Tempest Circuit", "Nimbus Crown", "Aether Relay", "Thunder Span", "Cyclone Bastion", "Maelstrom Axis", "Static Reach", "Stormline Horizon"],
    surfaceArchetypes: ["electrical storm mantle", "charged relay plateau", "wind-shear command shelf", "shockfront logistics grid", "ion-lashed industrial rise", "pressure-riven power basin"],
    atmosphere: ["charged cobalt cloud shell", "violet ion haze", "electrical upper-air shroud", "stormglass canopy", "static-rich vapor band", "lightning-fed sky crown"],
    weather: ["permanent thunder belts", "rotating shock cyclones", "sheet lightning walls", "high-velocity pressure arcs", "ion storm bloom", "multi-front electro squalls"],
    palettes: ["storm violet", "electric indigo", "cobalt static", "aether blue", "lightning silver", "tempest periwinkle"],
    geology: ["charged crystal ridges", "storm-carved mountain arcs", "magnetized canyon seams", "volatile energy shelves", "pressure-cracked continents", "lightning-fused plateaus"],
    strategicRoles: ["power harvesting", "sensor leadership", "high-mobility staging", "relay operations", "shock-weather fleet tactics", "rapid response command"],
    anomalies: ["permanent storm eye", "ion ring flare", "lightning halo arc", "aether scar band", "charged moon wake", "electrostatic crown"],
    chains: ["Stormline Reach", "Tempest Crown", "Nimbus Verge", "Thunder Span", "Aether Circuit", "Cyclone Arc"],
  },
  "hero-generic": {
    titles: ["Frontier Dominion", "Orbital Bastion", "Deepfield Span", "Zenith Hold", "Command Reach", "Pioneer Relay", "Apex Colony", "Celestial Axis"],
    surfaceArchetypes: ["mixed terrain frontier", "adaptive command shelf", "deepfield industrial basin", "orbital growth mantle", "generalist reserve plateau", "scalable colony grid"],
    atmosphere: ["balanced frontier haze", "neutral upper-air shell", "orbital dust veil", "mixed vapor canopy", "soft ion horizon", "clear strategic sky band"],
    weather: ["mixed seasonal fronts", "shifting frontier storms", "calm orbital drift", "balanced pressure tides", "transitional weather arcs", "open-sky squalls"],
    palettes: ["frontier teal", "orbital blue", "zenith cyan", "deepfield steel", "celestial mint", "pioneer slate"],
    geology: ["mixed tectonic shelves", "reserve-rich plate lattices", "adaptable mountain basins", "scalable trench networks", "frontier canyon arcs", "hybrid development ridges"],
    strategicRoles: ["flexible empire support", "adaptive scaling", "generalist expansion", "balanced staging", "multi-path planning", "frontier command"],
    anomalies: ["orbital reflection ring", "double horizon arc", "deepfield lens flare", "reserve glow line", "pioneer halo band", "frontier scar crescent"],
    chains: ["Frontier Sector", "Orbital Chain", "Zenith Verge", "Deepfield Arc", "Command Expanse", "Pioneer Span"],
  },
};

const ORBIT_BANDS = [
  "Inner Orbit",
  "Mid Orbit",
  "Trade Lane",
  "Outer Orbit",
] as const;

const TOTAL_PLANET_COMBINATIONS = Object.values(FAMILY_CONFIG).reduce((total, config) => {
  const familyTotal =
    config.titles.length *
    config.surfaceArchetypes.length *
    config.atmosphere.length *
    config.weather.length *
    config.palettes.length *
    config.geology.length *
    config.strategicRoles.length *
    config.anomalies.length *
    config.chains.length;
  return total + familyTotal;
}, 0);

export const PLANET_GENERATION_SPACE = TOTAL_PLANET_COMBINATIONS;

function hashString(value: string): number {
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mixSeed(seed: number, value: number): number {
  return Math.imul(seed ^ (value + 0x9e3779b9), 2246822519) >>> 0;
}

function pickVariant<T>(items: T[], seed: number, offset: number): T {
  return items[(mixSeed(seed, offset) + offset) % items.length];
}

function getOrbitBand(position: number): string {
  if (position <= 3) return ORBIT_BANDS[0];
  if (position <= 6) return ORBIT_BANDS[1];
  if (position <= 10) return ORBIT_BANDS[2];
  return ORBIT_BANDS[3];
}

function describeTemperature(temperature: number): string {
  if (temperature >= 95) return "extreme thermal pressure";
  if (temperature >= 55) return "high-heat atmospheric stress";
  if (temperature >= 18) return "stable habitable climate bands";
  if (temperature >= -12) return "cold upper-air circulation";
  return "severe cryogenic conditions";
}

function describeSize(diameter: number): string {
  if (diameter >= 16500) return "a colossal planetary shell";
  if (diameter >= 14000) return "a broad imperial surface";
  if (diameter >= 11200) return "a balanced planetary footprint";
  if (diameter >= 9200) return "a compact command surface";
  return "a tight frontier body";
}

function describeFields(maxFields: number): string {
  if (maxFields >= 195) return "exceptional expansion headroom";
  if (maxFields >= 182) return "deep infrastructure capacity";
  if (maxFields >= 170) return "strong long-term build depth";
  if (maxFields >= 158) return "disciplined development capacity";
  return "careful field management";
}

function getVisualFamily(planet?: Planet | null): PlanetVisualFamily {
  if (!planet) return "hero-generic";

  const position = planet.position || 1;
  const temperature = planet.temperature ?? 20;
  const diameter = planet.diameter ?? 10000;
  const seed = hashString(
    `${planet.galaxy}:${planet.system}:${planet.position}:${planet.name}:${temperature}:${diameter}:${planet.maxFields}`
  );
  const roll = mixSeed(seed, position) % 100;

  if (temperature <= -35) return roll < 65 ? "hero-ice" : "hero-oceanic";
  if (temperature >= 90) return roll < 68 ? "hero-lava" : "hero-toxic";

  if (position <= 3) {
    if (roll < 32) return "hero-lava";
    if (roll < 57) return "hero-arid";
    if (roll < 76) return "hero-toxic";
    return "hero-storm";
  }
  if (position <= 6) {
    if (roll < 32) return "hero-temperate";
    if (roll < 56) return "hero-oceanic";
    if (roll < 76) return "hero-storm";
    return "hero-arid";
  }
  if (position <= 10) {
    if (roll < 30) return "hero-arid";
    if (roll < 54) return "hero-temperate";
    if (roll < 75) return "hero-storm";
    return "hero-oceanic";
  }

  if (roll < 34) return "hero-ice";
  if (roll < 56) return "hero-oceanic";
  if (roll < 76) return "hero-storm";
  return "hero-toxic";
}

function makeVariantCode(seed: number): string {
  const normalized = (seed >>> 0).toString(36).toUpperCase();
  return normalized.padStart(6, "0").slice(0, 6);
}

export function getPlanetIdentity(planet?: Planet | null): PlanetIdentity {
  const visualFamily = getVisualFamily(planet);
  const config = FAMILY_CONFIG[visualFamily];
  const orbitBand = getOrbitBand(planet?.position ?? 8);
  const seed = hashString(
    planet
      ? [
          planet.galaxy,
          planet.system,
          planet.position,
          planet.name,
          planet.temperature,
          planet.diameter,
          planet.maxFields,
          planet.usedFields,
        ].join(":")
      : "generic"
  );

  const title = pickVariant(config.titles, seed, 1);
  const surfaceArchetype = pickVariant(config.surfaceArchetypes, seed, 2);
  const atmosphere = pickVariant(config.atmosphere, seed, 3);
  const weather = pickVariant(config.weather, seed, 4);
  const palette = pickVariant(config.palettes, seed, 5);
  const geology = pickVariant(config.geology, seed, 6);
  const strategicRole = pickVariant(config.strategicRoles, seed, 7);
  const anomaly = pickVariant(config.anomalies, seed, 8);
  const chain = pickVariant(config.chains, seed, 9);

  const climate = describeTemperature(planet?.temperature ?? 20);
  const size = describeSize(planet?.diameter ?? 10000);
  const fields = describeFields(planet?.maxFields ?? 163);
  const variantCode = makeVariantCode(seed);
  const signature = `${palette} / ${weather} / ${anomaly}`;

  return {
    visualFamily,
    biomeLabel: `${title} ${pickVariant(["World", "Sphere", "Colony", "Prime", "Station", "Dominion"], seed, 10)}`,
    empireTone: `${climate}, ${size}, and ${fields} favor ${strategicRole} across a ${surfaceArchetype} under ${atmosphere}.`,
    classification: `${chain} - ${orbitBand} - ${variantCode}`,
    orbitBand,
    surfaceArchetype,
    atmosphere,
    weather,
    palette,
    geology,
    strategicRole,
    anomaly,
    signature,
    variantCode,
  };
}
