import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SendTransactionError,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  AccountMeta,
} from "@solana/web3.js";
import { AnchorProvider, setProvider } from "@coral-xyz/anchor";

export const GAME_STATE_PROGRAM_ID = new PublicKey("7yKyjQ7m8tSqvqYnV65aVV9Jwdee7KqyELeDXf6Fxkt4");
export const DELEGATION_PROGRAM_ID = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");
export const MAGIC_PROGRAM_ID = new PublicKey("Magic11111111111111111111111111111111111111");
export const MAGIC_CONTEXT_ID = new PublicKey("MagicContext1111111111111111111111111111111");
export const RPC_ENDPOINT = "https://api.devnet.solana.com";
export const ER_RPC = "https://devnet-router.magicblock.app";
export const ER_DIRECT_RPC = "https://devnet-us.magicblock.app";
const BURNER_MIN_BALANCE_LAMPORTS = 2_000_000;
const BURNER_TARGET_BALANCE_LAMPORTS = 10_000_000;
const BURNER_BACKUP_VERSION = 1;
const BURNER_RECOVERY_MESSAGE_PREFIX = "Chained Universe burner recovery v1";
const BURNER_CACHE_VERSION = 1;
const BURNER_CACHE_STORAGE_PREFIX = "chained_universe_burner_cache_v1";
const BURNER_CACHE_DEVICE_KEY_STORAGE = "chained_universe_burner_cache_device_key_v1";
const DEVNET_VALIDATOR = new PublicKey("MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd"); // US devnet

const PLAYER_PROFILE_DISCRIMINATOR = Buffer.from([82, 226, 99, 87, 164, 130, 181, 80]);
const PLANET_STATE_DISCRIMINATOR = Buffer.from([1, 25, 230, 69, 194, 252, 152, 240]);
const AUTHORIZED_BURNER_DISCRIMINATOR = Buffer.from([167, 224, 219, 12, 187, 156, 26, 90]);
const BURNER_BACKUP_DISCRIMINATOR = Buffer.from([238, 218, 213, 56, 222, 98, 210, 20]);

const IX = {
  initializePlayer: Buffer.from([79, 249, 88, 177, 220, 62, 56, 128]),
  initializeHomeworld: Buffer.from([124, 7, 81, 167, 80, 191, 227, 173]),
  initializeColony: Buffer.from([91, 184, 105, 243, 90, 175, 137, 217]),
  delegate: Buffer.from([90, 147, 75, 178, 85, 88, 4, 137]),
  registerBurner: Buffer.from([86, 28, 173, 191, 72, 62, 79, 125]),
  revokeBurner: Buffer.from([112, 30, 140, 138, 225, 80, 254, 174]),
  extendBurner: Buffer.from([125, 231, 53, 204, 60, 68, 254, 46]),
  upsertBurnerBackup: Buffer.from([165, 118, 142, 79, 113, 18, 90, 116]),
  deleteBurnerBackup: Buffer.from([38, 198, 244, 144, 35, 215, 77, 159]),
  produceBurner: Buffer.from([136, 102, 176, 125, 55, 146, 27, 107]),
  startBuild: Buffer.from([243, 32, 82, 71, 153, 119, 168, 6]),
  startBuildBurner: Buffer.from([35, 11, 14, 189, 19, 212, 226, 141]),
  finishBuild: Buffer.from([67, 114, 22, 130, 241, 73, 183, 140]),
  finishBuildBurner: Buffer.from([147, 93, 29, 18, 163, 219, 137, 224]),
  startResearch: Buffer.from([175, 179, 153, 18, 254, 39, 12, 126]),
  startResearchBurner: Buffer.from([165, 116, 5, 191, 4, 154, 97, 65]),
  finishResearch: Buffer.from([213, 3, 235, 30, 13, 68, 227, 86]),
  finishResearchBurner: Buffer.from([246, 91, 111, 168, 119, 195, 48, 28]),
  buildShip: Buffer.from([213, 16, 198, 123, 106, 214, 120, 157]),
  buildShipBurner: Buffer.from([99, 31, 34, 12, 40, 1, 66, 153]),
  launchFleet: Buffer.from([54, 168, 21, 184, 175, 6, 32, 5]),
  launchFleetBurner: Buffer.from([177, 82, 80, 210, 153, 107, 211, 56]),
  resolveTransport: Buffer.from([123, 85, 232, 96, 135, 53, 52, 32]),
  resolveTransportBurner: Buffer.from([158, 208, 80, 41, 30, 199, 255, 212]),
  resolveColonize: Buffer.from([229, 191, 212, 205, 242, 178, 50, 79]),
  resolveColonizeBurner: Buffer.from([129, 122, 173, 189, 121, 100, 249, 53]),
  commitPlanetState: Buffer.from([230, 31, 100, 83, 140, 6, 40, 154]),
  commitTwoPlanetStates: Buffer.from([204, 235, 28, 222, 148, 58, 229, 168]),
  commitAndUndelegatePlanetState: Buffer.from([241, 53, 136, 145, 235, 32, 47, 95]),
  commitAndUndelegateTwoPlanetStates: Buffer.from([152, 231, 191, 138, 92, 198, 202, 172]),
} as const;

const MAX_MISSIONS = 4;
const TRANSPORT_MISSION = 2;
const COLONIZE_MISSION = 5;
const MAX_PLANET_NAME_LEN = 32;
const MAX_MISSION_COLONY_NAME_LEN = 32;

export interface Mission {
  missionType: number;
  destination: string;
  targetGalaxy: number;
  targetSystem: number;
  targetPosition: number;
  colonyName: string;
  departTs: number;
  arriveTs: number;
  returnTs: number;
  sSmallCargo: number;
  sLargeCargo: number;
  sLightFighter: number;
  sHeavyFighter: number;
  sCruiser: number;
  sBattleship: number;
  sBattlecruiser: number;
  sBomber: number;
  sDestroyer: number;
  sDeathstar: number;
  sRecycler: number;
  sEspionageProbe: number;
  sColonyShip: number;
  cargoMetal: bigint;
  cargoCrystal: bigint;
  cargoDeuterium: bigint;
  applied: boolean;
}

export interface Planet {
  creator: string;
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
  usedFields: number;
  metalMine: number;
  crystalMine: number;
  deuteriumSynthesizer: number;
  solarPlant: number;
  fusionReactor: number;
  roboticsFactory: number;
  naniteFactory: number;
  shipyard: number;
  metalStorage: number;
  crystalStorage: number;
  deuteriumTank: number;
  researchLab: number;
  missileSilo: number;
  buildQueueItem: number;
  buildQueueTarget: number;
  buildFinishTs: number;
}

export interface Research {
  creator: string;
  energyTech: number;
  combustionDrive: number;
  impulseDrive: number;
  hyperspaceDrive: number;
  computerTech: number;
  astrophysics: number;
  igrNetwork: number;
  queueItem: number;
  queueTarget: number;
  researchFinishTs: number;
}

export interface Resources {
  metal: bigint;
  crystal: bigint;
  deuterium: bigint;
  metalHour: bigint;
  crystalHour: bigint;
  deuteriumHour: bigint;
  energyProduction: bigint;
  energyConsumption: bigint;
  metalCap: bigint;
  crystalCap: bigint;
  deuteriumCap: bigint;
  lastUpdateTs: number;
}

export interface Fleet {
  creator: string;
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
  recycler: number;
  espionageProbe: number;
  colonyShip: number;
  solarSatellite: number;
  activeMissions: number;
  missions: Mission[];
}

export interface PlayerState {
  planet: Planet;
  resources: Resources;
  fleet: Fleet;
  research: Research;
  entityPda: string;
  planetPda: string;
  fleetPda: string;
  resourcesPda: string;
  researchPda: string;
  isDelegated: boolean;
}

export interface BurnerRecoveryPromptRequest {
  mode: "create" | "unlock";
  wallet: string;
  planet: string;
}

export type BurnerRecoveryPromptHandler = (request: BurnerRecoveryPromptRequest) => Promise<string>;

interface GameClientOptions {
  requestBurnerRecoveryPassphrase?: BurnerRecoveryPromptHandler;
}

interface BurnerLocalCacheRecord {
  version: number;
  wallet: string;
  planet: string;
  burner: string;
  iv: string;
  ciphertext: string;
  updatedAt: number;
}

export interface LaunchFleetTarget {
  galaxy: number;
  system: number;
  position: number;
  colonyName?: string;
}

export type ProgressReporter = (message: string) => void;

interface PlayerProfileAccount {
  authority: PublicKey;
  planetCount: number;
}

interface PlanetStateAccount {
  authority: PublicKey;
  player: PublicKey;
  planetIndex: number;
  galaxy: number;
  system: number;
  position: number;
  name: string;
  diameter: number;
  temperature: number;
  maxFields: number;
  usedFields: number;
  metalMine: number;
  crystalMine: number;
  deuteriumSynthesizer: number;
  solarPlant: number;
  fusionReactor: number;
  roboticsFactory: number;
  naniteFactory: number;
  shipyard: number;
  metalStorage: number;
  crystalStorage: number;
  deuteriumTank: number;
  researchLab: number;
  missileSilo: number;
  energyTech: number;
  combustionDrive: number;
  impulseDrive: number;
  hyperspaceDrive: number;
  computerTech: number;
  astrophysics: number;
  igrNetwork: number;
  researchQueueItem: number;
  researchQueueTarget: number;
  researchFinishTs: number;
  buildQueueItem: number;
  buildQueueTarget: number;
  buildFinishTs: number;
  metal: bigint;
  crystal: bigint;
  deuterium: bigint;
  metalHour: bigint;
  crystalHour: bigint;
  deuteriumHour: bigint;
  energyProduction: bigint;
  energyConsumption: bigint;
  metalCap: bigint;
  crystalCap: bigint;
  deuteriumCap: bigint;
  lastUpdateTs: number;
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
  recycler: number;
  espionageProbe: number;
  colonyShip: number;
  solarSatellite: number;
  activeMissions: number;
  missions: Mission[];
}

