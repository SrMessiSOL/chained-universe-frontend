import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Line, OrbitControls, PerspectiveCamera, Stars, useTexture } from "@react-three/drei";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import * as THREE from "three";
import { createUniverseSnapshotFromChainData, orbitForSystemPosition, pointOnUniverseOrbit, snapshotFromPublicPlanets, type UniverseMission, type UniverseOrbit, type UniversePlanet, type UniverseSnapshot } from "./universe-data";
import { fetchAllPublicPlanets, fetchUniverseMapData } from "./game-state";
import { planetSurfaceStyle } from "./planet-style";
import "./universe-lab.css";
import oceanWorldAlbedo from "./assets/universe-lab/ocean-world-albedo.png";
import gasGiantAlbedo from "./assets/universe-lab/gas-giant-albedo.png";
import stellarCorona from "./assets/universe-lab/stellar-corona.png";
import gamesolMark from "./assets/ui/logobg.png";

const FACTION_COLORS: Record<UniversePlanet["faction"], string> = { owned: "#44f7c3", allied: "#5fa9ff", unknown: "#a8b5c9", hostile: "#ff586d" };
type ZoomLevel = "universe" | "galaxy" | "system";
type GraphicsMode = "3d" | "compat";
const MAX_GALAXY = 999;
const SYSTEMS_PER_GALAXY = 999;
const PLANETS_PER_SYSTEM = 15;
const GALAXY_SECTOR_SIZE = 128;

function detectUniverseGraphicsMode(): GraphicsMode {
  if (typeof document === "undefined") return "compat";
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { antialias: false, failIfMajorPerformanceCaveat: true });
    if (!gl) return "compat";
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return "3d";
  } catch {
    return "compat";
  }
}

const GALAXY_COLORS = ["#86d5ff", "#c597ff", "#ffbd72", "#9cf7d4", "#6d8dff", "#ff8bbf"];
const GALAXY_KINDS = ["spiral", "spiral", "barred", "elliptical"] as const;
type GalaxyDefinition = { id: string; label: string; position: [number, number, number]; density: number; kind: typeof GALAXY_KINDS[number]; tint: string; liveWorlds: number };
type StarDefinition = { color: string; scale: number; label: string; binary?: boolean; remnant?: boolean };
type GalaxySystem = { id: string; label: string; position: [number, number, number]; occupied: boolean; star: StarDefinition; planetCount: number };
export type UniverseOwnedPlanet = { entity: string; name: string; galaxy: number; system: number; position: number };
// This is one rendered sector of the backend's 1-999 galaxy range. Additional
// sectors are generated from exactly the same deterministic coordinate seed.
function buildGalaxySector(firstGalaxy: number, populations: Map<number, number>): GalaxyDefinition[] {
  return Array.from({ length: GALAXY_SECTOR_SIZE }, (_, index) => {
  const column = index % 12;
  const row = Math.floor(index / 12);
  const galaxy = firstGalaxy + index;
  return { id: `g-${galaxy}`, label: galaxy.toString().padStart(3, "0"), position: [(column - 3.5) * 58 + Math.sin(galaxy * 2.7) * 8, (row - 3.5) * 48 + Math.cos(galaxy * 1.9) * 7, Math.sin(galaxy * 0.71) * 52 + Math.cos(galaxy * 1.27) * 18] as [number, number, number], density: 24 + ((galaxy * 37) % 128), kind: GALAXY_KINDS[galaxy % GALAXY_KINDS.length], tint: GALAXY_COLORS[galaxy % GALAXY_COLORS.length], liveWorlds: populations.get(galaxy) ?? 0 };
  });
}
const STAR_TYPES: StarDefinition[] = [
  { color: "#ef4f32", scale: 0.38, label: "Red Dwarf" }, { color: "#ff9d64", scale: 0.7, label: "Orange Dwarf" }, { color: "#ffd78a", scale: 1, label: "Yellow Dwarf" }, { color: "#f8fbff", scale: 0.8, label: "White Dwarf" }, { color: "#a9d7ff", scale: 1.25, label: "Blue Giant" }, { color: "#ff7554", scale: 2.15, label: "Red Giant" }, { color: "#b9d6ff", scale: 2.5, label: "Blue Supergiant" }, { color: "#d8d1ff", scale: 0.5, label: "Neutron Star" }, { color: "#ffe19a", scale: 1.05, label: "Binary System", binary: true }, { color: "#c991ff", scale: 1.7, label: "Supernova Remnant", remnant: true },
];
function starForSystem(galaxy: number, system: number): StarDefinition { return STAR_TYPES[(galaxy * 101 + system * 31) % STAR_TYPES.length]; }
function buildGalaxySystems(galaxy: number, planets: UniversePlanet[]): GalaxySystem[] {
  const systemsByNumber = new Map<number, number>();
  for (const planet of planets) {
    const coords = planet.system.split(":").map(Number);
    if (coords[0] !== galaxy) continue;
    const systemId = coords[1] || 0;
    systemsByNumber.set(systemId, (systemsByNumber.get(systemId) ?? 0) + 1);
  }
  return Array.from({ length: SYSTEMS_PER_GALAXY }, (_, index) => {
    const systemId = index + 1;
    const arm = index % 3;
    const radius = 7 + Math.sqrt(index + 1) * 2.7;
    const angle = arm * (Math.PI * 2 / 3) + radius * 1.28 + index * 0.11;
    return {
      id: `s-${galaxy}-${systemId}`,
      label: systemId.toString().padStart(3, "0"),
      planetCount: systemsByNumber.get(systemId) ?? 0,
      position: [Math.cos(angle) * radius, ((index % 31) - 15) * 0.9 + Math.sin(index * 0.73) * 4, Math.sin(angle) * radius * 0.82] as [number, number, number],
      occupied: (systemsByNumber.get(systemId) ?? 0) > 0,
      star: starForSystem(galaxy, systemId),
    };
  });
}

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
}

