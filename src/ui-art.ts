const artModules = import.meta.glob("./assets/ui/*.{png,webp,jpg,jpeg}", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const artIndex = new Map<string, string>();

for (const [path, url] of Object.entries(artModules)) {
  const filename = path.split("/").pop() ?? "";
  const stem = filename.replace(/\.(png|webp|jpg|jpeg)$/i, "").toLowerCase();
  artIndex.set(stem, url);
}

export const UI_ART_EXPECTED_KEYS = [
  "metalMine",
  "crystalMine",
  "deuteriumSynthesizer",
  "solarPlant",
  "fusionReactor",
  "roboticsFactory",
  "naniteFactory",
  "shipyard",
  "metalStorage",
  "crystalStorage",
  "deuteriumTank",
  "researchLab",
  "energyTech",
  "combustionDrive",
  "impulseDrive",
  "hyperspaceDrive",
  "computerTech",
  "astrophysics",
  "igrNetwork",
  "smallCargo",
  "largeCargo",
  "colonyShip",
] as const;

function toLookupKey(key: string): string {
  return key.trim().toLowerCase();
}

export function resolveGameArt(key: string, fallback: string): string {
  const resolved = artIndex.get(toLookupKey(key));
  return resolved ? `url("${resolved}")` : fallback;
}