interface AuthorizedBurnerAccount {
  authority: PublicKey;
  burner: PublicKey;
  planet: PublicKey;
  expiresAt: number;
  revoked: boolean;
  bump: number;
}

interface BurnerBackupAccount {
  authority: PublicKey;
  planet: PublicKey;
  burner: PublicKey;
  version: number;
  ciphertext: Uint8Array;
  iv: Uint8Array;
  salt: Uint8Array;
  kdfSalt: Uint8Array;
  updatedAt: number;
  bump: number;
}

class BorshWriter {
  private chunks: Buffer[] = [];

  writeU8(value: number): void { this.chunks.push(Buffer.from([value & 0xff])); }
  writeU16(value: number): void { const b = Buffer.alloc(2); b.writeUInt16LE(value, 0); this.chunks.push(b); }
  writeU32(value: number): void { const b = Buffer.alloc(4); b.writeUInt32LE(value, 0); this.chunks.push(b); }
  writeI64(value: number): void { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(value), 0); this.chunks.push(b); }
  writeU64(value: bigint | number): void { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(value), 0); this.chunks.push(b); }
  writeBytes(value: Uint8Array): void {
    this.writeU32(value.length);
    this.chunks.push(Buffer.from(value));
  }
  writeFixedBytes(value: Uint8Array): void {
    this.chunks.push(Buffer.from(value));
  }
  writeString(value: string): void {
    const bytes = Buffer.from(value, "utf8");
    this.writeU32(bytes.length);
    this.chunks.push(bytes);
  }
  toBuffer(): Buffer { return Buffer.concat(this.chunks); }
}

function readU8(d: Buffer, o: number): number { return d.readUInt8(o); }
function readU16(d: Buffer, o: number): number { return d.readUInt16LE(o); }
function readU32(d: Buffer, o: number): number { return d.readUInt32LE(o); }
function readU64(d: Buffer, o: number): bigint { return d.readBigUInt64LE(o); }
function readI16(d: Buffer, o: number): number { return d.readInt16LE(o); }
function readI64(d: Buffer, o: number): number { return Number(d.readBigInt64LE(o)); }
function readPubkeyRaw(d: Buffer, o: number): PublicKey { return new PublicKey(d.slice(o, o + 32)); }

function readFixedString(data: Buffer, offset: number, length: number): string {
  return Buffer.from(data.slice(offset, offset + length)).toString("utf8").replace(/\0/g, "").trim();
}

function encodeInstruction(discriminator: Buffer, args?: Buffer): Buffer {
  return args ? Buffer.concat([discriminator, args]) : discriminator;
}

function encodeInitializeHomeworldArgs(now: number, name: string, galaxy = 0, system = 0, position = 0): Buffer {
  const writer = new BorshWriter();
  writer.writeI64(now);
  writer.writeString(name);
  writer.writeU16(galaxy);
  writer.writeU16(system);
  writer.writeU8(position);
  return writer.toBuffer();
}

function encodeInitializeColonyArgs(now: number, mission: Mission): Buffer {
  const writer = new BorshWriter();
  writer.writeI64(now);
  writer.writeString(mission.colonyName || "Colony");
  writer.writeU16(mission.targetGalaxy);
  writer.writeU16(mission.targetSystem);
  writer.writeU8(mission.targetPosition);
  writer.writeU64(mission.cargoMetal);
  writer.writeU64(mission.cargoCrystal);
  writer.writeU64(mission.cargoDeuterium);
  writer.writeU32(mission.sSmallCargo);
  writer.writeU32(mission.sLargeCargo);
  writer.writeU32(mission.sLightFighter);
  writer.writeU32(mission.sHeavyFighter);
  writer.writeU32(mission.sCruiser);
  writer.writeU32(mission.sBattleship);
  writer.writeU32(mission.sBattlecruiser);
  writer.writeU32(mission.sBomber);
  writer.writeU32(mission.sDestroyer);
  writer.writeU32(mission.sDeathstar);
  writer.writeU32(mission.sRecycler);
  writer.writeU32(mission.sEspionageProbe);
  writer.writeU32(0); // colony_ship: always 0 (consumed by the mission)
  writer.writeU32(0); // solar_satellite: always 0 (cannot be transferred via fleet)
  return writer.toBuffer();
}

function encodeBuildShipArgs(shipType: number, quantity: number, now: number): Buffer {
  const writer = new BorshWriter();
  writer.writeU8(shipType);
  writer.writeU32(quantity);
  writer.writeI64(now);
  return writer.toBuffer();
}

function encodeI64Arg(value: number): Buffer {
  const writer = new BorshWriter();
  writer.writeI64(value);
  return writer.toBuffer();
}

function encodeUpsertBurnerBackupArgs(
  burner: PublicKey,
  version: number,
  ciphertext: Uint8Array,
  iv: Uint8Array,
  salt: Uint8Array,
  kdfSalt: Uint8Array,
): Buffer {
  const writer = new BorshWriter();
  writer.writeFixedBytes(burner.toBytes());
  writer.writeU8(version);
  writer.writeBytes(ciphertext);
  writer.writeFixedBytes(iv);
  writer.writeFixedBytes(salt);
  writer.writeFixedBytes(kdfSalt);
  return writer.toBuffer();
}

function encodeDelegateArgs(commitFrequencyMs: number, validator?: PublicKey | null): Buffer {
  const writer = new BorshWriter();
  writer.writeU32(commitFrequencyMs);
  writer.writeU8(validator ? 1 : 0);
  if (validator) {
    return Buffer.concat([writer.toBuffer(), validator.toBuffer()]);
  }
  return writer.toBuffer();
}

function encodeLaunchFleetArgs(
  ships: { lf?: number; hf?: number; cr?: number; bs?: number; bc?: number; bm?: number; ds?: number; de?: number; sc?: number; lc?: number; rec?: number; ep?: number; col?: number },
  cargo: { metal?: bigint; crystal?: bigint; deuterium?: bigint },
  missionType: number,
  speedFactor: number,
  now: number,
  flightSeconds: number,
  target: LaunchFleetTarget,
): Buffer {
  const writer = new BorshWriter();
  writer.writeU8(missionType);
  writer.writeU32(ships.lf ?? 0);
  writer.writeU32(ships.hf ?? 0);
  writer.writeU32(ships.cr ?? 0);
  writer.writeU32(ships.bs ?? 0);
  writer.writeU32(ships.bc ?? 0);
  writer.writeU32(ships.bm ?? 0);
  writer.writeU32(ships.ds ?? 0);
  writer.writeU32(ships.de ?? 0);
  writer.writeU32(ships.sc ?? 0);
  writer.writeU32(ships.lc ?? 0);
  writer.writeU32(ships.rec ?? 0);
  writer.writeU32(ships.ep ?? 0);
  writer.writeU32(ships.col ?? 0);
  writer.writeU64(cargo.metal ?? 0n);
  writer.writeU64(cargo.crystal ?? 0n);
  writer.writeU64(cargo.deuterium ?? 0n);
  writer.writeU8(speedFactor);
  writer.writeI64(now);
  writer.writeI64(flightSeconds);
  writer.writeU16(target.galaxy);
  writer.writeU16(target.system);
  writer.writeU8(target.position);
  writer.writeString(target.colonyName ?? "");
  return writer.toBuffer();
}

export function derivePlayerProfilePda(walletPubkey: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("player_profile"), walletPubkey.toBuffer()],
    GAME_STATE_PROGRAM_ID,
  )[0];
}

export function derivePlanetStatePda(walletPubkey: PublicKey, index: number): PublicKey {
  const indexSeed = Buffer.alloc(4);
  indexSeed.writeUInt32LE(index, 0);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("planet_state"), walletPubkey.toBuffer(), indexSeed],
    GAME_STATE_PROGRAM_ID,
  )[0];
}

function deriveDelegateBufferPda(planetPda: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("buffer"), planetPda.toBuffer()],
    GAME_STATE_PROGRAM_ID,
  )[0];
}

function deriveDelegationRecordPda(planetPda: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("delegation"), planetPda.toBuffer()],
    DELEGATION_PROGRAM_ID,
  )[0];
}

function deriveDelegationMetadataPda(planetPda: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("delegation-metadata"), planetPda.toBuffer()],
    DELEGATION_PROGRAM_ID,
  )[0];
}

function deriveAuthorizedBurnerPda(planetPda: PublicKey, burnerPubkey: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("authorized_burner"), planetPda.toBuffer(), burnerPubkey.toBuffer()],
    GAME_STATE_PROGRAM_ID,
  )[0];
}

function deriveBurnerBackupPda(authority: PublicKey, planetPda: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("burner_backup"), authority.toBuffer(), planetPda.toBuffer()],
    GAME_STATE_PROGRAM_ID,
  )[0];
}

function deserializePlayerProfile(data: Buffer): PlayerProfileAccount {
  if (!data.slice(0, 8).equals(PLAYER_PROFILE_DISCRIMINATOR)) {
    throw new Error("Invalid player profile discriminator.");
  }
  let o = 8;
  const authority = readPubkeyRaw(data, o); o += 32;
  const planetCount = readU32(data, o);
  return { authority, planetCount };
}