function GalaxyNode({ galaxy, selected, onSelect }: { galaxy: GalaxyDefinition; selected: boolean; onSelect: () => void }) {
  const visual = useRef<THREE.Group>(null!);
  const galaxyTexture = useTexture(stellarCorona);
  galaxyTexture.colorSpace = THREE.SRGBColorSpace;
  const { stars, dust, core } = useMemo(() => {
    const random = seeded(Number(galaxy.label) * 971);
    const positions: number[] = [];
    const dustPositions: number[] = [];
    const corePositions: number[] = [];
    const count = 2600;
    for (let index = 0; index < count; index += 1) {
      const arm = index % (galaxy.kind === "spiral" ? 4 : galaxy.kind === "barred" ? 2 : 6);
      const radius = Math.pow(random(), 0.56) * 6.3 + 0.58;
      const base = arm * (Math.PI * 2 / (galaxy.kind === "barred" ? 2 : galaxy.kind === "elliptical" ? 6 : 4)) + radius * 1.62;
      const angle = base + (random() - 0.5) * (galaxy.kind === "elliptical" ? 2.9 : 0.7);
      const ellipse = galaxy.kind === "elliptical" ? 0.57 : galaxy.kind === "barred" ? 0.7 : 0.88;
      const x = Math.cos(angle) * radius;
      const y = (random() - 0.5) * (galaxy.kind === "elliptical" ? 0.72 : 0.15);
      const z = Math.sin(angle) * radius * ellipse;
      positions.push(x, y, z);
      if (index % 3 === 0) dustPositions.push(x * 1.04, y * 1.9, z * 1.04);
      if (index < 520 && index % 2 === 0) corePositions.push(x * 0.48, y * 0.7, z * 0.48);
    }
    return { stars: new Float32Array(positions), dust: new Float32Array(dustPositions), core: new Float32Array(corePositions) };
  }, [galaxy]);
  useFrame(({ clock }) => {
    if (visual.current) visual.current.rotation.y = clock.getElapsedTime() * (selected ? 0.018 : 0.009);
  });
  return <group position={galaxy.position} scale={2.1} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
    <group ref={visual} rotation={[0.18, Number(galaxy.label) * 0.12, 0]}>
      <sprite scale={[5.8, 5.8, 1]}><spriteMaterial map={galaxyTexture} color={galaxy.tint} transparent opacity={selected ? 0.27 : 0.14} blending={THREE.AdditiveBlending} depthWrite={false} /></sprite>
      <points><bufferGeometry><bufferAttribute attach="attributes-position" args={[dust, 3]} /></bufferGeometry><pointsMaterial color={galaxy.tint} size={0.22} sizeAttenuation transparent opacity={selected ? 0.25 : 0.13} blending={THREE.AdditiveBlending} depthWrite={false} /></points>
      <points><bufferGeometry><bufferAttribute attach="attributes-position" args={[stars, 3]} /></bufferGeometry><pointsMaterial color={galaxy.tint} size={0.13} sizeAttenuation transparent opacity={selected ? 1 : 0.82} blending={THREE.AdditiveBlending} depthWrite={false} /></points>
      <points><bufferGeometry><bufferAttribute attach="attributes-position" args={[core, 3]} /></bufferGeometry><pointsMaterial color="#fff4d3" size={0.23} sizeAttenuation transparent opacity={selected ? 0.95 : 0.68} blending={THREE.AdditiveBlending} depthWrite={false} /></points>
    </group>
    <mesh><sphereGeometry args={[0.72 + galaxy.density / 500, 48, 48]} /><meshBasicMaterial color="#000000" /></mesh>
    <Html center distanceFactor={30} style={{ pointerEvents: "none" }}><div className="galaxy-label"><b>GALAXY {galaxy.label}</b><span>{galaxy.liveWorlds} ON-CHAIN WORLDS</span></div></Html>
  </group>;
}

function DeepUniverseStarfield() {
  const { positions, colors } = useMemo(() => {
    const random = seeded(918_273);
    const starPositions: number[] = [];
    const starColors: number[] = [];
    const palette = [new THREE.Color("#dff7ff"), new THREE.Color("#87bdff"), new THREE.Color("#ffe5b0"), new THREE.Color("#d8c7ff")];
    for (let index = 0; index < 14_000; index += 1) {
      const radius = 380 + Math.pow(random(), .72) * 2_050;
      const longitude = random() * Math.PI * 2;
      const latitude = Math.acos(2 * random() - 1);
      const flatten = .7 + random() * .55;
      starPositions.push(Math.sin(latitude) * Math.cos(longitude) * radius, Math.cos(latitude) * radius * flatten, Math.sin(latitude) * Math.sin(longitude) * radius);
      const tint = palette[Math.floor(random() * palette.length)].clone().lerp(new THREE.Color("#ffffff"), random() * .38);
      const intensity = .58 + random() * .42;
      starColors.push(tint.r * intensity, tint.g * intensity, tint.b * intensity);
    }
    return { positions: new Float32Array(starPositions), colors: new Float32Array(starColors) };
  }, []);
  return <points><bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /><bufferAttribute attach="attributes-color" args={[colors, 3]} /></bufferGeometry><pointsMaterial vertexColors size={1.05} sizeAttenuation transparent opacity={.76} blending={THREE.AdditiveBlending} depthWrite={false} /></points>;
}

function GalaxyGlowField({ centers, populations }: { centers: Float32Array; populations: Map<number, number> }) {
  const galaxyTexture = useTexture(stellarCorona);
  galaxyTexture.colorSpace = THREE.SRGBColorSpace;
  return <group>
    {Array.from({ length: MAX_GALAXY }, (_, index) => {
      const galaxy = index + 1;
      const liveWorlds = populations.get(galaxy) ?? 0;
      const tint = GALAXY_COLORS[galaxy % GALAXY_COLORS.length];
      const size = liveWorlds > 0 ? 34 : 25;
      return <sprite key={galaxy} position={[centers[index * 3], centers[index * 3 + 1], centers[index * 3 + 2]]} scale={[size, size, 1]}>
        <spriteMaterial map={galaxyTexture} color={tint} transparent opacity={liveWorlds > 0 ? 0.2 : 0.105} blending={THREE.AdditiveBlending} depthWrite={false} />
      </sprite>;
    })}
  </group>;
}

