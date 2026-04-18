import React, { useEffect, useState, useCallback, useRef } from "react";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  GameClient,
  type GameConfigState,
  type VaultRecoveryPromptRequest,
  Planet, Resources, Fleet, Mission, PlayerState, Research,
  BUILDINGS, SHIPS, SHIP_TYPE_IDX, MISSION_LABELS,
  upgradeCost, buildTimeSecs,
  fmt, fmtCountdown, missionProgress, energyEfficiency,
} from "./game-state";
import GalaxyTab from "./GalaxyTab";
import MarketTab from "./Markettab";
import { MarketClient } from "./market-client";
import { BUILDING_REQUIREMENTS, RESEARCH_REQUIREMENTS, type Requirement } from "./combat-engine";
import { getPlanetTheme } from "./art-direction";
import { getPlanetIdentity } from "./planet-generation";
import { resolveGameArt } from "./ui-art";
import { usePsg1Controls } from "./usePsg1Controls";
import WalletConnectControl from "./WalletConnectControl";

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab = "overview" | "resources" | "buildings" | "shipyard" | "fleet" | "missions" | "research" | "galaxy" | "market";

type LaunchTargetInput =
  | { kind: "transport"; mode: "owned"; destinationEntity: string }
  | { kind: "transport"; mode: "coords"; galaxy: number; system: number; position: number }
  | { kind: "colonize"; galaxy: number; system: number; position: number; colonyName: string };

type ConfirmationState =
  | null
  | { kind: "resolveColonize"; mission: Mission; slotIdx: number };

const DEV_CONFIG_ADMIN_WALLET = "HAHnFdgoASDzzma7fP9nfKo5nByU1uStYR964QhWnL2X";
const DEFAULT_ANTIMATTER_MINT = "FAeZLeqohcxNBpwGrbYBLj2TavFqt4353mT6qY6Z7YFh";
const DEFAULT_ANTIMATTER_DECIMALS = 6;
const SPL_TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

function formatTokenAmount(raw: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const fraction = raw % base;
  if (fraction === 0n) return whole.toString();
  const fractionText = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole.toString()}.${fractionText}`;
}

function formatSolBalance(lamports: bigint): string {
  const sol = Number(lamports) / 1_000_000_000;
  if (sol === 0) return "0";
  if (sol < 0.001) return "<0.001";
  return sol.toFixed(3);
}

const AntimatterIcon: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" opacity="0.9" />
    <circle cx="12" cy="12" r="2.2" fill="currentColor" />
    <ellipse cx="12" cy="12" rx="8" ry="3.2" stroke="currentColor" strokeWidth="1.4" opacity="0.8" />
    <ellipse cx="12" cy="12" rx="3.2" ry="8" stroke="currentColor" strokeWidth="1.4" opacity="0.55" transform="rotate(35 12 12)" />
  </svg>
);

// ─── Mobile detection hook ────────────────────────────────────────────────────
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
}

// ─── Ship requirements ────────────────────────────────────────────────────────
interface ShipRequirement { label: string; met: boolean; current: number; required: number; }
interface ShipRequirementsCheck { shipName: string; shipIcon: string; requirements: ShipRequirement[]; allMet: boolean; }
interface RequirementStatus { label: string; met: boolean; current: number; required: number; type: "building" | "research"; }
interface RequirementCheck { title: string; icon: string; categoryLabel: string; subtitle: string; hint: string; requirements: RequirementStatus[]; allMet: boolean; }

const RESEARCH_TECHS = [
  { idx: 0, name: "Energy Technology", icon: "⚡", field: "energyTech", labReq: 1 },
  { idx: 1, name: "Combustion Drive", icon: "🔥", field: "combustionDrive", labReq: 1 },
  { idx: 2, name: "Impulse Drive", icon: "🚀", field: "impulseDrive", labReq: 5 },
  { idx: 3, name: "Hyperspace Drive", icon: "🌌", field: "hyperspaceDrive", labReq: 7 },
  { idx: 4, name: "Computer Technology", icon: "💻", field: "computerTech", labReq: 1 },
  { idx: 5, name: "Astrophysics", icon: "🔭", field: "astrophysics", labReq: 3 },
  { idx: 6, name: "Intergalactic Research Network", icon: "📡", field: "igrNetwork", labReq: 10 },
] as const;

const SUPPORTED_RESEARCH_KEYS = new Set(RESEARCH_TECHS.map(tech => tech.field));
const SUPPORTED_BUILDING_KEYS = new Set(BUILDINGS.map(building => building.key));
const BUILDING_LABELS = Object.fromEntries(BUILDINGS.map(building => [building.key, building.name])) as Record<string, string>;
const RESEARCH_LABELS = Object.fromEntries(RESEARCH_TECHS.map(tech => [tech.field, tech.name])) as Record<string, string>;

function formatRequirementLabel(key: string): string {
  const known = BUILDING_LABELS[key] ?? RESEARCH_LABELS[key];
  if (known) return known;
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, char => char.toUpperCase());
}

function mergeRequirements(requirements: Requirement[]): Requirement[] {
  const merged = new Map<string, Requirement>();
  for (const requirement of requirements) {
    const id = `${requirement.type}:${requirement.key}`;
    const existing = merged.get(id);
    if (!existing || requirement.level > existing.level) {
      merged.set(id, requirement);
    }
  }
  return Array.from(merged.values());
}

function buildRequirementCheck(
  itemName: string,
  itemIcon: string,
  categoryLabel: string,
  subtitle: string,
  hint: string,
  requirements: Requirement[],
  planet: Planet,
  research: Research,
): RequirementCheck {
  const supportedRequirements = mergeRequirements(requirements).filter(requirement => (
    requirement.type === "building"
      ? SUPPORTED_BUILDING_KEYS.has(requirement.key as (typeof BUILDINGS)[number]["key"])
      : SUPPORTED_RESEARCH_KEYS.has(requirement.key as (typeof RESEARCH_TECHS)[number]["field"])
  ));

  const requirementStatuses = supportedRequirements.map(requirement => {
    const current = requirement.type === "building"
      ? ((planet as any)[requirement.key] as number) ?? 0
      : ((research as any)[requirement.key] as number) ?? 0;
    return {
      label: formatRequirementLabel(requirement.key),
      met: current >= requirement.level,
      current,
      required: requirement.level,
      type: requirement.type,
    };
  });

  return {
    title: itemName,
    icon: itemIcon,
    categoryLabel,
    subtitle,
    hint,
    requirements: requirementStatuses,
    allMet: requirementStatuses.every(requirement => requirement.met),
  };
}

function svgToDataUri(svg: string): string {
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

function buildCardArt(accentA: string, accentB: string, accentC: string, motif: string): string {
  return svgToDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 160" fill="none">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${accentA}" stop-opacity="0.95"/>
          <stop offset="55%" stop-color="${accentB}" stop-opacity="0.82"/>
          <stop offset="100%" stop-color="#050816" stop-opacity="1"/>
        </linearGradient>
        <radialGradient id="glow" cx="0" cy="0" r="1" gradientTransform="translate(240 30) rotate(140) scale(120 90)">
          <stop offset="0%" stop-color="${accentC}" stop-opacity="0.72"/>
          <stop offset="100%" stop-color="${accentC}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="320" height="160" rx="24" fill="url(#bg)"/>
      <rect width="320" height="160" rx="24" fill="url(#glow)"/>
      <g opacity="0.15" stroke="white">
        <path d="M24 120H296" />
        <path d="M40 98H280" />
        <path d="M64 76H256" />
      </g>
      ${motif}
    </svg>
  `);
}

const BUILDING_ART: Record<string, string> = {
  metalMine: buildCardArt(
    "#61411d",
    "#a96f2b",
    "#ffd58b",
    `<g>
      <path d="M26 118L78 64L120 118Z" fill="#25140a" fill-opacity="0.95"/>
      <path d="M98 118L154 50L208 118Z" fill="#3a210f" fill-opacity="0.92"/>
      <path d="M210 118L254 72L292 118Z" fill="#5b3417" fill-opacity="0.9"/>
      <rect x="135" y="54" width="18" height="56" rx="3" fill="#ffcf7a"/>
      <rect x="132" y="62" width="24" height="8" rx="3" fill="#fff2cc" fill-opacity="0.7"/>
    </g>`
  ),
  crystalMine: buildCardArt(
    "#0d324d",
    "#146c94",
    "#7af0ff",
    `<g>
      <path d="M78 118L114 46L146 118Z" fill="#9ff6ff" fill-opacity="0.85"/>
      <path d="M128 118L162 26L198 118Z" fill="#d6feff" fill-opacity="0.95"/>
      <path d="M184 118L222 56L256 118Z" fill="#7de6f7" fill-opacity="0.82"/>
      <path d="M162 26L144 76L162 118L180 76Z" fill="#ffffff" fill-opacity="0.48"/>
    </g>`
  ),
  deuteriumSynthesizer: buildCardArt(
    "#14324c",
    "#195d7f",
    "#4cc9f0",
    `<g>
      <rect x="46" y="64" width="64" height="54" rx="10" fill="#0e1f34" fill-opacity="0.95"/>
      <rect x="120" y="46" width="82" height="72" rx="12" fill="#143451" fill-opacity="0.92"/>
      <rect x="214" y="58" width="54" height="60" rx="10" fill="#1d4d6f" fill-opacity="0.92"/>
      <circle cx="160" cy="82" r="18" fill="#71dbff" fill-opacity="0.88"/>
      <path d="M160 62C149 75 146 83 146 89C146 97 152 103 160 103C168 103 174 97 174 89C174 83 171 75 160 62Z" fill="#ffffff" fill-opacity="0.72"/>
    </g>`
  ),
  solarPlant: buildCardArt(
    "#5b3a08",
    "#ab6c0a",
    "#ffd60a",
    `<g>
      <circle cx="248" cy="40" r="20" fill="#ffe27a" fill-opacity="0.95"/>
      <g stroke="#d9eef4" stroke-width="4" stroke-linecap="round">
        <path d="M88 114L98 78L134 114" />
        <path d="M166 114L176 68L216 114" />
      </g>
      <g fill="#0f2741">
        <rect x="72" y="74" width="34" height="20" rx="2"/>
        <rect x="108" y="74" width="34" height="20" rx="2"/>
        <rect x="150" y="64" width="34" height="20" rx="2"/>
        <rect x="186" y="64" width="34" height="20" rx="2"/>
      </g>
    </g>`
  ),
  fusionReactor: buildCardArt(
    "#31124b",
    "#5b1f7f",
    "#f72585",
    `<g>
      <circle cx="160" cy="80" r="42" fill="#12061f" fill-opacity="0.9"/>
      <circle cx="160" cy="80" r="22" fill="#ff86c5" fill-opacity="0.85"/>
      <circle cx="160" cy="80" r="10" fill="#fff3f8"/>
      <path d="M112 84C126 52 194 52 208 84" stroke="#fbb1db" stroke-width="6" stroke-linecap="round"/>
      <path d="M122 108C140 124 180 124 198 108" stroke="#f72585" stroke-width="5" stroke-linecap="round"/>
    </g>`
  ),
  roboticsFactory: buildCardArt(
    "#21293d",
    "#44506e",
    "#89a3ff",
    `<g>
      <rect x="52" y="62" width="94" height="56" rx="14" fill="#141b2d" fill-opacity="0.92"/>
      <rect x="160" y="48" width="114" height="70" rx="16" fill="#1b243a" fill-opacity="0.94"/>
      <circle cx="106" cy="90" r="18" fill="#91a4ff" fill-opacity="0.85"/>
      <circle cx="222" cy="80" r="24" fill="#c6d0ff" fill-opacity="0.8"/>
      <path d="M222 56V104M198 80H246" stroke="#ffffff" stroke-opacity="0.58" stroke-width="5" stroke-linecap="round"/>
    </g>`
  ),
  naniteFactory: buildCardArt(
    "#141a2a",
    "#22324d",
    "#8fd3ff",
    `<g>
      <path d="M70 102L110 58L146 102L110 118Z" fill="#b5ebff" fill-opacity="0.86"/>
      <path d="M138 104L176 44L214 104L176 120Z" fill="#e0f8ff" fill-opacity="0.94"/>
      <path d="M204 102L240 64L274 102L240 116Z" fill="#8fd3ff" fill-opacity="0.8"/>
      <circle cx="176" cy="82" r="8" fill="#0a1222"/>
    </g>`
  ),
  shipyard: buildCardArt(
    "#1b2847",
    "#254f88",
    "#82d8ff",
    `<g>
      <rect x="48" y="78" width="220" height="40" rx="18" fill="#0f172b" fill-opacity="0.9"/>
      <path d="M96 76L146 54L212 60L248 76L208 88H122Z" fill="#d9f2ff" fill-opacity="0.9"/>
      <path d="M136 60L174 42L208 48L186 60Z" fill="#84d4ff" fill-opacity="0.82"/>
      <path d="M68 56H94V80H68Z" fill="#274c7d" fill-opacity="0.92"/>
    </g>`
  ),
  metalStorage: buildCardArt("#2c343f", "#53606d", "#cfd9df", `<g><rect x="74" y="48" width="58" height="70" rx="14" fill="#d0d5da" fill-opacity="0.88"/><rect x="138" y="38" width="64" height="80" rx="16" fill="#b0b8c1" fill-opacity="0.86"/><rect x="208" y="56" width="42" height="62" rx="12" fill="#89939d" fill-opacity="0.8"/></g>`),
  crystalStorage: buildCardArt("#112d46", "#2a4d69", "#78c6ff", `<g><rect x="60" y="64" width="56" height="54" rx="14" fill="#78c6ff" fill-opacity="0.7"/><rect x="124" y="42" width="68" height="76" rx="18" fill="#c4f1ff" fill-opacity="0.88"/><rect x="200" y="58" width="52" height="60" rx="16" fill="#7dd3fc" fill-opacity="0.72"/></g>`),
  deuteriumTank: buildCardArt("#0f2f3d", "#1e6075", "#76f7ff", `<g><ellipse cx="100" cy="86" rx="28" ry="34" fill="#70e4f4" fill-opacity="0.74"/><rect x="126" y="50" width="68" height="68" rx="24" fill="#c6fbff" fill-opacity="0.82"/><ellipse cx="230" cy="86" rx="26" ry="30" fill="#40bfd9" fill-opacity="0.66"/></g>`),
  researchLab: buildCardArt("#261443", "#4f2b83", "#d6b3ff", `<g><rect x="54" y="64" width="72" height="54" rx="16" fill="#0d1022" fill-opacity="0.92"/><rect x="138" y="46" width="128" height="72" rx="18" fill="#161a32" fill-opacity="0.95"/><circle cx="188" cy="82" r="20" fill="#e5d1ff" fill-opacity="0.9"/><path d="M188 62V102M168 82H208" stroke="#48227c" stroke-width="5" stroke-linecap="round"/></g>`),
};

const RESEARCH_ART: Record<string, string> = {
  energyTech: buildCardArt("#3a2c0d", "#8a5d0c", "#ffd166", `<g><path d="M148 32L116 88H152L132 128L212 66H168L188 32Z" fill="#ffe29a" fill-opacity="0.96"/></g>`),
  combustionDrive: buildCardArt("#45130f", "#8f2d1f", "#ff8c42", `<g><path d="M162 38C136 68 134 92 146 106C156 118 174 118 184 106C196 92 194 68 162 38Z" fill="#ff9b54" fill-opacity="0.92"/><path d="M162 64C152 78 150 88 154 94C158 100 166 100 170 94C174 88 172 78 162 64Z" fill="#fff1da" fill-opacity="0.82"/></g>`),
  impulseDrive: buildCardArt("#0c2442", "#124e78", "#68d8ff", `<g><path d="M96 96L154 44L214 70L184 96Z" fill="#d8f5ff" fill-opacity="0.9"/><path d="M184 96L230 106L198 118L142 112Z" fill="#8fd8ff" fill-opacity="0.76"/><circle cx="230" cy="78" r="16" fill="#7ae3ff" fill-opacity="0.88"/></g>`),
  hyperspaceDrive: buildCardArt("#160b2f", "#38136a", "#b388ff", `<g><circle cx="160" cy="80" r="38" stroke="#d2b8ff" stroke-width="8" stroke-opacity="0.9"/><circle cx="160" cy="80" r="18" fill="#ffffff" fill-opacity="0.74"/><path d="M122 80H198" stroke="#f1e8ff" stroke-width="4" stroke-linecap="round"/></g>`),
  computerTech: buildCardArt("#0f2136", "#183d63", "#82c7ff", `<g><rect x="72" y="42" width="176" height="82" rx="16" fill="#d9efff" fill-opacity="0.9"/><rect x="86" y="56" width="148" height="48" rx="8" fill="#16314d"/><circle cx="118" cy="80" r="8" fill="#82c7ff"/><path d="M142 80H210" stroke="#8fd0ff" stroke-width="6" stroke-linecap="round"/></g>`),
  astrophysics: buildCardArt("#091124", "#1a2847", "#9fd8ff", `<g><circle cx="164" cy="84" r="34" fill="#cbeaff" fill-opacity="0.88"/><circle cx="164" cy="84" r="10" fill="#091124"/><path d="M164 50C194 50 220 68 232 92" stroke="#ffffff" stroke-opacity="0.66" stroke-width="4"/><circle cx="232" cy="92" r="6" fill="#ffe29a"/></g>`),
  igrNetwork: buildCardArt("#082433", "#0f4f63", "#71f0d0", `<g><circle cx="94" cy="96" r="18" fill="#71f0d0" fill-opacity="0.86"/><circle cx="160" cy="58" r="18" fill="#d8fff5" fill-opacity="0.88"/><circle cx="226" cy="96" r="18" fill="#71f0d0" fill-opacity="0.8"/><path d="M108 86L146 66L212 86" stroke="#d8fff5" stroke-width="5" stroke-linecap="round"/></g>`),
};

const SHIP_ART: Record<string, string> = {
  smallCargo: buildCardArt(
    "#10243d",
    "#1b4a78",
    "#8fd8ff",
    `<g>
      <path d="M68 96L128 64L212 70L254 94L206 108L110 108Z" fill="#dff4ff" fill-opacity="0.92"/>
      <path d="M138 68L176 46L212 52L190 68Z" fill="#8dd4ff" fill-opacity="0.84"/>
      <rect x="84" y="92" width="28" height="10" rx="4" fill="#1a3556"/>
      <circle cx="242" cy="90" r="11" fill="#7ae7ff" fill-opacity="0.9"/>
    </g>`
  ),
  largeCargo: buildCardArt(
    "#15263f",
    "#305983",
    "#c7e9ff",
    `<g>
      <path d="M44 98L116 58L232 62L282 94L222 114L92 114Z" fill="#e9f7ff" fill-opacity="0.94"/>
      <path d="M126 62L182 34L230 40L198 62Z" fill="#a9ddff" fill-opacity="0.82"/>
      <rect x="78" y="98" width="52" height="12" rx="4" fill="#244162"/>
      <circle cx="268" cy="90" r="14" fill="#bdf0ff" fill-opacity="0.92"/>
    </g>`
  ),
  colonyShip: buildCardArt(
    "#173231",
    "#2c6d68",
    "#b7fff0",
    `<g>
      <path d="M58 92L134 52L220 58L264 86L202 114L104 114Z" fill="#e8fff8" fill-opacity="0.93"/>
      <path d="M134 52L176 24L212 28L188 52Z" fill="#aaf4e4" fill-opacity="0.84"/>
      <circle cx="160" cy="84" r="18" fill="#78e6d2" fill-opacity="0.72"/>
      <circle cx="160" cy="84" r="8" fill="#173231"/>
      <circle cx="248" cy="84" r="13" fill="#b7fff0" fill-opacity="0.88"/>
    </g>`
  ),
};

function getBuildingArt(key: string): string {
  const fallback = BUILDING_ART[key] ?? buildCardArt("#172133", "#283b5b", "#8db0ff", `<g><rect x="78" y="48" width="164" height="70" rx="18" fill="#d6e0ff" fill-opacity="0.84"/></g>`);
  return resolveGameArt(key, fallback);
}

function getResearchArt(key: string): string {
  const fallback = RESEARCH_ART[key] ?? buildCardArt("#152032", "#263f63", "#9dbfff", `<g><circle cx="160" cy="80" r="34" fill="#dbe8ff" fill-opacity="0.86"/></g>`);
  return resolveGameArt(key, fallback);
}

function getShipArt(key: string): string {
  const fallback = SHIP_ART[key] ?? buildCardArt("#152032", "#263f63", "#9dbfff", `<g><rect x="72" y="58" width="176" height="46" rx="16" fill="#dbe8ff" fill-opacity="0.86"/></g>`);
  return resolveGameArt(key, fallback);
}

function checkBuildingRequirements(buildingKey: string, planet: Planet, research: Research): RequirementCheck | null {
  const building = BUILDINGS.find(entry => entry.key === buildingKey);
  if (!building) return null;
  return buildRequirementCheck(
    building.name,
    building.icon,
    "BUILDING REQUIREMENTS NOT MET",
    "Building prerequisites are missing",
    "Upgrade the missing buildings or research first, then come back and start this construction.",
    BUILDING_REQUIREMENTS[buildingKey] ?? [],
    planet,
    research,
  );
}

function checkResearchRequirements(
  tech: typeof RESEARCH_TECHS[number],
  planet: Planet,
  research: Research,
): RequirementCheck {
  const requirements = [
    { type: "building", key: "researchLab", level: tech.labReq } as Requirement,
    ...(RESEARCH_REQUIREMENTS[tech.field] ?? []),
  ];
  return buildRequirementCheck(
    tech.name,
    tech.icon,
    "RESEARCH REQUIREMENTS NOT MET",
    "Technology prerequisites are missing",
    "Upgrade the missing lab, buildings, or prerequisite technologies before starting this research.",
    requirements,
    planet,
    research,
  );
}