function deserializeMission(data: Buffer, offset: number): { mission: Mission; bytesRead: number } {
  let o = offset;
  const missionType = readU8(data, o); o += 1;
  const targetGalaxy = readU16(data, o); o += 2;
  const targetSystem = readU16(data, o); o += 2;
  const targetPosition = readU8(data, o); o += 1;
  const colonyName = readFixedString(data, o, MAX_MISSION_COLONY_NAME_LEN); o += MAX_MISSION_COLONY_NAME_LEN;
  const departTs = readI64(data, o); o += 8;
  const arriveTs = readI64(data, o); o += 8;
  const returnTs = readI64(data, o); o += 8;
  const sSmallCargo = readU32(data, o); o += 4;
  const sLargeCargo = readU32(data, o); o += 4;
  const sLightFighter = readU32(data, o); o += 4;
  const sHeavyFighter = readU32(data, o); o += 4;
  const sCruiser = readU32(data, o); o += 4;
  const sBattleship = readU32(data, o); o += 4;
  const sBattlecruiser = readU32(data, o); o += 4;
  const sBomber = readU32(data, o); o += 4;
  const sDestroyer = readU32(data, o); o += 4;
  const sDeathstar = readU32(data, o); o += 4;
  const sRecycler = readU32(data, o); o += 4;
  const sEspionageProbe = readU32(data, o); o += 4;
  const sColonyShip = readU32(data, o); o += 4;
  const cargoMetal = readU64(data, o); o += 8;
  const cargoCrystal = readU64(data, o); o += 8;
  const cargoDeuterium = readU64(data, o); o += 8;
  const applied = readU8(data, o) !== 0; o += 1;

  return {
    mission: {
      missionType,
      destination: "11111111111111111111111111111111",
      targetGalaxy,
      targetSystem,
      targetPosition,
      colonyName,
      departTs,
      arriveTs,
      returnTs,
      sSmallCargo,
      sLargeCargo,
      sLightFighter,
      sHeavyFighter,
      sCruiser,
      sBattleship,
      sBattlecruiser,
      sBomber,
      sDestroyer,
      sDeathstar,
      sRecycler,
      sEspionageProbe,
      sColonyShip,
      cargoMetal,
      cargoCrystal,
      cargoDeuterium,
      applied,
    },
    bytesRead: o - offset,
  };
}

function deserializePlanetState(data: Buffer): PlanetStateAccount {
  if (!data.slice(0, 8).equals(PLANET_STATE_DISCRIMINATOR)) {
    throw new Error("Invalid planet state discriminator.");
  }

  let o = 8;
  const authority = readPubkeyRaw(data, o); o += 32;
  const player = readPubkeyRaw(data, o); o += 32;
  const planetIndex = readU32(data, o); o += 4;
  const galaxy = readU16(data, o); o += 2;
  const system = readU16(data, o); o += 2;
  const position = readU8(data, o); o += 1;
  const name = readFixedString(data, o, MAX_PLANET_NAME_LEN); o += MAX_PLANET_NAME_LEN;
  const diameter = readU32(data, o); o += 4;
  const temperature = readI16(data, o); o += 2;
  const maxFields = readU16(data, o); o += 2;
  const usedFields = readU16(data, o); o += 2;
  const metalMine = readU8(data, o); o += 1;
  const crystalMine = readU8(data, o); o += 1;
  const deuteriumSynthesizer = readU8(data, o); o += 1;
  const solarPlant = readU8(data, o); o += 1;
  const fusionReactor = readU8(data, o); o += 1;
  const roboticsFactory = readU8(data, o); o += 1;
  const naniteFactory = readU8(data, o); o += 1;
  const shipyard = readU8(data, o); o += 1;
  const metalStorage = readU8(data, o); o += 1;
  const crystalStorage = readU8(data, o); o += 1;
  const deuteriumTank = readU8(data, o); o += 1;
  const researchLab = readU8(data, o); o += 1;
  const missileSilo = readU8(data, o); o += 1;
  const energyTech = readU8(data, o); o += 1;
  const combustionDrive = readU8(data, o); o += 1;
  const impulseDrive = readU8(data, o); o += 1;
  const hyperspaceDrive = readU8(data, o); o += 1;
  const computerTech = readU8(data, o); o += 1;
  const astrophysics = readU8(data, o); o += 1;
  const igrNetwork = readU8(data, o); o += 1;
  const researchQueueItem = readU8(data, o); o += 1;
  const researchQueueTarget = readU8(data, o); o += 1;
  const researchFinishTs = readI64(data, o); o += 8;
  const buildQueueItem = readU8(data, o); o += 1;
  const buildQueueTarget = readU8(data, o); o += 1;
  const buildFinishTs = readI64(data, o); o += 8;
  const metal = readU64(data, o); o += 8;
  const crystal = readU64(data, o); o += 8;
  const deuterium = readU64(data, o); o += 8;
  const metalHour = readU64(data, o); o += 8;
  const crystalHour = readU64(data, o); o += 8;
  const deuteriumHour = readU64(data, o); o += 8;
  const energyProduction = readU64(data, o); o += 8;
  const energyConsumption = readU64(data, o); o += 8;
  const metalCap = readU64(data, o); o += 8;
  const crystalCap = readU64(data, o); o += 8;
  const deuteriumCap = readU64(data, o); o += 8;
  const lastUpdateTs = readI64(data, o); o += 8;
  const smallCargo = readU32(data, o); o += 4;
  const largeCargo = readU32(data, o); o += 4;
  const lightFighter = readU32(data, o); o += 4;
  const heavyFighter = readU32(data, o); o += 4;
  const cruiser = readU32(data, o); o += 4;
  const battleship = readU32(data, o); o += 4;
  const battlecruiser = readU32(data, o); o += 4;
  const bomber = readU32(data, o); o += 4;
  const destroyer = readU32(data, o); o += 4;
  const deathstar = readU32(data, o); o += 4;
  const recycler = readU32(data, o); o += 4;
  const espionageProbe = readU32(data, o); o += 4;
  const colonyShip = readU32(data, o); o += 4;
  const solarSatellite = readU32(data, o); o += 4;
  const activeMissions = readU8(data, o); o += 1;
  const missions: Mission[] = [];

  for (let i = 0; i < MAX_MISSIONS; i++) {
    const { mission, bytesRead } = deserializeMission(data, o);
    missions.push(mission);
    o += bytesRead;
  }

  return {
    authority,
    player,
    planetIndex,
    galaxy,
    system,
    position,
    name,
    diameter,
    temperature,
    maxFields,
    usedFields,
    metalMine,
    crystalMine,
    deuteriumSynthesizer,
    solarPlant,
    fusionReactor,
    roboticsFactory,
    naniteFactory,
    shipyard,
    metalStorage,
    crystalStorage,
    deuteriumTank,
    researchLab,
    missileSilo,
    energyTech,
    combustionDrive,
    impulseDrive,
    hyperspaceDrive,
    computerTech,
    astrophysics,
    igrNetwork,
    researchQueueItem,
    researchQueueTarget,
    researchFinishTs,
    buildQueueItem,
    buildQueueTarget,
    buildFinishTs,
    metal,
    crystal,
    deuterium,
    metalHour,
    crystalHour,
    deuteriumHour,
    energyProduction,
    energyConsumption,
    metalCap,
    crystalCap,
    deuteriumCap,
    lastUpdateTs,
    smallCargo,
    largeCargo,
    lightFighter,
    heavyFighter,
    cruiser,
    battleship,
    battlecruiser,
    bomber,
    destroyer,
    deathstar,
    recycler,
    espionageProbe,
    colonyShip,
    solarSatellite,
    activeMissions,
    missions,
  };
}

function deserializeAuthorizedBurner(data: Buffer): AuthorizedBurnerAccount {
  if (!data.slice(0, 8).equals(AUTHORIZED_BURNER_DISCRIMINATOR)) {
    throw new Error("Invalid authorized burner discriminator.");
  }

  let o = 8;
  const authority = readPubkeyRaw(data, o); o += 32;
  const burner = readPubkeyRaw(data, o); o += 32;
  const planet = readPubkeyRaw(data, o); o += 32;
  const expiresAt = readI64(data, o); o += 8;
  const revoked = readU8(data, o) !== 0; o += 1;
  const bump = readU8(data, o);

  return {
    authority,
    burner,
    planet,
    expiresAt,
    revoked,
    bump,
  };
}

function deserializeBurnerBackup(data: Buffer): BurnerBackupAccount {
  if (!data.slice(0, 8).equals(BURNER_BACKUP_DISCRIMINATOR)) {
    throw new Error("Invalid burner backup discriminator.");
  }

  let o = 8;
  const authority = readPubkeyRaw(data, o); o += 32;
  const planet = readPubkeyRaw(data, o); o += 32;
  const burner = readPubkeyRaw(data, o); o += 32;
  const version = readU8(data, o); o += 1;
  const ciphertextLen = readU32(data, o); o += 4;
  const ciphertext = new Uint8Array(data.slice(o, o + ciphertextLen)); o += ciphertextLen;
  const iv = new Uint8Array(data.slice(o, o + 12)); o += 12;
  const salt = new Uint8Array(data.slice(o, o + 16)); o += 16;
  const kdfSalt = new Uint8Array(data.slice(o, o + 16)); o += 16;
  const updatedAt = readI64(data, o); o += 8;
  const bump = readU8(data, o);

  return {
    authority,
    planet,
    burner,
    version,
    ciphertext,
    iv,
    salt,
    kdfSalt,
    updatedAt,
    bump,
  };
}