function FullUniverseOverview({ populations, onSelect }: { populations: Map<number, number>; onSelect: (galaxy: number) => void }) {
  const hitTargets = useRef<THREE.InstancedMesh>(null!);
  const blackHoles = useRef<THREE.InstancedMesh>(null!);
  const blackHoleHalos = useRef<THREE.InstancedMesh>(null!);
  const { stars, colors, dustStars, dustColors, coreStars, coreColors, centers } = useMemo(() => {
    const starPositions: number[] = [];
    const starColors: number[] = [];
    const dustPositions: number[] = [];
    const dustColorValues: number[] = [];
    const corePositions: number[] = [];
    const coreColorValues: number[] = [];
    const centerPositions: number[] = [];
    const localPosition = new THREE.Vector3();
    for (let galaxy = 1; galaxy <= MAX_GALAXY; galaxy += 1) {
      const index = galaxy - 1;
      const column = index % 10;
      const row = Math.floor(index / 10) % 10;
      const layer = Math.floor(index / 100);
      const spatial = seeded(galaxy * 7919);
      const centerX = (column - 4.5) * 210 + (spatial() - 0.5) * 150;
      const centerY = (row - 4.5) * 175 + (spatial() - 0.5) * 130;
      const centerZ = (layer - 4.5) * 290 + (spatial() - 0.5) * 220;
      const tint = new THREE.Color(GALAXY_COLORS[galaxy % GALAXY_COLORS.length]);
      const random = seeded(galaxy * 541);
      const kind = GALAXY_KINDS[galaxy % GALAXY_KINDS.length];
      const particles = populations.has(galaxy) ? 440 : 270;
      const orientation = new THREE.Quaternion().setFromEuler(new THREE.Euler((spatial() - .5) * 1.35, spatial() * Math.PI * 2, (spatial() - .5) * 1.1));
      for (let index = 0; index < particles; index += 1) {
        const arm = index % (kind === "spiral" ? 4 : kind === "barred" ? 2 : 6);
        const coreParticle = index < particles * .28;
        const radius = coreParticle ? Math.pow(random(), 2.35) * 6.2 + .35 : Math.pow(random(), .58) * 16.5 + 1.2;
        const base = arm * (Math.PI * 2 / (kind === "barred" ? 2 : kind === "elliptical" ? 6 : 4)) + radius * .92;
        const angle = kind === "elliptical" ? random() * Math.PI * 2 : base + (random() - 0.5) * (coreParticle ? 1.25 : .48);
        const ellipse = kind === "elliptical" ? 0.57 : kind === "barred" ? 0.7 : 0.88;
        const barredCore = kind === "barred" && !coreParticle && index % 4 === 0;
        const localX = barredCore ? (random() - .5) * 25 : Math.cos(angle) * radius;
        const localY = barredCore ? (random() - .5) * 2.4 : Math.sin(angle) * radius * ellipse;
        const localZ = (random() - 0.5) * (kind === "elliptical" ? 2.2 : .7);
        localPosition.set(localX, localY, localZ).applyQuaternion(orientation);
        starPositions.push(centerX + localPosition.x, centerY + localPosition.y, centerZ + localPosition.z);
        const particleTint = tint.clone().lerp(new THREE.Color("#fff7dc"), coreParticle ? .72 : random() * .16);
        starColors.push(particleTint.r, particleTint.g, particleTint.b);
        if (index % 3 === 0) {
          dustPositions.push(centerX + localPosition.x * 1.08, centerY + localPosition.y * 1.08, centerZ + localPosition.z * 1.08);
          const dustTint = tint.clone().lerp(new THREE.Color("#b7d8ff"), .22);
          dustColorValues.push(dustTint.r, dustTint.g, dustTint.b);
        }
        if (coreParticle && index % 2 === 0) {
          corePositions.push(centerX + localPosition.x * .72, centerY + localPosition.y * .72, centerZ + localPosition.z * .72);
          const coreTint = tint.clone().lerp(new THREE.Color("#fffbe8"), .86);
          coreColorValues.push(coreTint.r, coreTint.g, coreTint.b);
        }
      }
      centerPositions.push(centerX, centerY, centerZ);
    }
    return { stars: new Float32Array(starPositions), colors: new Float32Array(starColors), dustStars: new Float32Array(dustPositions), dustColors: new Float32Array(dustColorValues), coreStars: new Float32Array(corePositions), coreColors: new Float32Array(coreColorValues), centers: new Float32Array(centerPositions) };
  }, [populations]);
  useEffect(() => {
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < MAX_GALAXY; index += 1) {
      matrix.makeTranslation(centers[index * 3], centers[index * 3 + 1], centers[index * 3 + 2]);
      hitTargets.current.setMatrixAt(index, matrix);
      blackHoles.current.setMatrixAt(index, matrix);
      blackHoleHalos.current.setMatrixAt(index, matrix);
    }
    hitTargets.current.instanceMatrix.needsUpdate = true;
    blackHoles.current.instanceMatrix.needsUpdate = true;
    blackHoleHalos.current.instanceMatrix.needsUpdate = true;
  }, [centers]);
  return <group rotation={[-0.23, 0.4, -0.08]}>
    <UniverseCoreBlackHole />
    <GalaxyGlowField centers={centers} populations={populations} />
    <points><bufferGeometry><bufferAttribute attach="attributes-position" args={[dustStars, 3]} /><bufferAttribute attach="attributes-color" args={[dustColors, 3]} /></bufferGeometry><pointsMaterial vertexColors size={1.35} sizeAttenuation transparent opacity={0.13} blending={THREE.AdditiveBlending} depthWrite={false} /></points>
    <points><bufferGeometry><bufferAttribute attach="attributes-position" args={[stars, 3]} /><bufferAttribute attach="attributes-color" args={[colors, 3]} /></bufferGeometry><pointsMaterial vertexColors size={0.46} sizeAttenuation transparent opacity={0.98} blending={THREE.AdditiveBlending} depthWrite={false} /></points>
    <points><bufferGeometry><bufferAttribute attach="attributes-position" args={[coreStars, 3]} /><bufferAttribute attach="attributes-color" args={[coreColors, 3]} /></bufferGeometry><pointsMaterial vertexColors size={0.82} sizeAttenuation transparent opacity={0.88} blending={THREE.AdditiveBlending} depthWrite={false} /></points>
    <instancedMesh ref={blackHoleHalos} args={[undefined, undefined, MAX_GALAXY]}><sphereGeometry args={[5.8, 20, 20]} /><meshBasicMaterial color="#5b4d91" transparent opacity={0.12} side={THREE.BackSide} depthWrite={false} /></instancedMesh>
    <instancedMesh ref={blackHoles} args={[undefined, undefined, MAX_GALAXY]}><sphereGeometry args={[2.5, 20, 20]} /><meshBasicMaterial color="#000000" /></instancedMesh>
    <instancedMesh ref={hitTargets} args={[undefined, undefined, MAX_GALAXY]} onClick={(event) => { event.stopPropagation(); if (typeof event.instanceId === "number") onSelect(event.instanceId + 1); }}><sphereGeometry args={[22, 10, 10]} /><meshBasicMaterial transparent opacity={0} depthWrite={false} /></instancedMesh>
  </group>;
}