function checkShipRequirements(shipKey: string, research: Research, planet: Planet): ShipRequirementsCheck | null {
  const ship = SHIPS.find(s => s.key === shipKey);
  if (!ship) return null;
  const requirements: ShipRequirement[] = [];
  requirements.push({ label: "Shipyard", met: planet.shipyard >= 1, current: planet.shipyard, required: 1 });
  if (shipKey === "smallCargo") requirements.push({ label: "Combustion Drive", met: research.combustionDrive >= 2, current: research.combustionDrive, required: 2 });
  if (shipKey === "largeCargo") requirements.push({ label: "Combustion Drive", met: research.combustionDrive >= 6, current: research.combustionDrive, required: 6 });
  if (shipKey === "colonyShip") {
    requirements.push({ label: "Impulse Drive", met: research.impulseDrive >= 3, current: research.impulseDrive, required: 3 });
    requirements.push({ label: "Astrophysics", met: research.astrophysics >= 4, current: research.astrophysics, required: 4 });
  }
  return { shipName: ship.name, shipIcon: ship.icon, requirements, allMet: requirements.every(r => r.met) };
}

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Share+Tech+Mono&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --void: #04040d; --panel: #0b0b1e; --border: #1a1a3a; --purple: #9b5de5;
    --cyan: #00f5d4; --text: #c8d6e5; --dim: #4a5568; --metal: #b8b8d4;
    --crystal: #00f5d4; --deut: #4cc9f0; --danger: #ff006e; --success: #06d6a0;
    --warn: #ffd60a; --glow-p: 0 0 20px rgba(155,93,229,0.4); --glow-c: 0 0 20px rgba(0,245,212,0.4);
    --bottom-bar: 64px; --shell-shadow: 0 24px 60px rgba(0,0,0,0.38); --panel-soft: rgba(255,255,255,0.045);
  }
  html, body, #root { height: 100%; background: var(--void); color: var(--text);
    font-family: 'Share Tech Mono', monospace; font-size: 13px; }
  .starfield { position: fixed; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; }
  .star { position: absolute; border-radius: 50%; background: white;
    animation: twinkle var(--dur) ease-in-out infinite; animation-delay: var(--delay); }
  @keyframes twinkle { 0%,100%{opacity:var(--min-op);transform:scale(1)} 50%{opacity:1;transform:scale(1.4)} }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
  @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
  @keyframes slideUp { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }
  @keyframes fadeIn { from{opacity:0} to{opacity:1} }

  .app { position: relative; z-index: 1; height: 100vh; display: grid;
    grid-template-rows: 56px 1fr; grid-template-columns: 220px 1fr;
    grid-template-areas: "header header" "sidebar main"; overflow: hidden; }
  .header { grid-area: header; display: flex; align-items: center; justify-content: space-between;
    padding: 0 24px; background: rgba(8,8,22,0.95); border-bottom: 1px solid var(--border);
    backdrop-filter: blur(12px); z-index: 10; }
  .header::after { content: ""; position: absolute; inset: auto 24px 0 24px; height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent); }
  .logo-area { display: flex; align-items: center; gap: 12px; }
  .game-title { font-family: 'Orbitron', sans-serif; font-size: 16px; font-weight: 900; letter-spacing: 3px;
    background: linear-gradient(135deg, var(--purple), var(--cyan));
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .header-right { display: flex; align-items: center; gap: 12px; }
  .header-cluster { display:flex; align-items:center; gap:10px; padding:6px 10px; border:1px solid rgba(255,255,255,0.08); border-radius:18px; background: rgba(4,7,17,0.45); box-shadow: inset 0 1px 0 rgba(255,255,255,0.04); }
  .brand-stack { display:flex; flex-direction:column; gap:2px; }
  .brand-kicker { font-size:9px; letter-spacing:2.5px; text-transform:uppercase; color:rgba(200,214,229,0.46); }
  .header-callout { font-size:10px; color:var(--dim); letter-spacing:1.1px; }
  .chain-tag { font-size: 10px; letter-spacing: 1px; color: var(--dim);
    border: 1px solid var(--border); padding: 4px 8px; border-radius: 2px; }
  .token-badge { display: inline-flex; align-items: center; gap: 7px; font-size: 10px; letter-spacing: 1px;
    color: var(--warn); border: 1px solid rgba(255,214,10,0.35); padding: 4px 9px; border-radius: 999px;
    background: linear-gradient(135deg, rgba(255,214,10,0.12), rgba(0,245,212,0.04)); box-shadow: 0 0 18px rgba(255,214,10,0.08); }
  .token-badge.loading { color: var(--dim); border-color: var(--border); background: rgba(255,255,255,0.03); }
  .token-badge-icon { display: inline-flex; align-items: center; justify-content: center; color: var(--warn); }
  .token-badge-amount { font-family: 'Orbitron', sans-serif; font-size: 11px; font-weight: 700; color: var(--text); }
  .token-badge-label { font-size: 9px; color: var(--warn); letter-spacing: 1.4px; }
  .vault-tag { font-size: 10px; letter-spacing: 1px; color: var(--success);
    border: 1px solid rgba(6,214,160,0.3); padding: 4px 8px; border-radius: 2px;
    background: rgba(6,214,160,0.05); cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
  .vault-sol { font-family: 'Orbitron', sans-serif; font-size: 10px; font-weight: 700; color: var(--success); }
  .sidebar { grid-area: sidebar; background: rgba(11,11,30,0.9); border-right: 1px solid var(--border);
    display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden; }
  .sidebar-shell { position:relative; }
  .sidebar-shell::before { content:""; position:absolute; inset:0; background: linear-gradient(180deg, rgba(255,255,255,0.03), transparent 22%, transparent 82%, rgba(255,255,255,0.02)); pointer-events:none; }
  .res-panel { padding: 14px 16px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
  .res-label { font-size: 9px; letter-spacing: 2px; color: var(--dim); text-transform: uppercase; margin-bottom: 10px; }
  .res-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .res-name { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--dim); }
  .res-dot { width: 6px; height: 6px; border-radius: 50%; }
  .res-val { font-size: 12px; font-weight: 600; }
  .res-rate { font-size: 9px; color: var(--dim); }
  .cap-bar { margin-bottom: 12px; height: 2px; background: var(--border); border-radius: 1px; overflow: hidden; }
  .cap-fill { height: 100%; border-radius: 1px; transition: width 0.5s; }
  .energy-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-top: 1px solid var(--border); }
  .nav { flex: 1 1 0; min-height: 0; padding: 12px 0; overflow-y: auto; display: flex; flex-direction: column; gap: 3px; }
  .nav::-webkit-scrollbar { width: 5px; }
  .nav::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
  .nav-item { display: flex; align-items: center; gap: 10px; padding: 11px 16px; cursor: pointer;
    font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--dim);
    transition: all 0.15s; border-left: 2px solid transparent; }
  .nav-item:hover { color: var(--text); background: rgba(155,93,229,0.05); }
  .nav-item.active { color: var(--cyan); border-left-color: var(--cyan); background: rgba(0,245,212,0.05); }
  .nav-item:focus-visible,
  .mobile-more-item:focus-visible,
  .mobile-drawer-close:focus-visible,
  [data-psg1-focusable='true']:focus-visible,
  .psg1-focus { outline: 2px solid rgba(0,245,212,0.9); outline-offset: 2px; }
  .nav-badge { margin-left: auto; font-size: 9px; padding: 2px 6px; background: var(--danger);
    border-radius: 10px; color: white; font-weight: 700; }
  .main { grid-area: main; overflow-y: auto; padding: 0 24px 24px;
    scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
  .main-shell { position:relative; }
  .main-shell::before { content:""; position:absolute; inset:0; background: linear-gradient(180deg, rgba(255,255,255,0.02), transparent 25%), radial-gradient(circle at 75% 10%, rgba(255,255,255,0.03), transparent 30%); pointer-events:none; }
  .main::-webkit-scrollbar { width: 4px; }
  .main::-webkit-scrollbar-thumb { background: var(--border); }
  .desktop-tab-chrome { display:grid; gap:16px; padding-top:20px; }
  .desktop-resource-shell { position: sticky; top: 0; z-index: 6; padding: 14px 0 2px; background: transparent; backdrop-filter: none; }
  .desktop-resource-menu { display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap:12px; padding:14px 16px; border-radius:20px; }
  .desktop-resource-pill { position:relative; overflow:hidden; padding:14px 16px; border-radius:16px; border:1px solid rgba(255,255,255,0.08); background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(8,10,22,0.94)); box-shadow: inset 0 1px 0 rgba(255,255,255,0.04); min-width:0; }
  .desktop-resource-pill::before { content:""; position:absolute; inset:0; background: linear-gradient(135deg, rgba(255,255,255,0.04), transparent 46%, rgba(255,255,255,0.02)); pointer-events:none; }
  .desktop-resource-pill > * { position:relative; z-index:1; }
  .desktop-resource-label { font-size:9px; letter-spacing:2px; text-transform:uppercase; color:rgba(200,214,229,0.54); }
  .desktop-resource-value { margin-top:8px; font-family:'Orbitron',sans-serif; font-size:18px; color:white; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .desktop-resource-meta { margin-top:6px; font-size:10px; color:rgba(200,214,229,0.68); letter-spacing:0.8px; }
  .desktop-resource-cap { margin-top:10px; height:3px; background:rgba(255,255,255,0.08); border-radius:999px; overflow:hidden; }
  .desktop-resource-cap-fill { height:100%; border-radius:999px; }
  .desktop-tab-body { min-width:0; }
  .sidebar-top-offset { flex: 0 0 auto; height: 10px; margin: 20px 16px 8px; border-top: 1px solid rgba(255,255,255,0.08); opacity: 0.75; }
  .shell-error { border:1px solid rgba(255,0,110,0.28); background: linear-gradient(135deg, rgba(255,0,110,0.08), rgba(255,255,255,0.02)); color: #ff8fb7; padding: 12px 14px; border-radius: 12px; font-size: 11px; letter-spacing: 0.8px; margin-bottom: 16px; box-shadow: var(--shell-shadow); }
  .shell-panel { border:1px solid rgba(255,255,255,0.08); background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(8,10,22,0.92)); box-shadow: var(--shell-shadow); backdrop-filter: blur(16px); }
  .sidebar-planet-dot { width:8px; height:8px; border-radius:50%; background: var(--planet-accent, var(--cyan)); box-shadow: 0 0 12px var(--planet-accent, var(--cyan)); }
  .resource-grid { display:grid; gap:10px; }
  .res-panel.shell-panel { margin:0 16px 16px; border-radius:18px; padding:16px; }
  .nav.shell-panel { margin:0 16px 16px; border-radius:18px; padding:10px 0; background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(8,10,22,0.92)); }
  .nav-item { border-left:none; margin:0 10px; border-radius:12px; }
  .nav-item.active { border-left-color: transparent; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06); }
  .overview-shell { display:grid; gap:18px; }
  .overview-hero { position:relative; overflow:hidden; border-radius:24px; padding:18px; border:1px solid rgba(255,255,255,0.1); min-height:206px; box-shadow: var(--shell-shadow); background: var(--hero-gradient, linear-gradient(135deg, rgba(10,56,64,0.95), rgba(11,14,31,0.94))); }
  .overview-hero::before { content:""; position:absolute; inset:0; background: var(--hero-nebula, radial-gradient(circle at 18% 18%, rgba(88,251,213,0.20), transparent 18%)); opacity:1; }
  .overview-hero::after { content:""; position:absolute; inset:0; background: linear-gradient(125deg, rgba(255,255,255,0.04), transparent 32%, transparent 70%, rgba(255,255,255,0.05)); pointer-events:none; }
  .overview-hero > * { position:relative; z-index:1; }
  .hero-grid { display:grid; grid-template-columns: minmax(0, 1.45fr) minmax(168px, 0.55fr); gap:18px; align-items:stretch; }
  .hero-kicker { font-size:10px; letter-spacing:2.8px; text-transform:uppercase; color:rgba(200,214,229,0.64); margin-bottom:12px; }
  .hero-title { font-family:'Orbitron',sans-serif; font-size: clamp(22px, 4vw, 34px); line-height:1.05; color:white; letter-spacing:1.2px; max-width:10ch; }
  .hero-subtitle { margin-top:10px; font-size:11px; line-height:1.65; color:rgba(200,214,229,0.76); max-width:56ch; }
  .hero-chip-row { display:flex; flex-wrap:wrap; gap:10px; margin-top:14px; }
  .hero-chip { display:inline-flex; align-items:center; gap:8px; padding:8px 12px; border-radius:999px; border:1px solid rgba(255,255,255,0.1); background: rgba(4,8,18,0.45); font-size:10px; letter-spacing:1.2px; text-transform:uppercase; color:rgba(200,214,229,0.84); }
  .hero-chip strong { color:white; font-family:'Orbitron',sans-serif; font-size:11px; letter-spacing:0.8px; }
  .hero-planet-card { position:relative; overflow:hidden; border-radius:18px; min-height:116px; padding:10px; border:1px solid rgba(255,255,255,0.1); background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(8,10,19,0.88)); display:flex; align-items:center; justify-content:center; }
  .hero-planet-card::before { content:""; position:absolute; inset:0; background:
    radial-gradient(circle at 30% 22%, rgba(122,176,255,0.18), transparent 26%),
    radial-gradient(circle at 72% 32%, rgba(255,255,255,0.06), transparent 12%),
    radial-gradient(circle at 78% 18%, rgba(131,104,255,0.14), transparent 20%),
    linear-gradient(180deg, rgba(16,28,54,0.92), rgba(5,8,20,0.98));
    opacity:0.95; }
  .hero-planet-card::after { content:""; position:absolute; inset:0; background-image:
    radial-gradient(circle at 18% 30%, rgba(255,255,255,0.9) 0 1px, transparent 1.5px),
    radial-gradient(circle at 72% 24%, rgba(255,255,255,0.75) 0 1px, transparent 1.5px),
    radial-gradient(circle at 82% 62%, rgba(180,210,255,0.7) 0 1px, transparent 1.5px),
    radial-gradient(circle at 28% 74%, rgba(255,255,255,0.55) 0 1px, transparent 1.5px),
    radial-gradient(circle at 58% 56%, rgba(255,255,255,0.4) 0 1px, transparent 1.5px);
    opacity:0.55; }
  .hero-planet-top { display:flex; justify-content:space-between; gap:12px; align-items:flex-start; }
  .hero-planet-badge { padding:7px 10px; border-radius:999px; background: rgba(4,8,18,0.52); border:1px solid rgba(255,255,255,0.12); font-size:10px; color:rgba(200,214,229,0.72); letter-spacing:1px; }
  .hero-planet-visual { position:relative; z-index:1; align-self:center; display:flex; justify-content:center; align-items:center; width:100%; height:100%; margin:0; filter: drop-shadow(0 20px 24px rgba(0,0,0,0.34)); }
  .hero-planet-footer { display:flex; justify-content:space-between; gap:12px; align-items:flex-end; }
  .hero-planet-stat { display:grid; gap:4px; }
  .hero-planet-label { font-size:9px; color:rgba(200,214,229,0.54); letter-spacing:2px; text-transform:uppercase; }
  .hero-planet-value { font-family:'Orbitron',sans-serif; color:white; font-size:13px; letter-spacing:0.8px; }
  .overview-card-grid { display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap:14px; }
  .overview-metric { padding:18px; border-radius:18px; min-height:116px; }
  .overview-metric .card-label { font-size:9px; color:rgba(200,214,229,0.54); }
  .overview-metric .card-value { font-size:22px; }
  .overview-panel-grid { display:grid; grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr); gap:18px; }
  .overview-section-panel { border-radius:20px; padding:18px; }
  .planet-pill-list { display:flex; flex-wrap:wrap; gap:10px; }
  .planet-pill { padding:12px 14px; border-radius:16px; border:1px solid rgba(255,255,255,0.08); background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(7,9,18,0.94)); color:var(--text); cursor:pointer; min-width:160px; text-align:left; box-shadow: var(--shell-shadow); }
  .planet-pill.active { border-color: var(--planet-accent, var(--cyan)); box-shadow: 0 0 0 1px var(--planet-accent, var(--cyan)), var(--shell-shadow); }
  .planet-pill-title { font-family:'Orbitron',sans-serif; font-size:11px; color:white; }
  .planet-pill-sub { font-size:9px; color:rgba(200,214,229,0.58); margin-top:4px; letter-spacing:1px; }
  .command-empty { position:relative; overflow:hidden; max-width:720px; margin:48px auto; padding:28px; border-radius:24px; border:1px solid rgba(255,255,255,0.10); background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(7,9,19,0.94)); box-shadow: var(--shell-shadow); text-align:center; }
  .command-empty::before { content:""; position:absolute; inset:0; background: radial-gradient(circle at 20% 20%, rgba(108,245,204,0.16), transparent 20%), radial-gradient(circle at 80% 15%, rgba(155,93,229,0.14), transparent 22%); }
  .command-empty > * { position:relative; z-index:1; }
  .command-empty-art { display:flex; justify-content:center; margin-bottom:22px; filter: drop-shadow(0 28px 36px rgba(0,0,0,0.34)); }
  .command-empty-title { font-family:'Orbitron',sans-serif; font-size:24px; color:white; letter-spacing:2px; margin-bottom:10px; }
  .command-empty-sub { color:rgba(200,214,229,0.74); font-size:12px; line-height:1.8; margin-bottom:24px; }
  .command-empty-grid { display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap:12px; margin-bottom:20px; }
  .command-empty-step { padding:14px; border-radius:16px; border:1px solid rgba(255,255,255,0.08); background: rgba(4,8,18,0.42); text-align:left; }
  .command-empty-step-num { font-family:'Orbitron',sans-serif; color:var(--cyan); font-size:12px; margin-bottom:8px; }
  .command-empty-step-copy { font-size:11px; color:rgba(200,214,229,0.75); line-height:1.7; }

  .app-mobile { position: relative; z-index: 1; height: 100dvh; display: flex; flex-direction: column; overflow: hidden; }
  .mobile-header { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
    padding: 0 16px; height: 52px; background: rgba(6,6,18,0.97); border-bottom: 1px solid var(--border);
    backdrop-filter: blur(16px); z-index: 20; }
  .mobile-header-left { display: flex; align-items: center; gap: 10px; }
  .mobile-game-title { font-family: 'Orbitron', sans-serif; font-size: 13px; font-weight: 900; letter-spacing: 2px;
    background: linear-gradient(135deg, var(--purple), var(--cyan));
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .mobile-header-right { display: flex; align-items: center; gap: 8px; }
  .mobile-token-badge { max-width: 128px; padding: 3px 8px; gap: 6px; }
  .mobile-token-badge .token-badge-amount { font-size: 10px; }
  .mobile-token-badge .token-badge-label { font-size: 8px; }
  .mobile-res-strip { flex-shrink: 0; display: flex; align-items: center; gap: 0;
    background: rgba(8,8,22,0.92); border-bottom: 1px solid var(--border);
    overflow-x: hidden; scrollbar-width: none; -webkit-overflow-scrolling: touch; padding: 0; }
  .mobile-res-strip::-webkit-scrollbar { display: none; }
  .mobile-res-item { display: flex; flex: 1; flex-direction: column; align-items: center; padding: 8px 6px;
    border-right: 1px solid var(--border); flex-shrink: 0; min-width: 0px; }
  .mobile-res-item:last-child { border-right: none; }
  .mobile-res-label { font-size: 8px; letter-spacing: 1.5px; color: var(--dim); text-transform: uppercase; margin-bottom: 2px; }
  .mobile-res-value { font-size: 12px; font-weight: 600; font-family: 'Share Tech Mono', monospace; }
  .mobile-res-rate { font-size: 8px; color: var(--dim); margin-top: 1px; }
  .mobile-planet-banner { flex-shrink: 0; display: flex; align-items: center; gap: 12px;
    padding: 10px 16px; background: rgba(11,11,28,0.7); border-bottom: 1px solid var(--border); }
  .mobile-planet-coords { font-size: 9px; color: var(--dim); letter-spacing: 1px; }
  .mobile-planet-name { font-family: 'Orbitron', sans-serif; font-size: 12px; font-weight: 700; color: white; }
  .mobile-planet-meta { font-size: 9px; color: var(--dim); }
  .mobile-main { flex: 1; overflow-y: auto; padding: 16px 14px;
    padding-bottom: calc(var(--bottom-bar) + 16px);
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
  .mobile-main::-webkit-scrollbar { width: 3px; }
  .mobile-main::-webkit-scrollbar-thumb { background: var(--border); }
  .mobile-bottom-bar { flex-shrink: 0; position: fixed; bottom: 0; left: 0; right: 0;
    height: var(--bottom-bar); background: rgba(6,6,18,0.97);
    border-top: 1px solid var(--border); backdrop-filter: blur(20px);
    display: flex; align-items: stretch; z-index: 50;
    padding-bottom: env(safe-area-inset-bottom, 0px); }
  .mobile-nav-btn { flex: 1; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 3px; cursor: pointer; border: none;
    background: transparent; color: var(--dim); transition: all 0.15s;
    -webkit-tap-highlight-color: transparent; position: relative; padding: 0; }
  .mobile-nav-btn.active { color: var(--cyan); }
  .mobile-nav-btn.active::after { content: ''; position: absolute; top: 0; left: 20%; right: 20%;
    height: 2px; background: var(--cyan); border-radius: 0 0 2px 2px;
    box-shadow: 0 0 8px rgba(0,245,212,0.6); }
  .mobile-nav-btn:active { background: rgba(255,255,255,0.04); }
  .mobile-nav-icon { font-size: 18px; line-height: 1; }
  .mobile-nav-label { font-size: 8px; letter-spacing: 1px; text-transform: uppercase; font-family: 'Share Tech Mono', monospace; }
  .mobile-nav-badge { position: absolute; top: 6px; right: calc(50% - 14px);
    font-size: 8px; padding: 1px 4px; background: var(--danger);
    border-radius: 8px; color: white; font-weight: 700; min-width: 14px; text-align: center; }
  .mobile-more-drawer { position: fixed; bottom: var(--bottom-bar); left: 0; right: 0;
    background: rgba(8,8,22,0.98); border-top: 1px solid var(--border);
    backdrop-filter: blur(20px); z-index: 45; animation: slideUp 0.22s ease; }
  .mobile-more-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px;
    background: var(--border); border-bottom: 1px solid var(--border); }
  .mobile-more-item { display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 5px; padding: 16px 8px; background: var(--void); cursor: pointer;
    -webkit-tap-highlight-color: transparent; transition: background 0.1s; }
  .mobile-more-item:active { background: rgba(155,93,229,0.08); }
  .mobile-more-item.active { background: rgba(0,245,212,0.05); }
  .mobile-more-icon { font-size: 20px; }
  .mobile-more-label { font-size: 9px; letter-spacing: 1px; color: var(--dim); text-transform: uppercase; }
  .mobile-more-label.active { color: var(--cyan); }
  .mobile-drawer-close { display: flex; align-items: center; justify-content: center;
    padding: 12px; cursor: pointer; color: var(--dim); font-size: 11px; letter-spacing: 1px;
    -webkit-tap-highlight-color: transparent; }

  .section-title { font-family: 'Orbitron', sans-serif; font-size: 12px; font-weight: 700;
    letter-spacing: 3px; color: var(--purple); text-transform: uppercase; margin-bottom: 20px;
    padding-bottom: 8px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px; }
  .section-title::after { content:''; flex:1; height:1px; background: linear-gradient(90deg, var(--border), transparent); }
  .command-tab-shell { display:grid; gap:16px; }
  .command-section-head { position:relative; overflow:hidden; padding:18px 20px; border-radius:18px; border:1px solid rgba(255,255,255,0.08); background: linear-gradient(135deg, rgba(255,255,255,0.05), rgba(8,10,24,0.94)); box-shadow: var(--shell-shadow); }
  .command-section-head::before { content:""; position:absolute; inset:0; background: radial-gradient(circle at 18% 20%, rgba(108,245,204,0.12), transparent 20%), radial-gradient(circle at 82% 18%, rgba(155,93,229,0.12), transparent 22%); opacity:0.9; }
  .command-section-head > * { position:relative; z-index:1; }
  .command-eyebrow { font-size:10px; letter-spacing:2.4px; text-transform:uppercase; color:rgba(200,214,229,0.58); margin-bottom:8px; }
  .command-head-title { font-family:'Orbitron',sans-serif; font-size:20px; color:white; letter-spacing:1px; }
  .command-copy { margin-top:8px; max-width:72ch; font-size:11px; line-height:1.7; color:rgba(200,214,229,0.72); }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .grid-3 { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; }
  .grid-4 { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; }
  .card { position:relative; overflow:hidden; background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(8,10,22,0.94)); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 16px; transition: border-color 0.2s, transform 0.2s; box-shadow: var(--shell-shadow); }
  .card::before { content:""; position:absolute; inset:0; background: linear-gradient(135deg, rgba(255,255,255,0.04), transparent 42%, rgba(255,255,255,0.02)); pointer-events:none; }
  .card:hover { border-color: rgba(155,93,229,0.3); transform: translateY(-1px); }
  .card-label { font-size: 9px; letter-spacing: 2px; color: var(--dim); text-transform: uppercase; margin-bottom: 6px; }
  .card-value { font-family: 'Orbitron', sans-serif; font-size: 20px; font-weight: 700; color: white; }
  .card-sub { font-size: 10px; color: var(--dim); margin-top: 3px; }
  .building-card { position:relative; overflow:hidden; background: linear-gradient(180deg, rgba(255,255,255,0.045), rgba(8,10,22,0.95)); border: 1px solid rgba(255,255,255,0.08); border-radius: 18px;
    padding: 16px; display: flex; flex-direction: column; gap: 10px; transition: all 0.2s; box-shadow: var(--shell-shadow); }
  .building-card::before { content:""; position:absolute; inset:0; background: radial-gradient(circle at 84% 16%, rgba(155,93,229,0.08), transparent 18%), linear-gradient(145deg, rgba(255,255,255,0.04), transparent 40%); pointer-events:none; }
  .building-card:hover { border-color: rgba(155,93,229,0.4); transform: translateY(-1px); }
  .building-card-art { position: relative; height: 110px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.08); background-color: rgba(9,12,24,0.92); background-size: cover; background-position: center; box-shadow: inset 0 1px 0 rgba(255,255,255,0.06); overflow: hidden; }
  .building-card-art::after { content:""; position:absolute; inset:0; background: linear-gradient(180deg, rgba(255,255,255,0.05), transparent 32%, rgba(5,8,16,0.2)); pointer-events:none; }
  .building-header { display: flex; align-items: center; justify-content: space-between; }
  .building-icon-name { display: flex; align-items: center; gap: 8px; }
  .building-icon { font-size: 16px; }
  .building-name { font-size: 11px; color: var(--text); }
  .building-level { font-family: 'Orbitron', sans-serif; font-size: 15px; font-weight: 700; color: var(--purple); padding:6px 10px; border-radius:999px; background: rgba(155,93,229,0.08); border:1px solid rgba(155,93,229,0.2); }
  .building-costs { font-size: 10px; color: var(--dim); display: flex; flex-direction: column; gap: 4px; margin-top:auto; padding-top:4px; }
  .building-cost-row { display: flex; justify-content: space-between; padding:4px 0; border-bottom:1px solid rgba(255,255,255,0.04); }
  .building-cost-row:last-child { border-bottom:none; }
  .cost-ok { color: var(--text); } .cost-bad { color: var(--danger); }
  .build-btn { font-family: 'Share Tech Mono', monospace; font-size: 10px; margin-top: auto; letter-spacing: 1px;
    padding: 10px 12px; border-radius: 10px; border: none; cursor: pointer; transition: all 0.15s;
    text-transform: uppercase; width: 100%; }
  .build-btn.can-build { background: linear-gradient(135deg,rgba(155,93,229,0.2),rgba(0,245,212,0.1));
    border: 1px solid var(--purple); color: var(--purple); }
  .build-btn.can-build:hover { background: linear-gradient(135deg,var(--purple),var(--cyan)); color: var(--void); box-shadow: var(--glow-p); }
  .build-btn.building-now { background: rgba(255,214,10,0.1); border: 1px solid var(--warn); color: var(--warn); cursor: default; }
  .build-btn.finish-btn { background: rgba(6,214,160,0.1); border: 1px solid var(--success); color: var(--success); }
  .build-btn.finish-btn:hover { background: var(--success); color: var(--void); }
  .build-btn.no-funds { background: transparent; border: 1px solid var(--border); color: var(--dim); cursor: not-allowed; }
  .build-btn.locked-btn { background: rgba(255,0,110,0.06); border: 1px solid rgba(255,0,110,0.5); color: var(--danger); }
  .build-btn.locked-btn:hover { background: rgba(255,0,110,0.14); }
  .ship-build-card { position:relative; overflow:hidden; background: linear-gradient(180deg, rgba(255,255,255,0.045), rgba(8,10,22,0.95)); border: 1px solid rgba(255,255,255,0.08); border-radius: 18px;
    padding: 16px; display: flex; flex-direction: column; gap: 10px; transition: border-color 0.2s, transform 0.2s; box-shadow: var(--shell-shadow); }
  .ship-build-card::before { content:""; position:absolute; inset:0; background: radial-gradient(circle at 82% 16%, rgba(0,245,212,0.08), transparent 18%), linear-gradient(145deg, rgba(255,255,255,0.04), transparent 40%); pointer-events:none; }
  .ship-build-card:hover { border-color: rgba(0,245,212,0.3); transform: translateY(-1px); }
  .ship-build-card.locked { border-color: rgba(255,0,110,0.2); }
  .ship-build-card.locked:hover { border-color: rgba(255,0,110,0.4); }
  .ship-card-art { position: relative; width: 100%; height: 132px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.08); background-color: rgba(9,12,24,0.92); background-size: contain; background-repeat: no-repeat; background-position: center; box-shadow: inset 0 1px 0 rgba(255,255,255,0.06); overflow: hidden; }
  .ship-card-art::after { content:""; position:absolute; inset:0; background: radial-gradient(circle at 50% 48%, rgba(125,216,255,0.14), transparent 42%), linear-gradient(180deg, rgba(255,255,255,0.05), transparent 32%, rgba(5,8,16,0.2)); pointer-events:none; }
  .ship-build-header { display: flex; align-items: center; justify-content: space-between; }
  .ship-build-icon-name { display: flex; align-items: center; gap: 8px; }
  .ship-build-icon { font-size: 20px; }
  .ship-build-name { font-size: 11px; color: var(--text); }
  .ship-build-count { font-family: 'Orbitron', sans-serif; font-size: 14px; font-weight: 700; color: var(--cyan); }
  .ship-build-count.zero { color: var(--border); }
  .ship-qty-row { display: flex; align-items: center; gap: 6px; }
  .qty-input { width: 64px; padding: 8px 6px; font-size: 11px; border-radius: 10px; text-align: center;
    background: rgba(0,0,0,0.4); border: 1px solid var(--border); color: var(--text); }
  .ship-build-btn { font-family: 'Share Tech Mono', monospace; font-size: 10px; letter-spacing: 1px;
    padding: 10px 12px; border-radius: 10px; border: 1px solid var(--cyan); background: rgba(0,245,212,0.08);
    color: var(--cyan); cursor: pointer; transition: all 0.15s; text-transform: uppercase; flex: 1; }
  .ship-build-btn:hover:not(:disabled) { background: var(--cyan); color: var(--void); box-shadow: var(--glow-c); }
  .ship-build-btn:disabled { border-color: var(--border); color: var(--dim); cursor: not-allowed; background: transparent; }
  .ship-build-btn.locked-btn { border-color: rgba(255,0,110,0.5); color: var(--danger); background: rgba(255,0,110,0.06); cursor: pointer; }
  .ship-build-btn.locked-btn:hover { background: rgba(255,0,110,0.15); }
  .ship-card { position:relative; overflow:hidden; background: linear-gradient(180deg, rgba(255,255,255,0.045), rgba(8,10,22,0.95)); border: 1px solid rgba(255,255,255,0.08); border-radius: 18px;
    padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 8px; box-shadow: var(--shell-shadow); }
  .fleet-ship-card { align-items: stretch; gap: 12px; }
  .fleet-ship-card-art { position: relative; height: 132px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.08); background-color: rgba(9,12,24,0.92); background-size: contain; background-repeat: no-repeat; background-position: center; box-shadow: inset 0 1px 0 rgba(255,255,255,0.06); overflow: hidden; }
  .fleet-ship-card-art::before { content:""; position:absolute; inset:0; background: radial-gradient(circle at 50% 48%, rgba(125,216,255,0.14), transparent 42%), linear-gradient(180deg, rgba(255,255,255,0.04), rgba(5,8,16,0.12)); pointer-events:none; }
  .fleet-ship-card-copy { display:flex; align-items:flex-end; justify-content:space-between; gap:12px; width:100%; }
  .fleet-ship-card-name { font-size: 10px; color: var(--dim); letter-spacing: 1px; text-transform: uppercase; }
  .ship-icon { font-size: 22px; }
  .ship-name { font-size: 9px; color: var(--dim); text-align: center; letter-spacing: 1px; }
  .ship-count { font-family: 'Orbitron', sans-serif; font-size: 18px; font-weight: 700; color: var(--cyan); }
  .ship-count.zero { color: var(--border); }
  .mission-card { position:relative; overflow:hidden; background: linear-gradient(180deg, rgba(255,255,255,0.045), rgba(8,10,22,0.95)); border: 1px solid rgba(255,255,255,0.08); border-radius: 18px; padding: 18px; margin-bottom: 14px; box-shadow: var(--shell-shadow); }
  .mission-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .mission-type-badge { font-size: 10px; letter-spacing: 2px; padding: 3px 8px; border-radius: 2px; font-weight: 700; }
  .mission-type-badge.transport { background:rgba(0,245,212,0.1); color:var(--cyan); border:1px solid rgba(0,245,212,0.3); }
  .mission-type-badge.other { background:rgba(155,93,229,0.1); color:var(--purple); border:1px solid rgba(155,93,229,0.3); }
  .mission-returning { font-size: 10px; color: var(--success); letter-spacing: 1px; }
  .progress-bar { height: 3px; background: var(--border); border-radius: 2px; overflow: hidden; margin-bottom: 8px; }
  .progress-fill { height: 100%; border-radius: 2px; transition: width 1s linear; }
  .progress-fill.outbound { background: linear-gradient(90deg, var(--purple), var(--cyan)); }
  .progress-fill.returning { background: linear-gradient(90deg, var(--cyan), var(--success)); }
  .mission-info { display: flex; justify-content: space-between; font-size: 10px; color: var(--dim); }
  .mission-eta { color: var(--cyan); font-weight: 600; }
  .mission-ships { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px; }
  .mission-ship-badge { font-size: 10px; background: rgba(155,93,229,0.08); border: 1px solid var(--border); border-radius: 2px; padding: 2px 6px; color: var(--text); }
  .mission-ship-media { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 10px; }
  .mission-ship-card { width: 112px; border-radius: 14px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08); background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(8,10,22,0.94)); box-shadow: var(--shell-shadow); }
  .mission-ship-card-art { height: 68px; background-size: cover; background-position: center; }
  .mission-ship-card-copy { padding: 8px 10px; display: flex; justify-content: space-between; gap: 8px; font-size: 9px; letter-spacing: 0.8px; color: var(--text); }
  .apply-btn { font-family: 'Share Tech Mono', monospace; font-size: 10px; letter-spacing: 1px;
    padding: 6px 14px; border-radius: 2px; border: 1px solid var(--success); background: rgba(6,214,160,0.1);
    color: var(--success); cursor: pointer; transition: all 0.15s; margin-top: 10px; }
  .apply-btn:hover:not(:disabled) { background: var(--success); color: var(--void); }
  .apply-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .stat-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(26,26,58,0.5); }
  .stat-row:last-child { border-bottom: none; }
  .stat-key { color: var(--dim); font-size: 11px; letter-spacing: 1px; }
  .stat-val { font-size: 11px; color: var(--text); }
  .build-queue-banner { position:relative; overflow:hidden; background: linear-gradient(135deg, rgba(255,214,10,0.08), rgba(255,255,255,0.03)); border: 1px solid rgba(255,214,10,0.24);
    border-radius: 18px; padding: 14px 18px; margin-bottom: 20px;
    display: flex; align-items: center; justify-content: space-between; }
  .build-queue-banner::before { content:""; position:absolute; inset:0; background: linear-gradient(135deg, rgba(255,255,255,0.04), transparent 44%); pointer-events:none; }
  .build-queue-label { font-size: 10px; color: var(--warn); letter-spacing: 2px; text-transform: uppercase; }
  .build-queue-item-name { font-size: 13px; color: var(--text); margin-top: 2px; }
  .build-queue-right { text-align: right; }
  .build-queue-eta { font-family: 'Orbitron', sans-serif; font-size: 16px; font-weight: 700; color: var(--warn); }
  .modal-backdrop { position: fixed; inset: 0; background: rgba(4,4,13,0.85); z-index: 100;
    display: flex; align-items: flex-end; justify-content: center; backdrop-filter: blur(4px); }
  @media (min-width: 600px) { .modal-backdrop { align-items: center; } }
  .modal { background: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(8,10,22,0.97)); border: 1px solid rgba(255,255,255,0.08);
    border-radius: 18px 18px 0 0; padding: 24px 20px;
    width: 100%; max-height: 92dvh; overflow-y: auto;
    scrollbar-width: thin; scrollbar-color: var(--border) transparent;
    animation: slideUp 0.25s ease; box-shadow: var(--shell-shadow); }
  @media (min-width: 600px) { .modal { border-radius: 20px; width: 560px; max-height: 85vh; padding: 28px; animation: fadeIn 0.2s ease; } }
  .modal::before { content: ''; display: block; width: 36px; height: 3px;
    background: var(--border); border-radius: 2px; margin: 0 auto 20px; }
  @media (min-width: 600px) { .modal::before { display: none; } }
  .modal-title { font-family: 'Orbitron', sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 3px;
    color: var(--cyan); margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid var(--border); }
  .modal-section { margin-bottom: 18px; }
  .modal-label { font-size: 9px; letter-spacing: 2px; color: var(--dim); text-transform: uppercase; margin-bottom: 10px; }
  .modal-ship-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 12px; }
  @media (min-width: 500px) { .modal-ship-grid { grid-template-columns: repeat(3, 1fr); } }
  .modal-ship-row { display: flex; flex-direction: column; gap: 10px;
    background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 12px; padding: 8px 10px; }
  .modal-ship-label { font-size: 10px; color: var(--text); display: flex; align-items: center; gap: 5px; }
  .modal-ship-avail { font-size: 9px; color: var(--dim); }
  .modal-ship-top { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
  .modal-ship-copy { display:grid; gap:4px; }
  .modal-ship-art { height: 88px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.08); background-size: cover; background-position: center; background-color: rgba(9,12,24,0.92); overflow:hidden; }
  .modal-input { width: 64px; padding: 6px 8px; font-size: 12px; border-radius: 10px; text-align: right;
    background: rgba(0,0,0,0.4); border: 1px solid var(--border); color: var(--text); }
  .modal-select { padding: 8px 10px; font-size: 12px; border-radius: 2px; width: 100%;
    background: rgba(0,0,0,0.4); border: 1px solid var(--border); color: var(--text); }
  .modal-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .modal-footer { display: flex; gap: 10px; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border); }
  .modal-btn { font-family: 'Share Tech Mono', monospace; font-size: 11px; letter-spacing: 1px;
    padding: 12px 18px; border-radius: 12px; cursor: pointer; transition: all 0.15s; text-transform: uppercase; flex: 1; }
  .modal-btn.primary { border: 1px solid var(--cyan); background: rgba(0,245,212,0.1); color: var(--cyan); }
  .modal-btn.primary:hover:not(:disabled) { background: var(--cyan); color: var(--void); box-shadow: var(--glow-c); }
  .modal-btn.secondary { border: 1px solid var(--border); background: transparent; color: var(--dim); }
  .modal-btn.secondary:hover { color: var(--text); border-color: var(--dim); }
  .modal-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .modal-info-row { font-size: 10px; color: var(--dim); display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(26,26,58,0.3); }
  .modal-info-row:last-child { border-bottom: none; }
  .modal-info-val { color: var(--text); }
  .loading-overlay { position: fixed; inset: 0; pointer-events: none; background: rgba(4,4,13,0.92);
    z-index: 9999; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 24px; backdrop-filter: blur(8px); }
  .loading-spinner { width: 56px; height: 56px; border: 5px solid var(--border);
    border-top-color: var(--purple); border-radius: 50%; animation: spin 0.9s linear infinite; }
  .loading-text { font-family: 'Orbitron', sans-serif; font-size: 15px; letter-spacing: 3px;
    color: var(--cyan); text-transform: uppercase; text-align: center; animation: pulse 2s ease-in-out infinite; }
  .spinner { width:40px; height:40px; border:2px solid var(--border); border-top-color:var(--purple); border-radius:50%; animation:spin 0.8s linear infinite; }
  .landing { height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 32px; position: relative; z-index: 1; padding: 24px; }
  .landing-logo { animation: float 4s ease-in-out infinite; }
  .landing-title { font-family: 'Orbitron', sans-serif; font-size: clamp(24px, 8vw, 42px); font-weight: 900; letter-spacing: 6px;
    text-align: center; background: linear-gradient(135deg,var(--purple) 0%,var(--cyan) 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .landing-sub { font-size: 12px; letter-spacing: 3px; color: var(--dim); text-transform: uppercase; text-align: center; }
  .no-planet { max-width: 480px; margin: 40px auto; padding: 0 20px; text-align: center; }
  .no-planet-title { font-family:'Orbitron',sans-serif; font-size:16px; color:var(--purple); letter-spacing:3px; margin:24px 0 10px; }
  .no-planet-sub { color:var(--dim); font-size:11px; letter-spacing:1px; line-height:1.8; margin-bottom:32px; }
  .planet-name-input { background:var(--panel); border:1px solid var(--border); border-radius:3px;
    padding:12px 14px; color:var(--text); font-family:'Share Tech Mono',monospace; font-size:13px;
    letter-spacing:1px; outline:none; width:100%; text-align:center; margin-bottom:12px; }
  .create-btn { font-family:'Orbitron',sans-serif; font-size:12px; font-weight:700; letter-spacing:2px;
    padding:14px 24px; border:2px solid var(--cyan); border-radius:3px;
    background:linear-gradient(135deg,rgba(0,245,212,0.1),rgba(155,93,229,0.05));
    color:var(--cyan); cursor:pointer; transition:all 0.2s; width:100%; text-transform:uppercase; }
  .create-btn:hover:not(:disabled) { background:linear-gradient(135deg,var(--cyan),var(--purple)); color:var(--void); box-shadow:var(--glow-c); }
  .create-btn:disabled { color:var(--dim); cursor:not-allowed; }
  .error-msg { color:var(--danger); font-size:11px; letter-spacing:1px; margin-top:8px; }
  .tag { font-size:9px; letter-spacing:1.5px; padding:2px 6px; border-radius:2px; text-transform:uppercase;
    background:rgba(155,93,229,0.1); border:1px solid rgba(155,93,229,0.3); color:var(--purple); }
  .notice-box { background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(8,10,22,0.95)); border: 1px solid rgba(155,93,229,0.2);
    border-radius: 18px; padding: 14px 16px; font-size: 10px; color: var(--dim); letter-spacing: 1px; margin-bottom: 16px; box-shadow: var(--shell-shadow); }
  .wallet-adapter-button { font-family:'Share Tech Mono',monospace !important; font-size:11px !important; letter-spacing:1px !important; border-radius:14px !important; margin-right: 0 !important; min-height: 34px !important; height: 34px !important; padding: 0 12px !important; }
  @media (max-width: 767px) {
    .grid-2 { grid-template-columns: 1fr; }
    .grid-3 { grid-template-columns: 1fr 1fr; gap: 10px; }
    .grid-4 { grid-template-columns: 1fr 1fr; gap: 8px; }
    .hero-grid, .overview-panel-grid, .overview-card-grid, .command-empty-grid { grid-template-columns: 1fr; }
    .overview-hero { padding:18px; border-radius:20px; min-height:unset; }
    .command-section-head { padding:16px; border-radius:16px; }
    .hero-title { max-width:none; }
    .sidebar-planet-card, .res-panel.shell-panel, .nav.shell-panel { margin-left:12px; margin-right:12px; }
    .card-value { font-size: 16px; }
    .section-title { font-size: 10px; letter-spacing: 2px; margin-bottom: 14px; }
    .build-queue-banner { flex-direction: column; gap: 10px; align-items: flex-start; }
    .build-queue-right { width: 100%; display: flex; align-items: center; justify-content: space-between; }
    .mission-header { flex-wrap: wrap; gap: 6px; }
  }
  @media (max-width: 1180px) {
    .desktop-resource-menu { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 400px) { .grid-3 { grid-template-columns: 1fr; } }
  .req-modal { background: var(--panel); border: 1px solid rgba(255,0,110,0.3);
    border-radius: 10px 10px 0 0; padding: 24px 20px;
    width: 100%; max-height: 92dvh; overflow-y: auto;
    box-shadow: 0 0 40px rgba(255,0,110,0.12); animation: slideUp 0.25s ease; }
  @media (min-width: 600px) { .req-modal { border-radius: 6px; width: 480px; max-height: 85vh; padding: 28px; animation: fadeIn 0.2s ease; } }
  .req-modal::before { content: ''; display: block; width: 36px; height: 3px;
    background: rgba(255,0,110,0.3); border-radius: 2px; margin: 0 auto 20px; }
  @media (min-width: 600px) { .req-modal::before { display: none; } }
  .req-modal-title { font-family: 'Orbitron', sans-serif; font-size: 13px; font-weight: 700;
    letter-spacing: 3px; color: var(--danger); margin-bottom: 6px; }
  .req-modal-ship { display: flex; align-items: center; gap: 10px; margin-bottom: 20px;
    padding-bottom: 16px; border-bottom: 1px solid var(--border); }
  .req-modal-ship-icon { font-size: 28px; }
  .req-modal-ship-name { font-family: 'Orbitron', sans-serif; font-size: 14px; font-weight: 700; color: var(--text); letter-spacing: 1px; }
  .req-modal-ship-sub { font-size: 10px; color: var(--dim); letter-spacing: 1px; margin-top: 3px; }
  .req-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
  .req-row { display: flex; align-items: center; justify-content: space-between;
    padding: 12px 14px; border-radius: 3px; border: 1px solid; }
  .req-row.met { border-color: rgba(6,214,160,0.25); background: rgba(6,214,160,0.04); }
  .req-row.unmet { border-color: rgba(255,0,110,0.3); background: rgba(255,0,110,0.05); }
  .req-row-left { display: flex; align-items: center; gap: 8px; }
  .req-indicator { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .req-indicator.met { background: var(--success); box-shadow: 0 0 6px rgba(6,214,160,0.6); }
  .req-indicator.unmet { background: var(--danger); box-shadow: 0 0 6px rgba(255,0,110,0.6); }
  .req-name { font-size: 11px; color: var(--text); letter-spacing: 0.5px; }
  .req-progress { display: flex; align-items: center; gap: 8px; }
  .req-levels { font-family: 'Orbitron', sans-serif; font-size: 11px; font-weight: 700; }
  .req-levels.met { color: var(--success); }
  .req-levels.unmet { color: var(--danger); }
  .req-needed { font-size: 9px; color: var(--dim); letter-spacing: 1px; }
  .req-hint { background: rgba(155,93,229,0.05); border: 1px solid rgba(155,93,229,0.2);
    border-radius: 3px; padding: 10px 14px; font-size: 10px; color: var(--dim);
    letter-spacing: 0.5px; line-height: 1.7; }
  .fields-bar { margin-top: 10px; height: 3px; background: var(--border); border-radius: 2px; overflow: hidden; }
  .fields-fill { height: 100%; background: linear-gradient(90deg, var(--purple), var(--cyan)); transition: width 0.5s; }
  .fields-label { margin-top: 4px; font-size: 10px; color: var(--dim); display: flex; justify-content: space-between; }
  .coord-status-badge { font-size: 10px; letter-spacing: 1px; margin-top: 6px; height: 16px; }
`;

type PlanetBiome = "lava" | "temperate" | "arid" | "ice" | "oceanic" | "toxic" | "storm" | "generic";
type RGBA = [number, number, number, number];
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rgba = (r: number, g: number, b: number, a = 255): RGBA => [r, g, b, a];
function mixColor(a: RGBA, b: RGBA, t: number): RGBA { return [Math.round(lerp(a[0],b[0],t)),Math.round(lerp(a[1],b[1],t)),Math.round(lerp(a[2],b[2],t)),Math.round(lerp(a[3],b[3],t))]; }
function mulColor(a: RGBA, f: number): RGBA { return [clamp(Math.round(a[0]*f),0,255),clamp(Math.round(a[1]*f),0,255),clamp(Math.round(a[2]*f),0,255),a[3]]; }
function addColor(a: RGBA, amt: number): RGBA { return [clamp(a[0]+amt,0,255),clamp(a[1]+amt,0,255),clamp(a[2]+amt,0,255),a[3]]; }
function hashCoords(galaxy: number, system: number, position: number): number { let h=2166136261>>>0; const str=`${galaxy}:${system}:${position}`; for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);} return h>>>0; }
function mulberry32(seed: number) { return function(){ let t=(seed+=0x6d2b79f5); t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return((t^(t>>>14))>>>0)/4294967296; }; }
function valueNoise2D(x: number, y: number, seed: number): number { let n=Math.imul((x|0)^0x27d4eb2d,374761393)^Math.imul((y|0)^0x165667b1,668265263)^seed; n=(n^(n>>>13))>>>0; n=Math.imul(n,1274126177)>>>0; return(n&0xffff)/0xffff; }
function smoothNoise2D(x: number, y: number, seed: number): number { const x0=Math.floor(x),y0=Math.floor(y),xf=x-x0,yf=y-y0; const v00=valueNoise2D(x0,y0,seed),v10=valueNoise2D(x0+1,y0,seed),v01=valueNoise2D(x0,y0+1,seed),v11=valueNoise2D(x0+1,y0+1,seed); const sx=xf*xf*(3-2*xf),sy=yf*yf*(3-2*yf); return lerp(lerp(v00,v10,sx),lerp(v01,v11,sx),sy); }
function fbm2D(x: number, y: number, seed: number, octaves=5): number { let value=0,amp=0.5,freq=1,norm=0; for(let i=0;i<octaves;i++){value+=smoothNoise2D(x*freq,y*freq,seed+i*9973)*amp;norm+=amp;amp*=0.5;freq*=2;} return value/norm; }
type PixelPlanetVisual = { seed:number; biome:PlanetBiome; basePalette:RGBA[]; atmosphere:RGBA; glow:RGBA; cloudPalette:RGBA[]; ringColor:RGBA; stormColor:RGBA; hasRings:boolean; hasStorm:boolean; craterDensity:number; cloudDensity:number; mountainDensity:number; waterLevel:number; banding:number; polarCaps:boolean; rotationSpeed:number; cloudDriftSpeed:number; };
function paletteFromVisualFamily(biome: PlanetBiome): { basePalette: RGBA[]; atmosphere: RGBA; glow: RGBA; cloudPalette: RGBA[]; ringColor: RGBA; stormColor: RGBA } {
  switch (biome) {
    case "lava":
      return { basePalette:[rgba(26,8,10),rgba(72,18,16),rgba(138,34,18),rgba(212,79,18),rgba(255,173,67)], atmosphere:rgba(255,104,36,90), glow:rgba(255,98,28,180), cloudPalette:[rgba(255,190,110,32), rgba(255,120,40,44)], ringColor:rgba(255,158,87,110), stormColor:rgba(255,214,120,180) };
    case "temperate":
      return { basePalette:[rgba(12,34,56),rgba(28,86,136),rgba(32,126,98),rgba(88,165,101),rgba(186,205,144)], atmosphere:rgba(90,185,255,80), glow:rgba(72,198,255,150), cloudPalette:[rgba(248,252,255,95), rgba(192,234,255,70)], ringColor:rgba(160,232,255,105), stormColor:rgba(244,249,255,180) };
    case "arid":
      return { basePalette:[rgba(59,33,20),rgba(111,67,38),rgba(164,103,63),rgba(212,164,109),rgba(241,219,174)], atmosphere:rgba(255,194,108,64), glow:rgba(255,191,110,135), cloudPalette:[rgba(245,224,180,42), rgba(255,214,163,58)], ringColor:rgba(230,196,138,105), stormColor:rgba(255,230,191,175) };
    case "ice":
      return { basePalette:[rgba(21,41,68),rgba(47,86,128),rgba(112,165,197),rgba(195,229,243),rgba(244,250,255)], atmosphere:rgba(160,220,255,88), glow:rgba(180,230,255,145), cloudPalette:[rgba(252,252,255,74), rgba(202,232,255,64)], ringColor:rgba(205,236,255,120), stormColor:rgba(242,247,255,185) };
    case "oceanic":
      return { basePalette:[rgba(5,28,55),rgba(12,74,122),rgba(24,122,168),rgba(42,163,172),rgba(158,232,218)], atmosphere:rgba(88,205,255,86), glow:rgba(66,196,255,150), cloudPalette:[rgba(240,249,255,82), rgba(183,233,255,66)], ringColor:rgba(150,220,255,110), stormColor:rgba(228,247,255,188) };
    case "toxic":
      return { basePalette:[rgba(23,31,8),rgba(58,87,18),rgba(95,125,27),rgba(157,171,44),rgba(215,212,102)], atmosphere:rgba(164,235,72,72), glow:rgba(146,222,61,142), cloudPalette:[rgba(214,246,139,48), rgba(170,212,82,62)], ringColor:rgba(185,230,102,102), stormColor:rgba(230,255,170,176) };
    case "storm":
      return { basePalette:[rgba(18,22,54),rgba(42,56,113),rgba(81,103,186),rgba(126,149,221),rgba(211,225,255)], atmosphere:rgba(130,156,255,84), glow:rgba(121,144,255,148), cloudPalette:[rgba(238,242,255,88), rgba(186,195,255,72)], ringColor:rgba(169,180,255,110), stormColor:rgba(244,248,255,195) };
    case "generic":
    default:
      return { basePalette:[rgba(19,36,57),rgba(39,83,121),rgba(48,130,126),rgba(103,176,144),rgba(204,222,186)], atmosphere:rgba(116,211,232,78), glow:rgba(96,198,232,140), cloudPalette:[rgba(244,249,255,82), rgba(202,232,240,62)], ringColor:rgba(175,227,231,104), stormColor:rgba(247,252,255,180) };
  }
}
function chooseVisual(planet: Planet): PixelPlanetVisual {
  const identity = getPlanetIdentity(planet);
  const seed = hashCoords(planet.galaxy||1, planet.system||1, clamp(planet.position||1,1,15)) ^ parseInt(identity.variantCode, 36);
  const rand = mulberry32(seed);
  const biomeMap: Record<string, PlanetBiome> = { "hero-lava":"lava","hero-temperate":"temperate","hero-arid":"arid","hero-ice":"ice","hero-oceanic":"oceanic","hero-toxic":"toxic","hero-storm":"storm","hero-generic":"generic" };
  const biome = biomeMap[identity.visualFamily] ?? "generic";
  const palette = paletteFromVisualFamily(biome);
  const anomalyFactor = (identity.anomaly.length % 5) / 5;
  const weatherFactor = (identity.weather.length % 7) / 7;
  const roleFactor = (identity.strategicRole.length % 6) / 6;
  const rotationSpeed = 0.000012 + rand()*0.000026 + weatherFactor*0.000008;
  const cloudDriftSpeed = 0.000018 + rand()*0.00002 + anomalyFactor*0.000006;
  const hasRings = false;
  const hasStorm = /storm|thunder|cyclone|squall|pressure/i.test(identity.weather) || biome === "storm" || rand() > 0.7;
  return {
    seed, biome, ...palette, hasRings, hasStorm,
    craterDensity: biome === "temperate" || biome === "oceanic" ? 0.012 + rand()*0.03 : 0.03 + rand()*0.08,
    cloudDensity: biome === "storm" ? 0.18 + rand()*0.12 : biome === "oceanic" || biome === "temperate" ? 0.10 + rand()*0.12 : biome === "ice" ? 0.08 + rand()*0.10 : 0.03 + rand()*0.06,
    mountainDensity: 0.08 + rand()*0.14 + roleFactor*0.04,
    waterLevel: biome === "oceanic" ? 0.56 + rand()*0.18 : biome === "temperate" ? 0.30 + rand()*0.20 : biome === "ice" ? 0.08 + rand()*0.12 : biome === "arid" ? (rand()>0.85 ? 0.05 + rand()*0.06 : 0) : 0,
    banding: biome === "storm" ? 0.16 + rand()*0.12 : biome === "lava" ? 0.12 + rand()*0.10 : 0.03 + rand()*0.08,
    polarCaps: biome === "ice" || (biome === "temperate" && rand() > 0.5),
    rotationSpeed, cloudDriftSpeed,
  };
}
function renderPixelPlanetToCanvas(canvas: HTMLCanvasElement, planet: Planet, opts?: { size?: number; rotationOffset?: number; cloudOffset?: number }) {
  const size=opts?.size??92; const visual=chooseVisual(planet); const rotationOffset=opts?.rotationOffset??0; const cloudOffset=opts?.cloudOffset??0;
  canvas.width=size; canvas.height=size; canvas.style.width=`${size}px`; canvas.style.height=`${size}px`;
  const ctx=canvas.getContext("2d",{alpha:true}); if(!ctx)return; ctx.clearRect(0,0,size,size); ctx.imageSmoothingEnabled=false;
  const cx=size/2,cy=size/2,radius=Math.floor(size*0.355); const rand=mulberry32(visual.seed); const lightX=-0.62,lightY=-0.42;
  const tilt=(rand()*2-1)*0.35; const stormCx=(rand()*1.2-0.6)*0.45; const stormCy=(rand()*1.2-0.6)*0.45; const stormR=0.10+rand()*0.09;
  const img=ctx.createImageData(size,size); const data=img.data;
  function paletteSample(palette: RGBA[], t: number): RGBA { const n=palette.length-1; if(t<=0)return palette[0]; if(t>=1)return palette[n]; const scaled=t*n; const i=Math.floor(scaled); const f=scaled-i; return mixColor(palette[i],palette[Math.min(i+1,n)],f); }
  for(let py=0;py<size;py++){for(let px=0;px<size;px++){const dx=(px-cx)/radius,dy=(py-cy)/radius; const rr=dx*dx+dy*dy; if(rr>1)continue; const z=Math.sqrt(1-rr); const nx=dx,ny=dy*Math.cos(tilt)-z*Math.sin(tilt),nz=dy*Math.sin(tilt)+z*Math.cos(tilt); const shade=clamp(nx*lightX+ny*lightY+nz*0.88,-1,1); const lambert=0.28+Math.max(0,shade)*0.85; const u=(0.5+Math.atan2(nx,nz)/(Math.PI*2)+rotationOffset)%1; const v=0.5-Math.asin(ny)/Math.PI; const continents=fbm2D(u*5.5+11.7,v*5.5+3.2,visual.seed+101,6); const details=fbm2D(u*16.0+0.8,v*16.0+7.3,visual.seed+202,5); const ridges=fbm2D(u*22.0+8.4,v*22.0+9.1,visual.seed+303,4); const micro=fbm2D(u*42.0+2.1,v*42.0+1.6,visual.seed+404,3); const lat=Math.abs(v-0.5)*2; const band=(Math.sin((v+u*0.2)*Math.PI*(4+visual.banding*18)+visual.seed*0.001)+1)*0.5; let height=continents*0.56+details*0.24+ridges*0.14+micro*0.06+band*visual.banding*0.22;
    if(visual.biome==="temperate"||visual.biome==="ice"||visual.biome==="oceanic")height-=visual.waterLevel*0.42; else if(visual.biome==="arid")height-=visual.waterLevel*0.20; else height+=0.06;
    let color=paletteSample(visual.basePalette,clamp(height,0,1));
    if(visual.biome==="temperate"||visual.biome==="oceanic"){ if(height<0.08) color=mixColor(rgba(7,35,76,255), rgba(42,118,188,255), clamp((height+0.12)/0.20,0,1)); else { if(height>0.42) color=mixColor(color,rgba(184,188,154,255),0.25); if(height>0.62) color=mixColor(color,rgba(232,234,228,255),0.35);} }
    if(visual.biome==="lava"){ const magma=fbm2D(u*19+1.3,v*19+2.6,visual.seed+606,5); const crack=fbm2D(u*40+3.7,v*40+5.5,visual.seed+707,3); if(magma>0.66||crack>0.73)color=mixColor(color,rgba(255,129,32,255),0.62); if(magma>0.80)color=mixColor(color,rgba(255,210,92,255),0.74); }
    if(visual.biome==="toxic"){ const acid=fbm2D(u*17+4.1,v*17+3.7,visual.seed+909,5); if(acid>0.68) color=mixColor(color, rgba(193,255,106,255), 0.42); }
    if(visual.biome==="storm"){ const charge=fbm2D(u*28+1.7,v*28+8.3,visual.seed+515,4); if(charge>0.7) color=mixColor(color, rgba(215,223,255,255), 0.38); }
    if(visual.polarCaps&&lat>0.72)color=mixColor(color,rgba(245,248,255,255),clamp((lat-0.72)/0.22,0,1)*0.85);
    const craterNoise=fbm2D(u*31+9.1,v*31+1.4,visual.seed+808,4); if(craterNoise>1-visual.craterDensity)color=mulColor(color,0.72);
    if(visual.hasStorm){ const sx=u-(0.5+stormCx),sy=v-(0.5+stormCy),sdist=Math.sqrt(sx*sx+sy*sy); if(sdist<stormR){ const spiral=Math.sin(Math.atan2(sy,sx)*6+sdist*64-visual.seed*0.002); const stormAmt=clamp((stormR-sdist)/stormR,0,1)*(0.28+(spiral+1)*0.24); color=mixColor(color,visual.stormColor,stormAmt); } }
    const cloudNoise=fbm2D((u+cloudOffset)*14+5.3,v*14+7.9,visual.seed+1111,5); if(cloudNoise>1-visual.cloudDensity)color=mixColor(color,visual.cloudPalette[0],clamp((cloudNoise-(1-visual.cloudDensity))/visual.cloudDensity,0,1)*0.70);
    const rim=Math.pow(1-z,1.6); color=mixColor(color,visual.atmosphere,rim*0.65); color=mulColor(color,lambert); const spec=Math.pow(Math.max(0,shade),18); color=addColor(color,Math.round(spec*(visual.biome==="lava"||visual.biome==="toxic"?24:52)));
    const idx=(py*size+px)*4; data[idx]=color[0];data[idx+1]=color[1];data[idx+2]=color[2];data[idx+3]=255;
  }}
  const ringRotation = -0.28;
  const ringCx = cx;
  const ringCy = cy + radius * 0.2;
  const ringRxOuter = radius * 1.48;
  const ringRyOuter = radius * 0.38;
  const ringRxInner = radius * 1.2;
  const ringRyInner = radius * 0.24;
  const drawRingBand = (startAngle: number, endAngle: number, alphaScale: number) => {
    ctx.save();
    ctx.translate(ringCx, ringCy);
    ctx.rotate(ringRotation);
    const ringGradient = ctx.createLinearGradient(-ringRxOuter, 0, ringRxOuter, 0);
    ringGradient.addColorStop(0, `rgba(${visual.ringColor[0]},${visual.ringColor[1]},${visual.ringColor[2]},${0.16 * alphaScale})`);
    ringGradient.addColorStop(0.2, `rgba(${visual.ringColor[0]},${visual.ringColor[1]},${visual.ringColor[2]},${0.54 * alphaScale})`);
    ringGradient.addColorStop(0.5, `rgba(255,255,255,${0.3 * alphaScale})`);
    ringGradient.addColorStop(0.8, `rgba(${visual.ringColor[0]},${visual.ringColor[1]},${visual.ringColor[2]},${0.5 * alphaScale})`);
    ringGradient.addColorStop(1, `rgba(${visual.ringColor[0]},${visual.ringColor[1]},${visual.ringColor[2]},${0.12 * alphaScale})`);
    ctx.fillStyle = ringGradient;
    ctx.beginPath();
    ctx.ellipse(0, 0, ringRxOuter, ringRyOuter, 0, startAngle, endAngle);
    ctx.ellipse(0, 0, ringRxInner, ringRyInner, 0, endAngle, startAngle, true);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.22 * alphaScale})`;
    ctx.lineWidth = Math.max(1, size * 0.006);
    ctx.beginPath();
    ctx.ellipse(0, 0, ringRxOuter, ringRyOuter, 0, startAngle, endAngle);
    ctx.stroke();
    ctx.restore();
  };
  if (visual.hasRings) {
    drawRingBand(Math.PI * 1.06, Math.PI * 1.94, 0.48);
  }
  ctx.putImageData(img,0,0);
  if (visual.hasRings) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.995, 0, Math.PI * 2);
    ctx.clip();
    const occlusion = ctx.createLinearGradient(cx - radius, cy - radius * 0.08, cx + radius, cy + radius * 0.72);
    occlusion.addColorStop(0, "rgba(0,0,0,0)");
    occlusion.addColorStop(0.3, "rgba(0,0,0,0.05)");
    occlusion.addColorStop(0.5, "rgba(0,0,0,0.28)");
    occlusion.addColorStop(0.72, "rgba(0,0,0,0.1)");
    occlusion.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = occlusion;
    ctx.fillRect(cx - radius * 1.2, cy - radius * 0.05, radius * 2.4, radius * 1.35);
    ctx.restore();
  }
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  const glow = ctx.createRadialGradient(cx, cy, radius * 0.35, cx, cy, radius * 1.35);
  glow.addColorStop(0, `rgba(${visual.glow[0]},${visual.glow[1]},${visual.glow[2]},0.10)`);
  glow.addColorStop(1, `rgba(${visual.glow[0]},${visual.glow[1]},${visual.glow[2]},0)`);
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(cx, cy, radius * 1.35, 0, Math.PI * 2); ctx.fill();
  if (visual.hasRings) {
    ctx.save();
    ctx.shadowColor = `rgba(${visual.ringColor[0]},${visual.ringColor[1]},${visual.ringColor[2]},0.28)`;
    ctx.shadowBlur = size * 0.04;
    ctx.beginPath();
    ctx.rect(0, 0, size, size);
    ctx.arc(cx, cy, radius * 1.01, 0, Math.PI * 2, true);
    ctx.clip("evenodd");
    drawRingBand(0.2, Math.PI - 0.2, 0.92);
    ctx.restore();
  }
  ctx.restore();
}
const PixelPlanetCanvas: React.FC<{ planet: Planet; size?: number; rotationOffset?: number; cloudOffset?: number }> = ({ planet, size=92, rotationOffset=0, cloudOffset=0 }) => { const ref=React.useRef<HTMLCanvasElement|null>(null); React.useEffect(()=>{if(!ref.current)return; renderPixelPlanetToCanvas(ref.current,planet,{size,rotationOffset,cloudOffset});},[planet.galaxy,planet.system,planet.position,planet.temperature,planet.diameter,planet.maxFields,planet.name,size,rotationOffset,cloudOffset]); return <canvas ref={ref} width={size} height={size} style={{display:"block",imageRendering:"pixelated"}} />; };
const OrbitingPlanetVisual: React.FC<{ planet: Planet; size?: number }> = ({ planet, size=175 }) => { const [time,setTime]=React.useState(0); const visual=React.useMemo(()=>chooseVisual(planet),[planet.galaxy,planet.system,planet.position,planet.temperature,planet.diameter,planet.maxFields,planet.name]); React.useEffect(()=>{let raf=0; const started=performance.now(); const tick=(now: number)=>{setTime(now-started);raf=requestAnimationFrame(tick);}; raf=requestAnimationFrame(tick); return()=>cancelAnimationFrame(raf);},[]); return <PixelPlanetCanvas planet={planet} size={size} rotationOffset={(time*visual.rotationSpeed)%1} cloudOffset={(time*visual.cloudDriftSpeed)%1} />; };