function adaptPlanetState(planetPda: PublicKey, account: PlanetStateAccount, isDelegated: boolean): PlayerState {
  const authority = account.authority.toBase58();
  const key = planetPda.toBase58();

  return {
    entityPda: key,
    planetPda: key,
    fleetPda: key,
    resourcesPda: key,
    researchPda: key,
    isDelegated,
    planet: {
      creator: authority,
      entity: key,
      owner: authority,
      name: account.name,
      galaxy: account.galaxy,
      system: account.system,
      position: account.position,
      planetIndex: account.planetIndex,
      diameter: account.diameter,
      temperature: account.temperature,
      maxFields: account.maxFields,
      usedFields: account.usedFields,
      metalMine: account.metalMine,
      crystalMine: account.crystalMine,
      deuteriumSynthesizer: account.deuteriumSynthesizer,
      solarPlant: account.solarPlant,
      fusionReactor: account.fusionReactor,
      roboticsFactory: account.roboticsFactory,
      naniteFactory: account.naniteFactory,
      shipyard: account.shipyard,
      metalStorage: account.metalStorage,
      crystalStorage: account.crystalStorage,
      deuteriumTank: account.deuteriumTank,
      researchLab: account.researchLab,
      missileSilo: account.missileSilo,
      buildQueueItem: account.buildQueueItem,
      buildQueueTarget: account.buildQueueTarget,
      buildFinishTs: account.buildFinishTs,
    },
    resources: {
      metal: account.metal,
      crystal: account.crystal,
      deuterium: account.deuterium,
      metalHour: account.metalHour,
      crystalHour: account.crystalHour,
      deuteriumHour: account.deuteriumHour,
      energyProduction: account.energyProduction,
      energyConsumption: account.energyConsumption,
      metalCap: account.metalCap,
      crystalCap: account.crystalCap,
      deuteriumCap: account.deuteriumCap,
      lastUpdateTs: account.lastUpdateTs,
    },
    fleet: {
      creator: authority,
      smallCargo: account.smallCargo,
      largeCargo: account.largeCargo,
      lightFighter: account.lightFighter,
      heavyFighter: account.heavyFighter,
      cruiser: account.cruiser,
      battleship: account.battleship,
      battlecruiser: account.battlecruiser,
      bomber: account.bomber,
      destroyer: account.destroyer,
      deathstar: account.deathstar,
      recycler: account.recycler,
      espionageProbe: account.espionageProbe,
      colonyShip: account.colonyShip,
      solarSatellite: account.solarSatellite,
      activeMissions: account.activeMissions,
      missions: account.missions,
    },
    research: {
      creator: authority,
      energyTech: account.energyTech,
      combustionDrive: account.combustionDrive,
      impulseDrive: account.impulseDrive,
      hyperspaceDrive: account.hyperspaceDrive,
      computerTech: account.computerTech,
      astrophysics: account.astrophysics,
      igrNetwork: account.igrNetwork,
      queueItem: account.researchQueueItem,
      queueTarget: account.researchQueueTarget,
      researchFinishTs: account.researchFinishTs,
    },
  };
}

function summarizePlanetState(account: PlanetStateAccount | null) {
  if (!account) return null;
  return {
    authority: account.authority.toBase58(),
    planetIndex: account.planetIndex,
    coords: `${account.galaxy}:${account.system}:${account.position}`,
    metalMine: account.metalMine,
    crystalMine: account.crystalMine,
    deuteriumSynthesizer: account.deuteriumSynthesizer,
    solarPlant: account.solarPlant,
    researchLab: account.researchLab,
    shipyard: account.shipyard,
    buildQueueItem: account.buildQueueItem,
    buildQueueTarget: account.buildQueueTarget,
    buildFinishTs: account.buildFinishTs,
    researchQueueItem: account.researchQueueItem,
    researchQueueTarget: account.researchQueueTarget,
    researchFinishTs: account.researchFinishTs,
    metal: account.metal.toString(),
    crystal: account.crystal.toString(),
    deuterium: account.deuterium.toString(),
    activeMissions: account.activeMissions,
    lastUpdateTs: account.lastUpdateTs,
  };
}

function summarizeResearchState(account: PlanetStateAccount | null) {
  if (!account) return null;
  return {
    energyTech: account.energyTech,
    combustionDrive: account.combustionDrive,
    impulseDrive: account.impulseDrive,
    hyperspaceDrive: account.hyperspaceDrive,
    computerTech: account.computerTech,
    astrophysics: account.astrophysics,
    igrNetwork: account.igrNetwork,
    researchQueueItem: account.researchQueueItem,
    researchQueueTarget: account.researchQueueTarget,
    researchFinishTs: account.researchFinishTs,
    lastUpdateTs: account.lastUpdateTs,
  };
}

function formatResearchStateForLog(account: PlanetStateAccount | null): string {
  if (!account) return "null";
  return [
    `queueItem=${account.researchQueueItem}`,
    `queueTarget=${account.researchQueueTarget}`,
    `finishTs=${account.researchFinishTs}`,
    `energy=${account.energyTech}`,
    `combustion=${account.combustionDrive}`,
    `impulse=${account.impulseDrive}`,
    `hyperspace=${account.hyperspaceDrive}`,
    `computer=${account.computerTech}`,
    `astro=${account.astrophysics}`,
    `igr=${account.igrNetwork}`,
    `lastUpdate=${account.lastUpdateTs}`,
  ].join(" ");
}

function isPlanetStateAccount(
  account: Awaited<ReturnType<Connection["getAccountInfo"]>>,
): account is NonNullable<Awaited<ReturnType<Connection["getAccountInfo"]>>> {
  return !!account && account.owner.equals(GAME_STATE_PROGRAM_ID) && account.data.slice(0, 8).equals(PLANET_STATE_DISCRIMINATOR);
}

