import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SendTransactionError,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { AnchorProvider, setProvider } from "@coral-xyz/anchor";

// ─── Constants ────────────────────────────────────────────────────────────────
export const GAME_STATE_PROGRAM_ID = new PublicKey("7yKyjQ7m8tSqvqYnV65aVV9Jwdee7KqyELeDXf6Fxkt4");
export const RPC_ENDPOINT = "https://api.devnet.solana.com";

const VAULT_MIN_BALANCE_LAMPORTS = 5_000_000;
const VAULT_TARGET_BALANCE_LAMPORTS = 20_000_000;
const VAULT_BACKUP_VERSION = 1;
const VAULT_RECOVERY_MESSAGE_PREFIX = "Chained Universe vault recovery v1";
const VAULT_CACHE_VERSION = 1;
const VAULT_CACHE_STORAGE_PREFIX = "chained_universe_vault_cache_v1";
const VAULT_CACHE_DEVICE_KEY_STORAGE = "chained_universe_vault_cache_device_key_v1";

// ─── Discriminators ───────────────────────────────────────────────────────────
const PLAYER_PROFILE_DISCRIMINATOR = Buffer.from([82, 226, 99, 87, 164, 130, 181, 80]);
const PLANET_STATE_DISCRIMINATOR   = Buffer.from([1, 25, 230, 69, 194, 252, 152, 240]);
const AUTHORIZED_VAULT_DISCRIMINATOR = Buffer.from([224, 162, 234, 3, 170, 103, 243, 244]);
const VAULT_BACKUP_DISCRIMINATOR     = Buffer.from([167, 172, 2, 221, 196, 20, 199, 27]);

// ─── Instruction Discriminators ───────────────────────────────────────────────
// NOTE: These must be updated after `anchor build` generates the new IDL.
// Run: cat target/idl/game_state.json | jq '.instructions[] | {name, discriminator}'
const IX = {
  initializePlayer:       Buffer.from([79, 249, 88, 177, 220, 62, 56, 128]),
  rotateVault:            Buffer.from([192, 205, 175, 133, 189, 211, 141, 109]),
  revokeVault:            Buffer.from([199, 172, 226, 172, 196, 244, 179, 103]),
  extendVault:            Buffer.from([176, 167, 130, 249, 196, 63, 158, 200]),

  initializeHomeworld:    Buffer.from([124, 7, 81, 167, 80, 191, 227, 173]),
  initializeColony:       Buffer.from([91, 184, 105, 243, 90, 175, 137, 217]),

  produce:                Buffer.from([240, 243, 185, 55, 195, 151, 136, 205]),
  produceVault:           Buffer.from([228, 109, 51, 38, 151, 15, 255, 118]),

  startBuild:             Buffer.from([243, 32, 82, 71, 153, 119, 168, 6]),
  startBuildVault:        Buffer.from([140, 114, 250, 69, 2, 108, 3, 53]),

  finishBuild:            Buffer.from([67, 114, 22, 130, 241, 73, 183, 140]),
  finishBuildVault:       Buffer.from([89, 229, 199, 13, 162, 120, 161, 12]),

  startResearch:          Buffer.from([175, 179, 153, 18, 254, 39, 12, 126]),
  startResearchVault:     Buffer.from([239, 63, 88, 186, 249, 81, 76, 47]),

  finishResearch:         Buffer.from([213, 3, 235, 30, 13, 68, 227, 86]),
  finishResearchVault:    Buffer.from([172, 70, 116, 130, 96, 39, 20, 130]),

  buildShip:              Buffer.from([213, 16, 198, 123, 106, 214, 120, 157]),
  buildShipVault:         Buffer.from([76, 50, 77, 203, 109, 0, 245, 222]),

  launchFleet:            Buffer.from([54, 168, 21, 184, 175, 6, 32, 5]),
  launchFleetVault:       Buffer.from([11, 245, 64, 137, 202, 190, 124, 7]),

  resolveTransport:       Buffer.from([123, 85, 232, 96, 135, 53, 52, 32]),
  resolveTransportVault:  Buffer.from([168, 164, 6, 82, 122, 24, 118, 35]),

  resolveColonize:        Buffer.from([229, 191, 212, 205, 242, 178, 50, 79]),
  resolveColonizeVault:   Buffer.from([144, 28, 197, 235, 65, 250, 241, 88]),
} as const;

// ─── Layout constants ─────────────────────────────────────────────────────────
const MAX_MISSIONS = 4;
const MAX_PLANET_NAME_LEN = 32;
const MAX_MISSION_COLONY_NAME_LEN = 32;

// ─── Public interfaces ────────────────────────────────────────────────────────
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
  speedFactor: number;
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

export interface VaultRecoveryPromptRequest {
  mode: "create" | "unlock";
  wallet: string;
}

export type VaultRecoveryPromptHandler = (request: VaultRecoveryPromptRequest) => Promise<string>;

export interface LaunchFleetTarget {
  galaxy: number;
  system: number;
  position: number;
  colonyName?: string;
}

export type ProgressReporter = (message: string) => void;

interface GameClientOptions {
  requestVaultRecoveryPassphrase?: VaultRecoveryPromptHandler;
}

// ─── Internal account types ───────────────────────────────────────────────────
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

interface AuthorizedVaultAccount {
  authority: PublicKey;
  vault: PublicKey;
  expiresAt: number;
  revoked: boolean;
  bump: number;
}

interface VaultBackupAccount {
  authority: PublicKey;
  vault: PublicKey;
  version: number;
  ciphertext: Uint8Array;
  iv: Uint8Array;
  salt: Uint8Array;
  kdfSalt: Uint8Array;
  updatedAt: number;
  bump: number;
}

interface VaultLocalCacheRecord {
  version: number;
  wallet: string;
  vault: string;
  iv: string;
  ciphertext: string;
  updatedAt: number;
}

// ─── Borsh Writer ─────────────────────────────────────────────────────────────
class BorshWriter {
  private chunks: Buffer[] = [];