function UniverseCoreBlackHole() {
  const shell = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    if (shell.current) shell.current.rotation.y = clock.getElapsedTime() * 0.025;
  });
  return <group ref={shell}>
    <mesh><sphereGeometry args={[96, 96, 96]} /><meshBasicMaterial color="#000000" /></mesh>
    <mesh scale={1.035}><sphereGeometry args={[96, 96, 96]} /><meshBasicMaterial color="#241a3c" transparent opacity={0.25} side={THREE.BackSide} depthWrite={false} /></mesh>
    <pointLight color="#7865d8" intensity={18} distance={420} />
  </group>;
}

function GalaxyBlackHole() {
  return <group><mesh><sphereGeometry args={[1.2, 64, 64]} /><meshBasicMaterial color="#000000" /></mesh><mesh scale={1.09}><sphereGeometry args={[1.2, 64, 64]} /><meshBasicMaterial color="#362d58" transparent opacity={0.08} side={THREE.BackSide} /></mesh></group>;
}

function HeroStar({ star }: { star: StarDefinition }) {
  const starTexture = useTexture(stellarCorona);
  starTexture.colorSpace = THREE.SRGBColorSpace;
  const scale = Math.max(3.8, star.scale * 6.2);
  const members = star.binary ? [[-scale * 0.3, 0, 0], [scale * 0.3, 0.14, 0]] as const : [[0, 0, 0]] as const;
  return <group>{members.map((position, index) => <sprite key={index} position={position} scale={[scale * (star.binary ? .7 : 1), scale * (star.binary ? .7 : 1), 1]}><spriteMaterial map={starTexture} color={index === 1 ? "#b7dfff" : star.color} transparent opacity={1} blending={THREE.AdditiveBlending} depthWrite={false} /></sprite>)}{star.remnant && <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[scale * .67, .12, 8, 64]} /><meshBasicMaterial color={star.color} transparent opacity={.55} /></mesh>}<pointLight intensity={4.5 * star.scale} color={star.color} distance={28} /></group>;
}

function SystemNode({ system, onSelect }: { system: GalaxySystem; onSelect: () => void }) {
  const starTexture = useTexture(stellarCorona);
  starTexture.colorSpace = THREE.SRGBColorSpace;
  const scale = (system.occupied ? 1.28 : 0.98) * system.star.scale;
  const members = system.star.binary ? [[-scale * .25, 0, 0], [scale * .25, .08, 0]] as const : [[0, 0, 0]] as const;
  return <group position={system.position} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
    {members.map((position, index) => <sprite key={index} position={position} scale={[scale * (system.star.binary ? .7 : 1), scale * (system.star.binary ? .7 : 1), 1]}><spriteMaterial map={starTexture} color={index === 1 ? "#b6ddff" : system.star.color} transparent opacity={system.occupied ? 1 : 0.74} blending={THREE.AdditiveBlending} depthWrite={false} /></sprite>)}
    {system.star.remnant && <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[scale * .72, .025, 6, 32]} /><meshBasicMaterial color={system.star.color} transparent opacity={.5} /></mesh>}
    {system.occupied && <Html center distanceFactor={26} style={{ pointerEvents: "none" }}><div className="system-label">{system.star.label}-{system.label}</div></Html>}
  </group>;
}

function PlanetNode({ planet, active, onSelect }: { planet: UniversePlanet; active: boolean; onSelect: () => void }) {
  const orbiter = React.useRef<THREE.Group>(null!);
  const mesh = React.useRef<THREE.Mesh>(null!);
  const position = Number(planet.system.split(":")[2]) || 1;
  const style = planetSurfaceStyle(position);
  const radius = (planet.faction === "owned" ? 1.2 : 0.96) * (style.className === "gas" ? 1.12 : 1);
  const orbit = planet.orbit ?? orbitForSystemPosition(position);
  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();
    if (orbiter.current) {
      const [x, y, z] = pointOnUniverseOrbit(orbit, orbit.phase + elapsed * orbit.angularVelocity);
      orbiter.current.position.set(x, y, z);
    }
    if (!mesh.current) return;
    mesh.current.rotation.y = elapsed * (planet.faction === "hostile" ? -0.22 : 0.15);
    const pulse = active ? 1 + Math.sin(elapsed * 3) * 0.055 : 1;
    mesh.current.scale.setScalar(pulse);
  });
  const oceanTexture = useTexture(oceanWorldAlbedo);
  const gasTexture = useTexture(gasGiantAlbedo);
  oceanTexture.colorSpace = THREE.SRGBColorSpace;
  gasTexture.colorSpace = THREE.SRGBColorSpace;
  oceanTexture.wrapS = THREE.RepeatWrapping;
  gasTexture.wrapS = THREE.RepeatWrapping;
  return <group ref={orbiter} position={planet.coordinates}>
    <mesh ref={mesh} onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      <sphereGeometry args={[radius, 64, 64]} />
      <meshStandardMaterial map={style.texture === "gas" ? gasTexture : oceanTexture} color={style.previewColor} emissive={style.emissive} emissiveIntensity={0.48} roughness={style.roughness} metalness={style.metalness} />
    </mesh>
    <mesh scale={1.025}><sphereGeometry args={[radius, 64, 64]} /><meshBasicMaterial color={style.atmosphere} transparent opacity={style.className === "gas" ? 0.09 : 0.16} side={THREE.BackSide} /></mesh>
    {style.rings && <mesh rotation={[Math.PI / 2.35, 0.18, 0]}><ringGeometry args={[radius * 1.32, radius * 1.82, 96]} /><meshBasicMaterial color={style.atmosphere} transparent opacity={0.38} side={THREE.DoubleSide} depthWrite={false} /></mesh>}
    <mesh scale={1.2}>
      <sphereGeometry args={[1, 32, 32]} />
      <meshBasicMaterial color={FACTION_COLORS[planet.faction]} transparent opacity={active ? 0.26 : 0.09} side={THREE.BackSide} />
    </mesh>
    {planet.shielded && <mesh rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[1.4, 0.032, 8, 64]} /><meshBasicMaterial color="#8deaff" transparent opacity={0.78} />
    </mesh>}
    <pointLight color={style.atmosphere} intensity={planet.faction === "owned" ? 1.6 : 0.85} distance={8} />
    <Html center distanceFactor={15} style={{ pointerEvents: "none" }}><div className={`universe-label ${active ? "is-active" : ""}`}><b>{planet.name}</b><span>{planet.system}</span></div></Html>
  </group>;
}