function describeTxError(err: unknown): string {
  if (err instanceof SendTransactionError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

function isBlockhashNotFoundError(err: unknown): boolean {
  const message = describeTxError(err).toLowerCase();
  return message.includes("blockhash not found");
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function asCryptoBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(bytes.length));
  out.set(bytes);
  return out as Uint8Array<ArrayBuffer>;
}

function buildBurnerRecoveryMessage(authority: PublicKey, planetPda: PublicKey, salt: Uint8Array): Uint8Array {
  return utf8Bytes(
    `${BURNER_RECOVERY_MESSAGE_PREFIX}\nAuthority:${authority.toBase58()}\nPlanet:${planetPda.toBase58()}\nSalt:${bytesToBase64(salt)}`,
  );
}

function burnerLocalCacheStorageKey(authority: PublicKey, planetPda: PublicKey): string {
  return `${BURNER_CACHE_STORAGE_PREFIX}:${authority.toBase58()}:${planetPda.toBase58()}`;
}

export class GameClient {
  private connection: Connection;
  private erConnection: Connection;
  private erDirectConnection: Connection;
  private provider: AnchorProvider;
  private options: GameClientOptions;
  private sessionActive = false;
  private erSigner: Keypair | null = null;
  private burnerRecoveryPassphrase: string | null = null;

  constructor(connection: Connection, provider: AnchorProvider, options: GameClientOptions = {}) {
    this.connection = connection;
    this.erConnection = new Connection(ER_RPC, "confirmed");
    this.erDirectConnection = new Connection(ER_DIRECT_RPC, "confirmed");
    this.provider = provider;
    this.options = options;
    setProvider(provider);
  }

  isSessionActive(): boolean { return this.sessionActive; }
  restoreSession(): void {
    this.sessionActive = true;
  }

  getSessionAuthority(): PublicKey {
  return this.erSigner?.publicKey ?? this.provider.wallet.publicKey;
}

  clearCachedBurnerRecoveryPassphrase(): void {
    this.burnerRecoveryPassphrase = null;
  }

  private invalidateSessionContext(): void {
    this.erSigner = null;
  }

  private canUseBurnerInstructions(): boolean {
    return this.sessionActive && this.erSigner !== null;
  }

  private async createFreshSessionBurner(reportProgress?: ProgressReporter): Promise<Keypair> {
    const burner = Keypair.generate();
    reportProgress?.("Signing with wallet: funding fresh ER burner");
    const fundTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: this.provider.wallet.publicKey,
        toPubkey: burner.publicKey,
        lamports: BURNER_TARGET_BALANCE_LAMPORTS,
      }),
    );
    await this.provider.sendAndConfirm(fundTx, [], { commitment: "confirmed" });
    this.erSigner = burner;
    return burner;
  }

  private async ensureSessionContext(planetPda?: PublicKey, reportProgress?: ProgressReporter): Promise<void> {
    if (!this.sessionActive) return;
    if (planetPda) {
      await this.ensureAuthorizedBurner(planetPda, reportProgress);
    } else {
      await this.ensureSessionBurner(undefined, reportProgress);
    }
  }

  private async promptBurnerRecoveryPassphrase(
  planetPda: PublicKey, 
  createIfMissing: boolean
): Promise<string> {
  if (this.burnerRecoveryPassphrase) {
    return this.burnerRecoveryPassphrase;
  }
console.log("[prompt] called for planet:", planetPda.toBase58(), "create:", createIfMissing);

  // Priority 1: Use the custom handler passed from the UI (React component, modal, etc.)
  if (this.options.requestBurnerRecoveryPassphrase) {
    const value = await this.options.requestBurnerRecoveryPassphrase({
      mode: createIfMissing ? "create" : "unlock",
      wallet: this.provider.wallet.publicKey.toBase58(),
      planet: planetPda.toBase58(),
    });

    const trimmed = value?.trim();
    if (!trimmed) {
      throw new Error("Burner recovery password is required.");
    }

    this.burnerRecoveryPassphrase = trimmed;
    return trimmed;
  }

  // Priority 2: Fallback to native prompt (only for quick testing)
  const promptFn = globalThis.prompt;
  if (promptFn) {
    const promptText = createIfMissing
      ? "Choose a strong burner recovery password (you will need it on other devices):"
      : "Enter your burner recovery password to restore delegated gameplay:";

    const value = promptFn(promptText)?.trim();
    if (!value) {
      throw new Error("A burner recovery password is required.");
    }
    this.burnerRecoveryPassphrase = value;
    return value;
  }

  // Priority 3: No way to prompt → fail with clear message
  throw new Error(
    "No recovery passphrase handler provided. " +
    "Please pass `requestBurnerRecoveryPassphrase` in GameClientOptions " +
    "to show a proper input modal."
  );
}

  private getBurnerCacheDeviceKeyBytes(): Uint8Array | null {
    if (typeof localStorage === "undefined") return null;
    let encoded = localStorage.getItem(BURNER_CACHE_DEVICE_KEY_STORAGE);
    if (!encoded) {
      const fresh = crypto.getRandomValues(new Uint8Array(32));
      encoded = bytesToBase64(fresh);
      localStorage.setItem(BURNER_CACHE_DEVICE_KEY_STORAGE, encoded);
    }
    try {
      return asCryptoBytes(base64ToBytes(encoded));
    } catch {
      localStorage.removeItem(BURNER_CACHE_DEVICE_KEY_STORAGE);
      return null;
    }
  }

  private async getBurnerCacheDeviceKey(): Promise<CryptoKey | null> {
    const keyBytes = this.getBurnerCacheDeviceKeyBytes();
    if (!keyBytes) return null;
    return await crypto.subtle.importKey("raw", keyBytes.slice().buffer, "AES-GCM", false, ["encrypt", "decrypt"]);
  }

  private async persistLocalBurnerCache(planetPda: PublicKey, burner: Keypair): Promise<void> {
    if (typeof localStorage === "undefined") return;
    const key = await this.getBurnerCacheDeviceKey();
    if (!key) return;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv: asCryptoBytes(iv) }, key, asCryptoBytes(burner.secretKey)),
    );
    const record: BurnerLocalCacheRecord = {
      version: BURNER_CACHE_VERSION,
      wallet: this.provider.wallet.publicKey.toBase58(),
      planet: planetPda.toBase58(),
      burner: burner.publicKey.toBase58(),
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(ciphertext),
      updatedAt: Date.now(),
    };
    localStorage.setItem(burnerLocalCacheStorageKey(this.provider.wallet.publicKey, planetPda), JSON.stringify(record));
  }

  private async tryRestoreBurnerFromLocalCache(planetPda: PublicKey): Promise<Keypair | null> {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(burnerLocalCacheStorageKey(this.provider.wallet.publicKey, planetPda));
    if (!raw) {
      console.log("[GAME_STATE:burner_cache] miss", {
        planet: planetPda.toBase58(),
        wallet: this.provider.wallet.publicKey.toBase58(),
      });
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as BurnerLocalCacheRecord;
      if (
        parsed.version !== BURNER_CACHE_VERSION ||
        parsed.wallet !== this.provider.wallet.publicKey.toBase58() ||
        parsed.planet !== planetPda.toBase58()
      ) {
        localStorage.removeItem(burnerLocalCacheStorageKey(this.provider.wallet.publicKey, planetPda));
        return null;
      }
      const key = await this.getBurnerCacheDeviceKey();
      if (!key) return null;
      const secretKey = new Uint8Array(
        await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: asCryptoBytes(base64ToBytes(parsed.iv)) },
          key,
          asCryptoBytes(base64ToBytes(parsed.ciphertext)),
        ),
      );
      const burner = Keypair.fromSecretKey(secretKey);
      if (burner.publicKey.toBase58() !== parsed.burner) {
        throw new Error("Local burner cache does not match its expected burner address.");
      }
      this.erSigner = burner;
      console.log("[GAME_STATE:burner_cache] restored", {
        planet: planetPda.toBase58(),
        burner: burner.publicKey.toBase58(),
      });
      return burner;
    } catch (error) {
      console.warn("[GAME_STATE:burner_cache] invalid", {
        planet: planetPda.toBase58(),
        error: error instanceof Error ? error.message : String(error),
      });
      localStorage.removeItem(burnerLocalCacheStorageKey(this.provider.wallet.publicKey, planetPda));
      return null;
    }
  }

  private async getBurnerRecoverySignature(planetPda: PublicKey, salt: Uint8Array): Promise<Uint8Array | null> {
    const wallet = this.provider.wallet as unknown as {
      signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
    };
    if (typeof wallet.signMessage === "function") {
      const message = buildBurnerRecoveryMessage(this.provider.wallet.publicKey, planetPda, salt);
      return await wallet.signMessage.call(this.provider.wallet, message);
    }
    return null;
  }

  private async deriveBurnerEncryptionKey(
    planetPda: PublicKey,
    salt: Uint8Array,
    kdfSalt: Uint8Array,
    createIfMissing: boolean,
  ): Promise<CryptoKey> {
    const passphrase = await this.promptBurnerRecoveryPassphrase(planetPda, createIfMissing);
    const signature = await this.getBurnerRecoverySignature(planetPda, salt);
    const contextBytes = signature
      ? signature
      : utf8Bytes(
          `${this.provider.wallet.publicKey.toBase58()}:${planetPda.toBase58()}:${bytesToBase64(salt)}:no-sign-message`,
        );
    const keyMaterialBytes = asCryptoBytes(new Uint8Array([...contextBytes, ...utf8Bytes(`:${passphrase}`)]));
    const keyMaterial = await crypto.subtle.importKey("raw", keyMaterialBytes, "PBKDF2", false, ["deriveKey"]);
    return await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: asCryptoBytes(kdfSalt),
        iterations: 250_000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }

  private async encryptBurnerSecretKey(
    burner: Keypair,
    planetPda: PublicKey,
  ): Promise<{ ciphertext: Uint8Array; iv: Uint8Array; salt: Uint8Array; kdfSalt: Uint8Array }> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const kdfSalt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveBurnerEncryptionKey(planetPda, salt, kdfSalt, true);
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv: asCryptoBytes(iv) }, key, asCryptoBytes(burner.secretKey)),
    );
    return { ciphertext, iv, salt, kdfSalt };
  }

  private async decryptBurnerSecretKey(backup: BurnerBackupAccount): Promise<Keypair> {
    const key = await this.deriveBurnerEncryptionKey(backup.planet, backup.salt, backup.kdfSalt, false);
    const secretKey = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: asCryptoBytes(backup.iv) },
        key,
        asCryptoBytes(backup.ciphertext),
      ),
    );
    const burner = Keypair.fromSecretKey(secretKey);
    if (!burner.publicKey.equals(backup.burner)) {
      throw new Error("Recovered burner key does not match the on-chain burner backup.");
    }
    return burner;
  }

  private async fetchBurnerBackup(planetPda: PublicKey): Promise<{ pda: PublicKey; backup: BurnerBackupAccount | null }> {
    const pda = deriveBurnerBackupPda(this.provider.wallet.publicKey, planetPda);
    const account = await this.connection.getAccountInfo(pda, "confirmed");
    if (!account?.owner.equals(GAME_STATE_PROGRAM_ID)) {
      return { pda, backup: null };
    }
    return { pda, backup: deserializeBurnerBackup(Buffer.from(account.data)) };
  }

  private async upsertBurnerBackup(planetPda: PublicKey, burner: Keypair, reportProgress?: ProgressReporter): Promise<PublicKey> {
    const { pda: burnerBackupPda } = await this.fetchBurnerBackup(planetPda);
    const encrypted = await this.encryptBurnerSecretKey(burner, planetPda);
    reportProgress?.("Signing with wallet: storing encrypted burner backup on-chain");
    const tx = new Transaction().add(
      new TransactionInstruction({
        programId: GAME_STATE_PROGRAM_ID,
        keys: [
          { pubkey: this.provider.wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: planetPda, isSigner: false, isWritable: false },
          { pubkey: burnerBackupPda, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: encodeInstruction(
          IX.upsertBurnerBackup,
          encodeUpsertBurnerBackupArgs(
            burner.publicKey,
            BURNER_BACKUP_VERSION,
            encrypted.ciphertext,
            encrypted.iv,
            encrypted.salt,
            encrypted.kdfSalt,
          ),
        ),
      }),
    );
    await this.provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
    return burnerBackupPda;
  }

  private async tryRestoreBurnerFromBackup(planetPda: PublicKey, reportProgress?: ProgressReporter): Promise<Keypair | null> {
    const { backup, pda } = await this.fetchBurnerBackup(planetPda);
    if (!backup) {
      console.log("[GAME_STATE:burner_backup] miss", {
        planet: planetPda.toBase58(),
        backupPda: pda.toBase58(),
      });
      return null;
    }
    reportProgress?.("Signing with wallet: restoring burner from encrypted on-chain backup");
    const burner = await this.decryptBurnerSecretKey(backup);
    const balance = await this.connection.getBalance(burner.publicKey, "confirmed");
    if (balance < BURNER_MIN_BALANCE_LAMPORTS) {
      const topUp = Math.max(BURNER_TARGET_BALANCE_LAMPORTS - balance, 0);
      if (topUp > 0) {
        reportProgress?.("Signing with wallet: topping up restored ER burner");
        const fundTx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: this.provider.wallet.publicKey,
            toPubkey: burner.publicKey,
            lamports: topUp,
          }),
        );
        await this.provider.sendAndConfirm(fundTx, [], { commitment: "confirmed" });
      }
    }
    this.erSigner = burner;
    await this.persistLocalBurnerCache(planetPda, burner);
    console.log("[GAME_STATE:burner_backup] restored", {
      planet: planetPda.toBase58(),
      burner: burner.publicKey.toBase58(),
      backupPda: pda.toBase58(),
    });
    return burner;
  }

  private async ensureSessionBurner(planetPda?: PublicKey, reportProgress?: ProgressReporter): Promise<Keypair> {
    if (this.erSigner) return this.erSigner;

    if (planetPda) {
      const cached = await this.tryRestoreBurnerFromLocalCache(planetPda);
      if (cached) {
        return cached;
      }
      const restored = await this.tryRestoreBurnerFromBackup(planetPda, reportProgress);
      if (restored) {
        return restored;
      }
    }

    const burner = await this.createFreshSessionBurner(reportProgress);
    if (planetPda) {
      await this.persistLocalBurnerCache(planetPda, burner);
    }
    return burner;
  }

  private async ensureAuthorizedBurner(planetPda: PublicKey, reportProgress?: ProgressReporter): Promise<PublicKey> {
    const planetAccount = await this.connection.getAccountInfo(planetPda, "confirmed");
    if (!this.erSigner && planetAccount && !planetAccount.owner.equals(GAME_STATE_PROGRAM_ID)) {
      const restored =
        (await this.tryRestoreBurnerFromLocalCache(planetPda)) ??
        (await this.tryRestoreBurnerFromBackup(planetPda, reportProgress));
      if (!restored) {
        throw new Error(
          "This planet is already delegated. Restore its burner from the encrypted on-chain backup before trying delegated gameplay on this device.",
        );
      }
    }

    const burner = await this.ensureSessionBurner(planetPda, reportProgress);
    const authorizedBurner = deriveAuthorizedBurnerPda(planetPda, burner.publicKey);
    const existing = await this.connection.getAccountInfo(authorizedBurner, "confirmed");

    if (existing?.owner.equals(GAME_STATE_PROGRAM_ID)) {
      const decoded = deserializeAuthorizedBurner(Buffer.from(existing.data));
      const nowTs = Math.floor(Date.now() / 1000);
      const stillValid =
        decoded.authority.equals(this.provider.wallet.publicKey) &&
        decoded.burner.equals(burner.publicKey) &&
        decoded.planet.equals(planetPda) &&
        !decoded.revoked &&
        (decoded.expiresAt <= 0 || decoded.expiresAt > nowTs + 60);

      if (stillValid) {
        console.log("[GAME_STATE:authorized_burner] reuse", {
          planet: planetPda.toBase58(),
          burner: burner.publicKey.toBase58(),
          authorizedBurner: authorizedBurner.toBase58(),
        });
        return authorizedBurner;
      }
    }

    if (planetAccount && !planetAccount.owner.equals(GAME_STATE_PROGRAM_ID)) {
      throw new Error(
        "This planet is already delegated, so the current on-chain program cannot register a new burner authorization now. Restore the existing burner from backup, or undelegate first before authorizing a new burner.",
      );
    }

    reportProgress?.("Signing with wallet: authorizing burner for delegated gameplay");
    const tx = new Transaction().add(
      new TransactionInstruction({
        programId: GAME_STATE_PROGRAM_ID,
        keys: [
          { pubkey: this.provider.wallet.publicKey, isSigner: true, isWritable: true },
          { pubkey: burner.publicKey, isSigner: false, isWritable: false },
          { pubkey: planetPda, isSigner: false, isWritable: false },
          { pubkey: authorizedBurner, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: encodeInstruction(IX.registerBurner, encodeI64Arg(0)),
      }),
    );
    await this.provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
    return authorizedBurner;
  }

  private transactionNeedsWalletSignature(instructions: TransactionInstruction[]): boolean {
    const wallet = this.provider.wallet.publicKey;
    return instructions.some((instruction) =>
      instruction.keys.some((key) => key.isSigner && key.pubkey.equals(wallet)),
    );
  }

private buildCommitInstruction(
  primaryPlanetPda: PublicKey,
  secondaryPlanetPda?: PublicKey,
  undelegate = false,
): TransactionInstruction {
  const payerPubkey = this.erSigner?.publicKey ?? this.provider.wallet.publicKey;

  const discriminator = undelegate
    ? (secondaryPlanetPda
        ? Buffer.from([152, 231, 191, 138, 92, 198, 202, 172])
        : Buffer.from([241, 53, 136, 145, 235, 32, 47, 95]))
    : (secondaryPlanetPda
        ? Buffer.from([204, 235, 28, 222, 148, 58, 229, 168])
        : Buffer.from([230, 31, 100, 83, 140, 6, 40, 154]));

  const keys: AccountMeta[] = [
    { pubkey: payerPubkey,      isSigner: true,  isWritable: true }, // burner as payer, signs the tx
    { pubkey: primaryPlanetPda, isSigner: false, isWritable: true },
    {
      pubkey: secondaryPlanetPda ?? GAME_STATE_PROGRAM_ID,
      isSigner: false,
      isWritable: secondaryPlanetPda != null,
    },
    { pubkey: MAGIC_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: MAGIC_CONTEXT_ID, isSigner: false, isWritable: true },
  ];

  return new TransactionInstruction({
    programId: GAME_STATE_PROGRAM_ID,
    keys,
    data: discriminator,
  });
}

private async commitIfNeeded(
  label: string,
  primaryPlanet: PublicKey,
  secondaryPlanet?: PublicKey,
): Promise<void> {
  if (!this.sessionActive) return;

  console.log(`[GAME_STATE:commit] ${label}`, {
    primary: primaryPlanet.toBase58(),
    secondary: secondaryPlanet?.toBase58() ?? null,
    payer: this.erSigner?.publicKey.toBase58() ?? null,
  });

  const ix = this.buildCommitInstruction(primaryPlanet, secondaryPlanet, false);
  await this.sendInstruction(`commit_${label}`, [ix]);
}

  private buildDelegateInstruction(planetPda: PublicKey): TransactionInstruction {
    return new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: this.provider.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: deriveDelegateBufferPda(planetPda), isSigner: false, isWritable: true },
        { pubkey: deriveDelegationRecordPda(planetPda), isSigner: false, isWritable: true },
        { pubkey: deriveDelegationMetadataPda(planetPda), isSigner: false, isWritable: true },
        { pubkey: planetPda, isSigner: false, isWritable: true },
        { pubkey: GAME_STATE_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: DELEGATION_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
data: encodeInstruction(IX.delegate, encodeDelegateArgs(0, DEVNET_VALIDATOR)),
    });
  }

  private buildPlanetMutationInstruction(
    normalDiscriminator: Buffer,
    burnerDiscriminator: Buffer,
    planetPda: PublicKey,
    args: Buffer,
  ): TransactionInstruction {
    if (this.canUseBurnerInstructions()) {
      return new TransactionInstruction({
        programId: GAME_STATE_PROGRAM_ID,
        keys: [
          { pubkey: this.erSigner!.publicKey, isSigner: true, isWritable: true },
          { pubkey: deriveAuthorizedBurnerPda(planetPda, this.erSigner!.publicKey), isSigner: false, isWritable: false },
          { pubkey: planetPda, isSigner: false, isWritable: true },
        ],
        data: encodeInstruction(burnerDiscriminator, args),
      });
    }

    return new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: this.provider.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: planetPda, isSigner: false, isWritable: true },
      ],
      data: encodeInstruction(normalDiscriminator, args),
    });
  }

  private buildTransportInstruction(
    sourcePlanetPda: PublicKey,
    destinationPlanetPda: PublicKey,
    args: Buffer,
  ): TransactionInstruction {
    if (this.canUseBurnerInstructions()) {
      return new TransactionInstruction({
        programId: GAME_STATE_PROGRAM_ID,
        keys: [
          { pubkey: this.erSigner!.publicKey, isSigner: true, isWritable: true },
          { pubkey: deriveAuthorizedBurnerPda(sourcePlanetPda, this.erSigner!.publicKey), isSigner: false, isWritable: false },
          { pubkey: sourcePlanetPda, isSigner: false, isWritable: true },
          { pubkey: destinationPlanetPda, isSigner: false, isWritable: true },
        ],
        data: encodeInstruction(IX.resolveTransportBurner, args),
      });
    }

    return new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: this.provider.wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: sourcePlanetPda, isSigner: false, isWritable: true },
        { pubkey: destinationPlanetPda, isSigner: false, isWritable: true },
      ],
      data: encodeInstruction(IX.resolveTransport, args),
    });
  }