  writeU8(value: number): void { this.chunks.push(Buffer.from([value & 0xff])); }
  writeU16(value: number): void { const b = Buffer.alloc(2); b.writeUInt16LE(value, 0); this.chunks.push(b); }
  writeU32(value: number): void { const b = Buffer.alloc(4); b.writeUInt32LE(value, 0); this.chunks.push(b); }
  writeI64(value: number): void { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(value), 0); this.chunks.push(b); }
  writeU64(value: bigint | number): void { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(value), 0); this.chunks.push(b); }
  writeBytes(value: Uint8Array): void { this.writeU32(value.length); this.chunks.push(Buffer.from(value)); }
  writeFixedBytes(value: Uint8Array): void { this.chunks.push(Buffer.from(value)); }
  writeString(value: string): void {
    const bytes = Buffer.from(value, "utf8");
    this.writeU32(bytes.length);
    this.chunks.push(bytes);
  }
  toBuffer(): Buffer { return Buffer.concat(this.chunks); }
}

// ─── Borsh Readers ────────────────────────────────────────────────────────────
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

// ─── Instruction Encoders ─────────────────────────────────────────────────────
function encodeInstruction(discriminator: Buffer, args?: Buffer): Buffer {
  return args ? Buffer.concat([discriminator, args]) : discriminator;
}

function encodeInitializePlayerArgs(
  vault: PublicKey,
  expiresAt: number,
  backupVersion: number,
  backupCiphertext: Uint8Array,
  backupIv: Uint8Array,
  backupSalt: Uint8Array,
  backupKdfSalt: Uint8Array,
): Buffer {
  const writer = new BorshWriter();
  writer.writeFixedBytes(vault.toBytes());
  writer.writeI64(expiresAt);
  writer.writeU8(backupVersion);
  writer.writeBytes(backupCiphertext);
  writer.writeFixedBytes(backupIv);
  writer.writeFixedBytes(backupSalt);
  writer.writeFixedBytes(backupKdfSalt);
  return writer.toBuffer();
}

function encodeRotateVaultArgs(
  newVault: PublicKey,
  expiresAt: number,
  backupVersion: number,
  backupCiphertext: Uint8Array,
  backupIv: Uint8Array,
  backupSalt: Uint8Array,
  backupKdfSalt: Uint8Array,
): Buffer {
  const writer = new BorshWriter();
  writer.writeFixedBytes(newVault.toBytes());
  writer.writeI64(expiresAt);
  writer.writeU8(backupVersion);
  writer.writeBytes(backupCiphertext);
  writer.writeFixedBytes(backupIv);
  writer.writeFixedBytes(backupSalt);
  writer.writeFixedBytes(backupKdfSalt);
  return writer.toBuffer();
}

function encodeHomeworldArgs(now: number, name: string, galaxy = 0, system = 0, position = 0): Buffer {
  const writer = new BorshWriter();
  writer.writeI64(now);
  writer.writeString(name);
  writer.writeU16(galaxy);
  writer.writeU16(system);
  writer.writeU8(position);
  return writer.toBuffer();
}

function encodeColonyArgs(now: number, mission: Mission): Buffer {
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
  writer.writeU32(0); // colony_ship consumed
  writer.writeU32(0); // solar_satellite not transferable
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

// ─── PDA Derivations ──────────────────────────────────────────────────────────
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

function deriveAuthorizedVaultPda(authority: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("authorized_vault"), authority.toBuffer()],
    GAME_STATE_PROGRAM_ID,
  )[0];
}

function deriveVaultBackupPda(authority: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault_backup"), authority.toBuffer()],
    GAME_STATE_PROGRAM_ID,
  )[0];
}

// ─── Account Deserializers ────────────────────────────────────────────────────
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
      missionType, destination: "11111111111111111111111111111111",
      targetGalaxy, targetSystem, targetPosition, colonyName,
      departTs, arriveTs, returnTs,
      sSmallCargo, sLargeCargo, sLightFighter, sHeavyFighter, sCruiser,
      sBattleship, sBattlecruiser, sBomber, sDestroyer, sDeathstar,
      sRecycler, sEspionageProbe, sColonyShip,
      cargoMetal, cargoCrystal, cargoDeuterium, applied,
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
    authority, player, planetIndex, galaxy, system, position, name,
    diameter, temperature, maxFields, usedFields,
    metalMine, crystalMine, deuteriumSynthesizer, solarPlant, fusionReactor,
    roboticsFactory, naniteFactory, shipyard, metalStorage, crystalStorage,
    deuteriumTank, researchLab, missileSilo,
    energyTech, combustionDrive, impulseDrive, hyperspaceDrive, computerTech,
    astrophysics, igrNetwork,
    researchQueueItem, researchQueueTarget, researchFinishTs,
    buildQueueItem, buildQueueTarget, buildFinishTs,
    metal, crystal, deuterium,
    metalHour, crystalHour, deuteriumHour,
    energyProduction, energyConsumption,
    metalCap, crystalCap, deuteriumCap,
    lastUpdateTs,
    smallCargo, largeCargo, lightFighter, heavyFighter, cruiser,
    battleship, battlecruiser, bomber, destroyer, deathstar,
    recycler, espionageProbe, colonyShip, solarSatellite,
    activeMissions, missions,
  };
}

function deserializeAuthorizedVault(data: Buffer): AuthorizedVaultAccount {
  if (!data.slice(0, 8).equals(AUTHORIZED_VAULT_DISCRIMINATOR)) {
    throw new Error("Invalid authorized vault discriminator.");
  }
  let o = 8;
  const authority = readPubkeyRaw(data, o); o += 32;
  const vault = readPubkeyRaw(data, o); o += 32;
  const expiresAt = readI64(data, o); o += 8;
  const revoked = readU8(data, o) !== 0; o += 1;
  const bump = readU8(data, o);
  return { authority, vault, expiresAt, revoked, bump };
}

function deserializeVaultBackup(data: Buffer): VaultBackupAccount {
  if (!data.slice(0, 8).equals(VAULT_BACKUP_DISCRIMINATOR)) {
    throw new Error("Invalid vault backup discriminator.");
  }
  let o = 8;
  const authority = readPubkeyRaw(data, o); o += 32;
  const vault = readPubkeyRaw(data, o); o += 32;
  const version = readU8(data, o); o += 1;
  const ciphertextLen = readU32(data, o); o += 4;
  const ciphertext = new Uint8Array(data.slice(o, o + ciphertextLen)); o += ciphertextLen;
  const iv = new Uint8Array(data.slice(o, o + 12)); o += 12;
  const salt = new Uint8Array(data.slice(o, o + 16)); o += 16;
  const kdfSalt = new Uint8Array(data.slice(o, o + 16)); o += 16;
  const updatedAt = readI64(data, o); o += 8;
  const bump = readU8(data, o);
  return { authority, vault, version, ciphertext, iv, salt, kdfSalt, updatedAt, bump };
}

