import { Canvas } from "@react-three/fiber";
import { ArcballControls, Stars, Text, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { Activity, Building2, ChevronLeft, Crosshair, FlaskConical, Gem, Hammer, Pickaxe, Rocket, Scale, Shield, ShoppingCart, Trophy, Users, X, Zap } from "lucide-react";
import { ALLIANCE_CREATE_ANTIMATTER_COST, ALLIANCE_CREATE_USDC_COST, BUILDINGS, EXPLORER_CLUSTER, NETWORK_LABEL, SHIPS, SHIP_TYPE_IDX, energyEfficiency, upgradeCost, type AllianceJoinRequestAccount, type AllianceMembershipAccount, type AllianceStateAccount, type AllianceTreasuryStateAccount, type BattleResolvedEventRecord, type EspionageReportEventRecord, type GameClient, type PlayerState, type QuestProgressStateAccount, type QuestRewardTargetStateAccount, type QuestStateAccount, type StoreConfigState, type StorePurchaseStateAccount } from "./game-state";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletDisconnectButton, WalletModalButton, useWalletModal } from "@solana/wallet-adapter-react-ui";
import { activeQuestDefinitions, allianceBuildingCost, ALLIANCE_BUILDINGS, ALLIANCE_DEPOSIT_DEFINITIONS, hasQuestBit, questClaimedMask, questGroupResetSeconds, questRewardTargetForRequirement, STORE_PACKS, storePurchasedMask, tutorialQuestsComplete, type QuestDefinition } from "./App";
import gamesolMark from "./assets/ui/logobg.png";
import usdcCoin from "./assets/ui/usdc.svg";
import "./planet-world.css";
import "./planet-world-extra.css";
import "./planet-world-local.css";
import { resolveGameArt } from "./ui-art";
import type { MarketClient } from "./market-client";
import MarketTab from "./Markettab";
import { BUILDING_REQUIREMENTS } from "./combat-engine";
import { planetSurfaceStyle, type PlanetSurfaceStyle } from "./planet-style";
const MODEL_ROOT = "/planet-models/quaternius";

function terrainSignal(normal: THREE.Vector3): number {
  return Math.sin(normal.x * 4.8 + normal.z * 3.4) + Math.sin(normal.y * 7.6 - normal.x * 2.3) * .55 + Math.cos(normal.z * 9.2) * .3 + facilityLandInfluence(normal) * .72;
}

function terrainRadius(normal: THREE.Vector3): number {
  const continent = terrainSignal(normal);
  return 5.72 + Math.max(0, continent - .42) * .24 + Math.max(0, continent - .05) * .055;
}

function facilityLandInfluence(normal: THREE.Vector3): number {
  let strongest = 0;
  for (const [latitude, longitude] of FACILITY_SPOTS) {
    const site = new THREE.Vector3(
      Math.cos(latitude) * Math.sin(longitude),
      Math.sin(latitude),
      Math.cos(latitude) * Math.cos(longitude),
    );
    const dot = normal.dot(site);
    const influence = THREE.MathUtils.smoothstep(dot, .82, .985);
    strongest = Math.max(strongest, influence);
  }
  return strongest;
}

type FacilityBlueprint = {
  base: string;
  core: string;
  detail: string;
  baseScale: number;
  coreScale: number;
  detailScale: number;
  yaw: number;
  baseTint: string;
  coreTint: string;
  detailTint: string;
};

const FACILITY_BLUEPRINTS: FacilityBlueprint[] = [
  { base: "Platforms/Platform_DarkPlates.gltf", core: "Columns/Column_Pipes.gltf", detail: "Props/Prop_Vent_Big.gltf", baseScale: .20, coreScale: .14, detailScale: .16, yaw: -.35, baseTint: "#253846", coreTint: "#627d89", detailTint: "#c2803c" },
  { base: "Platforms/Platform_Metal2_Curve.gltf", core: "Columns/Column_Astra.gltf", detail: "Props/Prop_Light_Wide.gltf", baseScale: .21, coreScale: .15, detailScale: .17, yaw: .42, baseTint: "#183944", coreTint: "#47bce0", detailTint: "#a9efff" },
  { base: "Platforms/Platform_Round1.gltf", core: "Columns/Column_Round.gltf", detail: "Props/Prop_Computer.gltf", baseScale: .20, coreScale: .13, detailScale: .17, yaw: -.55, baseTint: "#183f42", coreTint: "#4db8a1", detailTint: "#94ebd4" },
  { base: "Platforms/Platform_Squares.gltf", core: "Columns/Column_Simple.gltf", detail: "Props/Prop_Light_Floor.gltf", baseScale: .22, coreScale: .15, detailScale: .18, yaw: .2, baseTint: "#4d3c21", coreTint: "#d6a541", detailTint: "#fff1a3" },
  { base: "Platforms/Platform_Metal_Curve.gltf", core: "Columns/Column_Hollow.gltf", detail: "Props/Prop_Fan_Small.gltf", baseScale: .21, coreScale: .15, detailScale: .18, yaw: -.2, baseTint: "#27304f", coreTint: "#6e78dc", detailTint: "#a8b4ff" },
  { base: "Platforms/Platform_3Plates.gltf", core: "Columns/Column_Large_Straight.gltf", detail: "Props/Prop_AccessPoint.gltf", baseScale: .21, coreScale: .14, detailScale: .16, yaw: .65, baseTint: "#293746", coreTint: "#5d8fac", detailTint: "#8ee6ff" },
  { base: "Platforms/Platform_Rails_4.gltf", core: "Columns/Column_MetalSupport.gltf", detail: "Props/Prop_Cable_3.gltf", baseScale: .19, coreScale: .15, detailScale: .20, yaw: -.7, baseTint: "#402f4f", coreTint: "#a76add", detailTint: "#e2b5ff" },
  { base: "Platforms/Platform_Metal.gltf", core: "Platforms/Door_Frame_SquareTall.gltf", detail: "Props/Prop_Rail_4.gltf", baseScale: .23, coreScale: .20, detailScale: .19, yaw: .25, baseTint: "#31424b", coreTint: "#8babb8", detailTint: "#d9edf0" },
  { base: "Platforms/Platform_Simple2.gltf", core: "Props/Prop_Barrel_Large.gltf", detail: "Props/Prop_Crate4.gltf", baseScale: .21, coreScale: .16, detailScale: .15, yaw: -.45, baseTint: "#3a4148", coreTint: "#7b8790", detailTint: "#c0c8cd" },
  { base: "Platforms/Platform_Simple2_Curve.gltf", core: "Props/Prop_Chest.gltf", detail: "Props/Prop_Light_Small.gltf", baseScale: .21, coreScale: .21, detailScale: .16, yaw: .55, baseTint: "#253c52", coreTint: "#6397be", detailTint: "#9ce7ff" },
  { base: "Platforms/Platform_DarkPlates_Curves.gltf", core: "Props/Prop_Barrel_Large.gltf", detail: "Props/Prop_Vent_Wide.gltf", baseScale: .20, coreScale: .16, detailScale: .16, yaw: -.1, baseTint: "#274145", coreTint: "#6c8b80", detailTint: "#90dcb9" },
  { base: "Platforms/Platform_CenterPlate_Curve.gltf", core: "Columns/Column_Astra.gltf", detail: "Props/Prop_Computer.gltf", baseScale: .20, coreScale: .14, detailScale: .17, yaw: .7, baseTint: "#29334c", coreTint: "#9a79cb", detailTint: "#cdb9ff" },
  { base: "Platforms/Platform_Round1.gltf", core: "Columns/Column_Pipes.gltf", detail: "Props/Prop_Light_Corner.gltf", baseScale: .20, coreScale: .13, detailScale: .17, yaw: -.65, baseTint: "#293d47", coreTint: "#4f9eae", detailTint: "#83e8f6" },
];

const FACILITY_SPOTS: Array<[number, number]> = [
  [.98, -1.72], [.62, -.72], [1.15, .12], [.48, 1.22], [.95, 2.1],
  [.08, -1.18], [-.42, -.45], [.12, .15], [-.55, .78], [-.08, 1.7],
  [-1.06, -1.63], [-.86, -.82], [-1.16, .56],
];

const RESEARCH = [
  { name: "Energy Technology", key: "energyTech", desc: "Raises Fusion Reactor energy output by 10%.", cost: [0, 800, 400] },
  { name: "Combustion Drive", key: "combustionDrive", desc: "Improves travel speed for combustion-drive ships.", cost: [400, 0, 600] },
  { name: "Impulse Drive", key: "impulseDrive", desc: "Improves travel speed for impulse-drive ships.", cost: [2000, 4000, 600] },
  { name: "Hyperspace Drive", key: "hyperspaceDrive", desc: "Improves travel speed for hyperspace-drive ships.", cost: [10000, 20000, 6000] },
  { name: "Computer Technology", key: "computerTech", desc: "Advances toward additional usable mission slots.", cost: [0, 400, 600] },
  { name: "Astrophysics", key: "astrophysics", desc: "Advances colonization capacity and colony requirements.", cost: [4000, 2000, 1000] },
  { name: "Intergalactic Research Network", key: "igrNetwork", desc: "Increases the research-network level and laboratory requirements.", cost: [240000, 400000, 160000] },
  { name: "Weapons Technology", key: "weaponsTechnology", desc: "Increases weapons effectiveness for ships and defenses.", cost: [800, 200, 0] },
  { name: "Shielding Technology", key: "shieldingTechnology", desc: "Increases shielding effectiveness for ships and defenses.", cost: [200, 600, 0] },
  { name: "Armor Technology", key: "armorTechnology", desc: "Increases armor effectiveness for ships and defenses.", cost: [1000, 0, 0] },
] as const;

const DEFENSE = [
  { name: "Rocket Launcher", key: "rocketLauncher", cost: [2000, 0, 0] },
  { name: "Light Laser", key: "lightLaser", cost: [1500, 500, 0] },
  { name: "Heavy Laser", key: "heavyLaser", cost: [6000, 2000, 0] },
  { name: "Gauss Cannon", key: "gaussCannon", cost: [20000, 15000, 2000] },
  { name: "Ion Cannon", key: "ionCannon", cost: [2000, 6000, 0] },
  { name: "Plasma Turret", key: "plasmaTurret", cost: [50000, 50000, 30000] },
  { name: "Small Shield Dome", key: "smallShieldDome", cost: [10000, 10000, 0] },
  { name: "Large Shield Dome", key: "largeShieldDome", cost: [50000, 50000, 0] },
  { name: "Anti-Ballistic Missile", key: "antiBallisticMissile", cost: [8000, 0, 2000] },
  { name: "Interplanetary Missile", key: "interplanetaryMissile", cost: [12500, 2500, 5000] },
] as const;

// Mirrors the proven launch safety rules in the preserved legacy App fleet modal.
const ATTACK_LAUNCH_COOLDOWN_SECONDS = 60;
const TARGET_ATTACK_COOLDOWN_SECONDS = 30 * 60;
const MIN_ATTACK_COMBAT_POINTS = 1_000;
const MAX_U64 = (1n << 64n) - 1n;

function storageCapacityAtLevel(level: number): bigint {
  const safeLevel = Math.max(0, Math.min(255, Math.floor(level)));
  const capacity = 10_000n * (1n << BigInt(safeLevel));
  return capacity > MAX_U64 ? MAX_U64 : capacity;
}