private async sendInstruction(label: string, instructions: TransactionInstruction[]): Promise<string> {
  try {
    const fullInstructions = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
      ...instructions,
    ];

    if (!this.sessionActive) {
      const tx = new Transaction().add(...fullInstructions);
      const signature = await this.provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
      return signature;
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        const { blockhash, lastValidBlockHeight } = await this.erDirectConnection.getLatestBlockhash("confirmed");
        const tx = new Transaction().add(...fullInstructions);
        tx.recentBlockhash = blockhash;

        // Burner is always the fee payer and always signs
        tx.feePayer = this.erSigner?.publicKey ?? this.provider.wallet.publicKey;

        if (this.erSigner) {
          tx.partialSign(this.erSigner);
        }

        if (this.transactionNeedsWalletSignature(fullInstructions)) {
          await this.provider.wallet.signTransaction(tx);
        }

const sig = await this.erDirectConnection.sendRawTransaction(
  tx.serialize(),
  { skipPreflight: true }
);

        await this.erDirectConnection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
        const confirmedTx = await this.erDirectConnection.getTransaction(sig, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        });

        if (label.startsWith("commit_")) {
          console.log("[GAME_STATE:commit] confirmed", {
            label,
            signature: sig,
            burner: this.erSigner?.publicKey.toBase58() ?? null,
            err: confirmedTx?.meta?.err ?? null,
            logs: confirmedTx?.meta?.logMessages ?? [],
          });
          const logLines = confirmedTx?.meta?.logMessages ?? [];
          if (logLines.length) {
            console.log(`[GAME_STATE:commit:logs:${label}]\n${logLines.join("\n")}`);
          }
        }

        if (confirmedTx?.meta?.err) {
          const logMessages = confirmedTx.meta.logMessages ?? [];
          const bestLogMessage =
            logMessages.find((line) => line.includes("ScheduleCommit ERR:")) ??
            logMessages.find((line) => /burner authorization/i.test(line)) ??
            logMessages.find((line) => line.includes("AnchorError")) ??
            logMessages.find((line) => line.includes("Program log:")) ??
            `Confirmed ER transaction failed: ${JSON.stringify(confirmedTx.meta.err)}`;
          throw new Error(bestLogMessage);
        }

        return sig;
      } catch (err) {
        lastError = err;
        if (!isBlockhashNotFoundError(err) || attempt === 5) {
          throw err;
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    throw lastError ?? new Error("Unknown ER transaction failure.");
  } catch (err) {
    if (label.startsWith("commit_")) {
      console.error("[GAME_STATE:commit] failure", {
        label,
        burner: this.erSigner?.publicKey.toBase58() ?? null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    if (err instanceof SendTransactionError) {
      try {
        const logs = await err.getLogs(this.sessionActive ? this.erDirectConnection : this.connection);
        if (label.startsWith("commit_")) {
          console.error("[GAME_STATE:commit] send_error_logs", { label, logs });
        }
      } catch {}
    }
    throw new Error(describeTxError(err));
  }
}

  private async fetchPlayerProfile(walletPubkey: PublicKey): Promise<PlayerProfileAccount | null> {
    const profilePda = derivePlayerProfilePda(walletPubkey);
    const account = await this.connection.getAccountInfo(profilePda, "confirmed");
    if (!account || !account.owner.equals(GAME_STATE_PROGRAM_ID)) return null;
    return deserializePlayerProfile(Buffer.from(account.data));
  }

  private async ensurePlayerProfile(wallet: PublicKey): Promise<PublicKey> {
    const profilePda = derivePlayerProfilePda(wallet);
    const existing = await this.connection.getAccountInfo(profilePda, "confirmed");
    if (existing) return profilePda;

    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: wallet, isSigner: true, isWritable: true },
        { pubkey: profilePda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: IX.initializePlayer,
    });

    await this.sendInstruction("initialize_player", [ix]);
    return profilePda;
  }

  private async loadPlanetStateByPda(planetPda: PublicKey): Promise<PlayerState | null> {
    const [devnetAcc, erRouterAcc, erDirectAcc] = await Promise.all([
      this.connection.getAccountInfo(planetPda, "confirmed"),
      this.erConnection.getAccountInfo(planetPda, "confirmed"),
      this.erDirectConnection.getAccountInfo(planetPda, "confirmed"),
    ]);
    const devnetState = isPlanetStateAccount(devnetAcc) ? deserializePlanetState(Buffer.from(devnetAcc.data)) : null;
    const erRouterState = isPlanetStateAccount(erRouterAcc) ? deserializePlanetState(Buffer.from(erRouterAcc.data)) : null;
    const erDirectState = isPlanetStateAccount(erDirectAcc) ? deserializePlanetState(Buffer.from(erDirectAcc.data)) : null;

    const account =
      isPlanetStateAccount(erDirectAcc) ? erDirectAcc :
      isPlanetStateAccount(erRouterAcc) ? erRouterAcc :
      isPlanetStateAccount(devnetAcc) ? devnetAcc :
      null;
    if (!account) return null;

    const isDelegated = !!devnetAcc && devnetAcc.owner.equals(DELEGATION_PROGRAM_ID);
    return adaptPlanetState(planetPda, deserializePlanetState(Buffer.from(account.data)), isDelegated);
  }

  private async findPlanetByCoordinates(galaxy: number, system: number, position: number): Promise<PublicKey | null> {
    const accounts = await this.connection.getProgramAccounts(GAME_STATE_PROGRAM_ID, { commitment: "confirmed" });
    for (const account of accounts) {
      if (!account.account.data.slice(0, 8).equals(PLANET_STATE_DISCRIMINATOR)) continue;
      try {
        const state = deserializePlanetState(Buffer.from(account.account.data));
        if (state.galaxy === galaxy && state.system === system && state.position === position) {
          return account.pubkey;
        }
      } catch {
        // Ignore parse failures.
      }
    }
    return null;
  }

  async findPlanets(walletPubkey: PublicKey): Promise<PlayerState[]> {
    const profile = await this.fetchPlayerProfile(walletPubkey);
    if (!profile) return [];

    const pdas = Array.from({ length: profile.planetCount }, (_, index) => derivePlanetStatePda(walletPubkey, index));
    const states = await Promise.all(pdas.map((pda) => this.loadPlanetStateByPda(pda)));
    return states.filter((state): state is PlayerState => !!state).sort((a, b) => a.planet.planetIndex - b.planet.planetIndex);
  }

  async findPlanet(walletPubkey: PublicKey): Promise<PlayerState | null> {
    const planets = await this.findPlanets(walletPubkey);
    return planets[0] ?? null;
  }

  async getSystemPlanets(galaxy: number, system: number): Promise<Planet[]> {
    const accounts = await this.connection.getProgramAccounts(GAME_STATE_PROGRAM_ID, { commitment: "confirmed" });
    const planets: Planet[] = [];

    for (const account of accounts) {
      if (!account.account.data.slice(0, 8).equals(PLANET_STATE_DISCRIMINATOR)) continue;
      try {
        const planetState = deserializePlanetState(Buffer.from(account.account.data));
        if (planetState.galaxy === galaxy && planetState.system === system) {
          planets.push(adaptPlanetState(account.pubkey, planetState, false).planet);
        }
      } catch {
        // Ignore unrelated data.
      }
    }

    return planets.sort((a, b) => a.position - b.position);
  }

  async initializePlanet(planetName = "Homeworld", reportProgress?: ProgressReporter): Promise<PlayerState> {
    const authority = this.provider.wallet.publicKey;
    reportProgress?.("Signing with wallet: creating player profile");
    const playerProfilePda = await this.ensurePlayerProfile(authority);
    const profile = await this.fetchPlayerProfile(authority);
    const nextIndex = profile?.planetCount ?? 0;
    const planetStatePda = derivePlanetStatePda(authority, nextIndex);

    reportProgress?.("Signing with wallet: creating homeworld");
    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: playerProfilePda, isSigner: false, isWritable: true },
        { pubkey: planetStatePda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeInstruction(IX.initializeHomeworld, encodeInitializeHomeworldArgs(Math.floor(Date.now() / 1000), planetName)),
    });

    await this.sendInstruction("initialize_homeworld", [ix]);
    reportProgress?.("Signing with wallet: delegating homeworld to ER");
    await this.delegatePlanet(planetStatePda, reportProgress);
    const state = await this.loadPlanetStateByPda(planetStatePda);
    if (!state) throw new Error("Planet created but could not be loaded.");
    return state;
  }

  async startBuild(entityPda: PublicKey, buildingIdx: number): Promise<string> {
    await this.ensureSessionContext(entityPda);
    const writer = new BorshWriter();
    writer.writeU8(buildingIdx);
    writer.writeI64(Math.floor(Date.now() / 1000));
    const sig = await this.sendInstruction("start_build", [
      this.buildPlanetMutationInstruction(IX.startBuild, IX.startBuildBurner, entityPda, writer.toBuffer()),
    ]);
    await this.commitIfNeeded("start_build", entityPda);
    return sig;
  }

  async finishBuild(entityPda: PublicKey): Promise<string> {
    await this.ensureSessionContext(entityPda);
    const writer = new BorshWriter();
    writer.writeI64(Math.floor(Date.now() / 1000));
    const sig = await this.sendInstruction("finish_build", [
      this.buildPlanetMutationInstruction(IX.finishBuild, IX.finishBuildBurner, entityPda, writer.toBuffer()),
    ]);
    await this.commitIfNeeded("finish_build", entityPda);
    return sig;
  }

  async startResearch(entityPda: PublicKey, techIdx: number): Promise<string> {
    await this.ensureSessionContext(entityPda);
    const writer = new BorshWriter();
    writer.writeU8(techIdx);
    writer.writeI64(Math.floor(Date.now() / 1000));
    const sig = await this.sendInstruction("start_research", [
      this.buildPlanetMutationInstruction(IX.startResearch, IX.startResearchBurner, entityPda, writer.toBuffer()),
    ]);
    await this.commitIfNeeded("start_research", entityPda);
    return sig;
  }

  async finishResearch(entityPda: PublicKey): Promise<string> {
    await this.ensureSessionContext(entityPda);
    const writer = new BorshWriter();
    writer.writeI64(Math.floor(Date.now() / 1000));
    const sig = await this.sendInstruction("finish_research", [
      this.buildPlanetMutationInstruction(IX.finishResearch, IX.finishResearchBurner, entityPda, writer.toBuffer()),
    ]);
    await this.loadPlanetStateByPda(entityPda);
    await this.commitIfNeeded("finish_research", entityPda);
    await this.loadPlanetStateByPda(entityPda);
    return sig;
  }

  async buildShip(entityPda: PublicKey, shipType: number, quantity: number): Promise<string> {
    await this.ensureSessionContext(entityPda);
    const sig = await this.sendInstruction("build_ship", [
      this.buildPlanetMutationInstruction(
        IX.buildShip,
        IX.buildShipBurner,
        entityPda,
        encodeBuildShipArgs(shipType, quantity, Math.floor(Date.now() / 1000)),
      ),
    ]);
    await this.commitIfNeeded("build_ship", entityPda);
    return sig;
  }

  async launchFleet(
    entityPda: PublicKey,
    ships: { lf?: number; hf?: number; cr?: number; bs?: number; bc?: number; bm?: number; ds?: number; de?: number; sc?: number; lc?: number; rec?: number; ep?: number; col?: number },
    cargo: { metal?: bigint; crystal?: bigint; deuterium?: bigint },
    missionType: number,
    flightSeconds: number,
    speedFactor = 100,
    target?: LaunchFleetTarget,
  ): Promise<string> {
    if (!target) throw new Error("Launch target is required.");
    await this.ensureSessionContext(entityPda);
    const sig = await this.sendInstruction("launch_fleet", [
      this.buildPlanetMutationInstruction(
        IX.launchFleet,
        IX.launchFleetBurner,
        entityPda,
        encodeLaunchFleetArgs(ships, cargo, missionType, speedFactor, Math.floor(Date.now() / 1000), flightSeconds, target),
      ),
    ]);
    await this.commitIfNeeded("launch_fleet", entityPda);
    return sig;
  }

  async resolveTransport(sourceEntityPda: PublicKey, mission: Mission, slot: number, now = Math.floor(Date.now() / 1000)): Promise<string> {
    const destinationPlanetPda = await this.findPlanetByCoordinates(mission.targetGalaxy, mission.targetSystem, mission.targetPosition);
    if (!destinationPlanetPda) {
      throw new Error(`No destination planet found at ${mission.targetGalaxy}:${mission.targetSystem}:${mission.targetPosition}.`);
    }

    await this.ensureSessionContext(sourceEntityPda);
    const writer = new BorshWriter();
    writer.writeU8(slot);
    writer.writeI64(now);
    const sig = await this.sendInstruction("resolve_transport", [
      this.buildTransportInstruction(sourceEntityPda, destinationPlanetPda, writer.toBuffer()),
    ]);
    await this.commitIfNeeded("resolve_transport", sourceEntityPda, destinationPlanetPda);
    return sig;
  }

  async resolveColonize(
    sourceEntityPda: PublicKey,
    mission: Mission,
    slot: number,
    now = Math.floor(Date.now() / 1000),
    reportProgress?: ProgressReporter,
  ): Promise<{ entityPda: PublicKey; planetPda: PublicKey; registerSig: string; resolveSig: string; initializeSig: string }> {
    const authority = this.provider.wallet.publicKey;
    const playerProfilePda = await this.ensurePlayerProfile(authority);
    const profile = await this.fetchPlayerProfile(authority);
    const nextIndex = profile?.planetCount ?? 0;
    const colonyPda = derivePlanetStatePda(authority, nextIndex);

    reportProgress?.("Signing with wallet: creating colony");
    const initializeSig = await this.sendInstruction("initialize_colony", [new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: playerProfilePda, isSigner: false, isWritable: true },
        { pubkey: colonyPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeInstruction(IX.initializeColony, encodeInitializeColonyArgs(now, mission)),
    })]);
    reportProgress?.("Signing with wallet: delegating colony to ER");
    await this.delegatePlanet(colonyPda, reportProgress);

    reportProgress?.("Signing with wallet: resolving colonize mission");
    await this.ensureSessionContext(sourceEntityPda);
    const writer = new BorshWriter();
    writer.writeU8(slot);
    writer.writeI64(now);
    const resolveSig = await this.sendInstruction("resolve_colonize", [
      this.buildPlanetMutationInstruction(IX.resolveColonize, IX.resolveColonizeBurner, sourceEntityPda, writer.toBuffer()),
    ]);
    await this.commitIfNeeded("resolve_colonize", sourceEntityPda);

    return {
      entityPda: colonyPda,
      planetPda: colonyPda,
      registerSig: initializeSig,
      resolveSig,
      initializeSig,
    };
  }

  async delegatePlanet(entityPda: PublicKey, reportProgress?: ProgressReporter): Promise<string> {
    const burner = await this.ensureSessionBurner(entityPda, reportProgress);
    await this.upsertBurnerBackup(entityPda, burner, reportProgress);
    await this.ensureAuthorizedBurner(entityPda, reportProgress);
    reportProgress?.("Signing with wallet: delegating planet to ER");
    const sig = await this.sendInstruction("delegate_planet_state", [
      this.buildDelegateInstruction(entityPda),
    ]);
    this.sessionActive = true;
    return sig;
  }