// ─── Adapters ─────────────────────────────────────────────────────────────────
function adaptPlanetState(planetPda: PublicKey, account: PlanetStateAccount): PlayerState {
  const authority = account.authority.toBase58();
  const key = planetPda.toBase58();
  return {
    entityPda: key, planetPda: key, fleetPda: key, resourcesPda: key, researchPda: key,
    isDelegated: false,
    planet: {
      creator: authority, entity: key, owner: authority,
      name: account.name, galaxy: account.galaxy, system: account.system, position: account.position,
      planetIndex: account.planetIndex, diameter: account.diameter, temperature: account.temperature,
      maxFields: account.maxFields, usedFields: account.usedFields,
      metalMine: account.metalMine, crystalMine: account.crystalMine,
      deuteriumSynthesizer: account.deuteriumSynthesizer, solarPlant: account.solarPlant,
      fusionReactor: account.fusionReactor, roboticsFactory: account.roboticsFactory,
      naniteFactory: account.naniteFactory, shipyard: account.shipyard,
      metalStorage: account.metalStorage, crystalStorage: account.crystalStorage,
      deuteriumTank: account.deuteriumTank, researchLab: account.researchLab,
      missileSilo: account.missileSilo,
      buildQueueItem: account.buildQueueItem, buildQueueTarget: account.buildQueueTarget,
      buildFinishTs: account.buildFinishTs,
    },
    resources: {
      metal: account.metal, crystal: account.crystal, deuterium: account.deuterium,
      metalHour: account.metalHour, crystalHour: account.crystalHour, deuteriumHour: account.deuteriumHour,
      energyProduction: account.energyProduction, energyConsumption: account.energyConsumption,
      metalCap: account.metalCap, crystalCap: account.crystalCap, deuteriumCap: account.deuteriumCap,
      lastUpdateTs: account.lastUpdateTs,
    },
    fleet: {
      creator: authority,
      smallCargo: account.smallCargo, largeCargo: account.largeCargo,
      lightFighter: account.lightFighter, heavyFighter: account.heavyFighter,
      cruiser: account.cruiser, battleship: account.battleship, battlecruiser: account.battlecruiser,
      bomber: account.bomber, destroyer: account.destroyer, deathstar: account.deathstar,
      recycler: account.recycler, espionageProbe: account.espionageProbe,
      colonyShip: account.colonyShip, solarSatellite: account.solarSatellite,
      activeMissions: account.activeMissions, missions: account.missions,
    },
    research: {
      creator: authority,
      energyTech: account.energyTech, combustionDrive: account.combustionDrive,
      impulseDrive: account.impulseDrive, hyperspaceDrive: account.hyperspaceDrive,
      computerTech: account.computerTech, astrophysics: account.astrophysics, igrNetwork: account.igrNetwork,
      queueItem: account.researchQueueItem, queueTarget: account.researchQueueTarget,
      researchFinishTs: account.researchFinishTs,
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isPlanetStateAccount(
  account: Awaited<ReturnType<Connection["getAccountInfo"]>>,
): account is NonNullable<Awaited<ReturnType<Connection["getAccountInfo"]>>> {
  return !!account &&
    account.owner.equals(GAME_STATE_PROGRAM_ID) &&
    account.data.slice(0, 8).equals(PLANET_STATE_DISCRIMINATOR);
}

function describeTxError(err: unknown): string {
  if (err instanceof SendTransactionError) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}

function bytesToBase64(bytes: Uint8Array): string { return Buffer.from(bytes).toString("base64"); }
function base64ToBytes(value: string): Uint8Array { return new Uint8Array(Buffer.from(value, "base64")); }
function utf8Bytes(value: string): Uint8Array { return new TextEncoder().encode(value); }
function asCryptoBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(bytes.length));
  out.set(bytes);
  return out as Uint8Array<ArrayBuffer>;
}



function buildVaultRecoveryMessage(authority: PublicKey, salt: Uint8Array): Uint8Array {
  return utf8Bytes(
    `${VAULT_RECOVERY_MESSAGE_PREFIX}\nAuthority:${authority.toBase58()}\nSalt:${bytesToBase64(salt)}`,
  );
}

function vaultLocalCacheKey(authority: PublicKey): string {
  return `${VAULT_CACHE_STORAGE_PREFIX}:${authority.toBase58()}`;
}

// ─── GameClient ───────────────────────────────────────────────────────────────
export class GameClient {
  private connection: Connection;
  private provider: AnchorProvider;
  private options: GameClientOptions;
  private vaultKeypair: Keypair | null = null;
  private vaultRecoveryPassphrase: string | null = null;
private preferVaultSigning = true;



  constructor(connection: Connection, provider: AnchorProvider, options: GameClientOptions = {}) {
    this.connection = connection;
    this.provider = provider;
    this.options = options;
    setProvider(provider);
  }

  getVaultPublicKey(): PublicKey | null {
    return this.vaultKeypair?.publicKey ?? null;
  }

  isVaultReady(): boolean {
    return this.vaultKeypair !== null;
  }

  clearCachedVaultRecoveryPassphrase(): void {
    this.vaultRecoveryPassphrase = null;

    
  }

  setPreferVaultSigning(value: boolean): void {
  this.preferVaultSigning = value;
}

getPreferVaultSigning(): boolean {
  return this.preferVaultSigning;
}
  // ── Crypto helpers ──────────────────────────────────────────────────────────
  private async promptVaultRecoveryPassphrase(createIfMissing: boolean): Promise<string> {
    if (this.vaultRecoveryPassphrase) return this.vaultRecoveryPassphrase;

    if (this.options.requestVaultRecoveryPassphrase) {
      const value = await this.options.requestVaultRecoveryPassphrase({
        mode: createIfMissing ? "create" : "unlock",
        wallet: this.provider.wallet.publicKey.toBase58(),
      });
      const trimmed = value?.trim();
      if (!trimmed) throw new Error("Vault recovery password is required.");
      this.vaultRecoveryPassphrase = trimmed;
      return trimmed;
    }

    const promptFn = globalThis.prompt;
    if (promptFn) {
      const promptText = createIfMissing
        ? "Choose a strong vault recovery password:"
        : "Enter your vault recovery password to restore game access:";
      const value = promptFn(promptText)?.trim();
      if (!value) throw new Error("A vault recovery password is required.");
      this.vaultRecoveryPassphrase = value;
      return value;
    }

    throw new Error(
      "No recovery passphrase handler provided. " +
      "Pass `requestVaultRecoveryPassphrase` in GameClientOptions.",
    );
  }
async withdrawVaultLamports(lamports: number): Promise<string> {
  if (!this.vaultKeypair) throw new Error("Vault is not ready.");
  if (lamports <= 0) throw new Error("Invalid withdraw amount.");

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: this.vaultKeypair.publicKey,
      toPubkey: this.provider.wallet.publicKey,
      lamports,
    }),
  );

  const { blockhash, lastValidBlockHeight } =
    await this.connection.getLatestBlockhash("confirmed");

  tx.recentBlockhash = blockhash;
  tx.feePayer = this.vaultKeypair.publicKey;
  tx.sign(this.vaultKeypair);

  const sig = await this.connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });

  await this.connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );

  return sig;
}