const PlanetSceneCard: React.FC<{ planet: Planet; size?: number; compact?: boolean }> = ({ planet, size = 164, compact = false }) => {
  const theme = getPlanetTheme(planet);
  const style = {
    "--planet-accent": theme.accent,
  } as React.CSSProperties;

  return (
    <div className="hero-planet-card" style={style}>
      <div className="hero-planet-visual">
        <OrbitingPlanetVisual planet={planet} size={compact ? Math.max(84, size - 50) : Math.max(110, size - 30)} />
      </div>
    </div>
  );
};

// ─── Small shared components ──────────────────────────────────────────────────
const LogoSVG: React.FC<{ size?: number }> = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <defs><linearGradient id="lg1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#9b5de5"/><stop offset="100%" stopColor="#00f5d4"/></linearGradient></defs>
    <rect x="18" y="18" width="48" height="48" rx="8" transform="rotate(45 50 50)" stroke="url(#lg1)" strokeWidth="5" fill="none"/>
    <rect x="26" y="26" width="36" height="36" rx="6" transform="rotate(45 50 50)" stroke="url(#lg1)" strokeWidth="4" fill="none" opacity="0.85"/>
    <rect x="36" y="36" width="20" height="20" rx="4" transform="rotate(45 50 50)" stroke="url(#lg1)" strokeWidth="3.5" fill="none" opacity="0.7"/>
  </svg>
);