const SHIP_COMBAT_POINTS: Record<string, number> = { lightFighter: 50, heavyFighter: 150, cruiser: 400, battleship: 1_000, battlecruiser: 700, bomber: 1_000, destroyer: 2_000, deathstar: 200_000, smallCargo: 5, largeCargo: 5, recycler: 1, espionageProbe: 1, colonyShip: 50 };
const SHIP_FUEL: Record<string, number> = { smallCargo: 10, largeCargo: 50, lightFighter: 20, heavyFighter: 75, cruiser: 300, battleship: 500, battlecruiser: 250, bomber: 1_000, destroyer: 1_000, deathstar: 1, recycler: 300, espionageProbe: 1, colonyShip: 1_000 };

function missionFuelCost(ships: Record<string, number>, speedFactor: number): number {
  const baseFuel = Object.entries(ships).reduce((total, [key, quantity]) => total + (SHIP_FUEL[key] ?? 0) * Math.max(0, quantity), 0);
  if (baseFuel <= 0) return 0;
  const speed = Math.max(10, Math.min(100, speedFactor));
  return Math.max(1, Math.floor((baseFuel * speed ** 2) / 10_000));
}

type RequirementRow = { label: string; current: number; required: number };

const RESEARCH_LAB_REQUIREMENTS: Record<string, RequirementRow[]> = {
  energyTech: [{ label: "Research Lab", current: 0, required: 1 }],
  combustionDrive: [{ label: "Research Lab", current: 0, required: 1 }, { label: "Energy Technology", current: 0, required: 1 }],
  impulseDrive: [{ label: "Research Lab", current: 0, required: 5 }, { label: "Energy Technology", current: 0, required: 1 }],
  hyperspaceDrive: [{ label: "Research Lab", current: 0, required: 7 }],
  computerTech: [{ label: "Research Lab", current: 0, required: 1 }],
  astrophysics: [{ label: "Research Lab", current: 0, required: 3 }, { label: "Impulse Drive", current: 0, required: 3 }],
  igrNetwork: [{ label: "Research Lab", current: 0, required: 10 }, { label: "Computer Technology", current: 0, required: 8 }],
  weaponsTechnology: [{ label: "Research Lab", current: 0, required: 4 }],
  shieldingTechnology: [{ label: "Research Lab", current: 0, required: 6 }, { label: "Energy Technology", current: 0, required: 3 }],
  armorTechnology: [{ label: "Research Lab", current: 0, required: 2 }],
};

const SHIP_REQUIREMENTS: Record<string, Array<[string, string, number]>> = {
  smallCargo: [["Shipyard", "shipyard", 2], ["Combustion Drive", "combustionDrive", 2]],
  largeCargo: [["Shipyard", "shipyard", 4], ["Combustion Drive", "combustionDrive", 6]],
  lightFighter: [["Shipyard", "shipyard", 1]],
  heavyFighter: [["Shipyard", "shipyard", 3], ["Armor Technology", "armorTechnology", 2], ["Impulse Drive", "impulseDrive", 2]],
  cruiser: [["Shipyard", "shipyard", 5], ["Impulse Drive", "impulseDrive", 4]],
  battleship: [["Shipyard", "shipyard", 7], ["Hyperspace Drive", "hyperspaceDrive", 4]],
  battlecruiser: [["Shipyard", "shipyard", 8], ["Hyperspace Drive", "hyperspaceDrive", 5], ["Computer Technology", "computerTech", 5], ["Weapons Technology", "weaponsTechnology", 5]],
  bomber: [["Shipyard", "shipyard", 8], ["Impulse Drive", "impulseDrive", 6], ["Hyperspace Drive", "hyperspaceDrive", 5], ["Weapons Technology", "weaponsTechnology", 5]],
  destroyer: [["Shipyard", "shipyard", 9], ["Hyperspace Drive", "hyperspaceDrive", 6], ["Armor Technology", "armorTechnology", 6]],
  deathstar: [["Shipyard", "shipyard", 12], ["Hyperspace Drive", "hyperspaceDrive", 7], ["Weapons Technology", "weaponsTechnology", 10], ["Energy Technology", "energyTech", 12]],
  recycler: [["Shipyard", "shipyard", 4], ["Combustion Drive", "combustionDrive", 6], ["Shielding Technology", "shieldingTechnology", 2]],
  espionageProbe: [["Shipyard", "shipyard", 3], ["Combustion Drive", "combustionDrive", 3]],
  colonyShip: [["Shipyard", "shipyard", 4], ["Impulse Drive", "impulseDrive", 3], ["Astrophysics", "astrophysics", 4]],
  solarSatellite: [["Shipyard", "shipyard", 1]],
};

const DEFENSE_REQUIREMENTS: Record<string, Array<[string, string, number]>> = {
  rocketLauncher: [["Shipyard", "shipyard", 1]],
  lightLaser: [["Shipyard", "shipyard", 2]],
  heavyLaser: [["Shipyard", "shipyard", 4]],
  gaussCannon: [["Shipyard", "shipyard", 6], ["Weapons Technology", "weaponsTechnology", 3]],
  ionCannon: [["Shipyard", "shipyard", 4], ["Shielding Technology", "shieldingTechnology", 2]],
  plasmaTurret: [["Shipyard", "shipyard", 8], ["Shielding Technology", "shieldingTechnology", 8], ["Weapons Technology", "weaponsTechnology", 10], ["Energy Technology", "energyTech", 8]],
  smallShieldDome: [["Shipyard", "shipyard", 1], ["Shielding Technology", "shieldingTechnology", 2]],
  largeShieldDome: [["Shipyard", "shipyard", 1], ["Shielding Technology", "shieldingTechnology", 6]],
  antiBallisticMissile: [["Shipyard", "shipyard", 1], ["Missile Silo", "missileSilo", 1]],
  interplanetaryMissile: [["Shipyard", "shipyard", 1], ["Missile Silo", "missileSilo", 1]],
};

const FLEET_LAUNCH_KEY: Record<string, "sc" | "lc" | "lf" | "hf" | "cr" | "bs" | "bc" | "bm" | "ds" | "de" | "rec" | "ep" | "col"> = {
  smallCargo: "sc", largeCargo: "lc", lightFighter: "lf", heavyFighter: "hf", cruiser: "cr", battleship: "bs", battlecruiser: "bc", bomber: "bm", destroyer: "ds", deathstar: "de", recycler: "rec", espionageProbe: "ep", colonyShip: "col",
};

const NEXT_BUILDING_EFFECT: Record<string, string> = {
  metalMine: "Increases metal production from this world.", crystalMine: "Increases crystal production from this world.", deuteriumSynthesizer: "Increases deuterium production from this world.", solarPlant: "Increases available energy.", fusionReactor: "Increases energy generated from deuterium.", roboticsFactory: "Reduces construction time across this world.", naniteFactory: "Greatly reduces construction time across this world.", shipyard: "Expands ship and defense production capacity.", metalStorage: "Increases the metal resource cap.", crystalStorage: "Increases the crystal resource cap.", deuteriumTank: "Increases the deuterium resource cap.", researchLab: "Enables higher research requirements.", missileSilo: "Expands missile infrastructure capacity.",
};

function FacilityAsset({ url, scale, tint, position, rotation = [0, 0, 0] }: { url: string; scale: number; tint: string; position?: [number, number, number]; rotation?: [number, number, number] }) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const material = Array.isArray(node.material) ? node.material[0] : node.material;
      if (!material) return;
      const nextMaterial = material.clone();
      if ("color" in nextMaterial && nextMaterial.color instanceof THREE.Color) nextMaterial.color.multiply(new THREE.Color(tint));
      if ("metalness" in nextMaterial) nextMaterial.metalness = Math.max(.35, nextMaterial.metalness ?? 0);
      if ("roughness" in nextMaterial) nextMaterial.roughness = Math.min(.52, nextMaterial.roughness ?? .8);
      node.material = nextMaterial;
    });
    return clone;
  }, [scene, tint]);
  return <primitive object={model} scale={scale} position={position} rotation={rotation} />;
}

function FacilityDressing({ index }: { index: number }) {
  const blueprint = FACILITY_BLUEPRINTS[index];
  if (!blueprint) return null;
  const root = `${MODEL_ROOT}/`;
  return <group rotation={[0, blueprint.yaw, 0]}>
    <Suspense fallback={null}>
      <FacilityAsset url={`${root}${blueprint.base}`} scale={blueprint.baseScale} tint={blueprint.baseTint} position={[0, .015, 0]} />
    </Suspense>
  </group>;
}

function FacilityLandmark({ index, level }: { index: number; level: number }) {
  const scale = 1.26 + Math.min(level, 12) * .055;
  const metal = <meshStandardMaterial color="#1c3848" metalness={.78} roughness={.26} />;
  const trim = <meshStandardMaterial color="#8ec9d6" metalness={.72} roughness={.2} />;
  const cyan = <meshStandardMaterial color="#34cdf4" emissive="#087d9c" emissiveIntensity={1.5} metalness={.35} roughness={.18} />;
  const amber = <meshStandardMaterial color="#ffc35b" emissive="#915007" emissiveIntensity={1.2} metalness={.2} roughness={.24} />;
  const green = <meshStandardMaterial color="#58dca0" emissive="#08734d" emissiveIntensity={1} metalness={.25} roughness={.24} />;
  const violet = <meshStandardMaterial color="#b18dff" emissive="#4e2c9b" emissiveIntensity={1} metalness={.28} roughness={.22} />;
  const common = { castShadow: true, receiveShadow: true };
  if (index === 0) return <group scale={scale}><mesh {...common} position={[0,.12,0]}><boxGeometry args={[.82,.2,.52]} />{metal}</mesh><mesh {...common} position={[0,.32,-.04]} rotation={[0,0,-.36]}><boxGeometry args={[.12,.58,.13]} />{trim}</mesh><mesh {...common} position={[.13,.6,-.04]} rotation={[0,0,1.08]}><boxGeometry args={[.1,.62,.11]} />{trim}</mesh><mesh {...common} position={[.38,.8,-.04]} rotation={[0,0,-.3]}><boxGeometry args={[.52,.1,.12]} />{metal}</mesh><mesh {...common} position={[.58,.67,-.04]}><coneGeometry args={[.13,.26,7]} />{amber}</mesh>{[-.28,.28].map((x) => <mesh {...common} key={x} position={[x,.02,.2]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[.12,.12,.14,10]} />{trim}</mesh>)}</group>;
  if (index === 1) return <group scale={scale}><mesh {...common} position={[0,.08,0]}><cylinderGeometry args={[.5,.58,.16,10]} />{metal}</mesh>{[[-.22,.38,.04],[.06,.62,.1],[.3,.36,-.08],[-.08,.34,-.26]].map((point, key) => <mesh {...common} key={key} position={point as [number,number,number]} rotation={[.15 * key,.4 * key,.1]}><octahedronGeometry args={[.2 + key*.04,0]} />{cyan}</mesh>)}<mesh position={[0,.12,.34]}><boxGeometry args={[.56,.06,.05]} />{trim}</mesh></group>;
  if (index === 2) return <group scale={scale}>{[-.26,0,.26].map((x) => <group key={x}><mesh {...common} position={[x,.3,0]}><cylinderGeometry args={[.14,.18,.58,14]} />{metal}</mesh><mesh {...common} position={[x,.62,0]}><sphereGeometry args={[.15,16,12]} />{green}</mesh><mesh {...common} position={[x,.9,0]}><cylinderGeometry args={[.035,.045,.2,8]} />{trim}</mesh></group>)}<mesh {...common} position={[0,.1,.27]}><boxGeometry args={[.88,.14,.18]} />{trim}</mesh></group>;
  if (index === 3) return <group scale={scale}><mesh {...common} position={[0,.08,0]}><boxGeometry args={[1.04,.16,.7]} />{metal}</mesh>{[[-.34,.31,0],[.34,.31,0],[-.34,.31,.2],[.34,.31,.2]].map((point,key) => <group key={key} position={point as [number,number,number]} rotation={[0,0,key % 2 ? -.38 : .38]}><mesh {...common} position={[0,.13,0]}><boxGeometry args={[.34,.04,.52]} />{amber}</mesh><mesh {...common} position={[0,0,0]}><cylinderGeometry args={[.035,.05,.3,8]} />{trim}</mesh></group>)}</group>;
  if (index === 4) return <group scale={scale}><mesh {...common} position={[0,.14,0]}><cylinderGeometry args={[.52,.62,.28,16]} />{metal}</mesh>{[.32,.48,.64].map((height,key) => <mesh {...common} key={height} position={[0,height,0]} rotation={[Math.PI/2,0,0]}><torusGeometry args={[.33-key*.045,.052,12,36]} />{cyan}</mesh>)}<mesh {...common} position={[0,.78,0]}><cylinderGeometry args={[.1,.16,.3,12]} />{trim}</mesh></group>;
  if (index === 5) return <group scale={scale}><mesh {...common} position={[0,.2,0]}><boxGeometry args={[.72,.38,.58]} />{metal}</mesh>{[[-.23,.47,0],[.23,.47,0]].map((point,key) => <mesh {...common} key={key} position={point as [number,number,number]}><cylinderGeometry args={[.09,.12,.24,10]} />{cyan}</mesh>)}<mesh {...common} position={[0,.46,.18]}><boxGeometry args={[.5,.05,.05]} />{trim}</mesh></group>;
  if (index === 6) return <group scale={scale}>{[[-.25,0,-.1],[.22,0,.08],[0,0,.25]].map((point,key) => <group key={key} position={point as [number,number,number]}><mesh {...common} position={[0,.23,0]}><cylinderGeometry args={[.12,.15,.46,10]} />{metal}</mesh><mesh {...common} position={[0,.5,0]}><sphereGeometry args={[.11,12,12]} />{violet}</mesh></group>)}</group>;
  if (index === 7) return <group scale={scale}><mesh {...common} position={[0,.07,0]}><boxGeometry args={[1.05,.14,.72]} />{metal}</mesh>{[-.33,.33].map((x) => <mesh {...common} key={x} position={[x,.21,0]}><boxGeometry args={[.08,.16,.75]} />{trim}</mesh>)}<mesh {...common} position={[0,.17,.04]}><boxGeometry args={[.42,.03,.58]} />{cyan}</mesh></group>;
  if (index === 8 || index === 9 || index === 10) { const material = index === 8 ? trim : index === 9 ? cyan : green; return <group scale={scale}>{[-.18,.18].map((x) => <group key={x}><mesh {...common} position={[x,.28,0]}><cylinderGeometry args={[.16,.2,.5,12]} />{metal}</mesh><mesh {...common} position={[x,.57,0]}><sphereGeometry args={[.16,14,12]} />{material}</mesh></group>)}</group>; }
  if (index === 11) return <group scale={scale}><mesh {...common} position={[0,.11,0]}><cylinderGeometry args={[.5,.58,.2,16]} />{metal}</mesh><mesh {...common} position={[0,.32,0]}><sphereGeometry args={[.32,20,14,0,Math.PI*2,0,Math.PI/2]} />{violet}</mesh><mesh {...common} position={[0,.72,0]}><cylinderGeometry args={[.035,.05,.48,8]} />{trim}</mesh><mesh {...common} position={[0,.99,0]}><sphereGeometry args={[.08,12,12]} />{cyan}</mesh></group>;
  return null;
}