async depositToVaultLamports(lamports: number): Promise<string> {
  if (!this.vaultKeypair) throw new Error("Vault is not ready.");
  if (!Number.isFinite(lamports) || lamports <= 0) {
    throw new Error("Invalid deposit amount.");
  }

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: this.provider.wallet.publicKey,
      toPubkey: this.vaultKeypair.publicKey,
      lamports,
    }),
  );

  tx.feePayer = this.provider.wallet.publicKey;

  return this.provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
}


  private getCacheDeviceKeyBytes(): Uint8Array | null {
    if (typeof localStorage === "undefined") return null;
    let encoded = localStorage.getItem(VAULT_CACHE_DEVICE_KEY_STORAGE);
    if (!encoded) {
      const fresh = crypto.getRandomValues(new Uint8Array(32));
      encoded = bytesToBase64(fresh);
      localStorage.setItem(VAULT_CACHE_DEVICE_KEY_STORAGE, encoded);
    }
    try { return asCryptoBytes(base64ToBytes(encoded)); }
    catch { localStorage.removeItem(VAULT_CACHE_DEVICE_KEY_STORAGE); return null; }
  }

  private async getCacheDeviceKey(): Promise<CryptoKey | null> {
    const keyBytes = this.getCacheDeviceKeyBytes();
    if (!keyBytes) return null;
    return crypto.subtle.importKey("raw", keyBytes.slice().buffer, "AES-GCM", false, ["encrypt", "decrypt"]);
  }

  private async persistLocalVaultCache(vault: Keypair): Promise<void> {
    if (typeof localStorage === "undefined") return;
    const key = await this.getCacheDeviceKey();
    if (!key) return;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv: asCryptoBytes(iv) }, key, asCryptoBytes(vault.secretKey)),
    );
    const record: VaultLocalCacheRecord = {
      version: VAULT_CACHE_VERSION,
      wallet: this.provider.wallet.publicKey.toBase58(),
      vault: vault.publicKey.toBase58(),
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(ciphertext),
      updatedAt: Date.now(),
    };
    localStorage.setItem(vaultLocalCacheKey(this.provider.wallet.publicKey), JSON.stringify(record));
  }

  private async tryRestoreVaultFromLocalCache(): Promise<Keypair | null> {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(vaultLocalCacheKey(this.provider.wallet.publicKey));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as VaultLocalCacheRecord;
      if (
        parsed.version !== VAULT_CACHE_VERSION ||
        parsed.wallet !== this.provider.wallet.publicKey.toBase58()
      ) {
        localStorage.removeItem(vaultLocalCacheKey(this.provider.wallet.publicKey));
        return null;
      }
      const key = await this.getCacheDeviceKey();
      if (!key) return null;
      const secretKey = new Uint8Array(
        await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: asCryptoBytes(base64ToBytes(parsed.iv)) },
          key,
          asCryptoBytes(base64ToBytes(parsed.ciphertext)),
        ),
      );
      const vault = Keypair.fromSecretKey(secretKey);
      if (vault.publicKey.toBase58() !== parsed.vault) {
        throw new Error("Cached vault key mismatch.");
      }
      this.vaultKeypair = vault;
      console.log("[GAME_STATE:vault_cache] restored", { vault: vault.publicKey.toBase58() });
      return vault;
    } catch (error) {
      console.warn("[GAME_STATE:vault_cache] invalid", error);
      localStorage.removeItem(vaultLocalCacheKey(this.provider.wallet.publicKey));
      return null;
    }
  }

  private async getVaultRecoverySignature(salt: Uint8Array): Promise<Uint8Array | null> {
    const wallet = this.provider.wallet as unknown as { signMessage?: (msg: Uint8Array) => Promise<Uint8Array> };
    if (typeof wallet.signMessage === "function") {
      const message = buildVaultRecoveryMessage(this.provider.wallet.publicKey, salt);
      return wallet.signMessage.call(this.provider.wallet, message);
    }
    return null;
  }

  private async deriveVaultEncryptionKey(
    salt: Uint8Array,
    kdfSalt: Uint8Array,
    createIfMissing: boolean,
  ): Promise<CryptoKey> {
    const passphrase = await this.promptVaultRecoveryPassphrase(createIfMissing);
    const signature = await this.getVaultRecoverySignature(salt);
    const contextBytes = signature
      ? signature
      : utf8Bytes(`${this.provider.wallet.publicKey.toBase58()}:${bytesToBase64(salt)}:no-sign-message`);
    const keyMaterialBytes = asCryptoBytes(new Uint8Array([...contextBytes, ...utf8Bytes(`:${passphrase}`)]));
    const keyMaterial = await crypto.subtle.importKey("raw", keyMaterialBytes, "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: asCryptoBytes(kdfSalt), iterations: 250_000, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }

  private async encryptVaultSecretKey(
    vault: Keypair,
  ): Promise<{ ciphertext: Uint8Array; iv: Uint8Array; salt: Uint8Array; kdfSalt: Uint8Array }> {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const kdfSalt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveVaultEncryptionKey(salt, kdfSalt, true);
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv: asCryptoBytes(iv) }, key, asCryptoBytes(vault.secretKey)),
    );
    return { ciphertext, iv, salt, kdfSalt };
  }

  private async decryptVaultSecretKey(backup: VaultBackupAccount): Promise<Keypair> {
    const key = await this.deriveVaultEncryptionKey(backup.salt, backup.kdfSalt, false);
    const secretKey = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: asCryptoBytes(backup.iv) },
        key,
        asCryptoBytes(backup.ciphertext),
      ),
    );
    const vault = Keypair.fromSecretKey(secretKey);
    if (!vault.publicKey.equals(backup.vault)) {
      throw new Error("Recovered vault key does not match the on-chain backup.");
    }
    return vault;
  }

  private async fetchVaultBackup(): Promise<VaultBackupAccount | null> {
    const pda = deriveVaultBackupPda(this.provider.wallet.publicKey);
    const account = await this.connection.getAccountInfo(pda, "confirmed");
    if (!account?.owner.equals(GAME_STATE_PROGRAM_ID)) return null;
    try { return deserializeVaultBackup(Buffer.from(account.data)); }
    catch { return null; }
  }

  private async tryRestoreVaultFromBackup(reportProgress?: ProgressReporter): Promise<Keypair | null> {
    const backup = await this.fetchVaultBackup();
    if (!backup) {
      console.log("[GAME_STATE:vault_backup] miss");
      return null;
    }
    reportProgress?.("Restoring vault from encrypted on-chain backup...");
    const vault = await this.decryptVaultSecretKey(backup);
    const balance = await this.connection.getBalance(vault.publicKey, "confirmed");
    if (balance < VAULT_MIN_BALANCE_LAMPORTS) {
      const topUp = VAULT_TARGET_BALANCE_LAMPORTS - balance;
      if (topUp > 0) {
        reportProgress?.("Topping up vault with SOL...");
        const fundTx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: this.provider.wallet.publicKey,
            toPubkey: vault.publicKey,
            lamports: topUp,
          }),
        );
        await this.provider.sendAndConfirm(fundTx, [], { commitment: "confirmed" });
      }
    }
    this.vaultKeypair = vault;
    await this.persistLocalVaultCache(vault);
    console.log("[GAME_STATE:vault_backup] restored", { vault: vault.publicKey.toBase58() });
    return vault;
  }

  // ── Vault setup ─────────────────────────────────────────────────────────────
  async ensureVault(reportProgress?: ProgressReporter): Promise<Keypair> {
    // 1. Try local cache first (no popup)
    const cached = await this.tryRestoreVaultFromLocalCache();
    if (cached) return cached;

    // 2. Try on-chain backup (asks for password)
    const restored = await this.tryRestoreVaultFromBackup(reportProgress);
    if (restored) return restored;

    // 3. Generate fresh vault
    const vault = Keypair.generate();
    reportProgress?.("Signing with wallet: funding fresh vault keypair");
    const fundTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: this.provider.wallet.publicKey,
        toPubkey: vault.publicKey,
        lamports: VAULT_TARGET_BALANCE_LAMPORTS,
      }),
    );
    await this.provider.sendAndConfirm(fundTx, [], { commitment: "confirmed" });
    this.vaultKeypair = vault;
    await this.persistLocalVaultCache(vault);
    return vault;
  }

  // ── Instruction senders ──────────────────────────────────────────────────────