async undelegatePlanet(entityPda: PublicKey): Promise<string> {
  const sig = await this.sendInstruction("commit_and_undelegate_planet_state", [
    this.buildCommitInstruction(entityPda, undefined, true),
  ]);
  this.erSigner = null;
  this.sessionActive = false;
  return sig;
}

  async findPlayerByWallet(walletPubkey: PublicKey): Promise<{ entityPda: string; fleetPda: string; resourcesPda: string; researchPda: string } | null> {
    const state = await this.findPlanet(walletPubkey);
    if (!state) return null;
    return {
      entityPda: state.entityPda,
      fleetPda: state.fleetPda,
      resourcesPda: state.resourcesPda,
      researchPda: state.researchPda,
    };
  }
}

export const BUILDINGS = [
  { idx: 0, key: "metalMine", name: "Metal Mine", icon: "⬡", desc: "Extracts metal from the planet crust." },
  { idx: 1, key: "crystalMine", name: "Crystal Mine", icon: "◈", desc: "Processes surface crystal formations." },
  { idx: 2, key: "deuteriumSynthesizer", name: "Deuterium Synthesizer", icon: "◉", desc: "Extracts deuterium from the atmosphere." },
  { idx: 3, key: "solarPlant", name: "Solar Plant", icon: "☀", desc: "Converts sunlight to energy." },
  { idx: 4, key: "fusionReactor", name: "Fusion Reactor", icon: "⚛", desc: "Burns deuterium for high-yield energy." },
  { idx: 5, key: "roboticsFactory", name: "Robotics Factory", icon: "🤖", desc: "Automated workers — halves build time." },
  { idx: 6, key: "naniteFactory", name: "Nanite Factory", icon: "🔬", desc: "Nano assemblers — massive build speed." },
  { idx: 7, key: "shipyard", name: "Shipyard", icon: "🚀", desc: "Constructs ships and defense units." },
  { idx: 8, key: "metalStorage", name: "Metal Storage", icon: "🏗", desc: "Increases metal cap." },
  { idx: 9, key: "crystalStorage", name: "Crystal Storage", icon: "🏗", desc: "Increases crystal cap." },
  { idx: 10, key: "deuteriumTank", name: "Deuterium Tank", icon: "🏗", desc: "Increases deuterium cap." },
  { idx: 11, key: "researchLab", name: "Research Lab", icon: "🔭", desc: "Required for all technology research." },
  { idx: 12, key: "missileSilo", name: "Missile Silo", icon: "🎯", desc: "Stores interplanetary missiles." },
] as const;