function Facility({ index, level, selected, name, onSelect }: { index: number; level: number; selected: boolean; name: string; onSelect: () => void }) {
  const [latitude, longitude] = FACILITY_SPOTS[index] ?? [0, 0];
  const normal = useMemo(() => new THREE.Vector3(
    Math.cos(latitude) * Math.sin(longitude),
    Math.sin(latitude),
    Math.cos(latitude) * Math.cos(longitude),
  ).normalize(), [latitude, longitude]);
  const orientation = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal), [normal]);
  const labelPosition: [number, number, number] = [0, 1.05, 0];
  const yaw = ((index * 1.73) + latitude * 2.4 - longitude * .7) % (Math.PI * 2);
  return <group position={normal.multiplyScalar(terrainRadius(normal) + .075)} quaternion={orientation} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
    <group rotation={[0, yaw, 0]}>
      <mesh position={[0, -.07, 0]} receiveShadow castShadow><cylinderGeometry args={[.72, .83, .12, 10]} /><meshStandardMaterial color="#122b39" roughness={.36} metalness={.8} /></mesh>
      <mesh position={[0, -.003, 0]} receiveShadow><cylinderGeometry args={[.6, .67, .035, 10]} /><meshStandardMaterial color="#376272" roughness={.3} metalness={.62} /></mesh>
      {[0, 1, 2].map((beacon) => <mesh key={beacon} position={[Math.cos(beacon * Math.PI * 2 / 3) * .57, .035, Math.sin(beacon * Math.PI * 2 / 3) * .57]}><sphereGeometry args={[.027, 8, 8]} /><meshStandardMaterial color="#62dfff" emissive="#1aa4c9" emissiveIntensity={2.2} /></mesh>)}
      <FacilityDressing index={index} />
      <FacilityLandmark index={index} level={level} />
      {selected && <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}><ringGeometry args={[0.58, 0.7, 48]} /><meshBasicMaterial color="#61dfff" transparent opacity={0.9} /></mesh>}
      {selected && <Text position={labelPosition} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.16} color="#e8fbff" anchorX="center">{`${name}  L${level}`}</Text>}
    </group>
  </group>;
}