private async sendInstruction(
  instructions: TransactionInstruction[],
  extraSigners: Keypair[] = [],
): Promise<string> {
  const fullInstructions = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
    ...instructions,
  ];

  const tx = new Transaction().add(...fullInstructions);

  const { blockhash, lastValidBlockHeight } =
    await this.connection.getLatestBlockhash("confirmed");

  tx.recentBlockhash = blockhash;

  // If we have a vault signer in this tx, make the vault the fee payer and
  // do NOT use the Anchor provider / wallet adapter path.
  if (extraSigners.length > 0) {
    tx.feePayer = extraSigners[0].publicKey;
    tx.sign(...extraSigners);

    const sig = await this.connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });

    await this.connection.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      "confirmed",
    );

    return sig;
  }

  // Wallet-only path
  tx.feePayer = this.provider.wallet.publicKey;
  return this.provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
}

private vaultSigners(): Keypair[] {
  return this.preferVaultSigning && this.vaultKeypair
    ? [this.vaultKeypair]
    : [];
}

  // ── Player / vault initialization ────────────────────────────────────────────
  async initializePlayer(reportProgress?: ProgressReporter): Promise<void> {
    const authority = this.provider.wallet.publicKey;
    const profilePda = derivePlayerProfilePda(authority);
    const authorizedVaultPda = deriveAuthorizedVaultPda(authority);
    const vaultBackupPda = deriveVaultBackupPda(authority);

    // Check if already initialized
    const existing = await this.connection.getAccountInfo(profilePda, "confirmed");
    if (existing) {
      // Profile exists, just ensure vault is loaded
      await this.ensureVault(reportProgress);
      return;
    }

    reportProgress?.("Signing with wallet: generating vault keypair");
    const vault = await this.ensureVault(reportProgress);
    const encrypted = await this.encryptVaultSecretKey(vault);

    reportProgress?.("Signing with wallet: creating player profile, vault authorization, and vault backup");

    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: authority,          isSigner: true,  isWritable: true  }, // authority (wallet)
        { pubkey: profilePda,         isSigner: false, isWritable: true  }, // player_profile
        { pubkey: authorizedVaultPda, isSigner: false, isWritable: true  }, // authorized_vault
        { pubkey: vaultBackupPda,     isSigner: false, isWritable: true  }, // vault_backup
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeInstruction(
        IX.initializePlayer,
        encodeInitializePlayerArgs(
          vault.publicKey,
          0, // expires_at = 0 (never)
          VAULT_BACKUP_VERSION,
          encrypted.ciphertext,
          encrypted.iv,
          encrypted.salt,
          encrypted.kdfSalt,
        ),
      ),
    });

    await this.sendInstruction([ix]);
  }

  async rotateVault(reportProgress?: ProgressReporter): Promise<void> {
    const authority = this.provider.wallet.publicKey;
    const authorizedVaultPda = deriveAuthorizedVaultPda(authority);
    const vaultBackupPda = deriveVaultBackupPda(authority);

    const newVault = Keypair.generate();
    reportProgress?.("Signing with wallet: funding new vault keypair");
    const fundTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: authority,
        toPubkey: newVault.publicKey,
        lamports: VAULT_TARGET_BALANCE_LAMPORTS,
      }),
    );
    await this.provider.sendAndConfirm(fundTx, [], { commitment: "confirmed" });

    const encrypted = await this.encryptVaultSecretKey(newVault);

    reportProgress?.("Signing with wallet: rotating vault on-chain");
    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: authority,          isSigner: true,  isWritable: true  },
        { pubkey: authorizedVaultPda, isSigner: false, isWritable: true  },
        { pubkey: vaultBackupPda,     isSigner: false, isWritable: true  },
      ],
      data: encodeInstruction(
        IX.rotateVault,
        encodeRotateVaultArgs(
          newVault.publicKey,
          0,
          VAULT_BACKUP_VERSION,
          encrypted.ciphertext,
          encrypted.iv,
          encrypted.salt,
          encrypted.kdfSalt,
        ),
      ),
    });

    await this.sendInstruction([ix]);
    this.vaultKeypair = newVault;
    await this.persistLocalVaultCache(newVault);
  }

  // ── Planet creation ──────────────────────────────────────────────────────────
  private async fetchPlayerProfile(walletPubkey: PublicKey): Promise<PlayerProfileAccount | null> {
    const profilePda = derivePlayerProfilePda(walletPubkey);
    const account = await this.connection.getAccountInfo(profilePda, "confirmed");
    if (!account || !account.owner.equals(GAME_STATE_PROGRAM_ID)) return null;
    try { return deserializePlayerProfile(Buffer.from(account.data)); }
    catch { return null; }
  }

  async initializePlanet(planetName = "Homeworld", reportProgress?: ProgressReporter): Promise<PlayerState> {
    const authority = this.provider.wallet.publicKey;

    // Ensure vault is ready
    await this.ensureVault(reportProgress);
    const vault = this.vaultKeypair!;

    // Ensure player profile + vault exists on-chain
    const profile = await this.fetchPlayerProfile(authority);
    if (!profile) {
      await this.initializePlayer(reportProgress);
    }

    const updatedProfile = await this.fetchPlayerProfile(authority);
    const nextIndex = updatedProfile?.planetCount ?? 0;
    const playerProfilePda = derivePlayerProfilePda(authority);
    const authorizedVaultPda = deriveAuthorizedVaultPda(authority);
    const planetStatePda = derivePlanetStatePda(authority, nextIndex);

    reportProgress?.("Vault signing: creating homeworld");

    const ix = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: vault.publicKey,    isSigner: true,  isWritable: true  }, // vault_signer (payer)
        { pubkey: authority,          isSigner: false, isWritable: false }, // authority (wallet, not signing)
        { pubkey: authorizedVaultPda, isSigner: false, isWritable: false }, // authorized_vault
        { pubkey: playerProfilePda,   isSigner: false, isWritable: true  }, // player_profile
        { pubkey: planetStatePda,     isSigner: false, isWritable: true  }, // planet_state
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeInstruction(
        IX.initializeHomeworld,
        encodeHomeworldArgs(Math.floor(Date.now() / 1000), planetName.trim() || "Homeworld"),
      ),
    });

    await this.sendInstruction([ix], [vault]);

    const state = await this.loadPlanetStateByPda(planetStatePda);
    if (!state) throw new Error("Planet created but could not be loaded.");
    return state;
  }

  // ── Planet loading ───────────────────────────────────────────────────────────
  private async loadPlanetStateByPda(planetPda: PublicKey): Promise<PlayerState | null> {
    const account = await this.connection.getAccountInfo(planetPda, "confirmed");
    if (!isPlanetStateAccount(account)) return null;
    return adaptPlanetState(planetPda, deserializePlanetState(Buffer.from(account.data)));
  }

  async findPlanets(walletPubkey: PublicKey): Promise<PlayerState[]> {
    const profile = await this.fetchPlayerProfile(walletPubkey);
    if (!profile) return [];
    const pdas = Array.from({ length: profile.planetCount }, (_, i) => derivePlanetStatePda(walletPubkey, i));
    const states = await Promise.all(pdas.map(pda => this.loadPlanetStateByPda(pda)));
    return states
      .filter((s): s is PlayerState => !!s)
      .sort((a, b) => a.planet.planetIndex - b.planet.planetIndex);
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
        const s = deserializePlanetState(Buffer.from(account.account.data));
        if (s.galaxy === galaxy && s.system === system) {
          planets.push(adaptPlanetState(account.pubkey, s).planet);
        }
      } catch { /* ignore */ }
    }
    return planets.sort((a, b) => a.position - b.position);
  }

  // ── Vault-signed planet mutation helper ──────────────────────────────────────
  private buildVaultMutationInstruction(
    vaultDiscriminator: Buffer,
    walletDiscriminator: Buffer,
    planetPda: PublicKey,
    planetAuthority: PublicKey,
    args: Buffer,
  ): TransactionInstruction {
if (this.preferVaultSigning && this.vaultKeypair) {
      const authorizedVaultPda = deriveAuthorizedVaultPda(planetAuthority);
      return new TransactionInstruction({
        programId: GAME_STATE_PROGRAM_ID,
        keys: [
          { pubkey: this.vaultKeypair.publicKey, isSigner: true,  isWritable: true  }, // vault_signer
          { pubkey: authorizedVaultPda,           isSigner: false, isWritable: false }, // authorized_vault
          { pubkey: planetPda,                    isSigner: false, isWritable: true  }, // planet_state
        ],
        data: encodeInstruction(vaultDiscriminator, args),
      });
    }

    // Fallback: wallet signs directly
    return new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: this.provider.wallet.publicKey, isSigner: true,  isWritable: true  },
        { pubkey: planetPda,                       isSigner: false, isWritable: true  },
      ],
      data: encodeInstruction(walletDiscriminator, args),
    });
  }

  private buildVaultTransportInstruction(
    sourcePlanetPda: PublicKey,
    destinationPlanetPda: PublicKey,
    planetAuthority: PublicKey,
    args: Buffer,
  ): TransactionInstruction {
if (this.preferVaultSigning && this.vaultKeypair) {
      const authorizedVaultPda = deriveAuthorizedVaultPda(planetAuthority);
      return new TransactionInstruction({
        programId: GAME_STATE_PROGRAM_ID,
        keys: [
          { pubkey: this.vaultKeypair.publicKey, isSigner: true,  isWritable: true  },
          { pubkey: authorizedVaultPda,           isSigner: false, isWritable: false },
          { pubkey: sourcePlanetPda,              isSigner: false, isWritable: true  },
          { pubkey: destinationPlanetPda,         isSigner: false, isWritable: true  },
        ],
        data: encodeInstruction(IX.resolveTransportVault, args),
      });
    }

    return new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: this.provider.wallet.publicKey, isSigner: true,  isWritable: true  },
        { pubkey: sourcePlanetPda,                isSigner: false, isWritable: true  },
        { pubkey: destinationPlanetPda,           isSigner: false, isWritable: true  },
      ],
      data: encodeInstruction(IX.resolveTransport, args),
    });
  }

  // ── Gameplay actions ─────────────────────────────────────────────────────────
  async startBuild(entityPda: PublicKey, buildingIdx: number): Promise<string> {
    await this.ensureVault();
    const writer = new BorshWriter();
    writer.writeU8(buildingIdx);
    writer.writeI64(Math.floor(Date.now() / 1000));

    // Need authority — load planet to get it
    const state = await this.loadPlanetStateByPda(entityPda);
    const authority = state ? new PublicKey(state.planet.owner) : this.provider.wallet.publicKey;

    return this.sendInstruction(
      [this.buildVaultMutationInstruction(IX.startBuildVault, IX.startBuild, entityPda, authority, writer.toBuffer())],
      this.vaultSigners(),
    );
  }

  async finishBuild(entityPda: PublicKey): Promise<string> {
    await this.ensureVault();
    const writer = new BorshWriter();
    writer.writeI64(Math.floor(Date.now() / 1000));
    const state = await this.loadPlanetStateByPda(entityPda);
    const authority = state ? new PublicKey(state.planet.owner) : this.provider.wallet.publicKey;
    return this.sendInstruction(
      [this.buildVaultMutationInstruction(IX.finishBuildVault, IX.finishBuild, entityPda, authority, writer.toBuffer())],
      this.vaultSigners(),
    );
  }

  async startResearch(entityPda: PublicKey, techIdx: number): Promise<string> {
    await this.ensureVault();
    const writer = new BorshWriter();
    writer.writeU8(techIdx);
    writer.writeI64(Math.floor(Date.now() / 1000));
    const state = await this.loadPlanetStateByPda(entityPda);
    const authority = state ? new PublicKey(state.planet.owner) : this.provider.wallet.publicKey;
    return this.sendInstruction(
      [this.buildVaultMutationInstruction(IX.startResearchVault, IX.startResearch, entityPda, authority, writer.toBuffer())],
      this.vaultSigners(),
    );
  }

  async finishResearch(entityPda: PublicKey): Promise<string> {
    await this.ensureVault();
    const writer = new BorshWriter();
    writer.writeI64(Math.floor(Date.now() / 1000));
    const state = await this.loadPlanetStateByPda(entityPda);
    const authority = state ? new PublicKey(state.planet.owner) : this.provider.wallet.publicKey;
    return this.sendInstruction(
      [this.buildVaultMutationInstruction(IX.finishResearchVault, IX.finishResearch, entityPda, authority, writer.toBuffer())],
      this.vaultSigners(),
    );
  }

  async buildShip(entityPda: PublicKey, shipType: number, quantity: number): Promise<string> {
    await this.ensureVault();
    const state = await this.loadPlanetStateByPda(entityPda);
    const authority = state ? new PublicKey(state.planet.owner) : this.provider.wallet.publicKey;
    return this.sendInstruction(
      [this.buildVaultMutationInstruction(
        IX.buildShipVault,
        IX.buildShip,
        entityPda,
        authority,
        encodeBuildShipArgs(shipType, quantity, Math.floor(Date.now() / 1000)),
      )],
      this.vaultSigners(),
    );
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
    await this.ensureVault();
    const state = await this.loadPlanetStateByPda(entityPda);
    const authority = state ? new PublicKey(state.planet.owner) : this.provider.wallet.publicKey;
    return this.sendInstruction(
      [this.buildVaultMutationInstruction(
        IX.launchFleetVault,
        IX.launchFleet,
        entityPda,
        authority,
        encodeLaunchFleetArgs(ships, cargo, missionType, speedFactor, Math.floor(Date.now() / 1000), flightSeconds, target),
      )],
      this.vaultSigners(),
    );
  }

  private async findPlanetByCoordinates(galaxy: number, system: number, position: number): Promise<PublicKey | null> {
    const accounts = await this.connection.getProgramAccounts(GAME_STATE_PROGRAM_ID, { commitment: "confirmed" });
    for (const account of accounts) {
      if (!account.account.data.slice(0, 8).equals(PLANET_STATE_DISCRIMINATOR)) continue;
      try {
        const s = deserializePlanetState(Buffer.from(account.account.data));
        if (s.galaxy === galaxy && s.system === system && s.position === position) return account.pubkey;
      } catch { /* ignore */ }
    }
    return null;
  }

  async resolveTransport(sourceEntityPda: PublicKey, mission: Mission, slot: number): Promise<string> {
    await this.ensureVault();
    const destinationPlanetPda = await this.findPlanetByCoordinates(
      mission.targetGalaxy, mission.targetSystem, mission.targetPosition,
    );
    if (!destinationPlanetPda) {
      throw new Error(`No destination planet found at ${mission.targetGalaxy}:${mission.targetSystem}:${mission.targetPosition}.`);
    }
    const state = await this.loadPlanetStateByPda(sourceEntityPda);
    const authority = state ? new PublicKey(state.planet.owner) : this.provider.wallet.publicKey;
    const writer = new BorshWriter();
    writer.writeU8(slot);
    writer.writeI64(Math.floor(Date.now() / 1000));
    return this.sendInstruction(
      [this.buildVaultTransportInstruction(sourceEntityPda, destinationPlanetPda, authority, writer.toBuffer())],
      this.vaultSigners(),
    );
  }

  async resolveColonize(
    sourceEntityPda: PublicKey,
    mission: Mission,
    slot: number,
    now = Math.floor(Date.now() / 1000),
    reportProgress?: ProgressReporter,
  ): Promise<{ entityPda: PublicKey; planetPda: PublicKey }> {
    await this.ensureVault(reportProgress);
    const vault = this.vaultKeypair!;
    const authority = this.provider.wallet.publicKey;

    const profile = await this.fetchPlayerProfile(authority);
    const nextIndex = profile?.planetCount ?? 0;
    const playerProfilePda = derivePlayerProfilePda(authority);
    const authorizedVaultPda = deriveAuthorizedVaultPda(authority);
    const colonyPda = derivePlanetStatePda(authority, nextIndex);

    reportProgress?.("Vault signing: creating colony");

    const initIx = new TransactionInstruction({
      programId: GAME_STATE_PROGRAM_ID,
      keys: [
        { pubkey: vault.publicKey,    isSigner: true,  isWritable: true  },
        { pubkey: authority,          isSigner: false, isWritable: false },
        { pubkey: authorizedVaultPda, isSigner: false, isWritable: false },
        { pubkey: playerProfilePda,   isSigner: false, isWritable: true  },
        { pubkey: colonyPda,          isSigner: false, isWritable: true  },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeInstruction(IX.initializeColony, encodeColonyArgs(now, mission)),
    });

    await this.sendInstruction([initIx], [vault]);

    reportProgress?.("Vault signing: resolving colonize mission");

    const resolveWriter = new BorshWriter();
    resolveWriter.writeU8(slot);
    resolveWriter.writeI64(now);

    const resolveIx = this.buildVaultMutationInstruction(
      IX.resolveColonizeVault,
      IX.resolveColonize,
      sourceEntityPda,
      authority,
      resolveWriter.toBuffer(),
    );

    await this.sendInstruction([resolveIx], this.vaultSigners());

    return { entityPda: colonyPda, planetPda: colonyPda };
  }

  async findPlayerByWallet(walletPubkey: PublicKey): Promise<{ entityPda: string } | null> {
    const state = await this.findPlanet(walletPubkey);
    if (!state) return null;
    return { entityPda: state.entityPda };
  }
}