export const SHIPS = [
  { key: "smallCargo", name: "Small Cargo", icon: "📦", atk: 5, cargo: 5_000, cost: { m: 2000, c: 2000, d: 0 } },
  { key: "largeCargo", name: "Large Cargo", icon: "🚛", atk: 5, cargo: 25_000, cost: { m: 6000, c: 6000, d: 0 } },
  { key: "lightFighter", name: "Light Fighter", icon: "✈", atk: 50, cargo: 50, cost: { m: 3000, c: 1000, d: 0 } },
  { key: "heavyFighter", name: "Heavy Fighter", icon: "⚡", atk: 150, cargo: 100, cost: { m: 6000, c: 4000, d: 0 } },
  { key: "cruiser", name: "Cruiser", icon: "🛸", atk: 400, cargo: 800, cost: { m: 20000, c: 7000, d: 2000 } },
  { key: "battleship", name: "Battleship", icon: "⚔", atk: 1000, cargo: 1500, cost: { m: 45000, c: 15000, d: 0 } },
  { key: "battlecruiser", name: "Battlecruiser", icon: "🔱", atk: 700, cargo: 750, cost: { m: 30000, c: 40000, d: 15000 } },
  { key: "bomber", name: "Bomber", icon: "💣", atk: 1000, cargo: 500, cost: { m: 50000, c: 25000, d: 15000 } },
  { key: "destroyer", name: "Destroyer", icon: "💥", atk: 2000, cargo: 2000, cost: { m: 60000, c: 50000, d: 15000 } },
  { key: "deathstar", name: "Deathstar", icon: "🌑", atk: 200000, cargo: 1000000, cost: { m: 5000000, c: 4000000, d: 1000000 } },
  { key: "recycler", name: "Recycler", icon: "♻", atk: 1, cargo: 20_000, cost: { m: 10000, c: 6000, d: 2000 } },
  { key: "espionageProbe", name: "Espionage Probe", icon: "👁", atk: 0, cargo: 0, cost: { m: 0, c: 1000, d: 0 } },
  { key: "colonyShip", name: "Colony Ship", icon: "🌍", atk: 50, cargo: 7500, cost: { m: 10000, c: 20000, d: 10000 } },
  { key: "solarSatellite", name: "Solar Satellite", icon: "🛰", atk: 1, cargo: 0, cost: { m: 0, c: 2000, d: 500 } },
] as const;

export const SHIP_TYPE_IDX: Record<string, number> = {
  smallCargo: 0,
  largeCargo: 1,
  lightFighter: 2,
  heavyFighter: 3,
  cruiser: 4,
  battleship: 5,
  battlecruiser: 6,
  bomber: 7,
  destroyer: 8,
  deathstar: 9,
  recycler: 10,
  espionageProbe: 11,
  colonyShip: 12,
  solarSatellite: 13,
};

export const MISSION_LABELS: Record<number, string> = {
  2: "TRANSPORT",
  5: "COLONIZE",
};

const BASE_COSTS: Record<number, [number, number, number]> = {
  0: [60, 15, 0],
  1: [48, 24, 0],
  2: [225, 75, 0],
  3: [75, 30, 0],
  4: [900, 360, 900],
  5: [400, 120, 200],
  6: [1000000, 500000, 100000],
  7: [400, 200, 100],
  8: [1000, 0, 0],
  9: [1000, 500, 0],
  10: [1000, 1000, 0],
  11: [200, 400, 200],
  12: [20, 20, 0],
};

function pow15(n: number): number {
  let r = 1;
  for (let i = 0; i < n; i++) r *= 1.5;
  return r;
}

export function upgradeCost(idx: number, currentLevel: number): [number, number, number] {
  const [bm, bc, bd] = BASE_COSTS[idx] ?? [0, 0, 0];
  const mult = pow15(currentLevel);
  return [Math.floor(bm * mult), Math.floor(bc * mult), Math.floor(bd * mult)];
}

export function buildTimeSecs(idx: number, nextLevel: number, robotics: number): number {
  const [bm, bc] = BASE_COSTS[idx] ?? [0, 0];
  const total = (bm + bc) * pow15(nextLevel - 1);
  return Math.max(1, Math.floor(total / (5 * (1 + robotics))));
}

export function fmt(n: bigint | number): string {
  if (typeof n === "bigint") return n.toString();
  return Math.trunc(n).toLocaleString();
}

export function fmtCountdown(totalSecs: number): string {
  if (totalSecs <= 0) return "READY";
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

export function missionProgress(m: Mission, nowTs: number): number {
  if (m.applied) {
    const total = m.returnTs - m.arriveTs;
    const elapsed = nowTs - m.arriveTs;
    return total <= 0 ? 100 : Math.min(100, Math.floor((elapsed / total) * 100));
  }
  const total = m.arriveTs - m.departTs;
  const elapsed = nowTs - m.departTs;
  return total <= 0 ? 100 : Math.min(100, Math.floor((elapsed / total) * 100));
}

export function energyEfficiency(res: Resources): number {
  if (res.energyConsumption === 0n) return 100;
  return Math.min(100, Number((res.energyProduction * 100n) / res.energyConsumption));
}