function TerrainPlanet({ style }: { style: PlanetSurfaceStyle }) {
  const terrain = useMemo(() => {
    const geometry = new THREE.IcosahedronGeometry(5.8, 5);
    const positions = geometry.attributes.position;
    const colors = new Float32Array(positions.count * 3);
    const color = new THREE.Color();
    for (let index = 0; index < positions.count; index += 1) {
      const vector = new THREE.Vector3().fromBufferAttribute(positions, index).normalize();
      const continent = terrainSignal(vector);
      const radius = terrainRadius(vector);
      positions.setXYZ(index, vector.x * radius, vector.y * radius, vector.z * radius);
      const facilityLand = facilityLandInfluence(vector);
      if (Math.abs(vector.y) > .82) color.set(style.polar);
      else if (facilityLand > .72 || continent > .78) color.set(style.highland);
      else if (facilityLand > .2 || continent > .42) color.set(style.land);
      else if (continent > .1) color.set(style.coast);
      else color.set(style.water);
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    return geometry;
  }, [style]);
  return <><mesh geometry={terrain} receiveShadow><meshStandardMaterial vertexColors roughness={.82} metalness={.05} /></mesh><mesh scale={1.018}><sphereGeometry args={[5.8,48,32]} /><meshPhysicalMaterial color={style.atmosphere} transparent opacity={.075} roughness={.12} metalness={.1} /></mesh></>;
}

function WorldStructures({ state, selected, onSelect }: { state: PlayerState; selected: number; onSelect: (index: number) => void }) {
  const style = useMemo(() => planetSurfaceStyle(state.planet.position), [state.planet.position]);
  const buildings = useMemo(() => BUILDINGS.map((building, index) => ({
    ...building,
    index,
    level: Number((state.planet as unknown as Record<string, number>)[building.key] ?? 0),
  })), [state]);
  return <>
    <ambientLight intensity={.58} />
    <hemisphereLight color="#bfeeff" groundColor="#081522" intensity={1.6} />
    <directionalLight position={[5, 8, 10]} intensity={3.2} color="#e7f9ff" castShadow />
    <pointLight position={[-6, 2, 7]} intensity={65} color="#32bfe8" distance={24} />
    <TerrainPlanet style={style} />
    {buildings.filter((building) => building.key !== "missileSilo").map((building) => {
      return <Facility key={building.key} index={building.index} level={building.level} name={building.name} selected={building.index === selected} onSelect={() => onSelect(building.index)} />;
    })}
  </>;
}

type PlanetWalletSummary = {
  label: string;
  worlds: number;
  shieldActive: boolean;
  vaultStatus: string;
  vaultSol: string;
  antimatter: string;
  usdc: string;
};

export default function PlanetWorld({ state, busy, run, onExit, wallet, game, market, worlds, ownedWorlds, activity, marketControls, vaultControls, allianceBalances }: { state: PlayerState; busy: boolean; run: (label: string, action: (client: GameClient, entity: PublicKey) => Promise<unknown>) => Promise<void>; onExit: () => void; wallet: PlanetWalletSummary | null; game: GameClient | null; market: MarketClient | null; worlds: Array<{ entity: string; name: string }>; ownedWorlds: PlayerState[]; activity: { battleReports: BattleResolvedEventRecord[]; spyReports: EspionageReportEventRecord[]; loading: boolean; refresh: () => Promise<void> }; marketControls: { onTxStart: (label: string) => void; onTxEnd: (error?: string) => void }; vaultControls: { depositAmount: string; withdrawAmount: string; onDepositAmountChange: (value: string) => void; onWithdrawAmountChange: (value: string) => void; onDeposit: () => Promise<void>; onWithdraw: () => Promise<void>; busy: boolean }; allianceBalances: { usdc: bigint; antimatter: bigint } }) {
  const { wallet: connectedWallet } = useWallet();
  const [selected, setSelected] = useState(0);
  const [modal, setModal] = useState<"buildingSelect" | "building" | "research" | "ships" | "defense" | "missions" | "quests" | "store" | "alliance" | "market" | "activity" | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [missionType, setMissionType] = useState(2);
  const [missionTarget, setMissionTarget] = useState({ galaxy: state.planet.galaxy, system: state.planet.system, position: 1, speed: 100, colonyName: "Colony" });
  const [missionShips, setMissionShips] = useState<Record<string, number>>({});
  const [missionCargo, setMissionCargo] = useState({ metal: "", crystal: "", deuterium: "" });
  const [missionError, setMissionError] = useState("");
  const [missionChecking, setMissionChecking] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [questState, setQuestState] = useState<QuestStateAccount | null>(null);
  const [questProgress, setQuestProgress] = useState<QuestProgressStateAccount | null>(null);
  const [questTargets, setQuestTargets] = useState<QuestRewardTargetStateAccount | null>(null);
  const [questsLoading, setQuestsLoading] = useState(false);
  const [collapsedQuestGroups, setCollapsedQuestGroups] = useState<Record<QuestDefinition["group"], boolean>>({ Tutorial: false, Daily: false, Weekly: false, Monthly: false });
  const [storeConfig, setStoreConfig] = useState<StoreConfigState | null>(null);
  const [storePurchaseState, setStorePurchaseState] = useState<StorePurchaseStateAccount | null>(null);
  const [storeLoading, setStoreLoading] = useState(false);
  const [alliance, setAlliance] = useState<AllianceStateAccount | null>(null);
  const [allianceMembership, setAllianceMembership] = useState<AllianceMembershipAccount | null>(null);
  const [allianceTreasury, setAllianceTreasury] = useState<AllianceTreasuryStateAccount | null>(null);
  const [allianceLoading, setAllianceLoading] = useState(false);
  const [allianceDirectory, setAllianceDirectory] = useState<AllianceStateAccount[]>([]);
  const [allianceJoinRequests, setAllianceJoinRequests] = useState<AllianceJoinRequestAccount[]>([]);
  const [allianceMembers, setAllianceMembers] = useState<AllianceMembershipAccount[]>([]);
  const [allianceName, setAllianceName] = useState("");
  const [allianceTag, setAllianceTag] = useState("");
  const [allianceImageUrl, setAllianceImageUrl] = useState("");
  const [queueBaselines, setQueueBaselines] = useState<Record<string, number>>({});
  const { setVisible: setWalletPickerVisible } = useWalletModal();
  const [nowTs, setNowTs] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = window.setInterval(() => setNowTs(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const activeQueues = [
      ["Construction", state.planet.buildQueueItem, state.planet.buildFinishTs],
      ["Research", state.research.queueItem, state.research.researchFinishTs],
      ["Shipyard", state.planet.shipBuildItem, state.planet.shipBuildFinishTs],
      ["Defense", state.planet.defenseBuildItem, state.planet.defenseBuildFinishTs],
    ] as const;
    setQueueBaselines((current) => {
      const next: Record<string, number> = {};
      for (const [label, item, finishAt] of activeQueues) {
        if (item === 255 || finishAt <= 0) continue;
        const key = `${label}:${finishAt}`;
        next[key] = current[key] ?? Math.max(1, finishAt - Math.floor(Date.now() / 1000));
      }
      return next;
    });
  }, [state.planet.buildQueueItem, state.planet.buildFinishTs, state.research.queueItem, state.research.researchFinishTs, state.planet.shipBuildItem, state.planet.shipBuildFinishTs, state.planet.defenseBuildItem, state.planet.defenseBuildFinishTs]);
  useEffect(() => {
    market?.setActivePlanet(new PublicKey(state.planetPda));
  }, [market, state.planetPda]);
  const refreshQuestLedger = async () => {
    if (!game) return;
    setQuestsLoading(true);
    try {
      const [nextState, nextProgress, nextTargets] = await Promise.all([
        game.getQuestState(),
        game.getQuestProgress(),
        game.getQuestRewardTargets(),
      ]);
      setQuestState(nextState);
      setQuestProgress(nextProgress);
      setQuestTargets(nextTargets);
    } finally {
      setQuestsLoading(false);
    }
  };
  useEffect(() => {
    if (modal === "quests") void refreshQuestLedger();
  }, [modal, game]);
  const refreshStore = async () => {
    if (!game) return;
    setStoreLoading(true);
    try {
      const [nextConfig, nextPurchaseState] = await Promise.all([game.getStoreConfig(), game.getStorePurchaseState()]);
      setStoreConfig(nextConfig);
      setStorePurchaseState(nextPurchaseState);
    } finally {
      setStoreLoading(false);
    }
  };
  useEffect(() => {
    if (modal === "store") void refreshStore();
  }, [modal, game]);
  const refreshAlliance = async () => {
    if (!game) return;
    setAllianceLoading(true);
    try {
      const membership = await game.getAllianceMembership();
      setAllianceMembership(membership);
      if (!membership || membership.role === 0) {
        setAlliance(null);
        setAllianceTreasury(null);
        setAllianceJoinRequests([]);
        setAllianceMembers([]);
        setAllianceDirectory(await game.fetchAlliances());
        return;
      }
      const loadedAlliance = await game.getAlliance(new PublicKey(membership.alliance));
      setAlliance(loadedAlliance);
      setAllianceDirectory([]);
      if (!loadedAlliance) {
        setAllianceTreasury(null);
        setAllianceJoinRequests([]);
        setAllianceMembers([]);
        return;
      }
      const allianceKey = new PublicKey(loadedAlliance.publicKey);
      const [treasury, members, requests] = await Promise.all([
        game.getAllianceTreasury(allianceKey),
        game.fetchAllianceMembers(allianceKey),
        membership.role === 2 ? game.fetchAllianceJoinRequests(allianceKey) : Promise.resolve([]),
      ]);
      setAllianceTreasury(treasury);
      setAllianceMembers(members);
      setAllianceJoinRequests(requests);
    } finally {
      setAllianceLoading(false);
    }
  };
  useEffect(() => {
    if (modal === "alliance") void refreshAlliance();
  }, [modal, game]);
  const building = BUILDINGS[selected];
  const level = Number((state.planet as unknown as Record<string, number>)[building.key] ?? 0);
  const queueBusy = state.planet.buildQueueItem !== 255;
  const researchBusy = state.research.queueItem !== 255;
  const shipyardBusy = state.planet.shipBuildItem !== 255 || state.planet.defenseBuildItem !== 255;
  const resource = state.resources;
  const storageCap = building.key === "metalStorage"
    ? { label: "Metal", current: resource.metalCap }
    : building.key === "crystalStorage"
      ? { label: "Crystal", current: resource.crystalCap }
      : building.key === "deuteriumTank"
        ? { label: "Deuterium", current: resource.deuteriumCap }
        : null;
  const energyPercent = energyEfficiency(resource);
  const energyTone = energyPercent <= 25 ? "critical" : energyPercent < 100 ? "warning" : "good";
  const hasAllianceUsdc = allianceBalances.usdc >= ALLIANCE_CREATE_USDC_COST;
  const hasAllianceAntimatter = allianceBalances.antimatter >= ALLIANCE_CREATE_ANTIMATTER_COST;
  const normalizedAllianceTag = allianceTag.trim().toUpperCase();
  const canCreateAlliance = allianceName.trim().length >= 2 && normalizedAllianceTag.length === 3 && hasAllianceUsdc && hasAllianceAntimatter;
  const [metalCost, crystalCost, deuteriumCost] = upgradeCost(building.idx, level);
  const canAfford = (metal: number, crystal: number, deuterium: number) => resource.metal >= BigInt(metal) && resource.crystal >= BigInt(crystal) && resource.deuterium >= BigInt(deuterium);
  const requirementValue = (key: string) => Number((state.planet as any)[key] ?? (state.research as any)[key] ?? 0);
  const requirementRows = (requirements: Array<[string, string, number]>) => requirements.map(([label, key, required]) => ({ label, current: requirementValue(key), required }));
  const buildingRequirements = (key: string) => (BUILDING_REQUIREMENTS[key] ?? []).map((requirement) => ({ label: requirement.key.replace(/([A-Z])/g, " $1"), current: requirementValue(requirement.key), required: requirement.level }));
  const requirementsMet = (requirements: RequirementRow[]) => requirements.every((requirement) => requirement.current >= requirement.required);
  const missingRequirementLabel = (requirements: RequirementRow[]) => requirements.filter((requirement) => requirement.current < requirement.required).map((requirement) => `${requirement.label} ${requirement.current}/${requirement.required}`).join(" · ");
  const buildingRequirementsForSelected = buildingRequirements(building.key);
  const buildingAffordable = canAfford(metalCost, crystalCost, deuteriumCost);
  const [researchLabMetalCost, researchLabCrystalCost, researchLabDeuteriumCost] = upgradeCost(11, state.planet.researchLab);
  const [shipyardMetalCost, shipyardCrystalCost, shipyardDeuteriumCost] = upgradeCost(7, state.planet.shipyard);
  const researchLabAffordable = canAfford(researchLabMetalCost, researchLabCrystalCost, researchLabDeuteriumCost);
  const shipyardAffordable = canAfford(shipyardMetalCost, shipyardCrystalCost, shipyardDeuteriumCost);
  const shipyardRequirements = buildingRequirements("shipyard");
  const shipyardRequirementsMet = requirementsMet(shipyardRequirements);
  const shipyardUpgrading = state.planet.buildQueueItem === 7;
  const researchLabUpgrading = state.planet.buildQueueItem === 11;
  const shipyardUpgradeBlocked = shipyardBusy;
  const researchLabUpgradeBlocked = researchBusy;
  const queues = [
    { label: "Construction", active: state.planet.buildQueueItem !== 255, item: BUILDINGS[state.planet.buildQueueItem]?.name ?? "Facility upgrade", finishAt: state.planet.buildFinishTs, finish: (client: GameClient, entity: PublicKey) => client.finishBuild(entity), accelerate: (client: GameClient, entity: PublicKey) => client.accelerateBuildWithAntimatter(entity) },
    { label: "Research", active: state.research.queueItem !== 255, item: RESEARCH[state.research.queueItem]?.name ?? "Research project", finishAt: state.research.researchFinishTs, finish: (client: GameClient, entity: PublicKey) => client.finishResearch(entity), accelerate: (client: GameClient, entity: PublicKey) => client.accelerateResearchWithAntimatter(entity) },
    { label: "Shipyard", active: state.planet.shipBuildItem !== 255, item: `${SHIPS[state.planet.shipBuildItem]?.name ?? "Ship build"} x${state.planet.shipBuildQty}`, finishAt: state.planet.shipBuildFinishTs, finish: (client: GameClient, entity: PublicKey) => client.finishShipBuild(entity), accelerate: (client: GameClient, entity: PublicKey) => client.accelerateShipBuildWithAntimatter(entity) },
    { label: "Defense", active: state.planet.defenseBuildItem !== 255, item: `${DEFENSE[state.planet.defenseBuildItem]?.name ?? "Defense build"} x${state.planet.defenseBuildQty}`, finishAt: state.planet.defenseBuildFinishTs, finish: (client: GameClient, entity: PublicKey) => client.finishDefenseBuild(entity), accelerate: (client: GameClient, entity: PublicKey) => client.accelerateDefenseBuildWithAntimatter(entity) },
  ];
  const selectFacility = (index: number) => {
    setSelected(index);
    const target = BUILDINGS[index];
    setModal(target.key === "researchLab" ? "research" : target.key === "shipyard" ? "ships" : "building");
  };
  const costs = (metal: number, crystal: number, deuterium: number) => <div className="pw-costs">
    {metal > 0 && <span className="metal"><Pickaxe />{metal.toLocaleString()}</span>}
    {crystal > 0 && <span className="crystal"><Gem />{crystal.toLocaleString()}</span>}
    {deuterium > 0 && <span className="deuterium"><FlaskConical />{deuterium.toLocaleString()}</span>}
  </div>;
  const resourceRequirementRows = (metal: number, crystal: number, deuterium: number): RequirementRow[] => [
    { label: "Metal", current: Number(resource.metal), required: metal },
    { label: "Crystal", current: Number(resource.crystal), required: crystal },
    { label: "Deuterium", current: Number(resource.deuterium), required: deuterium },
  ].filter((requirement) => requirement.required > 0);
  const requirementChecklist = (requirements: RequirementRow[], title = "Requirements") => <section className="pw-requirements">
    <header><span>{title}</span><b>{requirementsMet(requirements) ? "ALL MET" : `${requirements.filter((requirement) => requirement.current < requirement.required).length} MISSING`}</b></header>
    <div>{requirements.map((requirement) => { const met = requirement.current >= requirement.required; return <span key={`${title}:${requirement.label}`} className={met ? "met" : "missing"}><i>{met ? "OK" : "!"}</i><em>{requirement.label}</em><b>{requirement.current.toLocaleString()} / {requirement.required.toLocaleString()}</b></span>; })}</div>
  </section>;
  const queueTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    return hours > 0 ? `${hours}h ${String(minutes).padStart(2, "0")}m` : `${minutes}m ${String(remainder).padStart(2, "0")}s`;
  };
  const missionName = (missionType: number) => missionType === 1 ? "ATTACK" : missionType === 2 ? "TRANSPORT" : missionType === 5 ? "COLONIZE" : missionType === 6 ? "ESPIONAGE" : "MISSION";
  const selectedMissionShips = Object.values(missionShips).reduce((total, amount) => total + Math.max(0, amount), 0);
  const selectedProbeCount = Math.max(0, missionShips.espionageProbe ?? 0);
  const selectedColonyCount = Math.max(0, missionShips.colonyShip ?? 0);
  const selectedCargoCapacity = SHIPS.reduce((total, ship) => total + (missionShips[ship.key] ?? 0) * ship.cargo, 0);
  const selectedCargoTotal = Number(missionCargo.metal || 0) + Number(missionCargo.crystal || 0) + Number(missionCargo.deuterium || 0);
  const missionCoordinatesValid = missionTarget.galaxy >= 1 && missionTarget.galaxy <= 999 && missionTarget.system >= 1 && missionTarget.system <= 999 && missionTarget.position >= 1 && missionTarget.position <= 15;
  const missionFleetValid = selectedMissionShips > 0 && (missionType !== 6 || (selectedProbeCount > 0 && selectedMissionShips === selectedProbeCount)) && (missionType !== 5 || selectedColonyCount > 0);
  const missionCargoValid = (missionType === 5 || missionType === 6) || selectedCargoTotal <= selectedCargoCapacity;
  const canLaunchMission = missionCoordinatesValid && missionFleetValid && missionCargoValid;
  useEffect(() => {
    if (!missionCoordinatesValid) { setMissionError("Choose coordinates within Galaxy 1-999, System 1-999, Position 1-15."); return; }
    if (missionType === 6 && !missionFleetValid) { setMissionError("Espionage requires probes only."); return; }
    if (missionType === 5 && !missionFleetValid) { setMissionError("Colonization requires a Colony Ship."); return; }
    if (!missionFleetValid) { setMissionError("Select at least one ship."); return; }
    if (!missionCargoValid) { setMissionError("Cargo exceeds the selected fleet capacity."); return; }
    setMissionError("");
  }, [missionCoordinatesValid, missionCargoValid, missionFleetValid, missionType, selectedCargoCapacity, selectedCargoTotal, selectedMissionShips]);
  const launchMission = async () => {
    if (!canLaunchMission || !game || missionChecking) return;
    setMissionChecking(true);
    setMissionError("");
    try {
      const usableSlots = Math.min(4, 1 + Math.floor(state.research.computerTech / 5));
      const freeSlots = state.fleet.missions.slice(0, usableSlots).filter((mission) => mission.missionType === 0).length;
      if (freeSlots <= 0) throw new Error("No mission slots available. Resolve an existing mission first.");
      const cargo = { metal: BigInt(missionCargo.metal || 0), crystal: BigInt(missionCargo.crystal || 0), deuterium: BigInt(missionCargo.deuterium || 0) };
      if (resource.metal < cargo.metal || resource.crystal < cargo.crystal) throw new Error("Not enough resources are available for this mission cargo.");
      const fuel = BigInt(missionFuelCost(missionShips, missionTarget.speed) * (missionType === 5 ? 1 : 2));
      if (resource.deuterium < cargo.deuterium + fuel) throw new Error(`Not enough deuterium. Mission cargo and fuel require ${(cargo.deuterium + fuel).toLocaleString()}.`);
      const targetFree = await game.isCoordFree(missionTarget.galaxy, missionTarget.system, missionTarget.position);
      if (missionType === 5 && !targetFree) throw new Error("That coordinate slot is already occupied.");
      if (missionType !== 5 && targetFree) throw new Error(`${missionName(missionType)} missions can only target occupied planets.`);
      if (missionType === 1) {
        const now = Math.floor(Date.now() / 1000);
        const sourceUnlockLeft = Math.max(0, state.planet.attackUnlockedAt - now);
        const launchCooldownLeft = state.planet.lastAttackLaunchTs > 0 ? Math.max(0, state.planet.lastAttackLaunchTs + ATTACK_LAUNCH_COOLDOWN_SECONDS - now) : 0;
        const combatPoints = Object.entries(missionShips).reduce((total, [key, quantity]) => total + (SHIP_COMBAT_POINTS[key] ?? 0) * Math.max(0, quantity), 0);
        if (sourceUnlockLeft > 0) throw new Error(`Attack launches unlock in ${queueTime(sourceUnlockLeft)}.`);
        if (launchCooldownLeft > 0) throw new Error(`Attack launch cooldown: ${queueTime(launchCooldownLeft)} remaining.`);
        if (combatPoints < MIN_ATTACK_COMBAT_POINTS) throw new Error(`Attack fleet too weak. Need ${MIN_ATTACK_COMBAT_POINTS.toLocaleString()} combat points.`);
        const targetInfo = await game.getPublicPlanetInfoByCoordinates(missionTarget.galaxy, missionTarget.system, missionTarget.position);
        if (targetInfo) {
          const protectionLeft = Math.max(0, targetInfo.protectionUntilTs - now);
          const targetCooldownLeft = targetInfo.lastAttackedTs > 0 ? Math.max(0, targetInfo.lastAttackedTs + TARGET_ATTACK_COOLDOWN_SECONDS - now) : 0;
          if (protectionLeft > 0) throw new Error(`Target is protected for ${queueTime(protectionLeft)}.`);
          if (targetCooldownLeft > 0) throw new Error(`Target cooldown: ${queueTime(targetCooldownLeft)} remaining.`);
        }
      }
      const ships = Object.entries(missionShips).reduce((result, [key, amount]) => {
        const mapped = FLEET_LAUNCH_KEY[key];
        if (mapped && amount > 0) result[mapped] = amount;
        return result;
      }, {} as Record<"sc" | "lc" | "lf" | "hf" | "cr" | "bs" | "bc" | "bm" | "ds" | "de" | "rec" | "ep" | "col", number>);
      await run(`Launch ${missionName(missionType).toLowerCase()}`, (client, entity) => client.launchFleet(entity, ships, cargo, missionType, missionTarget.speed, { galaxy: missionTarget.galaxy, system: missionTarget.system, position: missionTarget.position, colonyName: missionType === 5 ? missionTarget.colonyName : undefined }));
    } catch (error) {
      setMissionError(error instanceof Error ? error.message : "Mission preflight failed.");
    } finally {
      setMissionChecking(false);
    }
  };
  const resolveMission = async (mission: PlayerState["fleet"]["missions"][number], slot: number) => {
    const label = `Resolve ${missionName(mission.missionType).toLowerCase()}`;
    if (mission.missionType === 1) await run(label, (client, entity) => client.resolveAttack(entity, mission, slot));
    else if (mission.missionType === 2) await run(label, (client, entity) => client.resolveTransport(entity, mission, slot));
    else if (mission.missionType === 6) await run(label, (client, entity) => client.resolveEspionage(entity, mission, slot));
    else if (mission.missionType === 5) await run(label, async (client, entity) => { await client.resolveColonize(entity, mission, slot); return ""; });
    if (mission.missionType === 1 || mission.missionType === 6) await activity.refresh();
  };
  const queueCommand = (queue: typeof queues[number]) => {
    const relatedQueues = queue.label === "Research" || queue.label === "Shipyard" ? [queues[0], queue] : [queue];
    return <>{relatedQueues.map((activeQueue) => {
      if (!activeQueue.active) return null;
      const seconds = Math.max(0, activeQueue.finishAt - nowTs);
      const ready = seconds === 0;
      const baseline = queueBaselines[`${activeQueue.label}:${activeQueue.finishAt}`] ?? 0;
      const progress = ready ? 100 : baseline > 0 ? Math.min(99, Math.max(0, ((baseline - seconds) / baseline) * 100)) : 0;
      return <section key={`${activeQueue.label}:${activeQueue.finishAt}`} className="pw-inline-queue">
        <div><span>{activeQueue.label} queue</span><strong>{activeQueue.item}</strong><div className={`pw-inline-queue-progress${ready ? " ready" : ""}`}><i style={{ width: `${progress}%` }} /></div></div>
        <div className="pw-inline-queue-control"><div className="pw-inline-queue-meta"><b>{ready ? "READY" : queueTime(seconds)}</b><em>{Math.round(progress)}%</em></div><div className="pw-inline-queue-actions"><button className="accelerate" disabled={busy || ready} onClick={() => run(`Accelerate ${activeQueue.label.toLowerCase()}`, activeQueue.accelerate)}>ACCELERATE</button><button className="resolve" disabled={busy || !ready} onClick={() => run(`Finish ${activeQueue.label.toLowerCase()}`, activeQueue.finish)}>RESOLVE</button></div></div>
      </section>;
    })}</>;
  };
  const questDefinitions = activeQuestDefinitions(nowTs, questProgress);
  const questsHideTutorial = tutorialQuestsComplete(questState);
  const questGroups: QuestDefinition["group"][] = questsHideTutorial ? ["Daily", "Weekly", "Monthly"] : ["Tutorial", "Daily", "Weekly", "Monthly"];
  const questWorldNames = new Map(worlds.map((world) => [world.entity, world.name]));
  const dailyCheckInClaimed = questState?.dailyCheckinDay === Math.floor(nowTs / 86_400) || hasQuestBit(questClaimedMask(1, questState, nowTs), 0);
  const claimQuest = async (quest: QuestDefinition) => {
    await run(quest.checkIn ? "Daily check-in" : `Claim ${quest.title}`, (client, entity) => quest.checkIn ? client.dailyCheckIn(entity) : client.claimQuest(entity, quest.period, quest.id));
    await refreshQuestLedger();
  };
  const purchaseStorePack = async (period: number, packId: number, title: string) => {
    await run(`Purchase ${title}`, (client, entity) => client.purchaseStorePack(entity, period, packId));
    await refreshStore();
  };
  const depositAllianceMission = async (mission: typeof ALLIANCE_DEPOSIT_DEFINITIONS[number]) => {
    await run(`Deposit for ${mission.title}`, (client, entity) => client.depositAllianceResources(entity, mission.period, mission.id, {
      metal: mission.metal,
      crystal: mission.crystal,
      deuterium: mission.deuterium,
      antimatter: mission.antimatter,
    }));
    await refreshAlliance();
  };
  const createAlliance = async () => {
    if (!canCreateAlliance) return;
    await run(`Create ${allianceName.trim()}`, (client) => client.createAlliance(allianceName.trim(), normalizedAllianceTag, allianceImageUrl.trim()));
    await refreshAlliance();
  };
  const runAllianceAction = async (label: string, action: (client: GameClient) => Promise<unknown>) => {
    await run(label, (client) => action(client));
    await refreshAlliance();
  };
  const shortAddress = (address: string) => `${address.slice(0, 5)}...${address.slice(-5)}`;
  const activityAmount = (value: bigint) => value.toLocaleString();
  const activityTime = (timestamp: number) => new Date(timestamp * 1000).toLocaleString();
  return <main className="planet-world">
    <section className="planet-world-scene"><Canvas camera={{ position: [0, 1.6, 22], fov: 52 }} dpr={[1, 1.25]} gl={{ antialias: false, powerPreference: "high-performance" }}><color attach="background" args={["#020711"]} /><Stars radius={80} depth={40} count={850} factor={2.2} saturation={0.2} fade /><WorldStructures state={state} selected={selected} onSelect={selectFacility} /><ArcballControls enablePan enableZoom enableRotate dampingFactor={0.1} minDistance={7} maxDistance={50} /></Canvas></section>
    <a className="pw-brand" href="/" aria-label="GAMESOL home"><img src={gamesolMark} alt="GAMESOL" /></a>
    <button className="pw-wallet-trigger" onClick={() => wallet ? setWalletOpen(true) : setWalletPickerVisible(true)}>
      {wallet && connectedWallet?.adapter.icon && <img src={connectedWallet.adapter.icon} alt={`${connectedWallet.adapter.name.toString()} logo`} />}
      <span>{wallet?.label ?? "CONNECT WALLET"}</span>
    </button>
    {wallet && walletOpen && <div className="pw-wallet-backdrop" onMouseDown={() => setWalletOpen(false)}><section className="pw-wallet-menu" onMouseDown={(event) => event.stopPropagation()}><header><span>WALLET</span><button aria-label="Close wallet menu" onClick={() => setWalletOpen(false)}><X /></button></header><div><span>Network</span><b>{NETWORK_LABEL}</b></div><div><span>Wallet</span><b>{wallet.label}</b></div><div><span>Command worlds</span><b>{wallet.worlds}</b></div><div><span>Shield</span><b className={wallet.shieldActive ? "good" : ""}>{wallet.shieldActive ? "ACTIVE" : "OFF"}</b></div><div><span>Vault</span><b className={wallet.vaultStatus === "ready" ? "good" : ""}>{wallet.vaultStatus.replace(/_/g, " ")}</b></div><div><span>Vault SOL</span><b>{wallet.vaultSol} SOL</b></div><div><span>Antimatter</span><b>{wallet.antimatter} AM</b></div><div><span>USDC</span><b>{wallet.usdc} USDC</b></div>{wallet.vaultStatus === "ready" && <section className="pw-vault-funding"><span>Vault funding</span><label><b>Deposit SOL</b><input type="number" min="0.001" step="0.001" inputMode="decimal" value={vaultControls.depositAmount} onChange={(event) => vaultControls.onDepositAmountChange(event.target.value)} disabled={busy || vaultControls.busy} /><button disabled={busy || vaultControls.busy} onClick={() => void vaultControls.onDeposit()}>DEPOSIT</button></label><label><b>Withdraw SOL</b><input type="number" min="0.001" step="0.001" inputMode="decimal" placeholder="0.00" value={vaultControls.withdrawAmount} onChange={(event) => vaultControls.onWithdrawAmountChange(event.target.value)} disabled={busy || vaultControls.busy} /><button disabled={busy || vaultControls.busy || !vaultControls.withdrawAmount} onClick={() => void vaultControls.onWithdraw()}>WITHDRAW</button></label></section>}<footer><WalletModalButton>CHANGE WALLET</WalletModalButton><WalletDisconnectButton>DISCONNECT</WalletDisconnectButton></footer></section></div>}
    <header className="pw-top"><button onClick={onExit} aria-label="Return to active planet system"><ChevronLeft /> SYSTEM</button><div className="pw-resources"><b className="metal"><Pickaxe /><span>METAL</span>{resource.metal.toLocaleString()}</b><b className="crystal"><Gem /><span>CRYSTAL</span>{resource.crystal.toLocaleString()}</b><b className="deuterium"><FlaskConical /><span>DEUTERIUM</span>{resource.deuterium.toLocaleString()}</b><b className={`energy ${energyTone}`}><Zap /><span>ENERGY</span>{resource.energyProduction.toLocaleString()} / {resource.energyConsumption.toLocaleString()} <em>{energyPercent}%</em></b></div></header>
    <section className="pw-queues">{queues.map((queue) => { const seconds = Math.max(0, queue.finishAt - nowTs); const ready = queue.active && seconds === 0; const baseline = queueBaselines[`${queue.label}:${queue.finishAt}`] ?? 0; const progress = ready ? 100 : baseline > 0 ? Math.min(99, Math.max(0, ((baseline - seconds) / baseline) * 100)) : 0; return <article key={queue.label} className={queue.active ? "active" : ""}><div className="pw-queue-title"><span>{queue.label}</span><b>{queue.active ? ready ? "READY" : queueTime(seconds) : "IDLE"}</b></div>{queue.active && <><strong>{queue.item}</strong><div className={`pw-queue-progress${ready ? " ready" : ""}`}><i style={{ width: `${progress}%` }} /></div><div className="pw-queue-actions">{ready ? <button disabled={busy} onClick={() => run(`Finish ${queue.label.toLowerCase()}`, queue.finish)}>FINISH</button> : <button className="accelerate" disabled={busy} onClick={() => run(`Accelerate ${queue.label.toLowerCase()}`, queue.accelerate)}>FINISH WITH ANTIMATTER</button>}</div></>}</article>; })}</section>
    <nav className="pw-operations" aria-label="Planet operations"><button title="Buildings" onClick={() => setModal("buildingSelect")}><Building2 /></button><button title="Research" onClick={() => setModal("research")}><FlaskConical /></button><button title="Shipyard" onClick={() => setModal("ships")}><Rocket /></button><button title="Defenses" onClick={() => setModal("defense")}><Shield /></button><button title="Missions" onClick={() => setModal("missions")}><Crosshair /></button><button title="Activity reports" onClick={() => setModal("activity")}><Activity /></button><button title="Market" onClick={() => setModal("market")}><Scale /></button><button title="Quests" onClick={() => setModal("quests")}><Trophy /></button><button title="Alliance" onClick={() => setModal("alliance")}><Users /></button><button title="Store" onClick={() => setModal("store")}><ShoppingCart /></button></nav>
    {modal && <div className="pw-modal-backdrop" onMouseDown={() => setModal(null)}><section className={`pw-command-modal${modal === "market" ? " pw-market-modal" : ""}`} onMouseDown={(event) => event.stopPropagation()}>
      <button className="pw-modal-close" aria-label="Close command panel" onClick={() => setModal(null)}><X /></button>
      {modal === "buildingSelect" && <><div className="pw-command-head"><span>PLANETARY FACILITIES</span><h2>Choose a structure</h2><p>Inspect the next upgrade, cost, prerequisites, and construction status before opening a facility.</p></div><div className="pw-facility-grid">{BUILDINGS.filter((item) => item.key !== "missileSilo").map((item) => { const index = BUILDINGS.findIndex((building) => building.key === item.key); return <button key={item.key} onClick={() => { setSelected(index); setModal(item.key === "researchLab" ? "research" : item.key === "shipyard" ? "ships" : "building"); }}><span style={{ backgroundImage: resolveGameArt(item.key, "none") }} /><div><b>{item.name}</b><small>Level {Number((state.planet as any)[item.key] ?? 0)}</small></div><ChevronLeft /></button>; })}</div></>}
      {modal === "building" && <><div className="pw-command-art" style={{ backgroundImage: resolveGameArt(building.key, "none") }} /><div className="pw-command-head"><span>PLANETARY FACILITY</span><h2>{building.name}</h2><p>Level {level} to {level + 1}</p></div>{queueCommand(queues[0])}<p className="pw-command-effect">{NEXT_BUILDING_EFFECT[building.key]}</p>{storageCap && <section className="pw-storage-cap"><div><span>Current {storageCap.label} cap</span><b>{storageCap.current.toLocaleString()}</b></div><i>→</i><div><span>Next cap · Level {level + 1}</span><b>{storageCapacityAtLevel(level + 1).toLocaleString()}</b></div></section>}{costs(metalCost, crystalCost, deuteriumCost)}{(!requirementsMet(buildingRequirementsForSelected) || !buildingAffordable) && requirementChecklist([...buildingRequirementsForSelected, ...resourceRequirementRows(metalCost, crystalCost, deuteriumCost)], "Upgrade requirements")}<button className="pw-primary-action" disabled={busy || queueBusy || !buildingAffordable || !requirementsMet(buildingRequirementsForSelected)} onClick={() => run(`Upgrade ${building.name}`, (client, entity) => client.startBuild(entity, selected))}><Hammer /> {queueBusy ? "CONSTRUCTION ACTIVE" : !requirementsMet(buildingRequirementsForSelected) ? "REQUIREMENTS NOT MET" : !buildingAffordable ? "INSUFFICIENT RESOURCES" : "UPGRADE FACILITY"}</button></>}
      {modal === "research" && <><div className="pw-command-head"><span>RESEARCH LABORATORY</span><h2>Technology command</h2><p>Select a project for this planet.</p></div>{queueCommand(queues[1])}<section className="pw-facility-upgrade"><div><b>Research Lab Lv {state.planet.researchLab}</b><span>Upgrade the laboratory to unlock deeper technologies.</span>{costs(researchLabMetalCost, researchLabCrystalCost, researchLabDeuteriumCost)}</div><button disabled={busy || queueBusy || researchLabUpgradeBlocked || !researchLabAffordable} onClick={() => run("Upgrade Research Lab", (client, entity) => client.startBuild(entity, 11))}>{queueBusy ? "CONSTRUCTION ACTIVE" : researchLabUpgradeBlocked ? "RESEARCH ACTIVE" : !researchLabAffordable ? "INSUFFICIENT RESOURCES" : "UPGRADE LAB"}</button></section><div className="pw-command-list">{RESEARCH.map((tech, index) => { const techLevel = Number((state.research as any)[tech.key] ?? 0); const multiplier = 2 ** techLevel; const cost = [tech.cost[0] * multiplier, tech.cost[1] * multiplier, tech.cost[2] * multiplier] as const; const requirementKeys: Record<string, string> = { "Energy Technology": "energyTech", "Impulse Drive": "impulseDrive", "Computer Technology": "computerTech" }; const requirements = (RESEARCH_LAB_REQUIREMENTS[tech.key] ?? []).map((requirement) => ({ ...requirement, current: requirement.label === "Research Lab" ? state.planet.researchLab : requirementValue(requirementKeys[requirement.label] ?? tech.key) })); const ready = requirementsMet(requirements) && canAfford(...cost); return <article key={tech.key}><div className="pw-row-art" style={{ backgroundImage: resolveGameArt(tech.key, "none") }} /><div><h3>{tech.name}</h3><p>Level {techLevel} to {techLevel + 1}. {tech.desc}</p>{costs(...cost)}{!requirementsMet(requirements) && <p className="pw-command-warning">Requires {missingRequirementLabel(requirements)}</p>}{!canAfford(...cost) && <p className="pw-command-warning">Insufficient resources.</p>}</div><button disabled={busy || researchBusy || researchLabUpgrading || !ready} onClick={() => run(`Research ${tech.name}`, (client, entity) => client.startResearch(entity, index))}>{researchBusy ? "RESEARCH ACTIVE" : researchLabUpgrading ? "LAB UPGRADING" : !requirementsMet(requirements) ? "REQUIREMENTS NOT MET" : !canAfford(...cost) ? "INSUFFICIENT RESOURCES" : "RESEARCH"}</button></article>; })}</div></>}
      {modal === "ships" && <><div className="pw-command-head"><span>SHIPYARD</span><h2>Fleet construction</h2><p>Ships and defenses share the shipyard queue.</p></div>{queueCommand(queues[2])}{queueCommand(queues[3])}<section className="pw-facility-upgrade"><div><b>Shipyard Lv {state.planet.shipyard}</b><span>Upgrade the shipyard to unlock more fleet and defense designs.</span>{costs(shipyardMetalCost, shipyardCrystalCost, shipyardDeuteriumCost)}{!shipyardRequirementsMet && <p className="pw-command-warning">Requires {missingRequirementLabel(shipyardRequirements)}</p>}{!shipyardAffordable && <p className="pw-command-warning">Insufficient resources.</p>}</div><button disabled={busy || queueBusy || shipyardUpgradeBlocked || !shipyardAffordable || !shipyardRequirementsMet} onClick={() => run("Upgrade Shipyard", (client, entity) => client.startBuild(entity, 7))}>{queueBusy ? "CONSTRUCTION ACTIVE" : shipyardUpgradeBlocked ? "PRODUCTION ACTIVE" : !shipyardRequirementsMet ? "REQUIREMENTS NOT MET" : !shipyardAffordable ? "INSUFFICIENT RESOURCES" : "UPGRADE SHIPYARD"}</button></section><label className="pw-quantity">Quantity <input type="number" min="1" value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} /></label><div className="pw-command-list">{SHIPS.map((ship) => { const cost = [ship.cost.m * quantity, ship.cost.c * quantity, ship.cost.d * quantity] as const; const requirements = requirementRows(SHIP_REQUIREMENTS[ship.key] ?? []); const ready = requirementsMet(requirements) && canAfford(...cost); return <article key={ship.key}><div className="pw-row-art" style={{ backgroundImage: resolveGameArt(ship.key, "none") }} /><div><h3>{ship.name}</h3><p>Owned {Number((state.fleet as any)[ship.key] ?? 0).toLocaleString()}</p>{costs(...cost)}{!requirementsMet(requirements) && <p className="pw-command-warning">Requires {missingRequirementLabel(requirements)}</p>}{!canAfford(...cost) && <p className="pw-command-warning">Insufficient resources.</p>}</div><button disabled={busy || shipyardBusy || shipyardUpgrading || !ready} onClick={() => run(`Build ${ship.name}`, (client, entity) => client.buildShip(entity, SHIP_TYPE_IDX[ship.key], quantity))}>{shipyardBusy ? "QUEUE ACTIVE" : shipyardUpgrading ? "SHIPYARD UPGRADING" : !requirementsMet(requirements) ? "REQUIREMENTS NOT MET" : !canAfford(...cost) ? "INSUFFICIENT RESOURCES" : "BUILD"}</button></article>; })}</div></>}
      {modal === "defense" && <><div className="pw-command-head"><span>DEFENSE GRID</span><h2>Defense construction</h2><p>Defense units use the shared shipyard production queue.</p></div>{queueCommand(queues[2])}{queueCommand(queues[3])}<label className="pw-quantity">Quantity <input type="number" min="1" value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} /></label><div className="pw-command-list">{DEFENSE.map((item, index) => { const cost = [item.cost[0] * quantity, item.cost[1] * quantity, item.cost[2] * quantity] as const; const requirements = requirementRows(DEFENSE_REQUIREMENTS[item.key] ?? []); const uniqueAlreadyBuilt = (item.key === "smallShieldDome" || item.key === "largeShieldDome") && Number((state.planet as any)[item.key] ?? 0) > 0; const ready = requirementsMet(requirements) && canAfford(...cost) && !uniqueAlreadyBuilt; return <article key={item.key}><div className="pw-row-art" style={{ backgroundImage: resolveGameArt(item.key, "none") }} /><div><h3>{item.name}</h3><p>Online {Number((state.planet as any)[item.key] ?? 0).toLocaleString()}</p>{costs(...cost)}{!requirementsMet(requirements) && <p className="pw-command-warning">Requires {missingRequirementLabel(requirements)}</p>}{uniqueAlreadyBuilt && <p className="pw-command-warning">Only one may be built on this planet.</p>}{!canAfford(...cost) && <p className="pw-command-warning">Insufficient resources.</p>}</div><button disabled={busy || shipyardBusy || shipyardUpgrading || !ready} onClick={() => run(`Build ${item.name}`, (client, entity) => client.buildDefense(entity, index, quantity))}>{shipyardBusy ? "QUEUE ACTIVE" : shipyardUpgrading ? "SHIPYARD UPGRADING" : uniqueAlreadyBuilt ? "ALREADY BUILT" : !requirementsMet(requirements) ? "REQUIREMENTS NOT MET" : !canAfford(...cost) ? "INSUFFICIENT RESOURCES" : "BUILD"}</button></article>; })}</div></>}
      {modal === "quests" && <><div className="pw-command-head"><span>QUEST COMMAND</span><h2>Command objectives</h2><p>Shared progression, on-chain claim state, and UTC reset windows for this commander.</p></div>{questsLoading ? <p className="pw-command-effect">Loading on-chain quest ledger...</p> : <div className="pw-quest-groups">{questGroups.map((group) => { const reset = questGroupResetSeconds(group, nowTs); const collapsed = collapsedQuestGroups[group]; const groupQuests = questDefinitions.filter((quest) => quest.group === group); return <section key={group}><header><div><span>{group}</span>{reset !== null && <b>Resets in {queueTime(reset)}</b>}</div><button onClick={() => setCollapsedQuestGroups((current) => ({ ...current, [group]: !current[group] }))}>{collapsed ? "SHOW" : "HIDE"}</button></header>{!collapsed && <div className="pw-quest-grid">{groupQuests.map((quest) => { const statuses = quest.requirements.map((requirement) => ({ ...requirement, current: requirement.current(state) })); const complete = statuses.every((requirement) => requirement.current >= requirement.required); const claimed = quest.checkIn ? dailyCheckInClaimed : hasQuestBit(questClaimedMask(quest.period, questState, nowTs), quest.id); const target = quest.period === 0 || quest.checkIn ? null : questRewardTargetForRequirement(quest.period as 1 | 2 | 3, quest.requirements[0]?.label ?? "", questTargets); const targetKey = target?.toBase58() ?? null; const wrongPlanet = !!targetKey && targetKey !== state.entityPda && targetKey !== state.planetPda; const targetName = targetKey ? (questWorldNames.get(targetKey) ?? "recorded world") : null; return <article key={`${quest.period}:${quest.id}`} className={claimed ? "claimed" : complete && !wrongPlanet ? "ready" : ""}><div className="pw-quest-title"><div><h3>{quest.title}</h3><p>{quest.hint}</p></div><b>{claimed ? "CLAIMED" : complete ? "READY" : group}</b></div>{statuses.length > 0 && <div className="pw-quest-requirements">{statuses.map((requirement) => <span key={requirement.label} className={requirement.current >= requirement.required ? "met" : ""}>{requirement.label}<b>{requirement.current}/{requirement.required}</b></span>)}</div>}<div className="pw-quest-reward"><span>Reward</span><b>{quest.reward.metal.toLocaleString()} M</b><b>{quest.reward.crystal.toLocaleString()} C</b><b>{quest.reward.deuterium.toLocaleString()} D</b></div><button disabled={busy || claimed || !complete || wrongPlanet} onClick={() => void claimQuest(quest)}>{claimed ? "CLAIMED" : wrongPlanet ? `CLAIM FROM ${targetName}` : complete ? "CLAIM" : "REQUIREMENTS"}</button></article>; })}</div>}</section>; })}</div>}</>}
      {modal === "alliance" && <><div className="pw-command-head"><span>ALLIANCE COMMAND</span><h2>{alliance?.name ?? "Alliance network"}</h2><p>{alliance ? `${alliance.memberCount} members. Shared infrastructure benefits every member.` : "Create an alliance or request membership without leaving this world."}</p></div>{allianceLoading ? <p className="pw-command-effect">Loading alliance state...</p> : !alliance || !allianceMembership ? <p className="pw-command-effect">Choose an alliance from the directory below, or establish a new command network.</p> : <><section className="pw-alliance-treasury"><div><span>Metal</span><b>{allianceTreasury?.metal.toLocaleString() ?? "0"}</b></div><div><span>Crystal</span><b>{allianceTreasury?.crystal.toLocaleString() ?? "0"}</b></div><div><span>Deuterium</span><b>{allianceTreasury?.deuterium.toLocaleString() ?? "0"}</b></div><div><span>Antimatter</span><b>{allianceTreasury ? (Number(allianceTreasury.antimatter) / 1_000_000).toLocaleString() : "0"}</b></div></section><div className="pw-alliance-buildings">{ALLIANCE_BUILDINGS.map((building) => { const currentLevel = Number((allianceTreasury as any)?.[building.key] ?? 0); const cost = allianceBuildingCost(building.id, currentLevel + 1); const leader = allianceMembership.role === 2; return <article key={building.key}><div><h3>{building.title} Lv {currentLevel}</h3><p>{building.hint}</p><span>{cost.metal.toLocaleString()} M · {cost.crystal.toLocaleString()} C · {cost.deuterium.toLocaleString()} D · {(Number(cost.antimatter) / 1_000_000).toLocaleString()} AM</span></div><button disabled={busy || !leader} onClick={() => void runAllianceAction(`Upgrade ${building.title}`, (client) => client.upgradeAllianceBuilding(building.id))}>{leader ? "UPGRADE" : "LEADER ONLY"}</button></article>; })}</div><section className="pw-alliance-roster"><header><span>MEMBERS</span><b>{allianceMembers.length}</b></header><div>{allianceMembers.map((member) => { const leader = member.role === 2; const self = member.authority === allianceMembership.authority; return <article key={member.authority}><div><h3>{shortAddress(member.authority)}</h3><p>{leader ? "Alliance leader" : "Alliance member"}</p></div>{allianceMembership.role === 2 && !leader && <div><button disabled={busy} onClick={() => void runAllianceAction("Transfer alliance leadership", (client) => client.transferAllianceLeadership(new PublicKey(member.authority)))}>MAKE LEADER</button>{!self && <button className="danger" disabled={busy} onClick={() => void runAllianceAction("Expel alliance member", (client) => client.expelAllianceMember(new PublicKey(member.authority)))}>EXPEL</button>}</div>}</article>; })}</div>{allianceMembership.role !== 2 && <button className="pw-alliance-leave" disabled={busy} onClick={() => void runAllianceAction("Leave alliance", (client) => client.leaveAlliance())}>LEAVE ALLIANCE</button>}</section>{allianceMembership.role === 2 && <section className="pw-alliance-requests"><header><span>JOIN REQUESTS</span><b>{allianceJoinRequests.length}</b></header>{allianceJoinRequests.map((request) => <article key={request.publicKey}><span>{shortAddress(request.applicant)}</span><div><button disabled={busy} onClick={() => void runAllianceAction("Approve alliance request", (client) => client.approveJoinRequest(new PublicKey(request.applicant)))}>APPROVE</button><button className="danger" disabled={busy} onClick={() => void runAllianceAction("Reject alliance request", (client) => client.rejectJoinRequest(new PublicKey(request.applicant)))}>REJECT</button></div></article>)}{allianceJoinRequests.length === 0 && <p>No pending applications.</p>}</section>}<div className="pw-alliance-missions">{(["Daily", "Weekly", "Monthly"] as const).map((group) => <section key={group}><header><span>{group} deposits</span><b>Alliance XP</b></header><div>{ALLIANCE_DEPOSIT_DEFINITIONS.filter((mission) => mission.group === group).map((mission) => <article key={`${mission.period}:${mission.id}`}><div><h3>{mission.title}</h3><p>{mission.metal > 0n && `${mission.metal.toLocaleString()} M `}{mission.crystal > 0n && `${mission.crystal.toLocaleString()} C `}{mission.deuterium > 0n && `${mission.deuterium.toLocaleString()} D `}{mission.antimatter > 0n && `${(Number(mission.antimatter) / 1_000_000).toLocaleString()} AM`}</p></div><b>+{mission.xp} XP</b><button disabled={busy} onClick={() => void depositAllianceMission(mission)}>DEPOSIT</button></article>)}</div></section>)}</div></>}</>}
      {modal === "store" && <><div className="pw-command-head"><span>COMMAND STORE</span><h2>Resource packs</h2><p>Purchases are wallet-wide and the selected world receives the on-chain resources.</p></div>{storeLoading ? <p className="pw-command-effect">Loading store configuration...</p> : !storeConfig ? <p className="pw-command-effect">The store configuration has not been initialized on this network.</p> : !storeConfig.enabled ? <p className="pw-command-effect">The store is currently disabled on-chain.</p> : <div className="pw-store-groups">{(["Daily", "Weekly", "Monthly"] as const).map((group) => { const period = group === "Daily" ? 1 : group === "Weekly" ? 2 : 3; const reset = questGroupResetSeconds(group, nowTs); return <section key={group}><header><span>{group} packs</span><b>Resets in {reset === null ? "-" : queueTime(reset)}</b></header><div>{STORE_PACKS.filter((pack) => pack.group === group).map((pack) => { const purchased = hasQuestBit(storePurchasedMask(pack.period, storePurchaseState, nowTs), pack.id); return <article key={`${pack.period}:${pack.id}`} className={purchased ? "claimed" : ""}><div><h3>{pack.title}</h3><p>{pack.hint}</p><span className="pw-usdc-price"><img src={usdcCoin} alt="" />{(Number(pack.priceUsdc) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC</span></div><div className="pw-store-reward"><b className="metal"><Pickaxe />{pack.reward.metal.toLocaleString()}</b><b className="crystal"><Gem />{pack.reward.crystal.toLocaleString()}</b><b className="deuterium"><FlaskConical />{pack.reward.deuterium.toLocaleString()}</b>{pack.shieldSeconds && <b><Shield />{Math.floor(pack.shieldSeconds / 3600)}h shield</b>}</div><button disabled={busy || purchased} onClick={() => void purchaseStorePack(pack.period, pack.id, pack.title)}>{purchased ? "PURCHASED" : "BUY"}</button></article>; })}</div></section>; })}</div>}</>}
      {modal === "activity" && <><div className="pw-command-head"><span>COMMAND INTELLIGENCE</span><h2>Battle and espionage reports</h2><p>Reconstructed from the same on-chain events used by the preserved legacy activity feed.</p></div><div className="pw-activity-toolbar"><span>{activity.battleReports.length} battle reports · {activity.spyReports.length} spy reports</span><button disabled={activity.loading} onClick={() => void activity.refresh()}>{activity.loading ? "SCANNING" : "REFRESH CHAIN"}</button></div>{activity.loading && activity.battleReports.length === 0 && activity.spyReports.length === 0 ? <p className="pw-command-effect">Scanning owned-world event history...</p> : activity.battleReports.length === 0 && activity.spyReports.length === 0 ? <p className="pw-command-effect">No battle or espionage reports have been recorded for your worlds yet.</p> : <div className="pw-activity-grid">{activity.spyReports.map(({ signature, event }) => { const resourcesVisible = event.revealLevel >= 1; const buildingsVisible = event.revealLevel >= 2; const militaryVisible = event.revealLevel >= 3; const techVisible = event.revealLevel >= 4; return <article key={`spy:${signature}`} className="spy"><header><div><span>SPY REPORT · LEVEL {event.revealLevel}</span><h3>{event.sourceGalaxy}:{event.sourceSystem}:{event.sourcePosition} → {event.targetGalaxy}:{event.targetSystem}:{event.targetPosition}</h3></div><b className={event.probesSurvived > 0 ? "good" : "danger"}>{event.probesSurvived > 0 ? "PROBES RETURNING" : "PROBES LOST"}</b></header><section><div><span>Signal / counter</span><b>{activityAmount(event.sensorScore)} / {activityAmount(event.counterScore)}</b></div><div><span>Resources</span><b>{resourcesVisible ? `${activityAmount(event.reportedMetal)} M · ${activityAmount(event.reportedCrystal)} C · ${activityAmount(event.reportedDeuterium)} D` : "HIDDEN"}</b></div><div><span>Building score</span><b>{buildingsVisible ? activityAmount(event.reportedBuildingScore) : "HIDDEN"}</b></div><div><span>Fleet / defense</span><b>{militaryVisible ? `${activityAmount(event.reportedFleetPoints)} / ${activityAmount(event.reportedDefensePoints)}` : "HIDDEN"}</b></div><div><span>Combat technology</span><b>{techVisible ? `W${event.reportedWeaponsTechnology} · S${event.reportedShieldingTechnology} · A${event.reportedArmorTechnology}` : "HIDDEN"}</b></div></section><footer><span>Probes {event.probesSurvived}/{event.probesSent}</span><span>{activityTime(event.resolvedAt)}</span><a href={`https://explorer.solana.com/tx/${signature}?cluster=${EXPLORER_CLUSTER}`} target="_blank" rel="noreferrer">VIEW TX</a></footer></article>; })}{activity.battleReports.map(({ signature, event }) => { const loot = event.lootMetal + event.lootCrystal + event.lootDeuterium; const debris = event.debrisMetal + event.debrisCrystal; const recycled = event.recycledMetal + event.recycledCrystal; return <article key={`battle:${signature}`} className="battle"><header><div><span>ATTACK REPORT · ROUND {event.combatRounds}</span><h3>{event.sourceGalaxy}:{event.sourceSystem}:{event.sourcePosition} → {event.targetGalaxy}:{event.targetSystem}:{event.targetPosition}</h3></div><b className={event.attackerWon ? "good" : "danger"}>{event.attackerWon ? "ATTACKER WON" : "ATTACKER REPELLED"}</b></header><section><div><span>Loot recovered</span><b>{activityAmount(loot)}</b></div><div><span>Generated debris</span><b>{activityAmount(debris)}</b></div><div><span>Recycled</span><b>{activityAmount(recycled)}</b></div><div><span>Attacker fleet</span><b>{event.attackerDestroyed ? "DESTROYED" : "RETURNING"}</b></div><div><span>Defender</span><b>{event.defenderSurvived ? "SURVIVED" : "DESTROYED"}</b></div></section><footer><span>{activityTime(event.resolvedAt)}</span><a href={`https://explorer.solana.com/tx/${signature}?cluster=${EXPLORER_CLUSTER}`} target="_blank" rel="noreferrer">VIEW TX</a></footer></article>; })}</div>}</>}
      {modal === "market" && <><div className="pw-command-head"><span>INTERPLANETARY MARKET</span><h2>Trade resources and worlds</h2><p>The complete legacy marketplace now runs inside the active planet command surface.</p></div><MarketTab client={market} state={state} ownedPlanets={ownedWorlds} liveRes={state.resources} antimatterBalance={allianceBalances.antimatter} onTxStart={marketControls.onTxStart} onTxEnd={marketControls.onTxEnd} txBusy={busy} sectionMode="both" canTransact={Boolean(game && market)} /></>}
      {modal === "missions" && <><div className="pw-command-head"><span>MISSION CONTROL</span><h2>Fleet operations</h2><p>Active fleet movements and new launches from this planet.</p></div><div className="pw-command-list">{state.fleet.missions.map((mission, slot) => { if (mission.missionType === 0) return null; const resolveAt = mission.applied ? mission.returnTs : mission.arriveTs; const ready = nowTs >= resolveAt; return <article key={slot}><div className="pw-mission-badge"><Crosshair /></div><div><h3>{missionName(mission.missionType)} · {mission.targetGalaxy}:{mission.targetSystem}:{mission.targetPosition}</h3><p>{mission.applied ? "Return leg" : "Outbound leg"} · {ready ? "Ready to resolve" : queueTime(Math.max(0, resolveAt - nowTs))}</p></div>{ready ? <button disabled={busy} onClick={() => resolveMission(mission, slot)}>RESOLVE</button> : <button disabled={busy} onClick={() => run("Accelerate mission", (client, entity) => client.accelerateMissionWithAntimatter(entity, slot, mission.applied ? 1 : 0))}>FINISH WITH AM</button>}</article>; })}{state.fleet.missions.every((mission) => mission.missionType === 0) && <p className="pw-command-effect">No fleet operations are currently active from this world.</p>}</div><section className="pw-launch"><h3>Launch mission</h3><div className="pw-launch-types">{[[2,"Transport"],[1,"Attack"],[6,"Espionage"],[5,"Colonize"]].map(([type, label]) => <button key={type} className={missionType === type ? "active" : ""} onClick={() => { setMissionType(Number(type)); setMissionError(""); }}>{label}</button>)}</div><div className="pw-launch-grid">{(["galaxy", "system", "position", "speed"] as const).map((field) => <label key={field}>{field}<input type="number" min={field === "speed" ? 10 : 1} max={field === "galaxy" || field === "system" ? 999 : field === "position" ? 15 : 100} value={missionTarget[field]} onChange={(event) => setMissionTarget((current) => ({ ...current, [field]: Math.max(field === "speed" ? 10 : 1, Number(event.target.value) || 1) }))} /></label>)}</div>{missionType === 5 && <label className="pw-colony-name">Colony name<input value={missionTarget.colonyName} maxLength={32} onChange={(event) => setMissionTarget((current) => ({ ...current, colonyName: event.target.value }))} /></label>}<h4>Fleet</h4><div className="pw-fleet-grid">{SHIPS.filter((ship) => ship.key !== "solarSatellite").map((ship) => <label key={ship.key}><span>{ship.name}<b>{Number((state.fleet as any)[ship.key] ?? 0).toLocaleString()}</b></span><input type="number" min="0" max={Number((state.fleet as any)[ship.key] ?? 0)} value={missionShips[ship.key] ?? ""} onChange={(event) => setMissionShips((current) => ({ ...current, [ship.key]: Math.min(Number((state.fleet as any)[ship.key] ?? 0), Math.max(0, Number(event.target.value) || 0)) }))} /></label>)}</div>{missionType !== 5 && missionType !== 6 && <><h4>Cargo</h4><div className="pw-launch-grid">{(["metal", "crystal", "deuterium"] as const).map((field) => <label key={field}>{field}<input type="number" min="0" max={Number((state.resources as any)[field] ?? 0)} value={missionCargo[field]} onChange={(event) => setMissionCargo((current) => ({ ...current, [field]: event.target.value }))} /></label>)}</div></>}{missionError && <p className="pw-launch-error">{missionError}</p>}<button className="pw-primary-action" disabled={busy} onClick={launchMission}><Rocket /> LAUNCH {missionName(missionType)}</button></section></>}
    </section></div>}
    {modal === "alliance" && !allianceLoading && !alliance && <section className="pw-alliance-onboarding"><header><span>ALLIANCE NETWORK</span><b>CREATE OR JOIN</b></header><section className="pw-alliance-intro"><h3>Build a shared command network</h3><p>Members deposit resources and ANTIMATTER for alliance XP. The leader upgrades shared buildings that benefit every member and the treasury holds the shared stockpile.</p></section><section className="pw-alliance-create"><div><b>CREATE AN ALLIANCE</b><span>500 USDC + 100,000 ANTIMATTER</span></div><div className="pw-alliance-balance"><span className={hasAllianceUsdc ? "met" : "missing"}><img src={usdcCoin} alt="" />{(Number(allianceBalances.usdc) / 1_000_000).toLocaleString()} / 500 USDC</span><span className={hasAllianceAntimatter ? "met" : "missing"}>{(Number(allianceBalances.antimatter) / 1_000_000).toLocaleString()} / 100,000 AM</span></div><div className="pw-alliance-inputs"><input placeholder="Alliance name" maxLength={32} value={allianceName} onChange={(event) => setAllianceName(event.target.value)} /><input placeholder="Tag (3 letters)" maxLength={3} value={allianceTag} onChange={(event) => setAllianceTag(event.target.value.toUpperCase())} /><input placeholder="Image URL (optional)" maxLength={160} value={allianceImageUrl} onChange={(event) => setAllianceImageUrl(event.target.value)} /></div><button disabled={busy || !canCreateAlliance} onClick={() => void createAlliance()}>{!hasAllianceUsdc || !hasAllianceAntimatter ? "REQUIREMENTS NOT MET" : "CREATE ALLIANCE"}</button></section></section>}
    {modal === "alliance" && !allianceLoading && !alliance && allianceDirectory.length > 0 && <section className="pw-alliance-directory"><header><span>ALLIANCE DIRECTORY</span><b>{allianceDirectory.length} FOUND</b></header><div>{allianceDirectory.map((item) => <article key={item.publicKey}><div><h3>{item.name} {item.tag ? `[${item.tag}]` : ""}</h3><p>Level {item.level} · {item.memberCount} members</p></div><button disabled={busy} onClick={() => void run(`Request to join ${item.name}`, (client) => client.requestJoinAlliance(new PublicKey(item.publicKey)))}>REQUEST JOIN</button></article>)}</div></section>}
  </main>;
}