// ─── Game Data Constants ──────────────────────────────────────────────────────
export const BUILDINGS = [
  { idx: 0,  key: "metalMine",            name: "Metal Mine",             icon: "⬡",  desc: "Extracts metal from the planet crust." },
  { idx: 1,  key: "crystalMine",          name: "Crystal Mine",           icon: "◈",  desc: "Processes surface crystal formations." },
  { idx: 2,  key: "deuteriumSynthesizer", name: "Deuterium Synthesizer",  icon: "◉",  desc: "Extracts deuterium from the atmosphere." },
  { idx: 3,  key: "solarPlant",           name: "Solar Plant",            icon: "☀",  desc: "Converts sunlight to energy." },
  { idx: 4,  key: "fusionReactor",        name: "Fusion Reactor",         icon: "⚛",  desc: "Burns deuterium for high-yield energy." },
  { idx: 5,  key: "roboticsFactory",      name: "Robotics Factory",       icon: "🤖", desc: "Automated workers — halves build time." },
  { idx: 6,  key: "naniteFactory",        name: "Nanite Factory",         icon: "🔬", desc: "Nano assemblers — massive build speed." },
  { idx: 7,  key: "shipyard",             name: "Shipyard",               icon: "🚀", desc: "Constructs ships and defense units." },
  { idx: 8,  key: "metalStorage",         name: "Metal Storage",          icon: "🏗", desc: "Increases metal cap." },
  { idx: 9,  key: "crystalStorage",       name: "Crystal Storage",        icon: "🏗", desc: "Increases crystal cap." },
  { idx: 10, key: "deuteriumTank",        name: "Deuterium Tank",         icon: "🏗", desc: "Increases deuterium cap." },
  { idx: 11, key: "researchLab",          name: "Research Lab",           icon: "🔭", desc: "Required for all technology research." },
  { idx: 12, key: "missileSilo",          name: "Missile Silo",           icon: "🎯", desc: "Stores interplanetary missiles." },
] as const;