function EmptyPlanetSlot({ position, orbit, onSelect }: { position: number; orbit: UniverseOrbit; onSelect: () => void }) {
  const orbiter = React.useRef<THREE.Group>(null!);
  const style = planetSurfaceStyle(position);
  useFrame(({ clock }) => {
    if (!orbiter.current) return;
    const [x, y, z] = pointOnUniverseOrbit(orbit, orbit.phase + clock.getElapsedTime() * orbit.angularVelocity);
    orbiter.current.position.set(x, y, z);
  });
  return <group ref={orbiter} position={pointOnUniverseOrbit(orbit)}>
    <mesh onClick={(event) => { event.stopPropagation(); onSelect(); }}>
      <sphereGeometry args={[0.32, 24, 24]} />
      <meshStandardMaterial color={style.previewColor} emissive={style.emissive} emissiveIntensity={0.32} transparent opacity={0.55} roughness={style.roughness} metalness={style.metalness} />
    </mesh>
    {style.rings && <mesh rotation={[Math.PI / 2.35, 0.18, 0]}><ringGeometry args={[0.43, 0.6, 48]} /><meshBasicMaterial color={style.atmosphere} transparent opacity={0.28} side={THREE.DoubleSide} /></mesh>}
    <Html center distanceFactor={15} style={{ pointerEvents: "none" }}>
      <div className="universe-label empty-slot"><b>EMPTY</b><span>POSITION {position}</span></div>
    </Html>
  </group>;
}

function OrbitPath({ orbit }: { orbit: UniverseOrbit }) {
  const points = useMemo(() => Array.from({ length: 73 }, (_, index) => {
    const angle = (index / 72) * Math.PI * 2;
    return pointOnUniverseOrbit(orbit, angle);
  }), [orbit.ellipse, orbit.inclination, orbit.radius]);
  return <Line points={points} color="#3f607a" transparent opacity={0.32} lineWidth={0.55} />;
}

function BoundedCameraTarget({ controls, limit }: { controls: React.MutableRefObject<any>; limit: number }) {
  const { camera } = useThree();
  useFrame(() => {
    const orbit = controls.current;
    if (!orbit || orbit.target.length() <= limit) return;
    const offset = camera.position.clone().sub(orbit.target);
    orbit.target.setLength(limit);
    camera.position.copy(orbit.target).add(offset);
    orbit.update();
  });
  return null;
}

function CenteredUniverseCamera({ controls, enabled }: { controls: React.MutableRefObject<any>; enabled: boolean }) {
  useEffect(() => {
    if (!enabled || !controls.current) return;
    controls.current.target.set(0, 0, 0);
    controls.current.update();
  }, [controls, enabled]);
  return null;
}

function CameraZoom({ command, controls, minDistance, maxDistance }: { command: { id: number; direction: "in" | "out" }; controls: React.MutableRefObject<any>; minDistance: number; maxDistance: number }) {
  const { camera } = useThree();
  useEffect(() => {
    const orbit = controls.current;
    if (!command.id || !orbit) return;
    const offset = camera.position.clone().sub(orbit.target).multiplyScalar(command.direction === "in" ? 0.72 : 1.38);
    offset.setLength(THREE.MathUtils.clamp(offset.length(), minDistance, maxDistance));
    camera.position.copy(orbit.target).add(offset);
    orbit.update();
  }, [camera, command, controls, maxDistance, minDistance]);
  return null;
}

function FleetRoute({ mission, planets }: { mission: UniverseMission; planets: UniversePlanet[] }) {
  const source = planets.find((planet) => planet.id === mission.sourceId);
  const target = planets.find((planet) => planet.id === mission.destinationId);
  const vessel = React.useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (!source || !target || !vessel.current) return;
    const progress = (mission.progress + clock.getElapsedTime() * 0.003) % 1;
    vessel.current.position.lerpVectors(new THREE.Vector3(...source.coordinates), new THREE.Vector3(...target.coordinates), progress);
  });
  if (!source || !target) return null;
  const color = mission.kind === "attack" ? "#ff586d" : mission.kind === "espionage" ? "#d998ff" : "#45f4c1";
  return <group><Line points={[source.coordinates, target.coordinates]} color={color} transparent opacity={0.42} lineWidth={1.2} dashed dashScale={3} dashSize={0.3} gapSize={0.2} />
    <mesh ref={vessel}><octahedronGeometry args={[0.13, 0]} /><meshBasicMaterial color={color} /></mesh>
  </group>;
}

function WebGLContextMonitor({ onContextLost }: { onContextLost: () => void }) {
  const { gl } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      onContextLost();
    };
    canvas.addEventListener("webglcontextlost", handleContextLost);
    return () => canvas.removeEventListener("webglcontextlost", handleContextLost);
  }, [gl, onContextLost]);
  return null;
}