const LandingScreen: React.FC<{ isMobile: boolean }> = ({ isMobile }) => (
  <div className="landing">
    <div className="landing-logo"><LogoSVG size={isMobile ? 80 : 120}/></div>
    <div><div className="landing-title">GAMESOL</div><div className="landing-sub">On-chain space strategy Â· Solana</div></div>
    <WalletConnectControl/>
  </div>
);

const ConnectingScreenPanel: React.FC = () => (
  <div style={{height:"100dvh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:24}}>
    <LogoSVG size={72}/>
    <div className="spinner" style={{width:"56px",height:"56px",borderWidth:"5px"}}/>
    <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:"15px",letterSpacing:"3px",color:"var(--cyan)"}}>CONNECTING...</div>
  </div>
);

const Starfield: React.FC = () => {
  const stars = Array.from({ length: 80 }, (_, i) => ({
    id: i, x: Math.random()*100, y: Math.random()*100,
    size: Math.random()*1.8+0.3, dur: (Math.random()*3+2).toFixed(1),
    delay: (Math.random()*4).toFixed(1), minOp: (Math.random()*0.2+0.05).toFixed(2),
  }));
  return <div className="starfield">{stars.map(s=><div key={s.id} className="star" style={{left:`${s.x}%`,top:`${s.y}%`,width:s.size,height:s.size,"--dur":`${s.dur}s`,"--delay":`${s.delay}s`,"--min-op":s.minOp} as React.CSSProperties}/>)}</div>;
};

const LoadingOverlay: React.FC<{ visible: boolean; message?: string }> = ({ visible, message }) => {
  if (!visible) return null;
  return (
    <div className="loading-overlay">
      <div className="loading-spinner"/>
      <div className="loading-text">{message ?? "PROCESSING..."}</div>
      <div style={{fontSize:"10px",color:"var(--dim)",marginTop:8,letterSpacing:"1px"}}>Please do not refresh the page</div>
    </div>
  );
};

const ResRow: React.FC<{ color: string; label: string; value: bigint; cap: bigint; rate: bigint }> = ({ color, label, value, cap, rate }) => {
  const pct = cap > 0n ? Math.min(100, Number(value*100n/cap)) : 0;
  return (<>
    <div className="res-row">
      <div className="res-name"><div className="res-dot" style={{background:color}}/>{label}</div>
      <div><div className="res-val" style={{color}}>{fmt(value)}</div><div className="res-rate">+{fmt(rate)}/h</div></div>
    </div>
    <div className="cap-bar"><div className="cap-fill" style={{width:`${pct}%`,background:color}}/></div>
  </>);
};

function useInterpolatedResources(res: Resources | undefined, nowTs: number): Resources | undefined {
  return React.useMemo(()=>{
    if(!res) return undefined;
    if(res.lastUpdateTs<=0) return res;
    const dt=Math.max(0,nowTs-res.lastUpdateTs);
    if(dt===0) return res;
    const eff=res.energyConsumption===0n?1.0:Math.min(1.0,Number(res.energyProduction)/Number(res.energyConsumption));
    const produce=(current: bigint,ratePerHour: bigint,cap: bigint): bigint=>{
      const gained=(Number(ratePerHour)*dt*eff)/3600;
      return BigInt(Math.floor(Math.min(Number(current)+gained,Number(cap))));
    };
    return{...res,metal:produce(res.metal,res.metalHour,res.metalCap),crystal:produce(res.crystal,res.crystalHour,res.crystalCap),deuterium:produce(res.deuterium,res.deuteriumHour,res.deuteriumCap)};
  },[res,nowTs]);
}

// ─── Modals ───────────────────────────────────────────────────────────────────
const VaultRecoveryModal: React.FC<{ request: VaultRecoveryPromptRequest|null; busy?: boolean; error?: string|null; onCancel: ()=>void; onSubmit: (p:string)=>void }> =
  ({ request, busy=false, error=null, onCancel, onSubmit }) => {
    const [password,setPassword]=useState(""); const [confirmPassword,setConfirmPassword]=useState("");
    useEffect(()=>{setPassword("");setConfirmPassword("");},[request?.mode,request?.wallet]);
    if(!request) return null;
    const isCreate=request.mode==="create";
    const canSubmit=isCreate?password.trim().length>=8&&password===confirmPassword:password.trim().length>0;
    return (
      <div className="modal-backdrop" style={{zIndex:12000}} onClick={e=>{if(e.target===e.currentTarget&&!busy)onCancel();}}>
        <div className="modal" style={{borderColor:"rgba(255,214,10,0.3)"}}>
          <div className="modal-title" style={{color:"var(--warn)"}}>{isCreate?"SECURE VAULT RECOVERY":"RESTORE VAULT ACCESS"}</div>
          <div className="modal-section">
            <div style={{fontSize:"11px",color:"var(--text)",lineHeight:1.7,marginBottom:14}}>{isCreate?"Create a recovery password to protect your vault keypair.":"Enter your recovery password to restore vault access on this device."}</div>
            <div style={{padding:"12px 14px",border:"1px solid rgba(255,214,10,0.35)",background:"rgba(255,214,10,0.08)",borderRadius:4,fontSize:"10px",lineHeight:1.6,color:"var(--text)"}}>This password protects your encrypted vault keypair stored on-chain.</div>
          </div>
          <div className="modal-section">
            <div className="modal-label">Recovery Password</div>
            <input className="modal-select" type="password" autoFocus value={password} onChange={e=>setPassword(e.target.value)} placeholder={isCreate?"Choose a strong recovery password":"Enter your recovery password"} disabled={busy}/>
          </div>
          {isCreate&&<div className="modal-section">
            <div className="modal-label">Confirm Password</div>
            <input className="modal-select" type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="Repeat the recovery password" disabled={busy}/>
            <div style={{fontSize:"10px",color:"var(--dim)",marginTop:8}}>Use at least 8 characters.</div>
          </div>}
          {error&&<div style={{color:"var(--danger)",fontSize:"10px",marginBottom:8}}>{error}</div>}
          <div className="modal-footer">
            <button className="modal-btn secondary" onClick={onCancel} disabled={busy}>CANCEL</button>
            <button className="modal-btn primary" disabled={!canSubmit||busy} onClick={()=>onSubmit(password.trim())}>{isCreate?"SAVE PASSWORD":"RESTORE VAULT"}</button>
          </div>
        </div>
      </div>
    );
  };

const ConfirmationModal: React.FC<{ isOpen:boolean; onClose:()=>void; onConfirm:()=>void; title:string; lines:string[]; confirmLabel:string; tone?:"primary"|"danger"; disabled?:boolean }> =
  ({ isOpen, onClose, onConfirm, title, lines, confirmLabel, tone="primary", disabled=false }) => {
    if(!isOpen) return null;
    return (
      <div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
        <div className="modal" style={{maxWidth:"520px"}}>
          <div className="modal-title">{title}</div>
          <div className="modal-section">{lines.map((line,i)=><div key={i} style={{fontSize:"11px",color:line.startsWith("-")?"var(--text)":"var(--dim)",lineHeight:1.6,marginBottom:10}}>{line}</div>)}</div>
          <div className="modal-footer">
            <button className="modal-btn secondary" onClick={onClose} disabled={disabled}>CANCEL</button>
            <button className={`modal-btn ${tone}`} onClick={onConfirm} disabled={disabled}>{confirmLabel}</button>
          </div>
        </div>
      </div>
    );
  };