export const SHIPS = [
  { key: "smallCargo",    name: "Small Cargo",    icon: "📦", atk: 5,      cargo: 5_000,    cost: { m: 2000,    c: 2000,    d: 0       } },
  { key: "largeCargo",    name: "Large Cargo",    icon: "🚛", atk: 5,      cargo: 25_000,   cost: { m: 6000,    c: 6000,    d: 0       } },
  { key: "lightFighter",  name: "Light Fighter",  icon: "✈",  atk: 50,     cargo: 50,       cost: { m: 3000,    c: 1000,    d: 0       } },
  { key: "heavyFighter",  name: "Heavy Fighter",  icon: "⚡",  atk: 150,    cargo: 100,      cost: { m: 6000,    c: 4000,    d: 0       } },
  { key: "cruiser",       name: "Cruiser",        icon: "🛸", atk: 400,    cargo: 800,      cost: { m: 20000,   c: 7000,    d: 2000    } },
  { key: "battleship",    name: "Battleship",     icon: "⚔",  atk: 1000,   cargo: 1500,     cost: { m: 45000,   c: 15000,   d: 0       } },
  { key: "battlecruiser", name: "Battlecruiser",  icon: "🔱", atk: 700,    cargo: 750,      cost: { m: 30000,   c: 40000,   d: 15000   } },
  { key: "bomber",        name: "Bomber",         icon: "💣", atk: 1000,   cargo: 500,      cost: { m: 50000,   c: 25000,   d: 15000   } },
  { key: "destroyer",     name: "Destroyer",      icon: "💥", atk: 2000,   cargo: 2000,     cost: { m: 60000,   c: 50000,   d: 15000   } },
  { key: "deathstar",     name: "Deathstar",      icon: "🌑", atk: 200000, cargo: 1000000,  cost: { m: 5000000, c: 4000000, d: 1000000 } },
  { key: "recycler",      name: "Recycler",       icon: "♻",  atk: 1,      cargo: 20_000,   cost: { m: 10000,   c: 6000,    d: 2000    } },
  { key: "espionageProbe",name: "Espionage Probe",icon: "👁", atk: 0,      cargo: 0,        cost: { m: 0,       c: 1000,    d: 0       } },
  { key: "colonyShip",    name: "Colony Ship",    icon: "🌍", atk: 50,     cargo: 7500,     cost: { m: 10000,   c: 20000,   d: 10000   } },
  { key: "solarSatellite",name: "Solar Satellite",icon: "🛰", atk: 1,      cargo: 0,        cost: { m: 0,       c: 2000,    d: 500     } },
] as const;

export const SHIP_TYPE_IDX: Record<string, number> = {
  smallCargo: 0, largeCargo: 1, lightFighter: 2, heavyFighter: 3, cruiser: 4,
  battleship: 5, battlecruiser: 6, bomber: 7, destroyer: 8, deathstar: 9,
  recycler: 10, espionageProbe: 11, colonyShip: 12, solarSatellite: 13,
};

export const MISSION_LABELS: Record<number, string> = { 2: "TRANSPORT", 5: "COLONIZE" };

const BASE_COSTS: Record<number, [number, number, number]> = {
  0: [60, 15, 0], 1: [48, 24, 0], 2: [225, 75, 0], 3: [75, 30, 0],
  4: [900, 360, 900], 5: [400, 120, 200], 6: [1000000, 500000, 100000],
  7: [400, 200, 100], 8: [1000, 0, 0], 9: [1000, 500, 0],
  10: [1000, 1000, 0], 11: [200, 400, 200], 12: [20, 20, 0],
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