function SectorScene({ snapshot, selected, level, fullUniverse, galaxySectorStart, selectedGalaxy, selectedSystem, cameraZoom, galaxyPopulations, systems, onSelect, onEmptySlotSelect, onLevelChange, onGalaxySelect, onSystemSelect, onFullGalaxySelect, onContextLost }: { snapshot: UniverseSnapshot; selected: UniversePlanet; level: ZoomLevel; fullUniverse: boolean; galaxySectorStart: number; selectedGalaxy: number; selectedSystem: number; cameraZoom: { id: number; direction: "in" | "out" }; galaxyPopulations: Map<number, number>; systems: GalaxySystem[]; onSelect: (planet: UniversePlanet) => void; onEmptySlotSelect: (target: { galaxy: number; system: number; position: number }) => void; onLevelChange: (level: ZoomLevel) => void; onGalaxySelect: (galaxy: number) => void; onSystemSelect: (system: number) => void; onFullGalaxySelect: (galaxy: number) => void; onContextLost: () => void }) {
  const galaxies = useMemo(() => buildGalaxySector(galaxySectorStart, galaxyPopulations), [galaxySectorStart, galaxyPopulations]);
  const cameraPosition: [number, number, number] = fullUniverse ? [0, 30, 2050] : level === "universe" ? [0, 18, 190] : level === "galaxy" ? [0, 14, 94] : [0, 8, 74];
  // The global map is bounded, but players can still approach any region of it.
  const cameraMinDistance = level === "universe" ? (fullUniverse ? 30 : 30) : level === "galaxy" ? 25 : 12;
  const cameraMaxDistance = level === "universe" ? (fullUniverse ? 2600 : 620) : level === "galaxy" ? 160 : 130;
  const targetLimit = level === "universe" ? (fullUniverse ? 1200 : 80) : level === "galaxy" ? 38 : 16;
  const controls = useRef<any>(null);
  return <Canvas key={`${level}-${fullUniverse ? "all" : "sector"}-${galaxySectorStart}-${selectedGalaxy}`} dpr={[1, 2]} gl={{ antialias: true }} onCreated={({ gl }) => gl.setClearColor("#02050d")}>
    <WebGLContextMonitor onContextLost={onContextLost} />
    <PerspectiveCamera makeDefault position={cameraPosition} fov={fullUniverse ? 46 : level === "universe" ? 44 : 42} />
    <ambientLight intensity={0.42} /><pointLight position={[0, 0, 0]} color="#51bfff" intensity={22} distance={26} />
    <pointLight position={[-8, 4, 6]} color="#ff6a38" intensity={6} distance={16} />
    {level === "universe" && fullUniverse ? <DeepUniverseStarfield /> : <Stars radius={170} depth={90} count={10500} factor={3.6} saturation={0.14} fade speed={0.25} />}
    {level === "universe" && <>
      {fullUniverse ? <FullUniverseOverview populations={galaxyPopulations} onSelect={onFullGalaxySelect} /> : galaxies.map((galaxy) => <GalaxyNode key={galaxy.id} galaxy={galaxy} selected={galaxy.id === `g-${selectedGalaxy}`} onSelect={() => { onGalaxySelect(Number(galaxy.label)); onLevelChange("galaxy"); }} />)}
      <Html center position={[0, -12, 0]} style={{ pointerEvents: "none" }}><div className="scene-caption">PUBLIC UNIVERSE - ALL KNOWN GALAXIES</div></Html>
    </>}
    {level === "galaxy" && <>
      <GalaxyBlackHole />
      {systems.map((system) => <SystemNode key={system.id} system={system} onSelect={() => { onSystemSelect(Number(system.label)); onLevelChange("system"); }} />)}
      <Html center position={[0, -6.1, 0]} style={{ pointerEvents: "none" }}><div className="scene-caption">{`GALAXY ${selectedGalaxy} - ${SYSTEMS_PER_GALAXY} SYSTEMS - ${systems.filter((system) => system.occupied).length} OCCUPIED`}</div></Html>
    </>}
    {level === "system" && <>
      <HeroStar star={starForSystem(selectedGalaxy, selectedSystem)} />
      {Array.from({ length: PLANETS_PER_SYSTEM }, (_, index) => index + 1).map((position) => {
        const planet = snapshot.planets.find((candidate) => Number(candidate.system.split(":")[2]) === position);
        const orbit = planet?.orbit ?? orbitForSystemPosition(position, selectedGalaxy * 1000 + selectedSystem);
        return <React.Fragment key={planet?.id ?? `empty-${position}`}><OrbitPath orbit={orbit} />{planet ? <PlanetNode planet={planet} active={selected.id === planet.id} onSelect={() => onSelect(planet)} /> : <EmptyPlanetSlot position={position} orbit={orbit} onSelect={() => onEmptySlotSelect({ galaxy: selectedGalaxy, system: selectedSystem, position })} />}</React.Fragment>;
      })}
      {snapshot.missions.map((mission) => <FleetRoute key={mission.id} mission={mission} planets={snapshot.planets} />)}
      <Html center position={[0, -3.1, 0]} style={{ pointerEvents: "none" }}><div className="scene-caption">{`GALAXY ${selectedGalaxy} - SYSTEM ${selectedSystem} - ${starForSystem(selectedGalaxy, selectedSystem).label.toUpperCase()}`}</div></Html>
    </>}
    <OrbitControls ref={controls} enablePan enableDamping dampingFactor={0.08} minDistance={cameraMinDistance} maxDistance={cameraMaxDistance} maxPolarAngle={Math.PI * 0.82} minPolarAngle={Math.PI * 0.22} autoRotate={false} />
    <CenteredUniverseCamera controls={controls} enabled={level === "universe" && fullUniverse} />
    <BoundedCameraTarget controls={controls} limit={targetLimit} />
    <CameraZoom command={cameraZoom} controls={controls} minDistance={cameraMinDistance} maxDistance={cameraMaxDistance} />
  </Canvas>;
}

function CompatibilityUniverseScene({ snapshot, level, selectedGalaxy, selectedSystem, galaxyPopulations, systems, onSelect, onEmptySlotSelect, onLevelChange, onGalaxySelect, onSystemSelect }: { snapshot: UniverseSnapshot; level: ZoomLevel; selectedGalaxy: number; selectedSystem: number; galaxyPopulations: Map<number, number>; systems: GalaxySystem[]; onSelect: (planet: UniversePlanet) => void; onEmptySlotSelect: (target: { galaxy: number; system: number; position: number }) => void; onLevelChange: (level: ZoomLevel) => void; onGalaxySelect: (galaxy: number) => void; onSystemSelect: (system: number) => void }) {
  const knownGalaxies = useMemo(() => {
    const galaxies = new Set<number>([selectedGalaxy, ...galaxyPopulations.keys()]);
    return [...galaxies].sort((a, b) => a - b);
  }, [galaxyPopulations, selectedGalaxy]);
  const availableSystems = useMemo(() => {
    const occupied = systems.filter((system) => system.occupied);
    const current = systems.find((system) => Number(system.label) === selectedSystem);
    return current && !occupied.includes(current) ? [current, ...occupied] : occupied;
  }, [selectedSystem, systems]);

  return <div className="compat-universe" role="region" aria-label="Compatibility universe navigator">
    <div className="compat-universe-heading"><span>COMPATIBILITY NAVIGATION</span><b>{level.toUpperCase()}</b></div>
    {level === "universe" && <>
      <h2>Known galaxies</h2>
      <p>This device is using the lightweight map. All navigation and planet actions remain available.</p>
      <div className="compat-grid galaxies">{knownGalaxies.map((galaxy) => <button key={galaxy} className={galaxy === selectedGalaxy ? "is-active" : ""} onClick={() => { onGalaxySelect(galaxy); onLevelChange("galaxy"); }}><span>GALAXY</span><b>{String(galaxy).padStart(3, "0")}</b><small>{galaxyPopulations.get(galaxy) ?? 0} ON-CHAIN WORLDS</small></button>)}</div>
    </>}
    {level === "galaxy" && <>
      <h2>Galaxy {selectedGalaxy}</h2>
      <p>{availableSystems.filter((system) => system.occupied).length} occupied systems detected. Use the coordinate controls above to visit any other system.</p>
      <div className="compat-grid systems">{availableSystems.map((system) => <button key={system.id} className={Number(system.label) === selectedSystem ? "is-active" : ""} onClick={() => { onSystemSelect(Number(system.label)); onLevelChange("system"); }}><span>{system.star.label}</span><b>SYSTEM {system.label}</b><small>{system.planetCount} PLANETS</small></button>)}</div>
    </>}
    {level === "system" && <>
      <h2>Galaxy {selectedGalaxy} · System {selectedSystem}</h2>
      <p>{starForSystem(selectedGalaxy, selectedSystem).label} · Select a planet or an empty position.</p>
      <div className="compat-orbits">{Array.from({ length: PLANETS_PER_SYSTEM }, (_, index) => index + 1).map((position) => {
        const planet = snapshot.planets.find((candidate) => Number(candidate.system.split(":")[2]) === position);
        return <button key={position} className={planet ? `has-planet faction-${planet.faction}` : "is-empty"} onClick={() => planet ? onSelect(planet) : onEmptySlotSelect({ galaxy: selectedGalaxy, system: selectedSystem, position })}><span className="compat-planet-dot" /><span><b>{planet?.name ?? `Empty position ${position}`}</b><small>POSITION {position}{planet ? ` · ${planet.faction.toUpperCase()}` : ""}</small></span><em>{planet ? "SELECT" : "TARGET"}</em></button>;
      })}</div>
    </>}
  </div>;
}