const ShipRequirementsModal: React.FC<{ check: ShipRequirementsCheck|null; onClose:()=>void; onGoBuildings?:()=>void; onGoResearch?:()=>void }> = ({ check, onClose, onGoBuildings, onGoResearch }) => {
  if(!check) return null;
  const needsResearch = check.requirements.some(req => !req.met && req.label !== "Shipyard");
  const needsBuildings = check.requirements.some(req => !req.met && req.label === "Shipyard");
  return (
    <div className="modal-backdrop" style={{zIndex:200}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="req-modal">
        <div style={{marginBottom:20,paddingBottom:16,borderBottom:"1px solid var(--border)"}}>
          <div className="req-modal-title">⚠ REQUIREMENTS NOT MET</div>
          <div style={{fontSize:10,color:"var(--dim)",letterSpacing:1,marginTop:4}}>Research prerequisites are missing</div>
        </div>
        <div className="req-modal-ship">
          <span className="req-modal-ship-icon">{check.shipIcon}</span>
          <div><div className="req-modal-ship-name">{check.shipName}</div><div className="req-modal-ship-sub">Cannot be constructed until requirements are met</div></div>
        </div>
        <div className="req-list">
          {check.requirements.map((req,i)=>(
            <div key={i} className={`req-row ${req.met?"met":"unmet"}`}>
              <div className="req-row-left"><div className={`req-indicator ${req.met?"met":"unmet"}`}/><span className="req-name">{req.label}</span></div>
              <div className="req-progress">
                <span className={`req-levels ${req.met?"met":"unmet"}`}>Lv {req.current} / {req.required}</span>
                {!req.met&&<span className="req-needed">need {req.required-req.current} more</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="req-hint">{check.requirements.some(r=>!r.met&&r.label!=="Shipyard")?"Visit the Research Lab tab to unlock the required technologies.":"Build a Shipyard in the Buildings tab first."}</div>
        <div className="modal-footer" style={{marginTop:20}}>
          {needsBuildings && onGoBuildings && <button className="modal-btn primary" onClick={() => { onGoBuildings(); onClose(); }}>GO TO BUILDINGS</button>}
          {needsResearch && onGoResearch && <button className="modal-btn primary" onClick={() => { onGoResearch(); onClose(); }}>GO TO RESEARCH</button>}
          <button className="modal-btn secondary" onClick={onClose} style={{borderColor:"rgba(255,0,110,0.3)",color:"var(--danger)"}}>CLOSE</button>
        </div>
      </div>
    </div>
  );
};

const RequirementsModal: React.FC<{ check: RequirementCheck | null; onClose: () => void; onGoBuildings?: () => void; onGoResearch?: () => void }> = ({ check, onClose, onGoBuildings, onGoResearch }) => {
  if (!check) return null;
  const needsBuildings = check.requirements.some(requirement => !requirement.met && requirement.type === "building");
  const needsResearch = check.requirements.some(requirement => !requirement.met && requirement.type === "research");
  return (
    <div className="modal-backdrop" style={{ zIndex: 200 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="req-modal">
        <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
          <div className="req-modal-title">⚠ {check.categoryLabel}</div>
          <div style={{ fontSize: 10, color: "var(--dim)", letterSpacing: 1, marginTop: 4 }}>{check.subtitle}</div>
        </div>
        <div className="req-modal-ship">
          <span className="req-modal-ship-icon">{check.icon}</span>
          <div>
            <div className="req-modal-ship-name">{check.title}</div>
            <div className="req-modal-ship-sub">Complete these prerequisites before trying again</div>
          </div>
        </div>
        <div className="req-list">
          {check.requirements.map((requirement, index) => (
            <div key={`${requirement.type}-${requirement.label}-${index}`} className={`req-row ${requirement.met ? "met" : "unmet"}`}>
              <div className="req-row-left">
                <div className={`req-indicator ${requirement.met ? "met" : "unmet"}`} />
                <span className="req-name">{requirement.label}</span>
              </div>
              <div className="req-progress">
                <span className={`req-levels ${requirement.met ? "met" : "unmet"}`}>Lv {requirement.current} / {requirement.required}</span>
                {!requirement.met && <span className="req-needed">need {requirement.required - requirement.current} more</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="req-hint">{check.hint}</div>
        <div className="modal-footer" style={{ marginTop: 20 }}>
          {needsBuildings && onGoBuildings && <button className="modal-btn primary" onClick={() => { onGoBuildings(); onClose(); }}>GO TO BUILDINGS</button>}
          {needsResearch && onGoResearch && <button className="modal-btn primary" onClick={() => { onGoResearch(); onClose(); }}>GO TO RESEARCH</button>}
          <button className="modal-btn secondary" onClick={onClose} style={{ borderColor: "rgba(255,0,110,0.3)", color: "var(--danger)" }}>CLOSE</button>
        </div>
      </div>
    </div>
  );
};

const VaultManagerModal: React.FC<{
  open: boolean; onClose: () => void; vaultReady: boolean;
  vaultStatus: import("./game-state").VaultStatus; vaultAddress: string | null; vaultBalance: bigint;
  useVaultSigning: boolean; onToggleSigning: (v: boolean) => void;
  depositAmount: string; onDepositAmountChange: (v: string) => void; onDeposit: () => Promise<void>;
  withdrawAmount: string; onWithdrawAmountChange: (v: string) => void; onWithdraw: () => Promise<void>;
  onRetryPassword: () => Promise<void>; onForceRotate: () => Promise<void>;
  onTransferAllPlanets: (newAuthority: string) => Promise<void>; busy: boolean;
  onRefreshBalance: () => Promise<void>;
}> = ({ open, onClose, vaultReady, vaultStatus, vaultAddress, vaultBalance, useVaultSigning, onToggleSigning, depositAmount, onDepositAmountChange, onDeposit, withdrawAmount, onWithdrawAmountChange, onWithdraw, onRetryPassword, onForceRotate, onTransferAllPlanets, busy, onRefreshBalance }) => {
  const [transferDest, setTransferDest] = useState("");
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);

  // Load balance immediately when modal opens
  useEffect(() => {
    if (open) {
      void onRefreshBalance().catch(() => {});
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;
  const statusColor = vaultReady ? "var(--success)" : "var(--danger)";
  const recoveryHint: Record<string, { title: string; body: string }> = {
    wrong_password: { title: "⚠ Wrong Recovery Password", body: "The on-chain backup was found but could not be decrypted. Try a different password, or rotate to a new vault keypair (requires wallet signature)." },
    backup_missing: { title: "⚠ Backup Not Found", body: "No encrypted backup exists on-chain for this wallet. If you still have your vault keypair cached on another device, use that device first. Otherwise rotate to a new vault keypair (requires wallet signature)." },
  };
  const hint = !vaultReady ? recoveryHint[vaultStatus] : null;
  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal" style={{ maxWidth: "560px" }}>
        <div className="modal-title">VAULT MANAGER</div>
        <div className="modal-section">
          <div className="modal-label">Vault Status</div>
          <div className="modal-info-row"><span>Status</span><span className="modal-info-val" style={{ color: statusColor }}>{vaultReady ? "READY" : "NOT READY"}</span></div>
          <div className="modal-info-row"><span>Address</span><span className="modal-info-val">{vaultAddress ? `${vaultAddress.slice(0,4)}…${vaultAddress.slice(-4)}` : "—"}</span></div>
          <div className="modal-info-row">
            <span>Balance</span>
            <span className="modal-info-val" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {formatSolBalance(vaultBalance)} SOL
              <button
                onClick={() => void onRefreshBalance()}
                disabled={busy}
                style={{ fontSize: 9, padding: "2px 6px", border: "1px solid var(--border)", background: "transparent", color: "var(--dim)", cursor: "pointer", borderRadius: 2, letterSpacing: 1 }}
              >↻</button>
            </span>
          </div>
        </div>
        {hint && (
          <div className="modal-section">
            <div style={{ background:"rgba(255,0,110,0.06)", border:"1px solid rgba(255,0,110,0.25)", borderRadius:4, padding:"12px 14px", marginBottom:12 }}>
              <div style={{ fontSize:11, color:"var(--danger)", letterSpacing:1, marginBottom:6, fontWeight:700 }}>{hint.title}</div>
              <div style={{ fontSize:10, color:"var(--dim)", lineHeight:1.7 }}>{hint.body}</div>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              {vaultStatus === "wrong_password" && <button className="modal-btn primary" style={{ fontSize:10 }} disabled={busy} onClick={() => void onRetryPassword()}>RETRY PASSWORD</button>}
              <button className="modal-btn" style={{ fontSize:10, border:"1px solid var(--warn)", color:"var(--warn)", background:"rgba(255,214,10,0.06)" }} disabled={busy} onClick={() => void onForceRotate()}>ROTATE VAULT (WALLET SIGN)</button>
            </div>
          </div>
        )}
        {vaultReady && (
          <div className="modal-section">
            <div className="modal-label">Signing Mode</div>
            <div className="modal-row"><span style={{ fontSize:11, color:"var(--dim)" }}>Use vault for gameplay</span><input type="checkbox" checked={useVaultSigning} onChange={e => onToggleSigning(e.target.checked)} disabled={busy} /></div>
          </div>
        )}
        {vaultReady && (<>
          <div className="modal-section"><div className="modal-label">Deposit SOL</div><div className="modal-row"><span style={{ fontSize:11, color:"var(--dim)" }}>Amount (SOL)</span><input className="modal-input" type="number" min="0" step="0.001" value={depositAmount} onChange={e => onDepositAmountChange(e.target.value)} disabled={busy} /></div></div>
          <div className="modal-section"><div className="modal-label">Withdraw SOL</div><div className="modal-row"><span style={{ fontSize:11, color:"var(--dim)" }}>Amount (SOL)</span><input className="modal-input" type="number" min="0" step="0.001" value={withdrawAmount} onChange={e => onWithdrawAmountChange(e.target.value)} disabled={busy} /></div></div>
        </>)}
        <div className="modal-section">
          <div className="modal-label" style={{ color:"var(--danger)" }}>⚠ Emergency: Transfer All Planets</div>
          <div style={{ fontSize:10, color:"var(--dim)", lineHeight:1.7, marginBottom:10 }}>Transfer all planet ownership to a clean wallet immediately if compromised.</div>
          <div className="modal-row">
            <span style={{ fontSize:11, color:"var(--dim)", flexShrink:0, marginRight:8 }}>Destination</span>
            <input style={{ flex:1, padding:"6px 8px", fontSize:11, borderRadius:2, background:"rgba(0,0,0,0.4)", border:"1px solid rgba(255,0,110,0.4)", color:"var(--text)", fontFamily:"'Share Tech Mono',monospace" }} type="text" placeholder="New wallet pubkey" value={transferDest} onChange={e => setTransferDest(e.target.value.trim())} disabled={busy}/>
          </div>
          {!showTransferConfirm ? (
            <button className="modal-btn" style={{ marginTop:8, fontSize:10, border:"1px solid var(--danger)", color:"var(--danger)", background:"rgba(255,0,110,0.06)" }} disabled={busy || !transferDest} onClick={() => setShowTransferConfirm(true)}>TRANSFER ALL PLANETS</button>
          ) : (
            <div style={{ marginTop:8, padding:"12px 14px", background:"rgba(255,0,110,0.08)", border:"1px solid rgba(255,0,110,0.3)", borderRadius:4 }}>
              <div style={{ fontSize:11, color:"var(--danger)", marginBottom:10 }}>Transfer all planets to {transferDest.slice(0,6)}…{transferDest.slice(-4)}?</div>
              <div style={{ display:"flex", gap:8 }}>
                <button className="modal-btn secondary" onClick={() => setShowTransferConfirm(false)} disabled={busy}>CANCEL</button>
                <button className="modal-btn" style={{ border:"1px solid var(--danger)", color:"var(--danger)", background:"rgba(255,0,110,0.1)" }} disabled={busy} onClick={async () => { setShowTransferConfirm(false); await onTransferAllPlanets(transferDest); }}>CONFIRM TRANSFER</button>
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="modal-btn secondary" onClick={onClose} disabled={busy}>CLOSE</button>
          {vaultReady && <>
            <button className="modal-btn primary" onClick={() => void onDeposit()} disabled={busy}>DEPOSIT</button>
            <button className="modal-btn primary" onClick={() => void onWithdraw()} disabled={busy}>WITHDRAW</button>
          </>}
        </div>
      </div>
    </div>
  );
};

// ─── Admin Card ───────────────────────────────────────────────────────────────
const GameConfigAdminCard: React.FC<{ visible: boolean; config: GameConfigState | null; mintInput: string; onMintInputChange: (value: string) => void; onSubmit: () => Promise<void>; busy: boolean; }> =
  ({ visible, config, mintInput, onMintInputChange, onSubmit, busy }) => {
    if (!visible) return null;
    return (
      <div className="card" style={{ marginBottom: 18, borderColor: "rgba(255,214,10,0.35)", background: "linear-gradient(180deg, rgba(255,214,10,0.06), rgba(11,11,30,0.92))" }}>
        <div className="section-title" style={{ marginBottom: 14 }}>Admin Config</div>
        <div style={{ display: "grid", gap: 10 }}>
          <div className="modal-info-row"><span>Status</span><span className="modal-info-val" style={{ color: config ? "var(--success)" : "var(--warn)" }}>{config ? "INITIALIZED" : "NOT INITIALIZED"}</span></div>
          <div className="modal-info-row"><span>Current Mint</span><span className="modal-info-val" style={{ maxWidth: "70%", overflow: "hidden", textOverflow: "ellipsis" }}>{config?.antimatterMint ?? "—"}</span></div>
          <div style={{ display: "grid", gap: 8 }}>
            <label className="modal-label" style={{ marginBottom: 0 }}>ANTIMATTER Mint</label>
            <input className="modal-input" type="text" value={mintInput} onChange={(e) => onMintInputChange(e.target.value.trim())} disabled={busy} spellCheck={false} style={{ width: "100%", fontFamily: "'Share Tech Mono', monospace" }}/>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="modal-btn primary" onClick={() => void onSubmit()} disabled={busy || !mintInput}>{config ? "UPDATE MINT" : "INITIALIZE CONFIG"}</button>
          </div>
        </div>
      </div>
    );
  };

const InstantFinishButton: React.FC<{ secondsLeft: number; balance: bigint; txBusy: boolean; enabled: boolean; onClick: () => void; }> =
  ({ secondsLeft, balance, txBusy, enabled, onClick }) => {
    const costTokens = BigInt(Math.max(0, secondsLeft));
    const enough = balance >= costTokens;
    const disabled = txBusy || !enabled || secondsLeft <= 0 || !enough;
    return (
      <button className="build-btn" style={{ border: "1px solid rgba(255,214,10,0.45)", color: disabled ? "var(--dim)" : "var(--warn)", background: disabled ? "rgba(255,255,255,0.03)" : "rgba(255,214,10,0.08)" }} disabled={disabled} onClick={onClick}>
        {`INSTANT ${fmt(costTokens)} AM`}
      </button>
    );
  };

type CoordStatus = "idle" | "checking" | "free" | "occupied";

const LaunchModal: React.FC<{ fleet: Fleet; res: Resources; ownedPlanets: PlayerState[]; currentPlanetPda: string; onClose: () => void; txBusy: boolean; onCheckCoord: (galaxy: number, system: number, position: number) => Promise<boolean>; onLaunch: (ships: Record<string, number>, cargo: { metal: bigint; crystal: bigint; deuterium: bigint }, missionType: number, speedFactor: number, target: LaunchTargetInput) => Promise<void>; prefillTarget?: { galaxy: number; system: number; position: number; missionType?: number }; }> =
  ({ fleet, res, ownedPlanets, currentPlanetPda, onClose, onLaunch, txBusy, onCheckCoord, prefillTarget }) => {
    const featuredLaunchShips = new Set(["smallCargo", "largeCargo", "colonyShip"]);
    const [shipQty, setShipQty] = useState<Record<string, number>>({});
    const [missionType, setMissionType] = useState(prefillTarget?.missionType ?? 2);
    const [cargoM, setCargoM] = useState(0); const [cargoC, setCargoC] = useState(0); const [cargoD, setCargoD] = useState(0);
    const [speed, setSpeed] = useState(100);
    const [transportMode, setTransportMode] = useState<"owned" | "coords">(prefillTarget?.missionType === 2 ? "coords" : "owned");
    const [targetGalaxy, setTargetGalaxy] = useState(prefillTarget?.galaxy ?? 1);
    const [targetSystem, setTargetSystem] = useState(prefillTarget?.system ?? 1);
    const [targetPosition, setTargetPosition] = useState(prefillTarget?.position ?? 1);
    const [colonyName, setColonyName] = useState("Colony");
    const [launching, setLaunching] = useState(false); const [localErr, setLocalErr] = useState<string | null>(null);
    const [coordStatus, setCoordStatus] = useState<CoordStatus>("idle");
    const coordCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const selectableOwned = ownedPlanets.filter(p => p.planetPda !== currentPlanetPda);
    const [targetEntity, setTargetEntity] = useState(selectableOwned[0]?.entityPda ?? "");
    const getQty = (key: string) => shipQty[key] ?? 0;
    const setQty = (key: string, v: number) => setShipQty(prev => ({ ...prev, [key]: Math.max(0, Math.min((fleet as any)[key] ?? 0, v)) }));
    const totalSent = Object.values(shipQty).reduce((a, b) => a + b, 0);
    const cargoCap = getQty("smallCargo")*5000+getQty("largeCargo")*25000+getQty("recycler")*20000+getQty("cruiser")*800+getQty("battleship")*1500;
    const cargoUsed = cargoM + cargoC + cargoD;
    const scheduleCoordCheck = useCallback((g: number, s: number, p: number) => { setCoordStatus("checking"); if (coordCheckTimer.current) clearTimeout(coordCheckTimer.current); coordCheckTimer.current = setTimeout(async () => { try { const free = await onCheckCoord(g, s, p); setCoordStatus(free ? "free" : "occupied"); } catch { setCoordStatus("idle"); } }, 400); }, [onCheckCoord]);

    // Auto-check coords if prefilled for colonize
    useEffect(() => {
      if (prefillTarget && missionType === 5) {
        scheduleCoordCheck(prefillTarget.galaxy, prefillTarget.system, prefillTarget.position);
      }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
      if (missionType === 5 || (missionType === 2 && transportMode === "coords")) {
        scheduleCoordCheck(targetGalaxy, targetSystem, targetPosition);
      } else {
        setCoordStatus("idle");
        if (coordCheckTimer.current) clearTimeout(coordCheckTimer.current);
      }
      return () => {
        if (coordCheckTimer.current) clearTimeout(coordCheckTimer.current);
      };
    }, [missionType, transportMode, targetGalaxy, targetSystem, targetPosition, scheduleCoordCheck]);
    const handleColonyCoordChange = (galaxy: number, system: number, position: number, setterG: (v: number) => void, setterS: (v: number) => void, setterP: (v: number) => void, changedField: "g" | "s" | "p", value: number) => { const ng=changedField==="g"?value:galaxy; const ns=changedField==="s"?value:system; const np=changedField==="p"?value:position; if(changedField==="g")setterG(ng); if(changedField==="s")setterS(ns); if(changedField==="p")setterP(np); };
    const coordStatusConfig: Record<CoordStatus, { color: string; text: string }> = { idle:{color:"var(--dim)",text:""}, checking:{color:"var(--warn)",text:"CHECKING..."}, free:{color:"var(--success)",text:"✓ SLOT FREE"}, occupied:{color:"var(--danger)",text:"✗ ALREADY OCCUPIED"} };
    const handleSubmit = async () => { try { setLocalErr(null); if(totalSent<=0)throw new Error("Select at least one ship."); if(cargoUsed>cargoCap)throw new Error("Cargo exceeds fleet capacity."); if(fleet.activeMissions>=4)throw new Error("No mission slots available."); if(missionType===5&&getQty("colonyShip")<=0)throw new Error("Colonize requires at least 1 colony ship."); if(missionType===5&&coordStatus==="occupied")throw new Error("That coordinate slot is already occupied."); if(missionType===2&&transportMode==="coords"&&coordStatus==="free")throw new Error("Transport missions can only target occupied planets."); let target: LaunchTargetInput; if(missionType===2){if(transportMode==="owned"){if(!targetEntity)throw new Error("Select a destination planet."); target={kind:"transport",mode:"owned",destinationEntity:targetEntity};}else{target={kind:"transport",mode:"coords",galaxy:targetGalaxy,system:targetSystem,position:targetPosition};}}else{target={kind:"colonize",galaxy:targetGalaxy,system:targetSystem,position:targetPosition,colonyName:colonyName.trim()||"Colony"};} setLaunching(true); await onLaunch(shipQty,{metal:BigInt(cargoM),crystal:BigInt(cargoC),deuterium:BigInt(cargoD)},missionType,speed,target); onClose(); }catch(e:any){setLocalErr(e?.message||String(e));}finally{setLaunching(false);}};
    return (
      <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="modal">
          <div className="modal-title">⊹ LAUNCH FLEET</div>
          <div className="modal-section"><div className="modal-label">Mission Type</div><select className="modal-select" value={missionType} onChange={e => setMissionType(Number(e.target.value))}><option value={2}>TRANSPORT</option><option value={5}>COLONIZE</option></select></div>
          {missionType===2&&(<div className="modal-section"><div className="modal-label">Target</div><div className="modal-row"><span style={{fontSize:11,color:"var(--dim)"}}>Mode</span><select className="modal-select" value={transportMode} onChange={e=>setTransportMode(e.target.value as "owned"|"coords")}><option value="owned">My planets</option><option value="coords">Coordinates</option></select></div>{transportMode==="owned"?(<div className="modal-row"><span style={{fontSize:11,color:"var(--dim)"}}>Destination</span><select className="modal-select" value={targetEntity} onChange={e=>setTargetEntity(e.target.value)} disabled={selectableOwned.length===0}>{selectableOwned.length===0?<option value="">No other planets</option>:selectableOwned.map(p=>(<option key={p.entityPda} value={p.entityPda}>{p.planet.name} [{p.planet.galaxy}:{p.planet.system}:{p.planet.position}]</option>))}</select></div>):(<>{(["Galaxy","System","Position"]as const).map((label,li)=>{const vals=[targetGalaxy,targetSystem,targetPosition];const setters=[(v:number)=>setTargetGalaxy(Math.max(1,Math.min(9,v))),(v:number)=>setTargetSystem(Math.max(1,Math.min(499,v))),(v:number)=>setTargetPosition(Math.max(1,Math.min(15,v)))];return(<div key={label} className="modal-row"><span style={{fontSize:11,color:"var(--dim)"}}>{label}</span><input className="modal-input" type="number" value={vals[li]} onChange={e=>setters[li](parseInt(e.target.value)||1)}/></div>);})}{coordStatus!=="idle"&&<div className="coord-status-badge" style={{color:coordStatus==="free"?"var(--danger)":coordStatusConfig[coordStatus].color}}>{coordStatus==="free"?"TRANSPORT BLOCKED: EMPTY SLOT":coordStatusConfig[coordStatus].text}</div>}</>)}</div>)}
          {missionType===5&&(<div className="modal-section"><div className="modal-label">Colony Target</div><div className="modal-row"><span style={{fontSize:11,color:"var(--dim)"}}>Galaxy</span><input className="modal-input" type="number" value={targetGalaxy} onChange={e=>handleColonyCoordChange(targetGalaxy,targetSystem,targetPosition,setTargetGalaxy,setTargetSystem,setTargetPosition,"g",Math.max(1,Math.min(9,parseInt(e.target.value)||1)))}/></div><div className="modal-row"><span style={{fontSize:11,color:"var(--dim)"}}>System</span><input className="modal-input" type="number" value={targetSystem} onChange={e=>handleColonyCoordChange(targetGalaxy,targetSystem,targetPosition,setTargetGalaxy,setTargetSystem,setTargetPosition,"s",Math.max(1,Math.min(499,parseInt(e.target.value)||1)))}/></div><div className="modal-row"><span style={{fontSize:11,color:"var(--dim)"}}>Position</span><input className="modal-input" type="number" value={targetPosition} onChange={e=>handleColonyCoordChange(targetGalaxy,targetSystem,targetPosition,setTargetGalaxy,setTargetSystem,setTargetPosition,"p",Math.max(1,Math.min(15,parseInt(e.target.value)||1)))}/></div>{coordStatus!=="idle"&&<div className="coord-status-badge" style={{color:coordStatusConfig[coordStatus].color}}>{coordStatusConfig[coordStatus].text}</div>}<div className="modal-row" style={{marginTop:10}}><span style={{fontSize:11,color:"var(--dim)"}}>Colony Name</span><input className="modal-input" type="text" maxLength={32} value={colonyName} onChange={e=>setColonyName(e.target.value)}/></div></div>)}
          <div className="modal-section"><div className="modal-label">Ships <span style={{color:"var(--cyan)"}}>{totalSent>0?`${totalSent} selected`:"none"}</span></div><div className="modal-ship-grid">{SHIPS.map(ship=>{const avail=((fleet as any)[ship.key]as number)??0; if(avail===0)return null; const featured=featuredLaunchShips.has(ship.key); return(<div key={ship.key} className="modal-ship-row">{featured&&<div className="modal-ship-art" style={{backgroundImage:getShipArt(ship.key)}} />}<div className="modal-ship-top"><div className="modal-ship-copy"><div className="modal-ship-label">{featured?ship.name:`${ship.icon} ${ship.name}`}</div><div className="modal-ship-avail">Avail: {avail.toLocaleString()}</div></div><input className="modal-input" type="number" min={0} max={avail} value={getQty(ship.key)||""} placeholder="0" onChange={e=>setQty(ship.key,parseInt(e.target.value)||0)}/></div></div>);})}</div></div>
          {cargoCap>0&&(<div className="modal-section"><div className="modal-label">Cargo <span style={{color:cargoUsed>cargoCap?"var(--danger)":"var(--dim)"}}>{cargoUsed.toLocaleString()} / {cargoCap.toLocaleString()}</span></div>{[{label:"Metal",color:"var(--metal)",val:cargoM,max:Number(res.metal),set:setCargoM},{label:"Crystal",color:"var(--crystal)",val:cargoC,max:Number(res.crystal),set:setCargoC},{label:"Deuterium",color:"var(--deut)",val:cargoD,max:Number(res.deuterium),set:setCargoD}].map(r=>(<div key={r.label} className="modal-row"><span style={{color:r.color,fontSize:11}}>{r.label} (avail: {fmt(r.max)})</span><input className="modal-input" type="number" min={0} max={r.max} value={r.val||""} placeholder="0" onChange={e=>r.set(Math.max(0,Math.min(r.max,parseInt(e.target.value)||0)))}/></div>))}</div>)}
          <div className="modal-section"><div className="modal-label">Flight Parameters</div><div className="modal-row"><span style={{fontSize:11,color:"var(--dim)"}}>Speed (10–100%)</span><input className="modal-input" type="number" min={10} max={100} step={10} value={speed} onChange={e=>setSpeed(Math.max(10,Math.min(100,parseInt(e.target.value)||100)))}/></div></div>
          {localErr&&<div className="error-msg" style={{marginBottom:8}}>{localErr}</div>}
          <div className="modal-footer"><button className="modal-btn secondary" onClick={onClose} disabled={launching||txBusy}>CANCEL</button><button className="modal-btn primary" onClick={handleSubmit} disabled={launching||txBusy||totalSent===0||fleet.activeMissions>=4||(missionType===5&&coordStatus==="occupied")||(missionType===2&&transportMode==="coords"&&(coordStatus==="checking"||coordStatus==="free"))}>{launching?"LAUNCHING...":"⊹ LAUNCH"}</button></div>
        </div>
      </div>
    );
  };

// ─── Tab components ───────────────────────────────────────────────────────────
const ResearchTab: React.FC<{ research: Research; res?: Resources; planet: Planet; txBusy: boolean; antimatterBalance: bigint; antimatterEnabled: boolean; onResearch: (idx: number) => void; onFinishResearch: () => void; onInstantFinishResearch: () => void; onGoBuildings: () => void; onGoResearch: () => void; }> =
  ({ research, res, planet, txBusy, antimatterBalance, antimatterEnabled, onResearch, onFinishResearch, onInstantFinishResearch, onGoBuildings, onGoResearch }) => {
    const now = Math.floor(Date.now() / 1000);
    const isResearching = research.queueItem !== 255;
    const researchSecsLeft = isResearching ? Math.max(0, research.researchFinishTs - now) : 0;
    const baseCostsArr = [[0,800,400],[400,0,600],[2000,4000,600],[10000,20000,6000],[0,400,600],[4000,2000,1000],[240000,400000,160000]];
    const [reqCheck, setReqCheck] = useState<RequirementCheck | null>(null);

    return (
      <>
        <div>
          <div className="section-title">🔬 RESEARCH LAB</div>
          {isResearching && (
            <div className="build-queue-banner" style={{ marginBottom: 20 }}>
              <div>
                <div className="build-queue-label">CURRENT RESEARCH</div>
                <div className="build-queue-item-name">{RESEARCH_TECHS.find(t => t.idx === research.queueItem)?.name || "Unknown"}</div>
              </div>
              <div className="build-queue-right" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                <div className="build-queue-eta">{fmtCountdown(researchSecsLeft)}</div>
                <button className="build-btn finish-btn" disabled={txBusy || researchSecsLeft > 0} onClick={onFinishResearch}>
                  {researchSecsLeft > 0 ? "IN PROGRESS" : "FINISH RESEARCH"}
                </button>
                <InstantFinishButton secondsLeft={researchSecsLeft} balance={antimatterBalance} enabled={antimatterEnabled} txBusy={txBusy} onClick={onInstantFinishResearch} />
              </div>
            </div>
          )}
          <div className="grid-3">
            {RESEARCH_TECHS.map(tech => {
              const level = ((research as any)[tech.field] as number) ?? 0;
              const costs = baseCostsArr[tech.idx];
              const cm = Math.floor(costs[0] * Math.pow(2, level));
              const cc = Math.floor(costs[1] * Math.pow(2, level));
              const cd = Math.floor(costs[2] * Math.pow(2, level));
              const canAfford = !res || (res.metal >= BigInt(cm) && res.crystal >= BigInt(cc) && res.deuterium >= BigInt(cd));
              const requirementCheck = checkResearchRequirements(tech, planet, research);
              const requirementsMet = requirementCheck.allMet;
              const isThis = isResearching && research.queueItem === tech.idx;
              const missingCount = requirementCheck.requirements.filter(requirement => !requirement.met).length;
              let btnClass = "build-btn no-funds";
              let btnText = "INSUFFICIENT FUNDS";
              if (isResearching) {
                btnClass = isThis ? "build-btn building-now" : "build-btn no-funds";
                btnText = isThis ? fmtCountdown(researchSecsLeft) : "QUEUE FULL";
              } else if (!requirementsMet) {
                btnClass = "build-btn locked-btn";
                btnText = `REQUIREMENTS (${missingCount})`;
              } else if (canAfford) {
                btnClass = "build-btn can-build";
                btnText = `RESEARCH → Lv ${level + 1}`;
              }

              return (
                <div key={tech.idx} className="building-card" style={{ borderColor: !requirementsMet ? "rgba(255,0,110,0.2)" : undefined }}>
                  <div className="building-card-art" style={{ backgroundImage: getResearchArt(tech.field) }} />
                  <div className="building-header">
                    <div className="building-icon-name">
                      <span className="building-icon">{tech.icon}</span>
                      <span className="building-name">{tech.name}</span>
                    </div>
                    <span className="building-level">Lv {level}</span>
                  </div>
                  {!requirementsMet && (
                    <div style={{ fontSize: 9, color: "var(--danger)", letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--danger)", display: "inline-block" }} />
                      locked {missingCount > 0 ? `· ${missingCount} missing` : ""}
                    </div>
                  )}
                  <div className="building-costs">
                    {cm > 0 && <div className="building-cost-row"><span>Metal</span><span className={res && res.metal < BigInt(cm) ? "cost-bad" : "cost-ok"}>{fmt(cm)}</span></div>}
                    {cc > 0 && <div className="building-cost-row"><span>Crystal</span><span className={res && res.crystal < BigInt(cc) ? "cost-bad" : "cost-ok"}>{fmt(cc)}</span></div>}
                    {cd > 0 && <div className="building-cost-row"><span>Deuterium</span><span className={res && res.deuterium < BigInt(cd) ? "cost-bad" : "cost-ok"}>{fmt(cd)}</span></div>}
                  </div>
                  <button
                    className={btnClass}
                    disabled={txBusy || (isResearching && !isThis) || (!requirementsMet ? false : !canAfford)}
                    onClick={() => {
                      if (isResearching) return;
                      if (!requirementsMet) {
                        setReqCheck(requirementCheck);
                        return;
                      }
                      onResearch(tech.idx);
                    }}
                  >
                    {btnText}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        <RequirementsModal check={reqCheck} onClose={() => setReqCheck(null)} onGoBuildings={onGoBuildings} onGoResearch={onGoResearch} />
      </>
    );
  };

const NoPlanetView: React.FC<{ planetName:string; onNameChange:(v:string)=>void; onCreate:()=>void; creating:boolean; error:string|null }> =
  ({ planetName, onNameChange, onCreate, creating, error }) => (
    <div className="command-empty">
      <div className="command-empty-art"><LogoSVG size={88}/></div>
      <div className="command-empty-title">Claim Your First World</div>
      <div className="command-empty-sub">
        Your command network is ready, but this wallet does not control any initialized planets yet.
        Create a homeworld to unlock the command HUD, research pipeline, and fleet progression.
      </div>
      <div className="command-empty-grid">
        <div className="command-empty-step">
          <div className="command-empty-step-num">01</div>
          <div className="command-empty-step-copy">Choose a world name and initialize your command center.</div>
        </div>
        <div className="command-empty-step">
          <div className="command-empty-step-num">02</div>
          <div className="command-empty-step-copy">The setup creates your first world and prepares the vault signing flow.</div>
        </div>
        <div className="command-empty-step">
          <div className="command-empty-step-num">03</div>
          <div className="command-empty-step-copy">From there, you can expand production, unlock science, and launch colonies.</div>
        </div>
      </div>
      <input className="planet-name-input" type="text" placeholder="Planet name (optional)" value={planetName} onChange={e=>onNameChange(e.target.value)} maxLength={19}/>
      <button className="create-btn" onClick={onCreate} disabled={creating}>{creating?"INITIALIZING...":"⊹ INITIALIZE HOMEWORLD"}</button>
      {error&&<div className="error-msg">{error}</div>}
      <div style={{fontSize:10,color:"rgba(200,214,229,0.6)",letterSpacing:1,marginTop:14}}>Requires 1 wallet signature · Vault handles the rest of gameplay after setup</div>
    </div>
  );

const OverviewTab: React.FC<{ state: PlayerState; planets: PlayerState[]; res?: Resources; nowTs: number; onSelectPlanet: (pda: string) => void; onFinishBuild: () => void; onFinishResearch: () => void; onFinishShipyard: () => void; onInstantFinishBuild: () => void; onInstantFinishResearch: () => void; onInstantFinishShipyard: () => void; txBusy: boolean; antimatterBalance: bigint; antimatterEnabled: boolean; }> =
  ({ state, planets, res, nowTs, onSelectPlanet, onFinishBuild, onFinishResearch, onFinishShipyard, onInstantFinishBuild, onInstantFinishResearch, onInstantFinishShipyard, txBusy, antimatterBalance, antimatterEnabled }) => {
    const { planet, research, fleet } = state;
    const buildInProgress = planet.buildFinishTs > 0 && planet.buildQueueItem !== 255;
    const buildSecsLeft = buildInProgress ? Math.max(0, planet.buildFinishTs - nowTs) : 0;
    const buildBuilding = BUILDINGS.find(b => b.idx === planet.buildQueueItem);
    const researchInProgress = research.researchFinishTs > 0 && research.queueItem !== 255;
    const researchSecsLeft = researchInProgress ? Math.max(0, research.researchFinishTs - nowTs) : 0;
    const techs = [{idx:0,name:"Energy Technology",icon:"⚡"},{idx:1,name:"Combustion Drive",icon:"🔥"},{idx:2,name:"Impulse Drive",icon:"🚀"},{idx:3,name:"Hyperspace Drive",icon:"🌌"},{idx:4,name:"Computer Technology",icon:"💻"},{idx:5,name:"Astrophysics",icon:"🔭"},{idx:6,name:"Intergalactic Research Network",icon:"📡"}] as const;
    const currentResearch = techs.find(t => t.idx === research.queueItem);
    const shipyardInProgress = planet.shipBuildFinishTs > 0 && planet.shipBuildItem !== 255 && planet.shipBuildQty > 0;
    const shipyardSecsLeft = shipyardInProgress ? Math.max(0, planet.shipBuildFinishTs - nowTs) : 0;
    const currentShip = SHIPS.find(s => SHIP_TYPE_IDX[s.key] === planet.shipBuildItem);
    const somethingInProgress = buildInProgress || researchInProgress || shipyardInProgress;
    const theme = getPlanetTheme(planet);
    const heroStyle = {
      "--hero-gradient": theme.heroGradient,
      "--hero-nebula": theme.nebulaGradient,
      "--planet-accent": theme.accent,
    } as React.CSSProperties;

    return (
      <div className="overview-shell">
        <div className="overview-hero" style={heroStyle}>
          <div className="hero-grid">
            <div>
              <div className="hero-kicker">Command Overview</div>
              <div className="hero-title">{planet.name || "Unnamed World"}</div>
              <div className="hero-subtitle">
                {theme.empireTone}. Monitor growth, queue progression, and fleet readiness from one
                command surface before pushing deeper into research, expansion, and interstellar trade.
              </div>
              <div className="hero-chip-row">
                <span className="hero-chip"><span className="sidebar-planet-dot" /> Sector <strong>{planet.galaxy}:{planet.system}:{planet.position}</strong></span>
                <span className="hero-chip">Diameter <strong>{planet.diameter.toLocaleString()} km</strong></span>
                <span className="hero-chip">Climate <strong>{planet.temperature}°C</strong></span>
                <span className="hero-chip">Fields <strong>{planet.usedFields}/{planet.maxFields}</strong></span>
              </div>
            </div>
            <PlanetSceneCard planet={planet} />
          </div>
        </div>

        {planets.length > 1 && (
          <div className="overview-section-panel shell-panel">
            <div className="section-title">Planet Network</div>
            <div className="planet-pill-list">
              {planets.map(p => (
                <button
                  key={p.planetPda}
                  className={`planet-pill${p.planetPda===state.planetPda?" active":""}`}
                  onClick={() => onSelectPlanet(p.planetPda)}
                  disabled={txBusy}
                >
                  <div className="planet-pill-title">{p.planet.name || `Planet ${p.planet.planetIndex+1}`}</div>
                  <div className="planet-pill-sub">[{p.planet.galaxy}:{p.planet.system}:{p.planet.position}] · {p.planet.usedFields}/{p.planet.maxFields} fields</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {somethingInProgress && (
          <div className="overview-section-panel shell-panel">
            <div className="section-title">In Progress</div>
            {buildInProgress && buildBuilding && (
              <div className="build-queue-banner" style={{marginBottom:12}}>
                <div><div className="build-queue-label">⚙ BUILDING</div><div className="build-queue-item-name">{buildBuilding.icon} {buildBuilding.name} → Lv {planet.buildQueueTarget}</div></div>
                <div className="build-queue-right" style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8}}><div className="build-queue-eta">{fmtCountdown(buildSecsLeft)}</div>{buildSecsLeft===0&&<button onClick={onFinishBuild} disabled={txBusy} className="build-btn finish-btn">FINISH BUILDING</button>}<InstantFinishButton secondsLeft={buildSecsLeft} balance={antimatterBalance} enabled={antimatterEnabled} txBusy={txBusy} onClick={onInstantFinishBuild}/></div>
              </div>
            )}
            {researchInProgress && currentResearch && (
              <div className="build-queue-banner" style={{marginBottom:12}}>
                <div><div className="build-queue-label">🔬 RESEARCH</div><div className="build-queue-item-name">{currentResearch.icon} {currentResearch.name}</div></div>
                <div className="build-queue-right" style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8}}><div className="build-queue-eta">{fmtCountdown(researchSecsLeft)}</div>{researchSecsLeft===0&&<button onClick={onFinishResearch} disabled={txBusy} className="build-btn finish-btn">FINISH RESEARCH</button>}<InstantFinishButton secondsLeft={researchSecsLeft} balance={antimatterBalance} enabled={antimatterEnabled} txBusy={txBusy} onClick={onInstantFinishResearch}/></div>
              </div>
            )}
            {shipyardInProgress && currentShip && (
              <div className="build-queue-banner">
                <div><div className="build-queue-label">🚀 SHIPYARD</div><div className="build-queue-item-name">{currentShip.icon} {currentShip.name} × {planet.shipBuildQty}</div></div>
                <div className="build-queue-right" style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8}}><div className="build-queue-eta">{fmtCountdown(shipyardSecsLeft)}</div>{shipyardSecsLeft===0&&<button onClick={onFinishShipyard} disabled={txBusy} className="build-btn finish-btn">FINISH SHIPYARD</button>}<InstantFinishButton secondsLeft={shipyardSecsLeft} balance={antimatterBalance} enabled={antimatterEnabled} txBusy={txBusy} onClick={onInstantFinishShipyard}/></div>
              </div>
            )}
          </div>
        )}

        <div className="overview-card-grid">
          <div className="card overview-metric shell-panel"><div className="card-label">Metal / Hour</div><div className="card-value" style={{color:"var(--metal)"}}>{res?fmt(res.metalHour):"—"}</div><div className="card-sub">Industrial extraction throughput</div></div>
          <div className="card overview-metric shell-panel"><div className="card-label">Crystal / Hour</div><div className="card-value" style={{color:"var(--crystal)"}}>{res?fmt(res.crystalHour):"—"}</div><div className="card-sub">Scientific and structural material flow</div></div>
          <div className="card overview-metric shell-panel"><div className="card-label">Deuterium / Hour</div><div className="card-value" style={{color:"var(--deut)"}}>{res?fmt(res.deuteriumHour):"—"}</div><div className="card-sub">Propulsion and high-energy reserves</div></div>
          <div className="card overview-metric shell-panel"><div className="card-label">Energy Balance</div><div className="card-value" style={{fontSize:16}}>{res?`${fmt(res.energyProduction)}/${fmt(res.energyConsumption)}`:"—"}</div><div className="card-sub">{res ? `${energyEfficiency(res)}% efficiency` : "Awaiting telemetry"}</div></div>
        </div>

        <div className="overview-panel-grid">
          <div className="overview-section-panel shell-panel">
            <div className="section-title">Infrastructure Snapshot</div>
            {BUILDINGS.slice(0,8).map(b => (
              <div key={b.idx} className="stat-row">
                <span style={{color:"var(--dim)",fontSize:11}}>{b.icon} {b.name}</span>
                <span style={{color:"white",fontFamily:"'Orbitron',sans-serif",fontSize:11}}>Lv {(planet as any)[b.key]??0}</span>
              </div>
            ))}
          </div>
          <div className="overview-section-panel shell-panel">
            <div className="section-title">Strategic Readout</div>
            <div className="stat-row"><span className="stat-key">Research Queue</span><span className="stat-val">{researchInProgress ? currentResearch?.name ?? "Active" : "Idle"}</span></div>
            <div className="stat-row"><span className="stat-key">Shipyard Queue</span><span className="stat-val">{shipyardInProgress ? `${currentShip?.name ?? "Ship"} × ${planet.shipBuildQty}` : "Idle"}</span></div>
            <div className="stat-row"><span className="stat-key">Active Missions</span><span className="stat-val">{fleet.activeMissions} / 4</span></div>
            <div className="stat-row"><span className="stat-key">Colony Capacity</span><span className="stat-val">Astrophysics Lv {research.astrophysics}</span></div>
            <div className="stat-row"><span className="stat-key">Research Lab</span><span className="stat-val">Lv {planet.researchLab}</span></div>
            <div className="stat-row"><span className="stat-key">Shipyard</span><span className="stat-val">Lv {planet.shipyard}</span></div>
          </div>
        </div>
      </div>
    );
  };

const ResourcesTab: React.FC<{ state:PlayerState; res?:Resources; nowTs:number; onStartBuild:(idx:number)=>void; onFinishBuild:()=>void; onInstantFinishBuild:()=>void; txBusy:boolean; antimatterBalance: bigint; antimatterEnabled:boolean; onGoBuildings: () => void; onGoResearch: () => void; }> =
  ({ state, res, nowTs, onStartBuild, onFinishBuild, onInstantFinishBuild, txBusy, antimatterBalance, antimatterEnabled, onGoBuildings, onGoResearch }) => {
    const { planet, research } = state;
    const [reqCheck, setReqCheck] = useState<RequirementCheck | null>(null);
    const buildInProgress = planet.buildFinishTs > 0 && planet.buildQueueItem !== 255;
    const buildSecsLeft = Math.max(0, planet.buildFinishTs - nowTs);

    return (
      <>
        <div>
          <div className="section-title">RESOURCE PRODUCTION</div>
          {buildInProgress && (
            <div className="build-queue-banner" style={{ marginBottom: 20 }}>
              <div>
                <div className="build-queue-label">⚙ Constructing</div>
                <div className="build-queue-item-name">{BUILDINGS.find(b => b.idx === planet.buildQueueItem)?.name} → Lv {planet.buildQueueTarget}</div>
              </div>
              <div className="build-queue-right" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                <div className="build-queue-eta">{fmtCountdown(buildSecsLeft)}</div>
                {buildSecsLeft === 0 && <button className="build-btn finish-btn" disabled={txBusy} onClick={onFinishBuild}>FINISH BUILD</button>}
                <InstantFinishButton secondsLeft={buildSecsLeft} balance={antimatterBalance} enabled={antimatterEnabled} txBusy={txBusy} onClick={onInstantFinishBuild} />
              </div>
            </div>
          )}
          <div className="grid-3">
            {BUILDINGS.filter(b => [0, 1, 2, 3, 4].includes(b.idx)).map(building => {
              const level = (planet as any)[building.key] ?? 0;
              const nextLevel = level + 1;
              const [cm, cc, cd] = upgradeCost(building.idx, level);
              const secs = buildTimeSecs(building.idx, nextLevel, planet.roboticsFactory);
              const hasMetal = !res || res.metal >= BigInt(cm);
              const hasCrystal = !res || res.crystal >= BigInt(cc);
              const hasDeut = !res || res.deuterium >= BigInt(cd);
              const canAfford = hasMetal && hasCrystal && hasDeut;
              const requirementCheck = checkBuildingRequirements(building.key, planet, research);
              const requirementsMet = requirementCheck?.allMet ?? true;
              const missingCount = requirementCheck?.requirements.filter(requirement => !requirement.met).length ?? 0;
              const isQueued = buildInProgress && planet.buildQueueItem === building.idx;
              const isReady = isQueued && buildSecsLeft === 0;

              let btnClass = "build-btn no-funds";
              let btnText = "INSUFFICIENT FUNDS";
              if (isReady) {
                btnClass = "build-btn finish-btn";
                btnText = "FINISH BUILD";
              } else if (isQueued) {
                btnClass = "build-btn building-now";
                btnText = fmtCountdown(buildSecsLeft);
              } else if (!buildInProgress && !requirementsMet) {
                btnClass = "build-btn locked-btn";
                btnText = `REQUIREMENTS (${missingCount})`;
              } else if (!buildInProgress && canAfford) {
                btnClass = "build-btn can-build";
                btnText = `BUILD ${fmtCountdown(secs)}`;
              }

              return (
                <div key={building.idx} className="building-card" style={{ borderColor: !requirementsMet ? "rgba(255,0,110,0.2)" : undefined }}>
                  <div className="building-card-art" style={{ backgroundImage: getBuildingArt(building.key) }} />
                  <div className="building-header">
                    <div className="building-icon-name">
                      <span className="building-icon">{building.icon}</span>
                      <span className="building-name">{building.name}</span>
                    </div>
                    <span className="building-level">Lv {level}</span>
                  </div>
                  {!requirementsMet && (
                    <div style={{ fontSize: 9, color: "var(--danger)", letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--danger)", display: "inline-block" }} />
                      locked {missingCount > 0 ? `· ${missingCount} missing` : ""}
                    </div>
                  )}
                  <div className="building-costs">
                    {cm > 0 && <div className="building-cost-row"><span>Metal</span><span className={hasMetal ? "cost-ok" : "cost-bad"}>{fmt(cm)}</span></div>}
                    {cc > 0 && <div className="building-cost-row"><span>Crystal</span><span className={hasCrystal ? "cost-ok" : "cost-bad"}>{fmt(cc)}</span></div>}
                    {cd > 0 && <div className="building-cost-row"><span>Deuterium</span><span className={hasDeut ? "cost-ok" : "cost-bad"}>{fmt(cd)}</span></div>}
                  </div>
                  <button
                    className={btnClass}
                    disabled={(isQueued && !isReady) || txBusy || (!isReady && !isQueued && !requirementsMet ? false : !isReady && !isQueued && !canAfford)}
                    onClick={() => {
                      if (isReady) {
                        onFinishBuild();
                        return;
                      }
                      if (!requirementsMet && requirementCheck) {
                        setReqCheck(requirementCheck);
                        return;
                      }
                      onStartBuild(building.idx);
                    }}
                  >
                    {btnText}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        <RequirementsModal check={reqCheck} onClose={() => setReqCheck(null)} onGoBuildings={onGoBuildings} onGoResearch={onGoResearch} />
      </>
    );
  };

const BuildingsTab: React.FC<{ state:PlayerState; res?:Resources; nowTs:number; onStartBuild:(idx:number)=>void; onFinishBuild:()=>void; onInstantFinishBuild:()=>void; txBusy:boolean; antimatterBalance: bigint; antimatterEnabled:boolean; onGoBuildings: () => void; onGoResearch: () => void; }> =
  ({ state, res, nowTs, onStartBuild, onFinishBuild, onInstantFinishBuild, txBusy, antimatterBalance, antimatterEnabled, onGoBuildings, onGoResearch }) => {
    const { planet, research } = state;
    const [reqCheck, setReqCheck] = useState<RequirementCheck | null>(null);
    const buildInProgress = planet.buildFinishTs > 0 && planet.buildQueueItem !== 255;
    const buildSecsLeft = Math.max(0, planet.buildFinishTs - nowTs);
    const infra = [5, 6, 7, 8, 9, 10, 11].map(idx => BUILDINGS[idx]);

    return (
      <>
        <div>
          <div className="section-title">INFRASTRUCTURE</div>
          {buildInProgress && (
            <div className="build-queue-banner" style={{ marginBottom: 20 }}>
              <div>
                <div className="build-queue-label">⚙ CONSTRUCTING</div>
                <div className="build-queue-item-name">{BUILDINGS.find(b => b.idx === planet.buildQueueItem)?.name} → Lv {planet.buildQueueTarget}</div>
              </div>
              <div className="build-queue-right" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                <div className="build-queue-eta">{fmtCountdown(buildSecsLeft)}</div>
                {buildSecsLeft === 0 && <button className="build-btn finish-btn" disabled={txBusy} onClick={onFinishBuild}>FINISH BUILD</button>}
                <InstantFinishButton secondsLeft={buildSecsLeft} balance={antimatterBalance} enabled={antimatterEnabled} txBusy={txBusy} onClick={onInstantFinishBuild} />
              </div>
            </div>
          )}
          <div className="grid-3">
            {infra.map(building => {
              const level = (planet as any)[building.key] ?? 0;
              const nextLevel = level + 1;
              const [cm, cc, cd] = upgradeCost(building.idx, level);
              const secs = buildTimeSecs(building.idx, nextLevel, planet.roboticsFactory);
              const hasMetal = !res || res.metal >= BigInt(cm);
              const hasCrystal = !res || res.crystal >= BigInt(cc);
              const hasDeut = !res || res.deuterium >= BigInt(cd);
              const canAfford = hasMetal && hasCrystal && hasDeut;
              const requirementCheck = checkBuildingRequirements(building.key, planet, research);
              const requirementsMet = requirementCheck?.allMet ?? true;
              const missingCount = requirementCheck?.requirements.filter(requirement => !requirement.met).length ?? 0;
              const isQueued = buildInProgress && planet.buildQueueItem === building.idx;
              const isReady = isQueued && buildSecsLeft === 0;

              let btnClass = "build-btn no-funds";
              let btnText = "INSUFFICIENT FUNDS";
              if (isReady) {
                btnClass = "build-btn finish-btn";
                btnText = "FINISH BUILD";
              } else if (isQueued) {
                btnClass = "build-btn building-now";
                btnText = fmtCountdown(buildSecsLeft);
              } else if (!buildInProgress && !requirementsMet) {
                btnClass = "build-btn locked-btn";
                btnText = `REQUIREMENTS (${missingCount})`;
              } else if (!buildInProgress && canAfford) {
                btnClass = "build-btn can-build";
                btnText = `BUILD ${fmtCountdown(secs)}`;
              }

              return (
                <div key={building.idx} className="building-card" style={{ borderColor: !requirementsMet ? "rgba(255,0,110,0.2)" : undefined }}>
                  <div className="building-card-art" style={{ backgroundImage: getBuildingArt(building.key) }} />
                  <div className="building-header">
                    <div className="building-icon-name">
                      <span className="building-icon">{building.icon}</span>
                      <span className="building-name">{building.name}</span>
                    </div>
                    <span className="building-level">Lv {level}</span>
                  </div>
                  <div style={{ fontSize: "10.5px", color: "var(--dim)", lineHeight: 1.45, margin: "8px 0 10px" }}>{building.desc}</div>
                  {!requirementsMet && (
                    <div style={{ fontSize: 9, color: "var(--danger)", letterSpacing: 0.5, display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--danger)", display: "inline-block" }} />
                      locked {missingCount > 0 ? `· ${missingCount} missing` : ""}
                    </div>
                  )}
                  <div className="building-costs">
                    {cm > 0 && <div className="building-cost-row"><span>Metal</span><span className={hasMetal ? "cost-ok" : "cost-bad"}>{fmt(cm)}</span></div>}
                    {cc > 0 && <div className="building-cost-row"><span>Crystal</span><span className={hasCrystal ? "cost-ok" : "cost-bad"}>{fmt(cc)}</span></div>}
                    {cd > 0 && <div className="building-cost-row"><span>Deuterium</span><span className={hasDeut ? "cost-ok" : "cost-bad"}>{fmt(cd)}</span></div>}
                  </div>
                  <button
                    className={btnClass}
                    disabled={(isQueued && !isReady) || txBusy || (!isReady && !isQueued && !requirementsMet ? false : !isReady && !isQueued && !canAfford)}
                    onClick={() => {
                      if (isReady) {
                        onFinishBuild();
                        return;
                      }
                      if (!requirementsMet && requirementCheck) {
                        setReqCheck(requirementCheck);
                        return;
                      }
                      onStartBuild(building.idx);
                    }}
                  >
                    {btnText}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        <RequirementsModal check={reqCheck} onClose={() => setReqCheck(null)} onGoBuildings={onGoBuildings} onGoResearch={onGoResearch} />
      </>
    );
  };

const ShipyardTab: React.FC<{ state: PlayerState; res?: Resources; nowTs: number; txBusy: boolean; onBuildShip: (shipType: number, qty: number) => void; onFinishShipyard: () => void; onInstantFinishShipyard: () => void; antimatterBalance: bigint; antimatterEnabled: boolean; onGoBuildings: () => void; onGoResearch: () => void; }> =
  ({ state, res, nowTs, txBusy, onBuildShip, onFinishShipyard, onInstantFinishShipyard, antimatterBalance, antimatterEnabled, onGoBuildings, onGoResearch }) => {
    const [quantities, setQuantities] = useState<Record<string, number>>({});
    const [reqCheck, setReqCheck] = useState<ShipRequirementsCheck | null>(null);
    const { planet, research } = state;
    if (planet.shipyard === 0) return (<div><div className="section-title">SHIPYARD</div><div className="notice-box" style={{textAlign:"center",padding:"40px 20px"}}><div style={{fontSize:36,marginBottom:12}}>🚀</div><div style={{fontSize:13,color:"var(--purple)",letterSpacing:2}}>SHIPYARD NOT BUILT</div><div style={{fontSize:11,color:"var(--dim)"}}>Build a Shipyard in the Buildings tab first.</div></div></div>);
    const shipyardInProgress = planet.shipBuildFinishTs > 0 && planet.shipBuildItem !== 255 && planet.shipBuildQty > 0;
    const shipyardSecsLeft = shipyardInProgress ? Math.max(0, planet.shipBuildFinishTs - nowTs) : 0;
    const currentShip = SHIPS.find(s => SHIP_TYPE_IDX[s.key] === planet.shipBuildItem);
    const canAfford = (cost: { m: number; c: number; d: number }, qty: number) => !res || (res.metal >= BigInt(cost.m * qty) && res.crystal >= BigInt(cost.c * qty) && res.deuterium >= BigInt(cost.d * qty));
    const visibleShips = SHIPS.filter(s => ["smallCargo","largeCargo","colonyShip"].includes(s.key));
    return (<><div><div className="section-title">SHIPYARD</div><div style={{fontSize:10,color:"var(--dim)",letterSpacing:1,marginBottom:20}}>Shipyard Lv {planet.shipyard} · Timed construction queue</div>{shipyardInProgress&&currentShip&&(<div className="build-queue-banner" style={{marginBottom:20}}><div><div className="build-queue-label">🚀 SHIPYARD</div><div className="build-queue-item-name">{currentShip.name} × {planet.shipBuildQty}</div></div><div className="build-queue-right" style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8}}><div className="build-queue-eta">{fmtCountdown(shipyardSecsLeft)}</div>{shipyardSecsLeft===0&&<button className="build-btn finish-btn" disabled={txBusy} onClick={onFinishShipyard}>FINISH SHIPYARD</button>}<InstantFinishButton secondsLeft={shipyardSecsLeft} balance={antimatterBalance} enabled={antimatterEnabled} txBusy={txBusy} onClick={onInstantFinishShipyard}/></div></div>)}<div className="grid-3">{visibleShips.map(ship=>{const typeIdx=SHIP_TYPE_IDX[ship.key]; if(typeIdx===undefined)return null; const qty=Math.max(1,quantities[ship.key]??1); const affordable=canAfford(ship.cost,qty); const current=((state.fleet as any)[ship.key]as number)??0; const check=checkShipRequirements(ship.key,research,planet); const reqsMet=check?.allMet??true; const missingCount=check?.requirements.filter(r=>!r.met).length??0; const disabled=txBusy||shipyardInProgress||!affordable; return(<div key={ship.key} className={`ship-build-card${!reqsMet?" locked":""}`}><div className="ship-card-art" style={{ backgroundImage: getShipArt(ship.key) }} /><div className="ship-build-header"><div className="ship-build-icon-name"><div><div className="ship-build-name">{ship.name}</div>{!reqsMet&&<div style={{fontSize:9,color:"var(--danger)",letterSpacing:0.5,marginTop:2,display:"flex",alignItems:"center",gap:4}}><span style={{width:5,height:5,borderRadius:"50%",background:"var(--danger)",display:"inline-block"}}/> locked{missingCount>0?` · ${missingCount} missing`:""}</div>}{reqsMet&&<div style={{fontSize:9,color:"var(--success)",letterSpacing:0.5,marginTop:2,display:"flex",alignItems:"center",gap:4}}><span style={{width:5,height:5,borderRadius:"50%",background:"var(--success)",display:"inline-block"}}/> unlocked</div>}</div></div><div className={`ship-build-count${current===0?" zero":""}`}>{current.toLocaleString()}</div></div><div style={{fontSize:10,color:"var(--dim)",margin:"8px 0"}}>{ship.cost.m>0&&<div style={{color:!res||res.metal>=BigInt(ship.cost.m*qty)?"var(--text)":"var(--danger)"}}>Metal: {fmt(ship.cost.m*qty)}</div>}{ship.cost.c>0&&<div style={{color:!res||res.crystal>=BigInt(ship.cost.c*qty)?"var(--text)":"var(--danger)"}}>Crystal: {fmt(ship.cost.c*qty)}</div>}{ship.cost.d>0&&<div style={{color:!res||res.deuterium>=BigInt(ship.cost.d*qty)?"var(--text)":"var(--danger)"}}>Deuterium: {fmt(ship.cost.d*qty)}</div>}</div><div className="ship-qty-row"><input className="qty-input" type="number" min={1} value={qty} onChange={e=>setQuantities(prev=>({...prev,[ship.key]:Math.max(1,parseInt(e.target.value)||1)}))} disabled={txBusy||shipyardInProgress}/><button className={`ship-build-btn${!reqsMet?" locked-btn":""}`} disabled={disabled} onClick={()=>{if(!reqsMet&&check){setReqCheck(check);return;}onBuildShip(typeIdx,qty);}}>{shipyardInProgress?"QUEUE BUSY":!reqsMet?`REQUIREMENTS (${missingCount})`:`BUILD ×${qty}`}</button></div></div>);})}</div></div><ShipRequirementsModal check={reqCheck} onClose={()=>setReqCheck(null)} onGoBuildings={onGoBuildings} onGoResearch={onGoResearch}/></>);
  };

const FleetTab: React.FC<{ fleet:Fleet; res?:Resources; txBusy:boolean; onOpenLaunch:()=>void }> =
  ({ fleet, txBusy, onOpenLaunch }) => {
    const totalShips=SHIPS.reduce((s,sh)=>s+((fleet as any)[sh.key]??0),0);
    const utilityShips=SHIPS.filter(s=>["smallCargo","largeCargo","colonyShip"].includes(s.key));
    return (<div><div className="section-title">FLEET COMMAND</div><div className="grid-4" style={{marginBottom:20}}><div className="card"><div className="card-label">Ships</div><div className="card-value">{totalShips.toLocaleString()}</div></div><div className="card"><div className="card-label">Missions</div><div className="card-value">{fleet.activeMissions}</div></div><div className="card"><div className="card-label">Slots</div><div className="card-value">{4-fleet.activeMissions}/4</div></div><div className="card"><div className="card-label">Cargo</div><div className="card-value" style={{fontSize:12}}>{fmt(fleet.smallCargo*5000+fleet.largeCargo*25000)}</div></div></div><button onClick={onOpenLaunch} disabled={txBusy} style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,letterSpacing:1,padding:"12px 20px",border:"1px solid var(--cyan)",background:"rgba(0,245,212,0.1)",color:"var(--cyan)",cursor:"pointer",borderRadius:2,textTransform:"uppercase",width:"100%",marginBottom:20}}>⊹ LAUNCH FLEET</button><div className="section-title">HANGAR</div><div className="grid-3">{utilityShips.map(s=>{const count=(fleet as any)[s.key]??0; return(<div key={s.key} className="ship-card"><div className="ship-card-art" style={{ backgroundImage: getShipArt(s.key) }} /><div className="ship-name">{s.name}</div><div className={`ship-count${count===0?" zero":""}`}>{count.toLocaleString()}</div></div>);})}</div></div>);
  };

const MissionsTab: React.FC<{ fleet:Fleet; nowTs:number; txBusy:boolean; onResolveTransport:(mission:Mission,slot:number)=>void; onResolveColonize:(mission:Mission,slot:number)=>void }> =
  ({ fleet, nowTs, txBusy, onResolveTransport, onResolveColonize }) => {
    const active=fleet.missions.map((m,i)=>({m,i})).filter(({m})=>m.missionType!==0);
    if(active.length===0)return(<div><div className="section-title">ACTIVE MISSIONS</div><div style={{textAlign:"center",padding:"60px 20px",color:"var(--dim)",fontSize:12,letterSpacing:1}}><div style={{fontSize:32,marginBottom:12}}>⊹</div><div>No missions in flight</div></div></div>);
    return (<div><div className="section-title">ACTIVE MISSIONS</div>{active.map(({m,i})=>{const progress=missionProgress(m,nowTs); const returning=m.applied; const etaSecs=returning?Math.max(0,m.returnTs-nowTs):Math.max(0,m.arriveTs-nowTs); const typeLabel=MISSION_LABELS[m.missionType]??"UNKNOWN"; const needsResolution=(m.missionType===2&&((!m.applied&&nowTs>=m.arriveTs)||(m.applied&&m.returnTs>0&&nowTs>=m.returnTs)))||(m.missionType===5&&!m.applied&&nowTs>=m.arriveTs); const ships=[{label:"SC",key:"smallCargo",n:m.sSmallCargo},{label:"LC",key:"largeCargo",n:m.sLargeCargo},{label:"LF",key:"lightFighter",n:m.sLightFighter},{label:"COL",key:"colonyShip",n:m.sColonyShip}].filter(s=>s.n>0); const artShips=ships.filter(s=>["smallCargo","largeCargo","colonyShip"].includes(s.key)); const hasCargo=m.cargoMetal>0n||m.cargoCrystal>0n||m.cargoDeuterium>0n; return(<div key={i} className="mission-card"><div className="mission-header"><div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><span className={`mission-type-badge ${m.missionType===2?"transport":"other"}`}>{typeLabel}</span><span className="tag">SLOT {i}</span>{needsResolution&&<span style={{fontSize:9,color:"var(--success)",letterSpacing:1,padding:"2px 6px",border:"1px solid rgba(6,214,160,0.4)",borderRadius:2}}></span>}</div>{returning&&<span className="mission-returning">↩ RETURN</span>}</div><div className="progress-bar"><div className={`progress-fill ${returning?"returning":"outbound"}`} style={{width:`${progress}%`}}/></div><div className="mission-info"><span>{returning?"Return ETA":"Arrive ETA"}</span><span className="mission-eta">{etaSecs<=0?"ARRIVED":fmtCountdown(etaSecs)}</span></div><div className="mission-ships">{ships.map(s=><span key={s.label} className="mission-ship-badge">{s.label} ×{s.n.toLocaleString()}</span>)}</div>{artShips.length>0&&<div className="mission-ship-media">{artShips.map(s=><div key={s.key} className="mission-ship-card"><div className="mission-ship-card-art" style={{backgroundImage:getShipArt(s.key)}} /><div className="mission-ship-card-copy"><span>{s.label}</span><strong>×{s.n.toLocaleString()}</strong></div></div>)}</div>}{hasCargo&&<div style={{marginTop:8,fontSize:10,color:"var(--dim)",display:"flex",gap:12,flexWrap:"wrap"}}>{m.cargoMetal>0n&&<span style={{color:"var(--metal)"}}>⛏ {fmt(m.cargoMetal)}</span>}{m.cargoCrystal>0n&&<span style={{color:"var(--crystal)"}}>💎 {fmt(m.cargoCrystal)}</span>}{m.cargoDeuterium>0n&&<span style={{color:"var(--deut)"}}>🧪 {fmt(m.cargoDeuterium)}</span>}</div>}{needsResolution&&<button className="apply-btn" disabled={txBusy} onClick={()=>m.missionType===2?onResolveTransport(m,i):onResolveColonize(m,i)}>{m.missionType===2?"RESOLVE TRANSPORT":"RESOLVE COLONIZE"}</button>}</div>);})}</div>);
  };

const MobileResStrip: React.FC<{ res: Resources; planet: Planet }> = ({ res, planet }) => (
  <div className="mobile-res-strip">
    {[{label:"MTL",value:res.metal,rate:res.metalHour,color:"var(--metal)"},{label:"CRY",value:res.crystal,rate:res.crystalHour,color:"var(--crystal)"},{label:"DEU",value:res.deuterium,rate:res.deuteriumHour,color:"var(--deut)"}].map(r=>(<div key={r.label} className="mobile-res-item"><div className="mobile-res-label" style={{color:r.color}}>{r.label}</div><div className="mobile-res-value" style={{color:r.color}}>{fmt(r.value)}</div><div className="mobile-res-rate">+{fmt(r.rate)}/h</div></div>))}
    <div className="mobile-res-item" style={{minWidth:90}}><div className="mobile-res-label">⚡ PWR</div><div className="mobile-res-value" style={{color:energyEfficiency(res)>=80?"var(--success)":energyEfficiency(res)>=36?"var(--warn)":"var(--danger)",fontSize:11}}>{energyEfficiency(res)}%</div><div className="mobile-res-rate">{fmt(res.energyProduction)}/{fmt(res.energyConsumption)}</div></div>
    <div className="mobile-res-item" style={{minWidth:80}}><div className="mobile-res-label">FIELDS</div><div className="mobile-res-value" style={{fontSize:11}}>{planet.usedFields}/{planet.maxFields}</div><div className="mobile-res-rate">{planet.name.slice(0,8)}</div></div>
  </div>
);

// ─── Nav definitions ──────────────────────────────────────────────────────────
const DesktopResourceMenu: React.FC<{ res: Resources; planet: Planet }> = ({ res, planet }) => {
  const efficiency = energyEfficiency(res);
  const efficiencyColor = efficiency >= 80 ? "var(--success)" : efficiency >= 36 ? "var(--warn)" : "var(--danger)";
  const resourceItems = [
    { label: "Metal", value: res.metal, rate: res.metalHour, cap: res.metalCap, color: "var(--metal)" },
    { label: "Crystal", value: res.crystal, rate: res.crystalHour, cap: res.crystalCap, color: "var(--crystal)" },
    { label: "Deuterium", value: res.deuterium, rate: res.deuteriumHour, cap: res.deuteriumCap, color: "var(--deut)" },
  ];

  return (
    <div className="desktop-resource-menu shell-panel">
      {resourceItems.map(item => {
        const capPct = item.cap > 0n ? Math.max(0, Math.min(100, Number((item.value * 100n) / item.cap))) : 0;
        return (
          <div key={item.label} className="desktop-resource-pill">
            <div className="desktop-resource-label" style={{ color: item.color }}>{item.label}</div>
            <div className="desktop-resource-value" style={{ color: item.color }}>{fmt(item.value)}</div>
            <div className="desktop-resource-meta">+{fmt(item.rate)}/h · cap {fmt(item.cap)}</div>
            <div className="desktop-resource-cap">
              <div className="desktop-resource-cap-fill" style={{ width: `${capPct}%`, background: item.color }} />
            </div>
          </div>
        );
      })}
      <div className="desktop-resource-pill">
        <div className="desktop-resource-label">Energy</div>
        <div className="desktop-resource-value" style={{ fontSize: 16, color: efficiencyColor }}>
          {fmt(res.energyProduction)}/{fmt(res.energyConsumption)}
        </div>
        <div className="desktop-resource-meta" style={{ color: efficiencyColor }}>{efficiency}% efficiency</div>
        <div className="desktop-resource-cap">
          <div className="desktop-resource-cap-fill" style={{ width: `${Math.max(0, Math.min(100, efficiency))}%`, background: efficiencyColor }} />
        </div>
      </div>
    </div>
  );
};

const PRIMARY_TABS: { id: Tab; icon: string; label: string }[] = [
  { id: "overview",  icon: "◈",  label: "Home"     },
  { id: "resources", icon: "⛏",  label: "Resources" },
  { id: "buildings", icon: "⬡",  label: "Build"    },
  { id: "research",  icon: "🔬", label: "Research"  },
  { id: "shipyard",  icon: "🚀", label: "Ships"    },
];
const SECONDARY_TABS: { id: Tab; icon: string; label: string }[] = [
  { id: "fleet",     icon: "◉",  label: "Fleet"    },
  { id: "missions",  icon: "⊹",  label: "Missions" },
  { id: "galaxy",    icon: "🌌", label: "Galaxy"    },
  { id: "market",    icon: "⚖",  label: "Market"    },
];

// ─── Main App ─────────────────────────────────────────────────────────────────
const App: React.FC = () => {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const { connected, publicKey: walletPublicKey, wallet } = useWallet();
  const isMobile = useIsMobile();
  const [activeWalletKey, setActiveWalletKey] = useState<string | null>(walletPublicKey?.toBase58() ?? null);
  const publicKey = React.useMemo(
    () => (activeWalletKey ? new PublicKey(activeWalletKey) : null),
    [activeWalletKey],
  );
  const lastSeenWalletKeyRef = useRef<string | null>(walletPublicKey?.toBase58() ?? null);

  const [planets, setPlanets] = useState<PlayerState[]>([]);
  const [selectedPlanetPda, setSelectedPlanetPda] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createProgress, setCreateProgress] = useState("");
  const [txBusy, setTxBusy] = useState(false);
  const [txProgress, setTxProgress] = useState("Processing...");
  const [confirmation, setConfirmation] = useState<ConfirmationState>(null);
  const [planetName, setPlanetName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [nowTs, setNowTs] = useState(Math.floor(Date.now() / 1000));
  const [showLaunchModal, setShowLaunchModal] = useState(false);
  const [launchPrefill, setLaunchPrefill] = useState<{ galaxy: number; system: number; position: number; missionType?: number } | undefined>(undefined);
  const [vaultPrompt, setVaultPrompt] = useState<VaultRecoveryPromptRequest | null>(null);
  const [vaultPromptError, setVaultPromptError] = useState<string | null>(null);
  const [vaultPromptBusy, setVaultPromptBusy] = useState(false);
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [useVaultSigning, setUseVaultSigning] = useState(true);
  const [vaultBalance, setVaultBalance] = useState<bigint>(0n);
  const [vaultActionBusy, setVaultActionBusy] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [showMoreDrawer, setShowMoreDrawer] = useState(false);
  const [vaultStatus, setVaultStatus] = useState<import("./game-state").VaultStatus>("loading");
  const [gameConfig, setGameConfig] = useState<GameConfigState | null>(null);
  const [gameConfigBusy, setGameConfigBusy] = useState(false);
  const [gameConfigMintInput, setGameConfigMintInput] = useState(DEFAULT_ANTIMATTER_MINT);
  const [antimatterBalance, setAntimatterBalance] = useState<bigint>(0n);
  const [antimatterBalanceLoading, setAntimatterBalanceLoading] = useState(false);
  const clientRef = useRef<GameClient | null>(null);
  const marketClientRef = useRef<MarketClient | null>(null);
  const selectedPdaRef = useRef<string | null>(null);
  const vaultPromptResolverRef = useRef<{ resolve: (v: string) => void; reject: (r?: unknown) => void } | null>(null);
  const walletSessionRef = useRef(0);
  const txLockRef = useRef(false);

  const state = planets.find(p => p.planetPda === selectedPlanetPda) ?? planets[0] ?? null;
  const hasCreatedWorld = planets.length > 0;
  const isDevConfigAdmin = publicKey?.toBase58() === DEV_CONFIG_ADMIN_WALLET;
  useEffect(() => { const id = setInterval(() => setNowTs(Math.floor(Date.now() / 1000)), 1000); return () => clearInterval(id); }, []);
  useEffect(() => {
    setActiveWalletKey(walletPublicKey?.toBase58() ?? null);
  }, [walletPublicKey]);
  useEffect(() => {
    if (!connected || !wallet?.adapter) return;
    const syncWalletKey = (nextKey: string | null) => {
      if (!nextKey) {
        lastSeenWalletKeyRef.current = null;
        setActiveWalletKey(null);
        return;
      }
      const previous = lastSeenWalletKeyRef.current;
      lastSeenWalletKeyRef.current = nextKey;
      setActiveWalletKey(nextKey);

      if (previous && previous !== nextKey) {
        window.location.reload();
      }
    };
    const handleConnect = (nextPublicKey?: PublicKey) => {
      syncWalletKey(nextPublicKey?.toBase58() ?? wallet.adapter.publicKey?.toBase58() ?? null);
    };
    const handleDisconnect = () => {
      syncWalletKey(null);
    };
    const handleAccountChanged = (nextPublicKey?: PublicKey) => {
      syncWalletKey(nextPublicKey?.toBase58() ?? null);
    };

    handleConnect(wallet.adapter.publicKey ?? undefined);
    wallet.adapter.on("connect", handleConnect);
    wallet.adapter.on("disconnect", handleDisconnect);

    const rawWallet = (wallet.adapter as any)._wallet;
    rawWallet?.on?.("accountChanged", handleAccountChanged);

    return () => {
      wallet.adapter.off("connect", handleConnect);
      wallet.adapter.off("disconnect", handleDisconnect);
      rawWallet?.off?.("accountChanged", handleAccountChanged);
    };
  }, [connected, wallet]);
  useEffect(() => { selectedPdaRef.current = selectedPlanetPda; }, [selectedPlanetPda]);
  useEffect(() => {
    marketClientRef.current?.setActivePlanet(state ? new PublicKey(state.planetPda) : null);
  }, [state]);
  useEffect(() => {
    if (!hasCreatedWorld && tab === "market") setTab("overview");
  }, [hasCreatedWorld, tab]);
  useEffect(() => {
    clientRef.current?.setPreferVaultSigning(useVaultSigning);
  }, [useVaultSigning]);

  // ── Vault balance loader (shared) ──────────────────────────────────────────
  const refreshVaultBalance = useCallback(async () => {
    if (!clientRef.current) return;
    const vaultPk = clientRef.current.getVaultPublicKey();
    if (!vaultPk) { setVaultBalance(0n); return; }
    const lamports = await connection.getBalance(vaultPk, "confirmed");
    setVaultBalance(BigInt(lamports));
  }, [connection]);

  const handleDepositVault = async () => {
    if (!clientRef.current) return;
    const amountSol = Number(depositAmount);
    if (!Number.isFinite(amountSol) || amountSol <= 0) { setError("Invalid deposit amount"); return; }
    setVaultActionBusy(true); setError(null);
    try { const lamports=Math.floor(amountSol*1_000_000_000); await clientRef.current.depositToVaultLamports(lamports); await refreshVaultBalance(); setDepositAmount(""); }
    catch (e: any) { setError(e?.message ?? "Vault deposit failed"); }
    finally { setVaultActionBusy(false); }
  };

  const handleWithdrawVault = async () => {
    if (!clientRef.current) return;
    const amountSol = Number(withdrawAmount);
    if (!Number.isFinite(amountSol) || amountSol <= 0) { setError("Invalid withdraw amount"); return; }
    setVaultActionBusy(true); setError(null);
    try { const lamports=Math.floor(amountSol*1_000_000_000); await clientRef.current.withdrawVaultLamports(lamports); await refreshVaultBalance(); setWithdrawAmount(""); }
    catch (e: any) { setError(e?.message ?? "Vault withdraw failed"); }
    finally { setVaultActionBusy(false); }
  };

  const requestVaultRecoveryPassphrase = useCallback((request: VaultRecoveryPromptRequest): Promise<string> => {
    setVaultPromptBusy(false); setVaultPromptError(null);
    setVaultPrompt({ mode: request.mode, wallet: request.wallet });
    return new Promise((resolve, reject) => { vaultPromptResolverRef.current = { resolve, reject }; });
  }, []);

  const handleVaultPromptCancel = useCallback(() => {
    if (vaultPromptBusy) return;
    vaultPromptResolverRef.current?.reject(new Error("User cancelled vault password entry"));
    vaultPromptResolverRef.current = null;
    setVaultPrompt(null); setVaultPromptError(null); setVaultPromptBusy(false);
    clientRef.current?.clearCachedVaultRecoveryPassphrase();
  }, [vaultPromptBusy]);

  const handleVaultPromptSubmit = useCallback((password: string) => {
    if (vaultPrompt?.mode === "create" && password.length < 8) { setVaultPromptError("Recovery password must be at least 8 characters."); return; }
    setVaultPromptBusy(true);
    vaultPromptResolverRef.current?.resolve(password);
    vaultPromptResolverRef.current = null;
    setVaultPrompt(null); setVaultPromptError(null); setVaultPromptBusy(false);
  }, [vaultPrompt]);

  const loadAllPlanets = useCallback(async (wallet: PublicKey, preferPda?: string | null) => {
    if (!clientRef.current) return [];
    const loaded = await clientRef.current.findPlanets(wallet);
    setPlanets(loaded);
    if (loaded.length === 0) { setSelectedPlanetPda(null); return loaded; }
    const next = loaded.find(p => p.planetPda === preferPda) ?? loaded.find(p => p.planetPda === selectedPdaRef.current) ?? loaded[0];
    setSelectedPlanetPda(next.planetPda);
    return loaded;
  }, []);

  const loadGameConfig = useCallback(async () => {
    if (!clientRef.current) { setGameConfig(null); return null; }
    const config = await clientRef.current.getGameConfig();
    setGameConfig(config);
    setGameConfigMintInput(config?.antimatterMint ?? DEFAULT_ANTIMATTER_MINT);
    return config;
  }, []);

  const loadAntimatterBalance = useCallback(async (mintValue?: string) => {
    if (!publicKey) { setAntimatterBalance(0n); return 0n; }
    const mintAddress = (mintValue ?? gameConfig?.antimatterMint ?? DEFAULT_ANTIMATTER_MINT).trim();
    if (!mintAddress) { setAntimatterBalance(0n); return 0n; }
    let mint: PublicKey;
    try { mint = new PublicKey(mintAddress); } catch { setAntimatterBalance(0n); return 0n; }
    setAntimatterBalanceLoading(true);
    try {
      const response = await connection.getParsedTokenAccountsByOwner(publicKey, { mint, programId: SPL_TOKEN_PROGRAM_ID }, "confirmed");
      const total = response.value.reduce((sum, account) => {
        const parsed = account.account.data.parsed as { info?: { tokenAmount?: { amount?: string } } };
        return sum + BigInt(parsed?.info?.tokenAmount?.amount ?? "0");
      }, 0n);
      setAntimatterBalance(total);
      return total;
    } finally { setAntimatterBalanceLoading(false); }
  }, [connection, gameConfig?.antimatterMint, publicKey]);

  const replacePlanetState = useCallback((nextState: PlayerState) => {
    setPlanets(prev => {
      const idx = prev.findIndex(p => p.planetPda === nextState.planetPda);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = nextState;
      return next;
    });
    return nextState;
  }, []);

  const refreshPlanetState = useCallback(async (planetPda: string) => {
    if (!clientRef.current) return null;
    const nextState = await clientRef.current.getPlanetStateByPda(new PublicKey(planetPda));
    if (!nextState) return null;
    replacePlanetState(nextState);
    return nextState;
  }, [replacePlanetState]);

  const refreshSelectedPlanetState = useCallback(async () => {
    if (!selectedPdaRef.current) return null;
    return refreshPlanetState(selectedPdaRef.current);
  }, [refreshPlanetState]);

  // ── Main wallet connection effect ──────────────────────────────────────────
  useEffect(() => {
    if (!connected || !anchorWallet || !publicKey) {
      walletSessionRef.current += 1;
      clientRef.current = null;
      marketClientRef.current = null;
      setPlanets([]); setSelectedPlanetPda(null); setLoading(false);
      setVaultStatus("loading"); setGameConfig(null);
      setGameConfigMintInput(DEFAULT_ANTIMATTER_MINT); setAntimatterBalance(0n);
      setVaultBalance(0n);
      return;
    }
    const sessionId = ++walletSessionRef.current;
    const provider = new AnchorProvider(connection, anchorWallet, { commitment: "confirmed" });
    const gameClient = new GameClient(connection, provider, { requestVaultRecoveryPassphrase });
    gameClient.setPreferVaultSigning(useVaultSigning);
    const marketClient = new MarketClient(connection, provider, gameClient);
    clientRef.current = gameClient;
    marketClientRef.current = marketClient;

    setLoading(true); setError(null); setVaultStatus("loading");
    Promise.all([
      loadAllPlanets(publicKey),
      loadGameConfig(),
      gameClient.restoreExistingVault(),
    ])
      .then(async ([, config]) => {
        if (walletSessionRef.current !== sessionId || clientRef.current !== gameClient) return;
        await loadAntimatterBalance(config?.antimatterMint ?? DEFAULT_ANTIMATTER_MINT);
        if (walletSessionRef.current !== sessionId || clientRef.current !== gameClient) return;
        const status = await gameClient.getVaultStatus();
        if (walletSessionRef.current !== sessionId || clientRef.current !== gameClient) return;
        setVaultStatus(status);
        await refreshVaultBalance();
      })
      .catch(e => {
        if (walletSessionRef.current !== sessionId) return;
        setError(e?.message ?? "Failed to load.");
      })
      .finally(() => {
        if (walletSessionRef.current !== sessionId) return;
        setLoading(false);
      });
    return () => {
      if (walletSessionRef.current === sessionId) {
        walletSessionRef.current += 1;
      }
    };
  }, [connected, anchorWallet, publicKey, connection, loadAllPlanets, loadGameConfig, loadAntimatterBalance, requestVaultRecoveryPassphrase, refreshVaultBalance]);

  const withTx = async (
    label: string,
    fn: () => Promise<string | void>,
    afterTx: () => Promise<unknown> = refreshSelectedPlanetState,
  ) => {
    if (txLockRef.current || !clientRef.current) return;
    txLockRef.current = true;
    setTxBusy(true); setTxProgress(label); setError(null);
    try { await fn(); await afterTx(); }
    catch (e: any) { setError(e?.message ?? `${label} failed`); }
    finally {
      txLockRef.current = false;
      setTxBusy(false);
      setTxProgress("Processing...");
    }
  };

  const handleFinishBuild = useCallback(async () => {
    if (!clientRef.current || !state) return;
    const latestState = await refreshSelectedPlanetState();
    if (!latestState || latestState.planet.buildFinishTs <= 0 || latestState.planet.buildQueueItem === 255) {
      setError(null);
      return;
    }

    await withTx(
      "Finish build",
      () => clientRef.current!.finishBuild(new PublicKey(state.entityPda)),
      async () => {
        const refreshed = await refreshSelectedPlanetState();
        if (!refreshed || refreshed.planet.buildFinishTs <= 0 || refreshed.planet.buildQueueItem === 255) {
          setError(null);
        }
      },
    );
  }, [refreshSelectedPlanetState, state]);

  const handleRetryVaultPassword = async () => {
    if (!clientRef.current) return;
    setVaultActionBusy(true); setError(null);
    try {
      const ok = await clientRef.current.retryVaultPassword(setTxProgress);
      const status = await clientRef.current.getVaultStatus();
      setVaultStatus(status);
      if (ok) await refreshVaultBalance();
      else setError("Wrong password — try again or rotate the vault.");
    }
    catch (e: any) { setError(e?.message ?? "Password retry failed"); }
    finally { setVaultActionBusy(false); }
  };

  const handleForceRotateVault = async () => {
    if (!clientRef.current) return;
    setVaultActionBusy(true); setTxProgress("Rotating vault..."); setError(null);
    try { await clientRef.current.forceRotateVault(setTxProgress); setVaultStatus("ready"); await refreshVaultBalance(); }
    catch (e: any) { setError(e?.message ?? "Vault rotation failed"); }
    finally { setVaultActionBusy(false); setTxProgress("Processing..."); }
  };

  const handleTransferAllPlanets = async (newAuthority: string) => {
    if (!clientRef.current) return;
    let dest: PublicKey;
    try { dest = new PublicKey(newAuthority); } catch { setError("Invalid destination wallet address."); return; }
    setTxBusy(true); setTxProgress("Transferring planets..."); setError(null);
    try { await clientRef.current.transferAllPlanets(dest, setTxProgress); if (publicKey) await loadAllPlanets(publicKey); }
    catch (e: any) { setError(e?.message ?? "Transfer failed"); }
    finally { setTxBusy(false); setTxProgress("Processing..."); }
  };

  const handleSaveGameConfig = async () => {
    if (!clientRef.current) return;
    let mint: PublicKey;
    try { mint = new PublicKey(gameConfigMintInput); } catch { setError("Invalid ANTIMATTER mint address."); return; }
    setGameConfigBusy(true); setTxProgress(gameConfig ? "Updating game config..." : "Initializing game config..."); setError(null);
    try {
      if (gameConfig) await clientRef.current.updateAntimatterMint(mint);
      else await clientRef.current.initializeGameConfig(mint);
      await loadGameConfig();
      await loadAntimatterBalance(mint.toBase58());
    }
    catch (e: any) { setError(e?.message ?? "Game config transaction failed"); }
    finally { setGameConfigBusy(false); setTxProgress("Processing..."); }
  };

  const handleInstantFinishBuild = async () => { if (!clientRef.current || !state) return; await withTx("Instant finish build", () => clientRef.current!.accelerateBuildWithAntimatter(new PublicKey(state.entityPda)), async () => { await refreshSelectedPlanetState(); await loadAntimatterBalance(); }); };
  const handleInstantFinishResearch = async () => { if (!clientRef.current || !state) return; await withTx("Instant finish research", () => clientRef.current!.accelerateResearchWithAntimatter(new PublicKey(state.entityPda)), async () => { await refreshSelectedPlanetState(); await loadAntimatterBalance(); }); };
  const handleInstantFinishShipyard = async () => { if (!clientRef.current || !state) return; await withTx("Instant finish shipyard", () => clientRef.current!.accelerateShipBuildWithAntimatter(new PublicKey(state.entityPda)), async () => { await refreshSelectedPlanetState(); await loadAntimatterBalance(); }); };

  useEffect(() => { if (!publicKey) return; void loadAntimatterBalance().catch(() => setAntimatterBalance(0n)); }, [publicKey, gameConfig?.antimatterMint, loadAntimatterBalance]);

  const createPlanet = async () => {
    if (!clientRef.current) return;
    setError(null); setCreating(true); setCreateProgress("Preparing vault...");
    try {
      await clientRef.current.initializePlanet(planetName.trim() || "Homeworld", setCreateProgress);
      if (publicKey) {
        const loaded=await loadAllPlanets(publicKey);
        const newest=[...loaded].sort((a,b)=>b.planet.planetIndex-a.planet.planetIndex)[0];
        if(newest)setSelectedPlanetPda(newest.planetPda);
      }
    }
    catch (e: any) { setError(e?.message ?? "Failed to create planet"); }
    finally { setCreating(false); setCreateProgress(""); }
  };

  const handleLaunch = async (ships: Record<string, number>, cargo: { metal: bigint; crystal: bigint; deuterium: bigint }, missionType: number, speedFactor: number, target: LaunchTargetInput) => {
    if (!clientRef.current || !state) return;
    let launchTarget: { galaxy: number; system: number; position: number; colonyName?: string };
    if (target.kind === "transport") {
      if (target.mode === "owned") { const dest=planets.find(p=>p.entityPda===target.destinationEntity); if(!dest)throw new Error("Destination planet not found."); launchTarget={galaxy:dest.planet.galaxy,system:dest.planet.system,position:dest.planet.position}; }
      else {
        const free=await clientRef.current.isCoordFree(target.galaxy,target.system,target.position);
        if(free)throw new Error(`Transport missions can only target occupied planets. [${target.galaxy}:${target.system}:${target.position}] is empty.`);
        launchTarget={galaxy:target.galaxy,system:target.system,position:target.position};
      }
    } else {
      const free=await clientRef.current.isCoordFree(target.galaxy,target.system,target.position);
      if(!free)throw new Error(`Slot [${target.galaxy}:${target.system}:${target.position}] is already occupied.`);
      launchTarget={galaxy:target.galaxy,system:target.system,position:target.position,colonyName:target.colonyName};
    }
    await withTx("Launch fleet", () => clientRef.current!.launchFleet(new PublicKey(state.entityPda), {lf:ships.lightFighter,hf:ships.heavyFighter,cr:ships.cruiser,bs:ships.battleship,bc:ships.battlecruiser,bm:ships.bomber,ds:ships.destroyer,de:ships.deathstar,sc:ships.smallCargo,lc:ships.largeCargo,rec:ships.recycler,ep:ships.espionageProbe,col:ships.colonyShip}, cargo, missionType, speedFactor, launchTarget));
  };

  const checkCoordAvailability = useCallback(async (galaxy: number, system: number, position: number) => {
    return clientRef.current?.isCoordFree(galaxy, system, position) ?? true;
  }, []);

  const executeResolveColonize = async (mission: Mission, slotIdx: number) => {
    if (!clientRef.current || !state) return;
    setConfirmation(null); setTxBusy(true); setTxProgress("Step 1/2: Creating colony planet..."); setError(null);
    try {
      const { entityPda } = await clientRef.current.resolveColonize(new PublicKey(state.entityPda), mission, slotIdx, Math.floor(Date.now() / 1000), (msg) => setTxProgress(msg));
      if (publicKey) {
        const loaded=await loadAllPlanets(publicKey);
        const colony=loaded.find(p=>p.planetPda===entityPda.toBase58());
        if(colony){
          setSelectedPlanetPda(colony.planetPda);
          setTab("overview");
        }
      }
    } catch (e: any) { setError(e?.message ?? "Resolve colonize failed"); }
    finally { setTxBusy(false); setTxProgress("Processing..."); }
  };

  const liveRes = useInterpolatedResources(state?.resources, nowTs);
  const activeMissionCount = state?.fleet.missions.filter(m => m.missionType !== 0).length ?? 0;
  const vaultReady = clientRef.current?.isVaultReady() ?? false;
  const antimatterBalanceLabel = formatTokenAmount(antimatterBalance, DEFAULT_ANTIMATTER_DECIMALS);
  const antimatterEnabled = !!gameConfig;
  const visibleSecondaryTabs = hasCreatedWorld
    ? SECONDARY_TABS
    : SECONDARY_TABS.filter(t => t.id !== "market");
  const visibleDesktopTabs: Tab[] = ["overview","resources","buildings","research","shipyard","fleet","missions","galaxy","market"]
    .filter(t => hasCreatedWorld || t !== "market") as Tab[];
  const controllerTabs = isMobile
    ? [...PRIMARY_TABS.map(entry => entry.id), ...visibleSecondaryTabs.map(entry => entry.id)]
    : visibleDesktopTabs;

  const cycleTab = useCallback((direction: 1 | -1) => {
    if (controllerTabs.length === 0) return;
    const currentIndex = controllerTabs.indexOf(tab);
    const baseIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (baseIndex + direction + controllerTabs.length) % controllerTabs.length;
    const nextTab = controllerTabs[nextIndex];
    setTab(nextTab);
    if (isMobile && visibleSecondaryTabs.some(entry => entry.id === nextTab)) {
      setShowMoreDrawer(true);
      return;
    }
    if (showMoreDrawer) {
      setShowMoreDrawer(false);
    }
  }, [controllerTabs, isMobile, showMoreDrawer, tab, visibleSecondaryTabs]);

  const handleControllerBack = useCallback(() => {
    if (vaultPrompt) {
      handleVaultPromptCancel();
      return;
    }
    if (confirmation) {
      setConfirmation(null);
      return;
    }
    if (showLaunchModal) {
      setShowLaunchModal(false);
      setLaunchPrefill(undefined);
      return;
    }
    if (showVaultModal) {
      setShowVaultModal(false);
      return;
    }
    if (showMoreDrawer) {
      setShowMoreDrawer(false);
      return;
    }
    if (tab !== "overview") {
      setTab("overview");
    }
  }, [confirmation, handleVaultPromptCancel, showLaunchModal, showMoreDrawer, showVaultModal, tab, vaultPrompt]);

  const handleControllerMenu = useCallback(() => {
    if (showLaunchModal || confirmation || vaultPrompt) return;
    if (isMobile) {
      setShowMoreDrawer(value => !value);
      return;
    }
    setShowVaultModal(value => !value);
  }, [confirmation, isMobile, showLaunchModal, vaultPrompt]);

  usePsg1Controls({
    enabled: connected && !loading,
    onBack: handleControllerBack,
    onMenu: handleControllerMenu,
    onNextTab: () => cycleTab(1),
    onPreviousTab: () => cycleTab(-1),
  });

  // ── Market tx callbacks ───────────────────────────────────────────────────
  const handleMarketTxStart = useCallback((label: string) => {
    setTxBusy(true); setTxProgress(label); setError(null);
  }, []);

  const handleMarketTxEnd = useCallback((err?: string) => {
    setTxBusy(false); setTxProgress("Processing...");
    if (err) setError(err);
    else void Promise.all([refreshSelectedPlanetState(), loadAntimatterBalance()]).catch(() => {});
  }, [refreshSelectedPlanetState, loadAntimatterBalance]);

  // ── Galaxy launch callbacks ───────────────────────────────────────────────
  const handleGalaxyLaunchTransport = useCallback((galaxy: number, system: number, position: number) => {
    setLaunchPrefill({ galaxy, system, position, missionType: 2 });
    setShowLaunchModal(true);
  }, []);

  const handleGalaxyLaunchColonize = useCallback((galaxy: number, system: number, position: number) => {
    setLaunchPrefill({ galaxy, system, position, missionType: 5 });
    setShowLaunchModal(true);
  }, []);

  // ── Tab content renderer ──────────────────────────────────────────────────
  const renderTabContent = () => {
    if (tab === "market") {
      return (
        <MarketTab
          client={marketClientRef.current}
          state={state}
          liveRes={liveRes}
          antimatterBalance={antimatterBalance}
          onTxStart={handleMarketTxStart}
          onTxEnd={handleMarketTxEnd}
          txBusy={txBusy}
        />
      );
    }

    if (!state) return <NoPlanetView planetName={planetName} onNameChange={setPlanetName} onCreate={createPlanet} creating={creating} error={error}/>;

    switch (tab) {
      case "overview":
        return <OverviewTab state={state} res={liveRes} nowTs={nowTs} planets={planets} onSelectPlanet={setSelectedPlanetPda} onFinishBuild={handleFinishBuild} onFinishResearch={() => withTx("Finish research", () => clientRef.current!.finishResearch(new PublicKey(state.entityPda)))} onFinishShipyard={() => withTx("Finish shipyard", () => clientRef.current!.finishShipBuild(new PublicKey(state.entityPda)))} onInstantFinishBuild={handleInstantFinishBuild} onInstantFinishResearch={handleInstantFinishResearch} onInstantFinishShipyard={handleInstantFinishShipyard} antimatterBalance={antimatterBalance} antimatterEnabled={antimatterEnabled} txBusy={txBusy}/>;
      case "resources":
        return <ResourcesTab state={state} res={liveRes} nowTs={nowTs} onStartBuild={idx => withTx("Start build", () => clientRef.current!.startBuild(new PublicKey(state.entityPda), idx))} onFinishBuild={handleFinishBuild} onInstantFinishBuild={handleInstantFinishBuild} antimatterBalance={antimatterBalance} antimatterEnabled={antimatterEnabled} txBusy={txBusy} onGoBuildings={() => setTab("buildings")} onGoResearch={() => setTab("research")} />;
      case "buildings":
        return <BuildingsTab state={state} res={liveRes} nowTs={nowTs} onStartBuild={idx => withTx("Start build", () => clientRef.current!.startBuild(new PublicKey(state.entityPda), idx))} onFinishBuild={handleFinishBuild} onInstantFinishBuild={handleInstantFinishBuild} antimatterBalance={antimatterBalance} antimatterEnabled={antimatterEnabled} txBusy={txBusy} onGoBuildings={() => setTab("buildings")} onGoResearch={() => setTab("research")} />;
      case "shipyard":
        return <ShipyardTab state={state} res={liveRes} nowTs={nowTs} txBusy={txBusy} onBuildShip={(shipType, qty) => withTx("Build ship", () => clientRef.current!.buildShip(new PublicKey(state.entityPda), shipType, qty))} onFinishShipyard={() => withTx("Finish shipyard", () => clientRef.current!.finishShipBuild(new PublicKey(state.entityPda)))} onInstantFinishShipyard={handleInstantFinishShipyard} antimatterBalance={antimatterBalance} antimatterEnabled={antimatterEnabled} onGoBuildings={() => setTab("buildings")} onGoResearch={() => setTab("research")} />;
      case "fleet":
        return <FleetTab fleet={state.fleet} res={liveRes} txBusy={txBusy} onOpenLaunch={() => { setLaunchPrefill(undefined); setShowLaunchModal(true); }}/>;
      case "missions":
        return <MissionsTab fleet={state.fleet} nowTs={nowTs} txBusy={txBusy} onResolveTransport={(mission, slotIdx) => withTx("Resolve transport", () => clientRef.current!.resolveTransport(new PublicKey(state.entityPda), mission, slotIdx), async () => { if (publicKey) await loadAllPlanets(publicKey, state.planetPda); })} onResolveColonize={(mission, slotIdx) => setConfirmation({ kind: "resolveColonize", mission, slotIdx })}/>;
      case "research":
        return <ResearchTab research={state.research} res={liveRes} planet={state.planet} txBusy={txBusy} onResearch={idx => withTx("Start research", () => clientRef.current!.startResearch(new PublicKey(state.entityPda), idx))} onFinishResearch={() => withTx("Finish research", () => clientRef.current!.finishResearch(new PublicKey(state.entityPda)))} onInstantFinishResearch={handleInstantFinishResearch} antimatterBalance={antimatterBalance} antimatterEnabled={antimatterEnabled} onGoBuildings={() => setTab("buildings")} onGoResearch={() => setTab("research")} />;
      case "galaxy":
        return (
          <GalaxyTab
            client={clientRef.current}
            currentPlanet={state.planet}
            ownedPlanets={planets}
            txBusy={txBusy}
            onLaunchTransport={handleGalaxyLaunchTransport}
            onLaunchColonize={handleGalaxyLaunchColonize}
          />
        );
      default:
        return null;
    }
  };

  const handleMobileTabClick = (t: Tab) => { setTab(t); setShowMoreDrawer(false); };

  const ALL_DESKTOP_TABS: Tab[] = ["overview","resources","buildings","research","shipyard","fleet","missions","galaxy","market"];
  const DESKTOP_TAB_ICONS: Record<Tab, string> = {
    overview:"◈", resources:"⛏", buildings:"⬡", research:"🔬",
    shipyard:"🚀", fleet:"◉", missions:"⊹", galaxy:"🌌", market:"⚖",
  };

  // Vault button label: show SOL balance if known
  const vaultButtonLabel = vaultBalance > 0n
    ? `⚿ ${formatSolBalance(vaultBalance)} SOL`
    : "⚿ VAULT";
  const activeTheme = getPlanetTheme(state?.planet);
  const shellStyle = {
    "--planet-accent": activeTheme.accent,
    "--planet-nebula": activeTheme.nebulaGradient,
  } as React.CSSProperties;

  return (
    <>
      <style>{CSS}</style>
      <Starfield/>
      <LoadingOverlay visible={(txBusy || creating || gameConfigBusy) && !vaultPrompt} message={creating ? createProgress : txProgress}/>

      {!connected && <LandingScreen isMobile={isMobile}/>}
      {connected && loading && <ConnectingScreenPanel/>}

      {/* ── DESKTOP ── */}
      {connected && !loading && !isMobile && (
        <div className="app">
          <header className="header" style={{ background: activeTheme.headerGradient, position: "relative" }}>
            <div className="logo-area">
              <div className="header-cluster">
                <LogoSVG size={28}/>
              </div>
            </div>
            <div className="header-right">
              <div className="header-cluster">
                <span className="chain-tag">DEVNET</span>
                <button className="vault-tag" onClick={() => setShowVaultModal(true)} type="button">
                  {vaultButtonLabel}
                </button>
                <span className="token-badge">
                  <span className="token-badge-icon"><AntimatterIcon size={14}/></span>
                  <span className="token-badge-amount">{antimatterBalanceLabel}</span>
                  <span className="token-badge-label">ANTIMATTER</span>
                </span>
              </div>
              <WalletConnectControl/>
            </div>
          </header>
          <aside className="sidebar sidebar-shell" style={{ ...shellStyle, background: activeTheme.sidebarGradient }}>
            {state ? (<>
              <div className="sidebar-top-offset" />
              {false && liveRes && (
                <div className="res-panel shell-panel">
                  <div className="res-label">Resources</div>
                  <div className="resource-grid">
                    <ResRow color="var(--metal)" label="Metal" value={liveRes!.metal} cap={liveRes!.metalCap} rate={liveRes!.metalHour}/>
                    <ResRow color="var(--crystal)" label="Crystal" value={liveRes!.crystal} cap={liveRes!.crystalCap} rate={liveRes!.crystalHour}/>
                    <ResRow color="var(--deut)" label="Deuterium" value={liveRes!.deuterium} cap={liveRes!.deuteriumCap} rate={liveRes!.deuteriumHour}/>
                  </div>
                  <div className="energy-row">
                    <span style={{color:"var(--dim)",fontSize:10,letterSpacing:1}}>⚡ ENERGY</span>
                    <span style={{fontSize:11,fontWeight:600,color:energyEfficiency(liveRes!)>=100?"var(--success)":energyEfficiency(liveRes!)>=60?"var(--warn)":"var(--danger)"}}>
                      {fmt(liveRes!.energyProduction)}/{fmt(liveRes!.energyConsumption)} ({energyEfficiency(liveRes!)}%)
                    </span>
                  </div>
                </div>
              )}
              <nav className="nav shell-panel">
                {visibleDesktopTabs.map(t => (
                  <div
                    key={t}
                    className={`nav-item${tab===t?" active":""}`}
                    onClick={() => setTab(t)}
                    tabIndex={0}
                    role="button"
                    data-psg1-focusable="true"
                    aria-pressed={tab===t}
                  >
                    {DESKTOP_TAB_ICONS[t]} {t.charAt(0).toUpperCase()+t.slice(1)}
                    {t==="missions"&&activeMissionCount>0&&<span className="nav-badge">{activeMissionCount}</span>}
                  </div>
                ))}
                {planets.length > 1 && (<>
                  <div style={{padding:"12px 16px 4px",fontSize:"9px",letterSpacing:"2px",color:"var(--dim)",textTransform:"uppercase"}}>Planets</div>
                  {planets.map(p => (
                    <div
                      key={p.planetPda}
                      className={`nav-item${p.planetPda===state.planetPda?" active":""}`}
                      onClick={() => setSelectedPlanetPda(p.planetPda)}
                      style={{paddingLeft:24}}
                      tabIndex={0}
                      role="button"
                      data-psg1-focusable="true"
                      aria-pressed={p.planetPda===state.planetPda}
                    >
                      🪐 {p.planet.name||`Planet ${p.planet.planetIndex+1}`}
                    </div>
                  ))}
                </>)}
              </nav>
            </>) : (
              <nav className="nav" />
            )}
          </aside>
          <main className="main main-shell" style={{position:"relative",zIndex:1, background: activeTheme.panelGradient}}>
            <div className="desktop-tab-chrome">
              {state && liveRes && <div className="desktop-resource-shell"><DesktopResourceMenu res={liveRes} planet={state.planet} /></div>}
              <GameConfigAdminCard visible={!!isDevConfigAdmin} config={gameConfig} mintInput={gameConfigMintInput} onMintInputChange={setGameConfigMintInput} onSubmit={handleSaveGameConfig} busy={gameConfigBusy || txBusy}/>
              {error && <div className="shell-error">{error}</div>}
              <div className="desktop-tab-body">
                {renderTabContent()}
              </div>
            </div>
          </main>
        </div>
      )}

      {/* ── MOBILE ── */}
      {connected && !loading && isMobile && (
        <div className="app-mobile">
          <div className="mobile-header" style={{ background: activeTheme.headerGradient }}>
            <div className="mobile-header-left">
              <LogoSVG size={22}/>
            </div>
            <div className="mobile-header-right">
              <span className="token-badge mobile-token-badge">
                <span className="token-badge-icon"><AntimatterIcon size={12}/></span>
                <span className="token-badge-amount">{antimatterBalanceLabel}</span>
              </span>
              <button className="vault-tag" onClick={() => setShowVaultModal(true)} type="button" style={{fontSize:9,padding:"3px 7px"}}>
                {vaultBalance > 0n ? `⚿ ${formatSolBalance(vaultBalance)}` : "⚿"}
              </button>
              <WalletConnectControl/>
            </div>
          </div>
          {state && liveRes && <MobileResStrip res={liveRes} planet={state.planet}/>}
          <div className="mobile-main">
            <GameConfigAdminCard visible={!!isDevConfigAdmin} config={gameConfig} mintInput={gameConfigMintInput} onMintInputChange={setGameConfigMintInput} onSubmit={handleSaveGameConfig} busy={gameConfigBusy || txBusy}/>
            {error && <div className="shell-error">{error}</div>}
            {renderTabContent()}
          </div>
          {showMoreDrawer && (
            <>
              <div style={{position:"fixed",inset:0,zIndex:44,background:"rgba(0,0,0,0.4)"}} onClick={() => setShowMoreDrawer(false)}/>
              <div className="mobile-more-drawer">
                <div className="mobile-more-grid">
                  {visibleSecondaryTabs.map(t => (
                    <div
                      key={t.id}
                      className={`mobile-more-item${tab===t.id?" active":""}`}
                      onClick={() => handleMobileTabClick(t.id)}
                      tabIndex={0}
                      role="button"
                      data-psg1-focusable="true"
                      aria-pressed={tab===t.id}
                    >
                      <span className="mobile-more-icon">{t.icon}</span>
                      <span className={`mobile-more-label${tab===t.id?" active":""}`}>{t.label}</span>
                    </div>
                  ))}
                  {planets.length > 1 && planets.map(p => (
                    <div
                      key={p.planetPda}
                      className={`mobile-more-item${p.planetPda===state?.planetPda?" active":""}`}
                      onClick={() => { setSelectedPlanetPda(p.planetPda); setShowMoreDrawer(false); }}
                      tabIndex={0}
                      role="button"
                      data-psg1-focusable="true"
                      aria-pressed={p.planetPda===state?.planetPda}
                    >
                      <span className="mobile-more-icon">🪐</span>
                      <span className={`mobile-more-label${p.planetPda===state?.planetPda?" active":""}`}>{(p.planet.name||"Planet").slice(0,8)}</span>
                    </div>
                  ))}
                </div>
                <div className="mobile-drawer-close" onClick={() => setShowMoreDrawer(false)} tabIndex={0} role="button" data-psg1-focusable="true">▼ CLOSE</div>
              </div>
            </>
          )}
          <div className="mobile-bottom-bar">
            {PRIMARY_TABS.map(t => (
              <button key={t.id} className={`mobile-nav-btn${tab===t.id?" active":""}`} onClick={() => handleMobileTabClick(t.id)}>
                {t.id==="missions"&&activeMissionCount>0&&<span className="mobile-nav-badge">{activeMissionCount}</span>}
                <span className="mobile-nav-icon">{t.icon}</span>
                <span className="mobile-nav-label">{t.label}</span>
              </button>
            ))}
            <button className={`mobile-nav-btn${visibleSecondaryTabs.some(t=>t.id===tab)||showMoreDrawer?" active":""}`} onClick={() => setShowMoreDrawer(v => !v)}>
              <span className="mobile-nav-icon">···</span>
              <span className="mobile-nav-label">More</span>
            </button>
          </div>
        </div>
      )}

      {/* ── SHARED MODALS ── */}
      {showLaunchModal && state && liveRes && (
        <LaunchModal
          fleet={state.fleet}
          res={liveRes}
          ownedPlanets={planets}
          currentPlanetPda={state.planetPda}
          onClose={() => { setShowLaunchModal(false); setLaunchPrefill(undefined); }}
          onLaunch={handleLaunch}
          txBusy={txBusy}
          onCheckCoord={checkCoordAvailability}
          prefillTarget={launchPrefill}
        />
      )}

      <ConfirmationModal isOpen={confirmation !== null} onClose={() => setConfirmation(null)} onConfirm={() => { if (confirmation?.kind === "resolveColonize") void executeResolveColonize(confirmation.mission, confirmation.slotIdx); }} title="RESOLVE COLONIZE" lines={["The vault will sign all steps — no wallet popup needed.","-  Step 1: Create colony planet account (vault pays rent)","-  Step 2: Resolve mission and clear mission slot"]} confirmLabel="RESOLVE COLONY" disabled={txBusy}/>

      <VaultManagerModal
        open={showVaultModal}
        onClose={() => setShowVaultModal(false)}
        vaultReady={vaultReady}
        vaultStatus={vaultStatus}
        vaultAddress={clientRef.current?.getVaultPublicKey()?.toBase58() ?? null}
        vaultBalance={vaultBalance}
        useVaultSigning={useVaultSigning}
        onToggleSigning={setUseVaultSigning}
        depositAmount={depositAmount}
        onDepositAmountChange={setDepositAmount}
        onDeposit={handleDepositVault}
        withdrawAmount={withdrawAmount}
        onWithdrawAmountChange={setWithdrawAmount}
        onWithdraw={handleWithdrawVault}
        onRetryPassword={handleRetryVaultPassword}
        onForceRotate={handleForceRotateVault}
        onTransferAllPlanets={handleTransferAllPlanets}
        busy={vaultActionBusy || txBusy}
        onRefreshBalance={refreshVaultBalance}
      />

      <VaultRecoveryModal request={vaultPrompt} busy={vaultPromptBusy} error={vaultPromptError} onCancel={handleVaultPromptCancel} onSubmit={handleVaultPromptSubmit}/>
    </>
  );
};

export default App;