export default function UniverseLab({ embedded = false, onOpenCommand, onOpenEmptyTarget, ownedPlanets = [], activeOwnedPlanet, onOperatePlanet, initialGalaxy, initialSystem }: { embedded?: boolean; onOpenCommand?: (planet: UniversePlanet) => void; onOpenEmptyTarget?: (target: { galaxy: number; system: number; position: number }) => void; ownedPlanets?: UniverseOwnedPlanet[]; activeOwnedPlanet?: string; onOperatePlanet?: (planet: UniverseOwnedPlanet) => void; initialGalaxy?: number; initialSystem?: number }) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [snapshot, setSnapshot] = useState<UniverseSnapshot | null>(null);
  const [selected, setSelected] = useState<UniversePlanet | null>(null);
  const [hudOpen, setHudOpen] = useState(() => typeof window === "undefined" || !window.matchMedia("(max-width: 700px)").matches);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>(initialGalaxy && initialSystem ? "system" : "universe");
  const fullUniverse = true;
  const [galaxyPopulations, setGalaxyPopulations] = useState<Map<number, number>>(() => new Map());
  const [selectedGalaxy, setSelectedGalaxy] = useState(initialGalaxy ?? 1);
  const [selectedSystem, setSelectedSystem] = useState(initialSystem ?? 1);
  const [cameraZoom, setCameraZoom] = useState<{ id: number; direction: "in" | "out" }>({ id: 0, direction: "in" });
  const [galaxyInput, setGalaxyInput] = useState(String(initialGalaxy ?? 1));
  const [systemInput, setSystemInput] = useState(String(initialSystem ?? 1));
  const [graphicsMode, setGraphicsMode] = useState<GraphicsMode>(detectUniverseGraphicsMode);

  const mapToSnapshot = (chainPlanets: Array<{
    entity: string;
    owner: string;
    name: string;
    galaxy: number;
    system: number;
    position: number;
    planetIndex: number;
    diameter: number;
    temperature: number;
    maxFields: number;
    createdAt: number;
    protectionUntilTs: number;
    lastAttackedTs: number;
    metal: bigint;
    crystal: bigint;
    deuterium: bigint;
    smallCargo: number;
    largeCargo: number;
    lightFighter: number;
    heavyFighter: number;
    cruiser: number;
    battleship: number;
    battlecruiser: number;
    bomber: number;
    destroyer: number;
    deathstar: number;
    missions: any[];
  }>) => {
    return createUniverseSnapshotFromChainData(
      chainPlanets.map((planet) => ({
        ...planet,
        smallCargo: planet.smallCargo,
        largeCargo: planet.largeCargo,
        lightFighter: planet.lightFighter,
        heavyFighter: planet.heavyFighter,
        cruiser: planet.cruiser,
        battleship: planet.battleship,
        battlecruiser: planet.battlecruiser,
        bomber: planet.bomber,
        destroyer: planet.destroyer,
        deathstar: planet.deathstar,
        missions: planet.missions,
      })),
      { viewer: publicKey?.toBase58() ?? null },
    );
  };

  const applySnapshot = (next: UniverseSnapshot) => {
    const populations = new Map<number, number>();
    let newSelected = next.planets[0] ?? null;
    if (selected?.id && next.planets.some((planet) => planet.id === selected.id)) {
      newSelected = next.planets.find((planet) => planet.id === selected.id) ?? newSelected;
    }
    setSelected(newSelected);
    setSnapshot(next);
    for (const planet of next.planets) {
      const galaxy = Number(planet.system.split(":")[0]);
      populations.set(galaxy, (populations.get(galaxy) ?? 0) + 1);
    }
    setGalaxyPopulations(populations);
    if (populations.size > 0) {
      const firstLiveGalaxy = Math.min(...populations.keys());
      if (!selectedGalaxy || !populations.has(selectedGalaxy)) {
        setSelectedGalaxy(firstLiveGalaxy);
      }
    }
  };

  const fetchFallbackUniverse = async () => {
    const publicPlanets = await fetchAllPublicPlanets(connection);
    const fallbackSnapshot = snapshotFromPublicPlanets(
      publicPlanets.map((planet) => ({
        entity: planet.entity,
        owner: planet.owner,
        name: planet.name,
        galaxy: planet.galaxy,
        system: planet.system,
        position: planet.position,
        planetIndex: planet.planetIndex,
      })),
    );
    applySnapshot(fallbackSnapshot);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const chainPlanets = await fetchUniverseMapData(connection);
        if (cancelled) return;
        if (!chainPlanets || chainPlanets.length === 0) throw new Error("No on-chain planets");
        applySnapshot(mapToSnapshot(chainPlanets));
        return;
      } catch {
        if (cancelled) return;
        try {
          await fetchFallbackUniverse();
        } catch {
        }
      }
    };

    void load();
    const timer = setInterval(() => {
      void load();
    }, 20000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [connection, publicKey?.toBase58()]);
  const visiblePlanets = useMemo(() => {
    if (!snapshot) return [];
    if (zoomLevel === "galaxy") {
      return snapshot.planets.filter((planet) => Number(planet.system.split(":")[0]) === selectedGalaxy);
    }
    if (zoomLevel === "system") {
      return snapshot.planets.filter((planet) => {
        const [planetGalaxy, planetSystem] = planet.system.split(":").map(Number);
        return planetGalaxy === selectedGalaxy && planetSystem === selectedSystem;
      });
    }
    return snapshot.planets;
  }, [snapshot, zoomLevel, selectedGalaxy, selectedSystem]);
  const galaxySystems = useMemo(() => {
    if (!snapshot) return [];
    return buildGalaxySystems(selectedGalaxy, snapshot.planets.filter((planet) => Number(planet.system.split(":")[0]) === selectedGalaxy));
  }, [snapshot, selectedGalaxy]);
  const openGalaxyFromOverview = (galaxy: number) => {
    setSelectedGalaxy(galaxy);
    setZoomLevel("galaxy");
  };
  const visitCoordinates = () => {
    const nextGalaxy = Number(galaxyInput);
    const nextSystem = Number(systemInput);
    if (!Number.isInteger(nextGalaxy) || !Number.isInteger(nextSystem) || nextGalaxy < 1 || nextGalaxy > MAX_GALAXY || nextSystem < 1 || nextSystem > SYSTEMS_PER_GALAXY) return;
    setSelectedGalaxy(nextGalaxy);
    setSelectedSystem(nextSystem);
    setZoomLevel("system");
  };
  const activePlanet = ownedPlanets.find((planet) => planet.entity === activeOwnedPlanet);
  if (!snapshot || !selected) return <div className="universe-loading">CALIBRATING NAVIGATION ARRAY</div>;
  return <main className={`universe-lab${embedded ? " embedded" : ""}`}>
    <div className="universe-scene">
      {graphicsMode === "3d" ? <Suspense fallback={null}>
        <SectorScene
          snapshot={{ ...snapshot, planets: visiblePlanets }}
          selected={selected}
          level={zoomLevel}
          fullUniverse={fullUniverse}
          galaxySectorStart={1}
          selectedGalaxy={selectedGalaxy}
          selectedSystem={selectedSystem}
          cameraZoom={cameraZoom}
          galaxyPopulations={galaxyPopulations}
          systems={galaxySystems}
          onSelect={(planet) => {
            setSelected(planet);
            onOpenCommand?.(planet);
          }}
          onEmptySlotSelect={(target) => onOpenEmptyTarget?.(target)}
          onLevelChange={setZoomLevel}
          onGalaxySelect={setSelectedGalaxy}
          onSystemSelect={setSelectedSystem}
          onFullGalaxySelect={openGalaxyFromOverview}
          onContextLost={() => setGraphicsMode("compat")}
        />
      </Suspense> : <CompatibilityUniverseScene
        snapshot={{ ...snapshot, planets: visiblePlanets }}
        level={zoomLevel}
        selectedGalaxy={selectedGalaxy}
        selectedSystem={selectedSystem}
        galaxyPopulations={galaxyPopulations}
        systems={galaxySystems}
        onSelect={(planet) => {
          setSelected(planet);
          onOpenCommand?.(planet);
        }}
        onEmptySlotSelect={(target) => onOpenEmptyTarget?.(target)}
        onLevelChange={setZoomLevel}
        onGalaxySelect={setSelectedGalaxy}
        onSystemSelect={setSelectedSystem}
      />}
    </div>
    <header className="universe-topbar"><a href="/" className="universe-brand" aria-label="GAMESOL home"><img src={gamesolMark} alt="GAMESOL" /></a><div className="zoom-controls"><button className="camera-zoom" disabled={graphicsMode === "compat"} onClick={() => setCameraZoom(({ id }) => ({ id: id + 1, direction: "out" }))} aria-label="Zoom camera out">−</button><button className="camera-zoom" disabled={graphicsMode === "compat"} onClick={() => setCameraZoom(({ id }) => ({ id: id + 1, direction: "in" }))} aria-label="Zoom camera in">+</button><div className="coordinate-jump"><input aria-label="Galaxy number" inputMode="numeric" value={galaxyInput} onChange={(event) => setGalaxyInput(event.target.value)} /><span>:</span><input aria-label="System number" inputMode="numeric" value={systemInput} onChange={(event) => setSystemInput(event.target.value)} /><button onClick={visitCoordinates}>GO</button></div><button disabled={zoomLevel === "universe"} onClick={() => setZoomLevel(zoomLevel === "system" ? "galaxy" : "universe")}>LEVEL OUT</button><b>{graphicsMode === "compat" ? `COMPAT · ${zoomLevel.toUpperCase()}` : zoomLevel.toUpperCase()}</b><button disabled={zoomLevel === "system"} onClick={() => setZoomLevel(zoomLevel === "universe" ? "galaxy" : "system")}>LEVEL IN</button>{ownedPlanets.length > 0 && <button onClick={() => setHudOpen(!hudOpen)}>{hudOpen ? "HIDE PLANETS" : "SHOW PLANETS"}</button>}</div></header>
    {ownedPlanets.length > 0 && <aside className={`universe-intel ${hudOpen ? "" : "is-hidden"}`}><div className="intel-kicker">COMMAND NETWORK</div><div className="roster-heading"><div><h1>Your planets</h1><p>{ownedPlanets.length} worlds under your control</p></div><b>{ownedPlanets.length}</b></div>{activePlanet && <button className="visit-active-system" onClick={() => { setSelectedGalaxy(activePlanet.galaxy); setSelectedSystem(activePlanet.system); setGalaxyInput(String(activePlanet.galaxy)); setSystemInput(String(activePlanet.system)); setZoomLevel("system"); }}>VISIT ACTIVE SYSTEM</button>}<div className="owned-planet-roster">{ownedPlanets.map((planet, index) => <button className={planet.entity === activeOwnedPlanet ? "is-active" : ""} key={planet.entity} onClick={() => onOperatePlanet?.(planet)}><span className="roster-index">{String(index + 1).padStart(2, "0")}</span><span className="roster-planet"><b>{planet.name}</b><small>G {planet.galaxy} · S {planet.system} · P {planet.position}</small></span><em>{planet.entity === activeOwnedPlanet ? "ACTIVE" : "OPERATE"}</em></button>)}</div></aside>}
  </main>;
}

