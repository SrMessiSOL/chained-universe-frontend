// Dependencies: npm install @solana/web3.js @magicblock-labs/bolt-sdk @coral-xyz/anchor
import {
  Connection,
  PublicKey,
  SendTransactionError,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
  AccountMeta,
} from "@solana/web3.js";
import { AnchorProvider, setProvider } from "@coral-xyz/anchor";
import { anchor as BoltAnchor, AddEntity, InitializeComponent, ApplySystem, createDelegateInstruction, createUndelegateInstruction } from "@magicblock-labs/bolt-sdk";

export const ER_DIRECT_RPC = "https://devnet.magicblock.app";

// ─── Program IDs ──────────────────────────────────────────────────────────────
export const WORLD_PROGRAM_ID      = new PublicKey("WorLD15A7CrDwLcLy4fRqtaTb9fbd8o8iqiEMUDse2n");
export const DELEGATION_PROGRAM_ID = new PublicKey("DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh");

export const PROGRAM_IDS = {
  componentPlanet:    new PublicKey("GSQbXfwxMWkW2bGASsKe4i8WupDPMRCLybZHRPJoXC6P"),
  componentFleet:     new PublicKey("CsHSUWnCL4rTi9WYcVRXyy2Sq9TgcH4Lr7WcZNViG5NY"),
  componentResources: new PublicKey("66QnMWuqE9B8vE9iSP1qWMk8R2yybci4NNJtdL3xiGjW"),
  componentResearch:  new PublicKey("EC83xSy52aXakXJFqgXni5Ked9TSo8QmQff1pjtumTbG"),
  systemInitialize:   new PublicKey("GHBGdcof2e5tsPe2vP3zJYNxJscojY7J7gdRXCsgdpY9"),
  systemProduce:      new PublicKey("DNNJg4A1yirXgUN5cdJ4ozuG8zJVkmxB2AsWvTqVsbk4"),
  systemBuild:        new PublicKey("E94HChSfw57Px2BJPKLnoaj17v6NKN7vXnoQGLSpxUve"),
  systemResearch:     new PublicKey("CXwXVUeovhbpXGWpHk56SgrnH2DwoqoTSErgtrJghK5Z"),
  systemLaunch:       new PublicKey("BVn9NZ51LqhbDowqhaJvxmXK6VGsP1k3dLtJEL8Fjmxv"),
  systemResolveColonize: new PublicKey("AuYuVgjpX64Fea3zGtUaEHjoewwyWBeT8Srsh8EXFhGL"),
  systemInitializeNewColony: new PublicKey("DapYcTdYUwB7qWhmqMGZU6V1vqS3NEagzt15fnWwfQMC"),
  systemResolveTransport: new PublicKey("DkzcueEX3ca9haAmFoHKsW7JQVFxBfeZJX1VdHSdPnYP"),
  systemShipyard:     new PublicKey("74wxuTRib19TzJyXNaeyPVcsFFFqBq8phtRSSPDsK2q2"),
  systemSession:      new PublicKey("BHRu4DADM4NsJvnvqY5znDUsrdvTrnkKyee9eYZ7Yd9G"),
} as const;

export const SHARED_WORLD_PDA = new PublicKey("5KY9KS6iKAwSDq3LbErP7LEPLdTPhqBLJ5VLG1555X8N");
export const RPC_ENDPOINT     = "https://api.devnet.solana.com";
export const ER_RPC           = "https://devnet-router.magicblock.app";

export const REGISTRY_PROGRAM_ID = new PublicKey("BV6JwMdA9gLfG5ut2VBzbmQoJTXUu5umXErBqv4V3PJq");

// ─── Data types ───────────────────────────────────────────────────────────────
export interface Mission {
  missionType:     number;
  destination:     string;
  targetGalaxy:    number;
  targetSystem:    number;
  targetPosition:  number;
  colonyName:      string;
  departTs:        number;
  arriveTs:        number;
  returnTs:        number;
  sSmallCargo:     number;
  sLargeCargo:     number;
  sLightFighter:   number;
  sHeavyFighter:   number;
  sCruiser:        number;
  sBattleship:     number;
  sBattlecruiser:  number;
  sBomber:         number;
  sDestroyer:      number;
  sDeathstar:      number;
  sRecycler:       number;
  sEspionageProbe: number;
  sColonyShip:     number;
  cargoMetal:      bigint;
  cargoCrystal:    bigint;
  cargoDeuterium:  bigint;
  applied:         boolean;
}

export interface Planet {
  creator:              string;
  entity:               string;
  owner:                string;
  name:                 string;
  galaxy:               number;
  system:               number;
  position:             number;
  planetIndex:          number;
  diameter:             number;
  temperature:          number;
  maxFields:            number;
  usedFields:           number;
  metalMine:            number;
  crystalMine:          number;
  deuteriumSynthesizer: number;
  solarPlant:           number;
  fusionReactor:        number;
  roboticsFactory:      number;
  naniteFactory:        number;
  shipyard:             number;
  metalStorage:         number;
  crystalStorage:       number;
  deuteriumTank:        number;
  researchLab:          number;
  missileSilo:          number;
  buildQueueItem:       number;
  buildQueueTarget:     number;
  buildFinishTs:        number;
}

export interface Research {
  creator:          string;
  energyTech:       number;
  combustionDrive:  number;
  impulseDrive:     number;
  hyperspaceDrive:  number;
  computerTech:     number;
  astrophysics:     number;
  igrNetwork:       number;
  queueItem:        number;
  queueTarget:      number;
  researchFinishTs: number;
}

export interface Resources {
  metal:             bigint;
  crystal:           bigint;
  deuterium:         bigint;
  metalHour:         bigint;
  crystalHour:       bigint;
  deuteriumHour:     bigint;
  energyProduction:  bigint;
  energyConsumption: bigint;
  metalCap:          bigint;
  crystalCap:        bigint;
  deuteriumCap:      bigint;
  lastUpdateTs:      number;
}

export interface Fleet {
  creator:         string;
  smallCargo:      number;
  largeCargo:      number;
  lightFighter:    number;
  heavyFighter:    number;
  cruiser:         number;
  battleship:      number;
  battlecruiser:   number;
  bomber:          number;
  destroyer:       number;
  deathstar:       number;
  recycler:        number;
  espionageProbe:  number;
  colonyShip:      number;
  solarSatellite:  number;
  activeMissions:  number;
  missions:        Mission[];
}

export interface PlayerState {
  planet:       Planet;
  resources:    Resources;
  fleet:        Fleet;
  research:     Research;
  entityPda:    string;
  planetPda:    string;
  fleetPda:     string;
  resourcesPda: string;
  researchPda:  string;
  isDelegated:  boolean;
}

export interface LaunchFleetTarget {
  galaxy: number;
  system: number;
  position: number;
  colonyName?: string;
}

export type ProgressReporter = (message: string) => void;

const TRANSPORT_MISSION = 2;
const COLONIZE_MISSION = 5;
const BASE_LAUNCH_ARGS_LEN = 94;
const TARGET_COORDS_LEN = 5;
const TRANSPORT_TARGET_ARGS_LEN = 5;
const COLONIZE_TARGET_ARGS_LEN = 37;
const RESOLVE_TRANSPORT_ARGS_LEN = 9;
const RESOLVE_COLONIZE_ARGS_LEN = 9;
const INIT_NEW_COLONY_ARGS_LEN = 105;

interface WalletMetaAccount {
  wallet: PublicKey;
  planetCount: number;
}

interface PlanetRegistryAccount {
  wallet: PublicKey;
  planetIndex: number;
  entityPda: PublicKey;
  planetPda: PublicKey;
  createdAt: number;
}

interface CoordinateRegistryAccount {
  galaxy: number;
  system: number;
  position: number;
  ownerWallet: PublicKey;
  entityPda: PublicKey;
  planetPda: PublicKey;
}

interface ColonizeMissionCargo {
  metal: bigint;
  crystal: bigint;
  deuterium: bigint;
}

function emptyResearch(creator: string): Research {
  return {
    creator,
    energyTech: 0,
    combustionDrive: 0,
    impulseDrive: 0,
    hyperspaceDrive: 0,
    computerTech: 0,
    astrophysics: 0,
    igrNetwork: 0,
    queueItem: 255,
    queueTarget: 0,
    researchFinishTs: 0,
  };
}

// ─── BOLT account layout ──────────────────────────────────────────────────────
const DISC = 8;

// ─── PDA derivation ───────────────────────────────────────────────────────────
export function deriveComponentPda(entityPda: PublicKey, componentProgramId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([entityPda.toBuffer()], componentProgramId)[0];
}

export function deriveRegistryPda(walletPubkey: PublicKey): PublicKey {
  return deriveRegistryPdaByIndex(walletPubkey, 0);
}

export function deriveRegistryPdaByIndex(walletPubkey: PublicKey, index: number): PublicKey {
  const indexSeed = Buffer.alloc(4);
  indexSeed.writeUInt32LE(index, 0);
  return PublicKey.findProgramAddressSync([Buffer.from("registry"), walletPubkey.toBuffer(), indexSeed], REGISTRY_PROGRAM_ID)[0];
}

export function deriveWalletMetaPda(walletPubkey: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("wallet_meta"), walletPubkey.toBuffer()], REGISTRY_PROGRAM_ID)[0];
}

export function deriveCoordRegistryPda(galaxy: number, system: number, position: number): PublicKey {
  const galaxySeed = Buffer.alloc(2);
  galaxySeed.writeUInt16LE(galaxy, 0);
  const systemSeed = Buffer.alloc(2);
  systemSeed.writeUInt16LE(system, 0);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("coord"), galaxySeed, systemSeed, Buffer.from([position & 0xff])],
    REGISTRY_PROGRAM_ID
  )[0];
}

// ─── Patch ApplySystem args ───────────────────────────────────────────────────
function patchApplyArgs(ix: TransactionInstruction, rawArgs: Buffer): TransactionInstruction {
  const disc   = ix.data.slice(0, 8);
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32LE(rawArgs.length, 0);
  return new TransactionInstruction({
    keys:      ix.keys,
    programId: ix.programId,
    data:      Buffer.concat([disc, lenBuf, rawArgs]),
  });
}

function describeAccountInfo(label: string, account: Awaited<ReturnType<Connection["getAccountInfo"]>>): string {
  if (!account) {
    return `${label}: missing`;
  }
  return `${label}: owner=${account.owner.toBase58()} executable=${account.executable} lamports=${account.lamports} dataLen=${account.data.length}`;
}

const IX_DISCRIMINATORS: Record<string, number[]> = {
  init_wallet_meta: [85, 51, 246, 106, 67, 236, 28, 180],
  register_planet: [213, 91, 78, 118, 207, 133, 98, 238],
};

function ixDiscriminator(name: string): Buffer {
  const bytes = IX_DISCRIMINATORS[name];
  if (!bytes) throw new Error(`Missing instruction discriminator for ${name}`);
  return Buffer.from(bytes);
}

// ─── Game client ──────────────────────────────────────────────────────────────
export class GameClient {
  private connection:   Connection;
  private erConnection: Connection;
  private provider:     AnchorProvider;
  private sessionActive = false;
  private erSigner:          Keypair | null = null;
  private erDirectConnection: Connection;

  constructor(connection: Connection, provider: AnchorProvider) {
    this.connection         = connection;
    this.erConnection       = new Connection(ER_RPC,        "confirmed");
    this.erDirectConnection = new Connection(ER_DIRECT_RPC, "confirmed");
    this.provider           = provider;

    setProvider(provider);
    const boltProvider = new (BoltAnchor as any).AnchorProvider(
      connection, provider.wallet, { commitment: "confirmed" }
    );
    (BoltAnchor as any).setProvider(boltProvider);
  }

  private chunkInstructionGroups(
    instructionGroups: TransactionInstruction[][],
    feePayer: PublicKey,
    prefixIxs: TransactionInstruction[] = [],
  ): TransactionInstruction[][] {
    const batches: TransactionInstruction[][] = [];
    let currentBatch: TransactionInstruction[] = [];

    const fitsInTransaction = (candidateBatch: TransactionInstruction[]): boolean => {
      try {
        const tx = new Transaction();
        tx.feePayer = feePayer;
        tx.recentBlockhash = "11111111111111111111111111111111";
        [...prefixIxs, ...candidateBatch].forEach((ix) => tx.add(ix));
        tx.serialize({ requireAllSignatures: false, verifySignatures: false });
        return true;
      } catch {
        return false;
      }
    };

    for (const group of instructionGroups) {
      const nextBatch = [...currentBatch, ...group];
      if (fitsInTransaction(nextBatch)) {
        currentBatch = nextBatch;
        continue;
      }

      if (currentBatch.length === 0) {
        throw new Error("A single planet's delegation instructions do not fit in one transaction.");
      }

      batches.push(currentBatch);
      currentBatch = [...group];

      if (!fitsInTransaction(currentBatch)) {
        throw new Error("A single planet's delegation instructions do not fit in one transaction.");
      }
    }

    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  private async getSessionTargets(primaryEntityPda?: PublicKey): Promise<Array<{
    entityPda: PublicKey;
    planetPda: PublicKey;
    resourcesPda: PublicKey;
    fleetPda: PublicKey;
    researchPda: PublicKey;
  }>> {
    const wallet = this.provider.wallet.publicKey;
    const states = await this.findPlanets(wallet);

    if (states.length > 0) {
      return states.map((state) => ({
        entityPda: new PublicKey(state.entityPda),
        planetPda: new PublicKey(state.planetPda),
        resourcesPda: new PublicKey(state.resourcesPda),
        fleetPda: new PublicKey(state.fleetPda),
        researchPda: new PublicKey(state.researchPda),
      }));
    }

    if (!primaryEntityPda) {
      return [];
    }

    return [{
      entityPda: primaryEntityPda,
      planetPda: deriveComponentPda(primaryEntityPda, PROGRAM_IDS.componentPlanet),
      resourcesPda: deriveComponentPda(primaryEntityPda, PROGRAM_IDS.componentResources),
      fleetPda: deriveComponentPda(primaryEntityPda, PROGRAM_IDS.componentFleet),
      researchPda: deriveComponentPda(primaryEntityPda, PROGRAM_IDS.componentResearch),
    }];
  }

  private async hydratePlayerState(
    planetPda: PublicKey,
    planetData: Buffer,
    readFromER: boolean,
    isDelegatedOverride?: boolean,
  ): Promise<PlayerState | null> {
    const planet = deserializePlanet(planetData);
    const entityPda = new PublicKey(planet.entity);
    console.log("[LOOKUP] entityPda:", entityPda.toBase58());

    const fleetPda     = deriveComponentPda(entityPda, PROGRAM_IDS.componentFleet);
    const resourcesPda = deriveComponentPda(entityPda, PROGRAM_IDS.componentResources);
    const researchPda  = deriveComponentPda(entityPda, PROGRAM_IDS.componentResearch);

    const [planetOwnerInfo] = await this.connection.getMultipleAccountsInfo([planetPda]);
    const isDelegated = isDelegatedOverride ?? (planetOwnerInfo?.owner.equals(DELEGATION_PROGRAM_ID) ?? false);
    console.log("[LOOKUP] isDelegated:", isDelegated);

    const dataConn = readFromER ? this.erConnection : this.connection;
    const [fleetAccount, resourcesAccount, researchAccount] = await dataConn.getMultipleAccountsInfo([
      fleetPda, resourcesPda, researchPda,
    ]);

    if (!fleetAccount || !resourcesAccount) {
      console.error("[LOOKUP] Missing fleet or resources accounts");
      return null;
    }

    const fleet     = deserializeFleet(Buffer.from(fleetAccount.data));
    const resources = deserializeResources(Buffer.from(resourcesAccount.data));
    const research  = researchAccount
      ? deserializeResearch(Buffer.from(researchAccount.data))
      : emptyResearch(planet.creator);

    return {
      planet, resources, fleet, research, isDelegated,
      entityPda: entityPda.toBase58(),
      planetPda: planetPda.toBase58(),
      fleetPda: fleetPda.toBase58(),
      resourcesPda: resourcesPda.toBase58(),
      researchPda: researchPda.toBase58(),
    };
  }

  async findPlanets(walletPubkey: PublicKey): Promise<PlayerState[]> {
    console.log("[LOOKUP] Loading all planets for wallet:", walletPubkey.toBase58());

    const planetCount = await this.fetchPlanetCount(walletPubkey);
    const states: PlayerState[] = [];
    const seenPlanetPdas = new Set<string>();

    for (let index = 0; index < planetCount; index++) {
      try {
        const registry = await this.fetchRegistry(walletPubkey, index);
        if (!registry) continue;

        const planetKey = registry.planetPda.toBase58();
        if (seenPlanetPdas.has(planetKey)) continue;

        const planetOwnerInfo = await this.connection.getAccountInfo(registry.planetPda, "confirmed");
        if (!planetOwnerInfo) continue;

        const isDelegated = planetOwnerInfo.owner.equals(DELEGATION_PROGRAM_ID);
        const readFromER = isDelegated;
        const lookupConn = readFromER ? this.erConnection : this.connection;
        const planetAcc = await lookupConn.getAccountInfo(registry.planetPda, "confirmed");
        if (!planetAcc) continue;

        const state = await this.hydratePlayerState(
          registry.planetPda,
          Buffer.from(planetAcc.data),
          readFromER,
          isDelegated,
        );
        if (!state) continue;

        states.push(state);
        seenPlanetPdas.add(planetKey);
      } catch (e) {
        console.error(`[LOOKUP] Failed loading planet at registry index ${index}:`, e);
      }
    }

    return states.sort((a, b) => a.planet.planetIndex - b.planet.planetIndex);
  }

async findPlanet(walletPubkey: PublicKey): Promise<PlayerState | null> {
  console.log("[LOOKUP] ── findPlanet ──────────────────────────────");
  console.log("[LOOKUP] wallet:", walletPubkey.toBase58());
  console.log("[LOOKUP] sessionActive:", this.sessionActive);
  console.log("[LOOKUP] erSigner:", this.erSigner?.publicKey.toBase58() ?? "none");

  const registeredPlanets = await this.findPlanets(walletPubkey);
  if (registeredPlanets.length > 0) {
    console.log("[LOOKUP] Returning first registered planet");
    return registeredPlanets[0];
  }

  const useER = false;
  let planetPda: PublicKey | null = null;
  let planetData: Buffer | null = null;

  console.log("[LOOKUP] Strategy A: getProgramAccounts on devnet");
  const planetAccounts = await this.connection.getProgramAccounts(
    PROGRAM_IDS.componentPlanet,
    {
      commitment: "confirmed",
      filters: [{ memcmp: { offset: DISC, bytes: walletPubkey.toBase58() } }],
    }
  );

  console.log("[LOOKUP] Strategy A result:", planetAccounts.length, "account(s)");

  if (planetAccounts.length > 0) {
    planetPda = planetAccounts[0].pubkey;
    planetData = Buffer.from(planetAccounts[0].account.data);
    console.log("[LOOKUP] Strategy A: planet PDA =", planetPda.toBase58(), "size:", planetData.length);
  }

  // Strategy B: Registry lookup (works on both devnet and ER)
  if (!planetPda) {
    console.log("[LOOKUP] Strategy B: on-chain registry lookup...");
    const registry = await this.fetchRegistry(walletPubkey);
    if (registry) {
      const lookupConn = this.connection;
      console.log("[LOOKUP] Strategy B: registry found — fetching planet from", useER ? "ER" : "devnet");

      const account = await lookupConn.getAccountInfo(registry.planetPda, "confirmed");
      if (account) {
        planetData = Buffer.from(account.data);
        planetPda = registry.planetPda;
        console.log("[LOOKUP] Strategy B: planet size:", planetData.length);
      } else {
        console.warn("[LOOKUP] Strategy B: planet account not found on", useER ? "ER" : "devnet");
      }
    } else {
      console.log("[LOOKUP] Strategy B: no registry entry");
    }
  }

  if (!planetPda || !planetData) {
    console.log("[LOOKUP] No planet found for this wallet");
    return null;
  }

  const planet = deserializePlanet(planetData);
  const entityPda = new PublicKey(planet.entity);
  console.log("[LOOKUP] entityPda:", entityPda.toBase58());

  const fleetPda     = deriveComponentPda(entityPda, PROGRAM_IDS.componentFleet);
  const resourcesPda = deriveComponentPda(entityPda, PROGRAM_IDS.componentResources);
  const researchPda  = deriveComponentPda(entityPda, PROGRAM_IDS.componentResearch);

  const [planetOwnerInfo] = await this.connection.getMultipleAccountsInfo([planetPda]);
  const isDelegated = planetOwnerInfo?.owner.equals(DELEGATION_PROGRAM_ID) ?? false;
  console.log("[LOOKUP] isDelegated:", isDelegated);

  const readFromER = isDelegated;
  if (readFromER) {
    const delegatedPlanetAcc = await this.erConnection.getAccountInfo(planetPda, "confirmed");
    if (delegatedPlanetAcc) {
      planetData = Buffer.from(delegatedPlanetAcc.data);
    } else {
      console.warn("[LOOKUP] Delegated planet missing on ER, falling back to devnet data");
    }
  }

  const state = await this.hydratePlayerState(planetPda, planetData, readFromER, isDelegated);
  if (!state) {
    console.error("[LOOKUP] Missing fleet or resources accounts");
    return null;
  }

  console.log("[LOOKUP] ✓ Planet fully loaded — isDelegated:", isDelegated, "size:", planetData.length);
  return state;
}

  async getSystemPlanets(galaxy: number, system: number): Promise<Planet[]> {
    console.log(`[GALAXY] Loading system ${galaxy}:${system}`);

    const registryPlanets: Planet[] = [];
    const seenPlanetPdas = new Set<string>();

    for (let position = 1; position <= 15; position++) {
      try {
        const coord = await this.fetchCoordinateRegistry(galaxy, system, position);
        if (!coord) continue;

        const planetAcc = await this.connection.getAccountInfo(coord.planetPda, "confirmed");
        if (!planetAcc) {
          console.warn(`[GALAXY] Registry points to missing planet at ${galaxy}:${system}:${position}`);
          continue;
        }

        const planet = deserializePlanet(Buffer.from(planetAcc.data));
        registryPlanets.push(planet);
        seenPlanetPdas.add(coord.planetPda.toBase58());
      } catch (e) {
        console.warn(`[GALAXY] Failed to load registry planet at ${galaxy}:${system}:${position}`, e);
      }
    }

    if (registryPlanets.length > 0) {
      console.log(`[GALAXY] Found ${registryPlanets.length} planets via coordinate registry in system ${galaxy}:${system}`);
      return registryPlanets.sort((a, b) => a.position - b.position);
    }

    const planets: Planet[] = [];
    const allPlanetAccounts = await this.connection.getProgramAccounts(
      PROGRAM_IDS.componentPlanet,
      {
        commitment: "confirmed",
        filters: [],
      }
    );

    for (const account of allPlanetAccounts) {
      try {
        if (seenPlanetPdas.has(account.pubkey.toBase58())) continue;
        const planet = deserializePlanet(Buffer.from(account.account.data));
        if (planet.galaxy === galaxy && planet.system === system) {
          planets.push(planet);
        }
      } catch (e) {
        // skip corrupted accounts
      }
    }

    console.log(`[GALAXY] Registry empty for ${galaxy}:${system}; fallback found ${planets.length} planets in component scan`);
    return planets.sort((a, b) => a.position - b.position);
  }

  async findPlayerByWallet(walletPubkey: PublicKey): Promise<{
    entityPda: string; fleetPda: string; resourcesPda: string; researchPda: string;
  } | null> {
    try {
      const registry = await this.fetchRegistry(walletPubkey);
      if (!registry) return null;
      const planetAcc = await this.connection.getAccountInfo(registry.planetPda, "confirmed");
      if (!planetAcc) return null;
      const planet    = deserializePlanet(Buffer.from(planetAcc.data));
      const entityPda = new PublicKey(planet.entity);
      const fleetPda     = deriveComponentPda(entityPda, PROGRAM_IDS.componentFleet);
      const resourcesPda = deriveComponentPda(entityPda, PROGRAM_IDS.componentResources);
      const researchPda  = deriveComponentPda(entityPda, PROGRAM_IDS.componentResearch);
      return {
        entityPda:    entityPda.toBase58(),
        fleetPda:     fleetPda.toBase58(),
        resourcesPda: resourcesPda.toBase58(),
        researchPda:  researchPda.toBase58(),
      };
    } catch (e) {
      console.error("[findPlayerByWallet] failed:", e);
      return null;
    }
  }

// ── Initialize a new planet ───────────────────────────────────────────────
async initializePlanet(planetName = "Homeworld", reportProgress?: ProgressReporter): Promise<PlayerState> {
  const payer = this.provider.wallet.publicKey;
  console.log(`[INIT] Starting planet creation for: ${payer.toBase58()}`);

  // 1. Create entity + initialize ALL components in ONE big transaction
  reportProgress?.("Creating the Homeworld entity");
  const addEntityResult = await AddEntity({
    payer,
    world: SHARED_WORLD_PDA,
    connection: this.connection,
  });

  const bigInitTx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_200_000 }), // high limit for all inits
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
    ...addEntityResult.transaction.instructions,
  );

  // Add InitializeComponent instructions for all 4 components
  const components = [
    PROGRAM_IDS.componentPlanet,
    PROGRAM_IDS.componentResources,
    PROGRAM_IDS.componentFleet,
    PROGRAM_IDS.componentResearch,
  ];

  reportProgress?.("Creating Planet, fleets, resources, investigations");
  for (const compId of components) {
    const init = await InitializeComponent({
      payer,
      entity: addEntityResult.entityPda,
      componentId: compId,
    });
    bigInitTx.add(init.transaction.instructions[0]);
  }

  const initSig = await this.provider.sendAndConfirm(bigInitTx, [], { commitment: "confirmed" });
  console.log("[1+2] Entity + All components initialized in one tx:", initSig);

  const entityPda = addEntityResult.entityPda;
  console.log("[1] Entity PDA:", entityPda.toBase58());

  // 3. Prepare args and call system_initialize (still needs its own tx because of custom args)
  const now = Math.floor(Date.now() / 1000);
  const args = Buffer.alloc(65, 0);
  args.writeBigInt64LE(BigInt(now), 0);
  const nameBytes = Buffer.from(planetName.slice(0, 19), "utf8");
  nameBytes.copy(args, 13);
  entityPda.toBuffer().copy(args, 32);
  args.writeUInt8(0, 64);

  const { transaction: applyTx } = await ApplySystem({
    authority: payer,
    systemId: PROGRAM_IDS.systemInitialize,
    world: SHARED_WORLD_PDA,
    entities: [{
      entity: entityPda,
      components: [
        { componentId: PROGRAM_IDS.componentPlanet },
        { componentId: PROGRAM_IDS.componentResources },
        { componentId: PROGRAM_IDS.componentFleet },
      ]
    }],
    args: [],
  });

  const patchedIx = patchApplyArgs(applyTx.instructions[0], args);

  reportProgress?.("Initializing components");
  const systemTx = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
    patchedIx
  );

  const systemSig = await this.provider.sendAndConfirm(systemTx, [], { commitment: "confirmed" });
  console.log("[3] system_initialize success:", systemSig);

  // 4. Load initialized planet coordinates from chain, then register them.
  const planetPda = deriveComponentPda(entityPda, PROGRAM_IDS.componentPlanet);
  const initializedPlanetAcc = await this.connection.getAccountInfo(planetPda, "confirmed");
  if (!initializedPlanetAcc) {
    throw new Error("Planet was initialized but the planet component could not be fetched for registration.");
  }

  const initializedPlanet = deserializePlanet(Buffer.from(initializedPlanetAcc.data));
  console.log(
    `[REG] Registering planet PDA ${planetPda.toBase58()} at ${initializedPlanet.galaxy}:${initializedPlanet.system}:${initializedPlanet.position}`
  );

  if (
    initializedPlanet.galaxy < 1 || initializedPlanet.galaxy > 9 ||
    initializedPlanet.system < 1 || initializedPlanet.system > 499 ||
    initializedPlanet.position < 1 || initializedPlanet.position > 15
  ) {
    throw new Error(
      `Initialized planet returned invalid coordinates for registry: ${initializedPlanet.galaxy}:${initializedPlanet.system}:${initializedPlanet.position}`
    );
  }

  reportProgress?.("Registering planet");
  await this.registerPlanet(
    entityPda,
    planetPda,
    initializedPlanet.galaxy,
    initializedPlanet.system,
    initializedPlanet.position,
  );

  // 5. Load final state
  const state = await this.findPlanet(payer);
  if (!state) {
    throw new Error("Planet created but could not be loaded.");
  }

  console.log(`[INIT] SUCCESS! Planet PDA: ${state.planetPda}`);
  return state;
}
  // ── System actions ─────────────────────────────────────────────────────────

  async startBuild(entityPda: PublicKey, buildingIdx: number): Promise<string> {
    const args = Buffer.alloc(10);
    args.writeUInt8(0, 0);
    args.writeUInt8(buildingIdx, 1);
    args.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000)), 2);
    return this.applySystem("start_build", entityPda, PROGRAM_IDS.systemBuild, [
      { componentId: PROGRAM_IDS.componentPlanet },
      { componentId: PROGRAM_IDS.componentResources },
    ], args);
  }

  async finishBuild(entityPda: PublicKey): Promise<string> {
    const args = Buffer.alloc(10);
    args.writeUInt8(1, 0);
    args.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000)), 2);
    return this.applySystem("finish_build", entityPda, PROGRAM_IDS.systemBuild, [
      { componentId: PROGRAM_IDS.componentPlanet },
      { componentId: PROGRAM_IDS.componentResources },
    ], args);
  }

  async startResearch(entityPda: PublicKey, techIdx: number): Promise<string> {
    const args = Buffer.alloc(10);
    args.writeUInt8(0, 0);
    args.writeUInt8(techIdx, 1);
    args.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000)), 2);
    return this.applySystem("start_research", entityPda, PROGRAM_IDS.systemResearch, [
      { componentId: PROGRAM_IDS.componentPlanet },
      { componentId: PROGRAM_IDS.componentResources },
      { componentId: PROGRAM_IDS.componentResearch },
    ], args);
  }

  async finishResearch(entityPda: PublicKey): Promise<string> {
    const args = Buffer.alloc(10);
    args.writeUInt8(1, 0);
    args.writeUInt8(0, 1);
    args.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000)), 2);
    return this.applySystem("finish_research", entityPda, PROGRAM_IDS.systemResearch, [
      { componentId: PROGRAM_IDS.componentPlanet },
      { componentId: PROGRAM_IDS.componentResources },
      { componentId: PROGRAM_IDS.componentResearch },
    ], args);
  }

  async buildShip(entityPda: PublicKey, shipType: number, quantity: number): Promise<string> {
  console.log("=== BUILD SHIP DEBUG ===");
  console.log("shipType:", shipType);
  console.log("Current PROGRAM_IDS.componentResearch:", PROGRAM_IDS.componentResearch.toBase58());
  console.log("Current PROGRAM_IDS.componentFleet:", PROGRAM_IDS.componentFleet.toBase58());

  const researchPda = deriveComponentPda(entityPda, PROGRAM_IDS.componentResearch);
  const fleetPda    = deriveComponentPda(entityPda, PROGRAM_IDS.componentFleet);

  console.log("Derived Research PDA:", researchPda.toBase58());
  console.log("Derived Fleet PDA:", fleetPda.toBase58());

  // Check actual on-chain owners
  const [researchAcc, fleetAcc] = await this.connection.getMultipleAccountsInfo([researchPda, fleetPda]);
  console.log("On-chain Research owner:", researchAcc?.owner.toBase58() || "MISSING");
  console.log("On-chain Fleet owner:", fleetAcc?.owner.toBase58() || "MISSING");

  // Now call the system
  const args = Buffer.alloc(13);
  args.writeUInt8(shipType, 0);
  args.writeUInt32LE(quantity, 1);
  args.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000)), 5);

  return this.applySystem("build_ship", entityPda, PROGRAM_IDS.systemShipyard, [
    { componentId: PROGRAM_IDS.componentFleet },
    { componentId: PROGRAM_IDS.componentResources },
    { componentId: PROGRAM_IDS.componentResearch },
  ], args);
}

  async launchFleet(
    entityPda: PublicKey,
    ships: { lf?:number; hf?:number; cr?:number; bs?:number; bc?:number;
             bm?:number; ds?:number; de?:number; sc?:number; lc?:number;
             rec?:number; ep?:number; col?:number },
    cargo: { metal?:bigint; crystal?:bigint; deuterium?:bigint },
    missionType: number,
    flightSeconds: number,
    speedFactor = 100,
    target?: LaunchFleetTarget,
  ): Promise<string> {
    if (missionType !== TRANSPORT_MISSION && missionType !== COLONIZE_MISSION) {
      throw new Error("Only Transport (2) and Colonize (5) missions are supported.");
    }

    if (!target) {
      throw new Error("Launch target is required.");
    }

    let argsLength = BASE_LAUNCH_ARGS_LEN;
    if (missionType === TRANSPORT_MISSION) {
      argsLength += TRANSPORT_TARGET_ARGS_LEN;
    } else {
      argsLength += COLONIZE_TARGET_ARGS_LEN;
    }

    const args = Buffer.alloc(argsLength, 0);
    args.writeUInt8(missionType, 0);
    args.writeUInt32LE(ships.lf  ?? 0,  1);  args.writeUInt32LE(ships.hf  ?? 0,  5);
    args.writeUInt32LE(ships.cr  ?? 0,  9);  args.writeUInt32LE(ships.bs  ?? 0, 13);
    args.writeUInt32LE(ships.bc  ?? 0, 17);  args.writeUInt32LE(ships.bm  ?? 0, 21);
    args.writeUInt32LE(ships.ds  ?? 0, 25);  args.writeUInt32LE(ships.de  ?? 0, 29);
    args.writeUInt32LE(ships.sc  ?? 0, 33);  args.writeUInt32LE(ships.lc  ?? 0, 37);
    args.writeUInt32LE(ships.rec ?? 0, 41);  args.writeUInt32LE(ships.ep  ?? 0, 45);
    args.writeUInt32LE(ships.col ?? 0, 49);
    args.writeBigUInt64LE(cargo.metal     ?? 0n, 53);
    args.writeBigUInt64LE(cargo.crystal   ?? 0n, 61);
    args.writeBigUInt64LE(cargo.deuterium ?? 0n, 69);
    args.writeUInt8(speedFactor, 77);
    args.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000)), 78);
    args.writeBigInt64LE(BigInt(flightSeconds), 86);

    args.writeUInt16LE(target.galaxy, BASE_LAUNCH_ARGS_LEN);
    args.writeUInt16LE(target.system, BASE_LAUNCH_ARGS_LEN + 2);
    args.writeUInt8(target.position, BASE_LAUNCH_ARGS_LEN + 4);

    if (missionType === COLONIZE_MISSION) {
      Buffer.from((target.colonyName ?? "Colony").slice(0, 32), "utf8").copy(
        args,
        BASE_LAUNCH_ARGS_LEN + TARGET_COORDS_LEN,
      );
    }

    return this.applySystem("launch_fleet", entityPda, PROGRAM_IDS.systemLaunch, [
      { componentId: PROGRAM_IDS.componentFleet },
      { componentId: PROGRAM_IDS.componentResources },
    ], args);
  }

  async resolveTransport(
    sourceEntityPda: PublicKey,
    mission: Mission,
    slot: number,
    now = Math.floor(Date.now() / 1000),
  ): Promise<string> {
    const destinationEntityPda = await this.resolveTransportDestinationEntity(
      mission.targetGalaxy,
      mission.targetSystem,
      mission.targetPosition,
    );
    await this.logResolveTransportDebug(
      sourceEntityPda,
      destinationEntityPda,
      mission.targetGalaxy,
      mission.targetSystem,
      mission.targetPosition,
      slot,
    );
    const args = Buffer.alloc(RESOLVE_TRANSPORT_ARGS_LEN, 0);
    args.writeUInt8(slot, 0);
    args.writeBigInt64LE(BigInt(now), 1);

    return this.applySystemForEntities(
      "resolve_transport",
      [
        {
          entity: sourceEntityPda,
          components: [{ componentId: PROGRAM_IDS.componentFleet }],
        },
        {
          entity: destinationEntityPda,
          components: [
            { componentId: PROGRAM_IDS.componentPlanet },
            { componentId: PROGRAM_IDS.componentResources },
          ],
        },
      ],
      PROGRAM_IDS.systemResolveTransport,
      args,
    );
  }

  private async resolveTransportDestinationEntity(
    galaxy: number,
    system: number,
    position: number,
  ): Promise<PublicKey> {
    const systemPlanets = await this.getSystemPlanets(galaxy, system);
    const destinationPlanet = systemPlanets.find((planet) => planet.position === position);
    if (!destinationPlanet) {
      throw new Error(`No destination planet found at ${galaxy}:${system}:${position}.`);
    }
    return new PublicKey(destinationPlanet.entity);
  }

  private async loadFleetForEntity(entityPda: PublicKey): Promise<Fleet> {
    const fleetPda = deriveComponentPda(entityPda, PROGRAM_IDS.componentFleet);
    const connections = this.sessionActive
      ? [this.erConnection, this.connection]
      : [this.connection, this.erConnection];

    for (const connection of connections) {
      const account = await connection.getAccountInfo(fleetPda, "confirmed");
      if (account) {
        return deserializeFleet(Buffer.from(account.data));
      }
    }

    throw new Error(`Fleet account not found for entity ${entityPda.toBase58()}`);
  }

  private async getColonizeMissionCargo(sourceEntityPda: PublicKey, slot: number): Promise<ColonizeMissionCargo> {
    const fleet = await this.loadFleetForEntity(sourceEntityPda);
    const mission = fleet.missions[slot];
    if (!mission) {
      throw new Error(`Mission slot ${slot} not found.`);
    }
    if (mission.missionType !== COLONIZE_MISSION) {
      throw new Error(`Mission slot ${slot} is not a colonize mission.`);
    }
    return {
      metal: mission.cargoMetal,
      crystal: mission.cargoCrystal,
      deuterium: mission.cargoDeuterium,
    };
  }

  async resolveColonize(
    sourceEntityPda: PublicKey,
    mission: Mission,
    slot: number,
    now = Math.floor(Date.now() / 1000),
  ): Promise<{ entityPda: PublicKey; planetPda: PublicKey; registerSig: string; resolveSig: string; initializeSig: string }> {
    const wallet = this.provider.wallet.publicKey;
    const planetCount = await this.fetchPlanetCount(wallet);
    const missionCargo = await this.getColonizeMissionCargo(sourceEntityPda, slot);

    const resolveArgs = Buffer.alloc(RESOLVE_COLONIZE_ARGS_LEN, 0);
    resolveArgs.writeUInt8(slot, 0);
    resolveArgs.writeBigInt64LE(BigInt(now), 1);

    const addEntityResult = await AddEntity({
      payer: wallet,
      world: SHARED_WORLD_PDA,
      connection: this.connection,
    });
    const colonyEntityPda = addEntityResult.entityPda;

    const initTx = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 1_200_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
      ...addEntityResult.transaction.instructions,
    );

    const colonyComponentIds = [
      PROGRAM_IDS.componentPlanet,
      PROGRAM_IDS.componentResources,
      PROGRAM_IDS.componentFleet,
      PROGRAM_IDS.componentResearch,
    ];
    const colonyInitializeComponents = [
      { componentId: PROGRAM_IDS.componentPlanet },
      { componentId: PROGRAM_IDS.componentResources },
    ];

    for (const componentId of colonyComponentIds) {
      const init = await InitializeComponent({
        payer: wallet,
        entity: colonyEntityPda,
        componentId,
      });
      initTx.add(init.transaction.instructions[0]);
    }

    await this.provider.sendAndConfirm(initTx, [], { commitment: "confirmed" });

    if (this.sessionActive) {
      await this.delegateEntityComponents(colonyEntityPda, colonyComponentIds);
    }

    const initializeArgs = Buffer.alloc(INIT_NEW_COLONY_ARGS_LEN, 0);
    initializeArgs.writeBigInt64LE(BigInt(now), 0);
    initializeArgs.writeUInt16LE(mission.targetGalaxy, 8);
    initializeArgs.writeUInt16LE(mission.targetSystem, 10);
    initializeArgs.writeUInt8(mission.targetPosition, 12);
    Buffer.from((mission.colonyName || "Colony").slice(0, 32), "utf8").copy(initializeArgs, 13);
    colonyEntityPda.toBuffer().copy(initializeArgs, 45);
    initializeArgs.writeUInt32LE(planetCount, 77);
    initializeArgs.writeBigUInt64LE(missionCargo.metal, 81);
    initializeArgs.writeBigUInt64LE(missionCargo.crystal, 89);
    initializeArgs.writeBigUInt64LE(missionCargo.deuterium, 97);

    const initializeSig = await this.applySystem(
      "initialize_new_colony",
      colonyEntityPda,
      PROGRAM_IDS.systemInitializeNewColony,
      colonyInitializeComponents,
      initializeArgs,
    );

    const colonyPlanetPda = deriveComponentPda(colonyEntityPda, PROGRAM_IDS.componentPlanet);
    const registerSig = await this.registerPlanet(
      colonyEntityPda,
      colonyPlanetPda,
      mission.targetGalaxy,
      mission.targetSystem,
      mission.targetPosition,
    );

    const resolveSig = await this.applySystem(
      "resolve_colonize",
      sourceEntityPda,
      PROGRAM_IDS.systemResolveColonize,
      [{ componentId: PROGRAM_IDS.componentFleet }],
      resolveArgs,
    );

    return { entityPda: colonyEntityPda, planetPda: colonyPlanetPda, registerSig, resolveSig, initializeSig };
  }

  async applyAttack(
    _attackerEntityPda: PublicKey,
    _defenderEntityPda: PublicKey,
    _missionSlot: number,
  ): Promise<string> {
    throw new Error("Attack flow has been removed; only transport and colonize are supported.");
  }

  isSessionActive(): boolean { return this.sessionActive; }

  restoreSession(): void {
    console.log("[CLIENT] Restoring session from on-chain delegation...");
    this.sessionActive = true;
    try {
      const stored = sessionStorage.getItem("_er_burner");
      if (stored) {
        const secretKey = Uint8Array.from(JSON.parse(stored));
        this.erSigner   = Keypair.fromSecretKey(secretKey);
        console.log("[CLIENT] ✓ Burner recovered from sessionStorage:", this.erSigner.publicKey.toBase58());
      } else {
        console.log("[CLIENT] No burner in sessionStorage — wallet will sign for endSession");
      }
    } catch (e) {
      console.warn("[CLIENT] Could not restore burner:", e);
    }
  }

  async startSession(entityPda: PublicKey): Promise<void> {
    const payer = this.provider.wallet.publicKey;
    const sessionTargets = await this.getSessionTargets(entityPda);

    console.log("[SESSION] ── startSession ─────────────────────────────");

    console.log(`[SESSION] Preparing delegation for ${sessionTargets.length} planet(s)`);

    if (sessionTargets.length === 0) {
      throw new Error("No planets found to start a session for.");
    }

    for (const target of sessionTargets) {
      const [pAcc, rAcc, fAcc, rsAcc] = await this.connection.getMultipleAccountsInfo([
        target.planetPda, target.resourcesPda, target.fleetPda, target.researchPda,
      ]);
      if (!pAcc || !rAcc || !fAcc || !rsAcc) throw new Error("Cannot start session: one or more component accounts missing");

      const alreadyDelegated = pAcc.owner.equals(DELEGATION_PROGRAM_ID);
      if (alreadyDelegated) {
        throw new Error("Accounts are already delegated. End the current session first before starting a new one.");
      }
    }

    const burner = Keypair.generate();
    console.log("[SESSION] Burner keypair:", burner.publicKey.toBase58());

    const fundTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey:   burner.publicKey,
        lamports:   10_000_000,
      })
    );
    const fundSig = await this.provider.sendAndConfirm(fundTx, []);
    console.log("[SESSION] Burner funded:", fundSig);

    const buildDelegateIx = (planetEntityPda: PublicKey, componentProgramId: PublicKey, componentPda: PublicKey) =>
      createDelegateInstruction({
        entity:       planetEntityPda,
        account:      componentPda,
        ownerProgram: componentProgramId,
        payer,
      });

    const delegateGroups = sessionTargets.map((target) => ([
      buildDelegateIx(target.entityPda, PROGRAM_IDS.componentPlanet, target.planetPda),
      buildDelegateIx(target.entityPda, PROGRAM_IDS.componentResources, target.resourcesPda),
      buildDelegateIx(target.entityPda, PROGRAM_IDS.componentFleet, target.fleetPda),
      buildDelegateIx(target.entityPda, PROGRAM_IDS.componentResearch, target.researchPda),
    ]));

    const delegateBatches = this.chunkInstructionGroups(
      delegateGroups,
      payer,
      [
        ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
      ],
    );
    console.log(`[SESSION] Delegation requires ${delegateBatches.length} transaction(s) after burner funding`);

    for (let batchIndex = 0; batchIndex < delegateBatches.length; batchIndex++) {
      const delegateTx = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
        ...delegateBatches[batchIndex],
      );
      const delegateSig = await this.provider.sendAndConfirm(delegateTx, []);
      console.log(`[SESSION] Delegate batch ${batchIndex + 1}/${delegateBatches.length} confirmed:`, delegateSig);
    }

    await new Promise(r => setTimeout(r, 2000));

    this.erSigner      = burner;
    this.sessionActive = true;
    try {
      sessionStorage.setItem("_er_burner", JSON.stringify(Array.from(burner.secretKey)));
    } catch (e) {
      console.warn("[SESSION] Could not persist burner (non-fatal):", e);
    }
    console.log("[SESSION] ✓ Session active");
  }

  async endSession(entityPda: PublicKey): Promise<void> {
    const sessionTargets = await this.getSessionTargets(entityPda);
    const isDelegatedOnChain = false;
    {
      const payer = this.provider.wallet.publicKey;
      const erConn = this.erDirectConnection;
      const delegatedTargets: typeof sessionTargets = [];

      for (const target of sessionTargets) {
        const planetAcc = await this.connection.getAccountInfo(target.planetPda, "confirmed");
        if (planetAcc?.owner.equals(DELEGATION_PROGRAM_ID)) {
          delegatedTargets.push(target);
        }
      }

      if (delegatedTargets.length === 0) {
        if (!this.sessionActive) {
          throw new Error("No active session to end - accounts are not delegated.");
        }
        console.warn("[END_SESSION] No delegated planets found on chain, proceeding with local cleanup only.");
      }

      const undelegatePayer = this.erSigner?.publicKey || payer;
      const erSigner = this.erSigner;
      const buildUndelegateIx = (componentProgramId: PublicKey, delegatedAccount: PublicKey) =>
        createUndelegateInstruction({
          payer: undelegatePayer,
          delegatedAccount,
          componentPda: componentProgramId,
        });

      const undelegateGroups = delegatedTargets.map((target) => ([
        buildUndelegateIx(PROGRAM_IDS.componentPlanet, target.planetPda),
        buildUndelegateIx(PROGRAM_IDS.componentResources, target.resourcesPda),
        buildUndelegateIx(PROGRAM_IDS.componentFleet, target.fleetPda),
        buildUndelegateIx(PROGRAM_IDS.componentResearch, target.researchPda),
      ]));

      const undelegateBatches = delegatedTargets.length > 0
        ? this.chunkInstructionGroups(undelegateGroups, undelegatePayer)
        : [];
      console.log(`[END_SESSION] Undelegation requires ${undelegateBatches.length} transaction(s) before burner refund`);

      const sendUndelegateBatch = async (batchInstructions: TransactionInstruction[]): Promise<string> => {
        const { blockhash, lastValidBlockHeight } = await erConn.getLatestBlockhash("confirmed");

        const freshTx = new Transaction();
        freshTx.feePayer = undelegatePayer;
        freshTx.recentBlockhash = blockhash;
        batchInstructions.forEach((ix) => freshTx.add(ix));

        if (erSigner) {
          freshTx.sign(erSigner);
        } else {
          await this.provider.wallet.signTransaction(freshTx);
        }

        console.log(`[END_SESSION] blockhash: ${blockhash.slice(0, 8)}... signing and sending...`);
        const txSig = await erConn.sendRawTransaction(freshTx.serialize(), { skipPreflight: true });
        await erConn.confirmTransaction({ signature: txSig, blockhash, lastValidBlockHeight }, "confirmed");
        return txSig;
      };

      for (let batchIndex = 0; batchIndex < undelegateBatches.length; batchIndex++) {
        let sig: string | null = null;
        for (let attempt = 1; attempt <= 5; attempt++) {
          try {
            console.log(`[END_SESSION] Sending undelegate batch ${batchIndex + 1}/${undelegateBatches.length} (attempt ${attempt}/5)...`);
            sig = await sendUndelegateBatch(undelegateBatches[batchIndex]);
            break;
          } catch (e: any) {
            const isBlockhash = e?.message?.includes("Blockhash not found") || e?.message?.includes("-32003");
            console.warn(`[END_SESSION] Batch ${batchIndex + 1} attempt ${attempt} failed:`, e?.message?.slice(0, 80));
            if (!isBlockhash || attempt === 5) throw e;
            await new Promise(r => setTimeout(r, 500));
          }
        }

        if (!sig) throw new Error(`Undelegate batch ${batchIndex + 1} failed after all retries`);
        console.log(`[END_SESSION] Undelegate batch ${batchIndex + 1}/${undelegateBatches.length} confirmed:`, sig);
      }

      await new Promise(r => setTimeout(r, 3000));

      if (this.erSigner) try {
        const burner = this.erSigner;
        const burnerBalance = await this.connection.getBalance(burner.publicKey);
        const refund = burnerBalance - 5000;
        if (refund > 0) {
          const recoverTx = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: burner.publicKey,
              toPubkey: payer,
              lamports: refund,
            })
          );
          const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash("confirmed");
          recoverTx.recentBlockhash = blockhash;
          recoverTx.feePayer = burner.publicKey;
          recoverTx.sign(burner);
          const recSig = await this.connection.sendRawTransaction(recoverTx.serialize());
          await this.connection.confirmTransaction({ signature: recSig, blockhash, lastValidBlockHeight }, "confirmed");
          console.log("[SESSION] Recovered", (refund / LAMPORTS_PER_SOL).toFixed(4), "SOL from burner");
        }
      } catch (e) {
        console.warn("[SESSION] Burner SOL recovery failed (non-critical):", e);
      }

      this.erSigner = null;
      this.sessionActive = false;
      try { sessionStorage.removeItem("_er_burner"); } catch {}
      console.log("[END_SESSION] Session ended - all state saved on Solana devnet");
      return;
    }

    if (!isDelegatedOnChain && !this.sessionActive) {
      throw new Error("No active session to end — accounts are not delegated");
    }

    const payer        = this.provider.wallet.publicKey;
    const planetPda    = deriveComponentPda(entityPda, PROGRAM_IDS.componentPlanet);
    const resourcesPda = deriveComponentPda(entityPda, PROGRAM_IDS.componentResources);
    const fleetPda     = deriveComponentPda(entityPda, PROGRAM_IDS.componentFleet);
    const researchPda  = deriveComponentPda(entityPda, PROGRAM_IDS.componentResearch);

    const erConn = this.erDirectConnection;

    const undelegatePayer = this.erSigner?.publicKey || payer;
    const buildUndelegateIx = (componentProgramId: PublicKey, delegatedAccount: PublicKey) =>
      createUndelegateInstruction({
        payer:            undelegatePayer,
        delegatedAccount: delegatedAccount,
        componentPda:     componentProgramId,
      });

    const ixPlanet    = buildUndelegateIx(PROGRAM_IDS.componentPlanet,    planetPda);
    const ixResources = buildUndelegateIx(PROGRAM_IDS.componentResources, resourcesPda);
    const ixFleet     = buildUndelegateIx(PROGRAM_IDS.componentFleet,     fleetPda);
    const researchAcc = await this.connection.getAccountInfo(researchPda, "confirmed");
    const ixResearch  = researchAcc ? buildUndelegateIx(PROGRAM_IDS.componentResearch, researchPda) : null;

    const erSigner = this.erSigner;

    const sendUndelegateTx = async (): Promise<string> => {
      const { blockhash, lastValidBlockHeight } = await erConn.getLatestBlockhash("confirmed");

      const freshTx = new Transaction();
      freshTx.add(ixPlanet);
      freshTx.add(ixResources);
      freshTx.add(ixFleet);
      if (ixResearch) freshTx.add(ixResearch);
      freshTx.feePayer        = undelegatePayer;
      freshTx.recentBlockhash = blockhash;

      if (erSigner) {
        freshTx.sign(erSigner);
      } else {
        await this.provider.wallet.signTransaction(freshTx);
      }

      console.log(`[END_SESSION] blockhash: ${blockhash.slice(0,8)}... signing and sending...`);
      const txSig = await erConn.sendRawTransaction(freshTx.serialize(), { skipPreflight: true });
      await erConn.confirmTransaction({ signature: txSig, blockhash, lastValidBlockHeight }, "confirmed");
      return txSig;
    };

    let sig: string | null = null;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        console.log(`[END_SESSION] Sending undelegate to ER (attempt ${attempt}/5)...`);
        sig = await sendUndelegateTx();
        break;
      } catch (e: any) {
        const isBlockhash = e?.message?.includes("Blockhash not found") || e?.message?.includes("-32003");
        console.warn(`[END_SESSION] Attempt ${attempt} failed:`, e?.message?.slice(0, 80));
        if (!isBlockhash || attempt === 5) throw e;
        await new Promise(r => setTimeout(r, 500));
      }
    }
    if (!sig) throw new Error("Undelegate failed after all retries");
    console.log("[END_SESSION] Undelegate tx sent:", sig);

    await new Promise(r => setTimeout(r, 3000));

    if (this.erSigner) try {
      const burner = this.erSigner!;
      const burnerBalance = await this.connection.getBalance(burner.publicKey);
      const refund = burnerBalance - 5000;
      if (refund > 0) {
        const recoverTx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: burner.publicKey,
            toPubkey:   payer,
            lamports:   refund,
          })
        );
        const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash("confirmed");
        recoverTx.recentBlockhash = blockhash;
        recoverTx.feePayer        = burner.publicKey;
        recoverTx.sign(burner);
        const recSig = await this.connection.sendRawTransaction(recoverTx.serialize());
        await this.connection.confirmTransaction({ signature: recSig, blockhash, lastValidBlockHeight }, "confirmed");
        console.log("[SESSION] Recovered", (refund / LAMPORTS_PER_SOL).toFixed(4), "SOL from burner");
      }
    } catch (e) {
      console.warn("[SESSION] Burner SOL recovery failed (non-critical):", e);
    }

    this.erSigner      = null;
    this.sessionActive = false;
    try { sessionStorage.removeItem("_er_burner"); } catch {}
    console.log("[END_SESSION] ✓ Session ended — all state saved on Solana devnet");
  }

  private async ensureWalletMeta(wallet: PublicKey): Promise<PublicKey> {
    const walletMetaPda = deriveWalletMetaPda(wallet);
    const existing = await this.connection.getAccountInfo(walletMetaPda, "confirmed");
    if (existing) return walletMetaPda;

    const ix = new TransactionInstruction({
      programId: REGISTRY_PROGRAM_ID,
      keys: [
        { pubkey: wallet, isSigner: true, isWritable: true },
        { pubkey: walletMetaPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: ixDiscriminator("init_wallet_meta"),
    });
    await this.provider.sendAndConfirm(new Transaction().add(ix), []);
    return walletMetaPda;
  }

  async registerPlanet(
    entityPda: PublicKey,
    planetPda: PublicKey,
    galaxy: number,
    system: number,
    position: number,
  ): Promise<string> {
    const wallet = this.provider.wallet.publicKey;
    const walletMetaPda = await this.ensureWalletMeta(wallet);
    const planetCount = await this.fetchPlanetCount(wallet);
    const registryPda = deriveRegistryPdaByIndex(wallet, planetCount);
    const coordPda = deriveCoordRegistryPda(galaxy, system, position);

    const args = Buffer.alloc(8 + 32 + 32 + 2 + 2 + 1);
    ixDiscriminator("register_planet").copy(args, 0);
    entityPda.toBuffer().copy(args, 8);
    planetPda.toBuffer().copy(args, 40);
    args.writeUInt16LE(galaxy, 72);
    args.writeUInt16LE(system, 74);
    args.writeUInt8(position, 76);

    const ix = new TransactionInstruction({
      programId: REGISTRY_PROGRAM_ID,
      keys: [
        { pubkey: wallet, isSigner: true, isWritable: true },
        { pubkey: walletMetaPda, isSigner: false, isWritable: true },
        { pubkey: registryPda, isSigner: false, isWritable: true },
        { pubkey: coordPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: args,
    });

    const sig = await this.provider.sendAndConfirm(new Transaction().add(ix), []);
    console.log("[REGISTRY] ✓ Registered planet index", planetCount, ":", sig);
    return sig;
  }

  async fetchPlanetCount(walletPubkey: PublicKey): Promise<number> {
    const walletMetaPda = deriveWalletMetaPda(walletPubkey);
    try {
      const account = await this.connection.getAccountInfo(walletMetaPda, "confirmed");
      if (!account) return 0;
      const walletMeta = deserializeWalletMeta(Buffer.from(account.data));
      return walletMeta.planetCount;
    } catch (e) {
      console.error("[REGISTRY] fetchPlanetCount failed:", e);
      return 0;
    }
  }

  async fetchRegistry(walletPubkey: PublicKey, index = 0): Promise<{ entityPda: PublicKey; planetPda: PublicKey } | null> {
    const registryPda = deriveRegistryPdaByIndex(walletPubkey, index);
    const account = await this.connection.getAccountInfo(registryPda, "confirmed");
    if (!account) return null;
    const registry = deserializePlanetRegistry(Buffer.from(account.data));
    return { entityPda: registry.entityPda, planetPda: registry.planetPda };
  }

  async fetchCoordinateRegistry(galaxy: number, system: number, position: number): Promise<CoordinateRegistryAccount | null> {
    const coordPda = deriveCoordRegistryPda(galaxy, system, position);
    const account = await this.connection.getAccountInfo(coordPda, "confirmed");
    if (!account) return null;
    return deserializeCoordinateRegistry(Buffer.from(account.data));
  }

  private async delegateEntityComponents(entityPda: PublicKey, componentProgramIds: PublicKey[]): Promise<void> {
    const payer = this.provider.wallet.publicKey;
    const delegateTx = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
    );

    for (const componentProgramId of componentProgramIds) {
      const componentPda = deriveComponentPda(entityPda, componentProgramId);
      delegateTx.add(createDelegateInstruction({
        entity: entityPda,
        account: componentPda,
        ownerProgram: componentProgramId,
        payer,
      }));
    }

    await this.provider.sendAndConfirm(delegateTx, []);
  }

  private async logResolveTransportDebug(
    sourceEntityPda: PublicKey,
    destinationEntityPda: PublicKey,
    targetGalaxy: number,
    targetSystem: number,
    targetPosition: number,
    slot: number,
  ): Promise<void> {
    const destinationPlanetPda = deriveComponentPda(destinationEntityPda, PROGRAM_IDS.componentPlanet);
    const destinationResourcesPda = deriveComponentPda(destinationEntityPda, PROGRAM_IDS.componentResources);
    const sourceFleetPda = deriveComponentPda(sourceEntityPda, PROGRAM_IDS.componentFleet);

    console.log("[resolve_transport] debug", {
      slot,
      sourceEntityPda: sourceEntityPda.toBase58(),
      sourceFleetPda: sourceFleetPda.toBase58(),
      destinationEntityPda: destinationEntityPda.toBase58(),
      targetGalaxy,
      targetSystem,
      targetPosition,
      destinationPlanetPda: destinationPlanetPda.toBase58(),
      destinationResourcesPda: destinationResourcesPda.toBase58(),
    });

    const connections = [
      { label: "devnet", connection: this.connection },
      { label: "er", connection: this.erConnection },
    ];

    for (const { label, connection } of connections) {
      try {
        const [sourceFleet, destinationPlanet, destinationResources] = await connection.getMultipleAccountsInfo([
          sourceFleetPda,
          destinationPlanetPda,
          destinationResourcesPda,
        ]);
        console.log(`[resolve_transport] ${label} accounts`);
        console.log(describeAccountInfo("sourceFleet", sourceFleet));
        console.log(describeAccountInfo("destinationPlanet", destinationPlanet));
        console.log(describeAccountInfo("destinationResources", destinationResources));
      } catch (debugErr) {
        console.warn(`[resolve_transport] ${label} account debug failed`, debugErr);
      }
    }
  }

  private async logSendTransactionError(
    label: string,
    err: unknown,
    connection: Connection,
  ): Promise<void> {
    const txErr = err as Partial<SendTransactionError> & { message?: string; logs?: string[] };
    console.error(`[SYS:${label}] Failed:`, txErr?.message ?? err);

    if (txErr?.logs?.length) {
      console.log(`[SYS:${label}] Logs from error object:`, txErr.logs);
    }

    if (err instanceof SendTransactionError) {
      try {
        const fetchedLogs = await err.getLogs(connection);
        if (fetchedLogs?.length) {
          console.log(`[SYS:${label}] Logs from SendTransactionError.getLogs():`, fetchedLogs);
        }
      } catch (logsErr) {
        console.warn(`[SYS:${label}] getLogs() failed:`, logsErr);
      }
    }
  }

  private logInstructionKeys(label: string, ix: TransactionInstruction): void {
    console.log(`[SYS:${label}] ApplySystem instruction keys:`);
    ix.keys.forEach((key, index) => {
      console.log(
        `[SYS:${label}] key[${index}] pubkey=${key.pubkey.toBase58()} signer=${key.isSigner} writable=${key.isWritable}`,
      );
    });
  }

  private async applySystemForEntities(
    label: string,
    entities: Array<{ entity: PublicKey; components: { componentId: PublicKey }[] }>,
    systemId: PublicKey,
    rawArgs: Buffer,
  ): Promise<string> {
    console.log(`[SYS:${label}] Sending multi-entity system... sessionActive:`, this.sessionActive, "erSigner:", !!this.erSigner);
    const authority = (this.sessionActive && this.erSigner)
      ? this.erSigner.publicKey
      : this.provider.wallet.publicKey;

    try {
      let sig: string;
      if (this.sessionActive && this.erSigner) {
        const erConn = this.erDirectConnection;
        const erSigner = this.erSigner;

        const { transaction: applyTx } = await ApplySystem({
          authority,
          systemId,
          world: SHARED_WORLD_PDA,
          entities,
          args: [],
        });
        this.logInstructionKeys(label, applyTx.instructions[0]);
        const patchedIx = patchApplyArgs(applyTx.instructions[0], rawArgs);

        const sendWithFreshBlockhash = async (): Promise<string> => {
          const { blockhash, lastValidBlockHeight } = await erConn.getLatestBlockhash("confirmed");
          const tx = new Transaction().add(
            ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
            patchedIx,
          );
          tx.recentBlockhash = blockhash;
          tx.feePayer = erSigner.publicKey;
          tx.sign(erSigner);
          const txSig = await erConn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
          await erConn.confirmTransaction({ signature: txSig, blockhash, lastValidBlockHeight }, "confirmed");
          return txSig;
        };

        let erSig: string | undefined;
        for (let attempt = 1; attempt <= 5; attempt++) {
          try {
            erSig = await sendWithFreshBlockhash();
            break;
          } catch (e: any) {
            const isBlockhash = e?.message?.includes("Blockhash not found") || e?.message?.includes("-32003");
            if (!isBlockhash || attempt === 5) throw e;
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        }
        if (!erSig) throw new Error(`[SYS:${label}] Failed after retries`);
        sig = erSig;
      } else {
        const { transaction: applyTx } = await ApplySystem({
          authority,
          systemId,
          world: SHARED_WORLD_PDA,
          entities,
          args: [],
        });
        this.logInstructionKeys(label, applyTx.instructions[0]);
        const tx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
          patchApplyArgs(applyTx.instructions[0], rawArgs),
        );
        sig = await this.provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
      }

      console.log(`[SYS:${label}] Confirmed:`, sig);
      return sig;
    } catch (err: any) {
      await this.logSendTransactionError(
        label,
        err,
        this.sessionActive && this.erSigner ? this.erDirectConnection : this.connection,
      );
      throw err;
    }
  }

  // ── Internal: build + send an ApplySystem transaction ────────────────────
  private async applySystem(
    label:      string,
    entityPda:  PublicKey,
    systemId:   PublicKey,
    components: { componentId: PublicKey }[],
    rawArgs:    Buffer,
  ): Promise<string> {
    console.log(`[SYS:${label}] Sending... sessionActive:`, this.sessionActive, "erSigner:", !!this.erSigner);
    const authority = (this.sessionActive && this.erSigner)
      ? this.erSigner.publicKey
      : this.provider.wallet.publicKey;

    try {
      let sig: string;
      if (this.sessionActive && this.erSigner) {
        const erConn    = this.erDirectConnection;
        const erSigner  = this.erSigner;

        const { transaction: applyTx } = await ApplySystem({
          authority,
          systemId,
          world:     SHARED_WORLD_PDA,
          entities:  [{ entity: entityPda, components }],
          args:      [],
        });
        const patchedIx = patchApplyArgs(applyTx.instructions[0], rawArgs);

        const sendWithFreshBlockhash = async (): Promise<string> => {
          const { blockhash, lastValidBlockHeight } = await erConn.getLatestBlockhash("confirmed");
          const tx = new Transaction().add(
            ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
            patchedIx,
          );
          tx.recentBlockhash = blockhash;
          tx.feePayer        = erSigner.publicKey;
          tx.sign(erSigner);
          const txSig = await erConn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
          await erConn.confirmTransaction({ signature: txSig, blockhash, lastValidBlockHeight }, "confirmed");
          return txSig;
        };

        let erSig: string | undefined;
        const maxRetries = 5;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            erSig = await sendWithFreshBlockhash();
            break;
          } catch (retryErr: any) {
            const isBlockhash = retryErr?.message?.includes("Blockhash not found") || retryErr?.message?.includes("-32003");
            console.warn(`[SYS:${label}] Attempt ${attempt} failed:`, retryErr?.message?.slice(0, 60));
            if (!isBlockhash || attempt === maxRetries) throw retryErr;
            await new Promise(r => setTimeout(r, 300));
          }
        }
        if (!erSig) throw new Error(`[SYS:${label}] Failed after ${maxRetries} attempts`);
        sig = erSig;
      } else {
        const { transaction: applyTx } = await ApplySystem({
          authority,
          systemId,
          world:     SHARED_WORLD_PDA,
          entities:  [{ entity: entityPda, components }],
          args:      [],
        });
        const tx = new Transaction().add(
          ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
          patchApplyArgs(applyTx.instructions[0], rawArgs),
        );
        sig = await this.provider.sendAndConfirm(tx, [], { commitment: "confirmed" });
      }
      console.log(`[SYS:${label}] Confirmed:`, sig);
      return sig;
    } catch (err: any) {
      await this.logSendTransactionError(
        label,
        err,
        this.sessionActive && this.erSigner ? this.erDirectConnection : this.connection,
      );
      throw err;
    }
  }
}

// ─── Binary read helpers ──────────────────────────────────────────────────────
function readU8(d: Buffer, o: number): number  { return d.readUInt8(o); }
function readU16(d: Buffer, o: number): number  { return d.readUInt16LE(o); }
function readU32(d: Buffer, o: number): number  { return d.readUInt32LE(o); }
function readU64(d: Buffer, o: number): bigint  { return d.readBigUInt64LE(o); }
function readI16(d: Buffer, o: number): number  { return d.readInt16LE(o); }
function readI64(d: Buffer, o: number): number  { return Number(d.readBigInt64LE(o)); }
function readPubkey(d: Buffer, o: number): string {
  return new PublicKey(d.slice(o, o + 32)).toBase58();
}

function readPubkeyRaw(d: Buffer, o: number): PublicKey {
  return new PublicKey(d.slice(o, o + 32));
}

function deserializeWalletMeta(data: Buffer): WalletMetaAccount {
  if (data.length < DISC + 32) {
    throw new Error(`WalletMeta account too small: ${data.length} bytes`);
  }

  let o = DISC;
  const wallet = readPubkeyRaw(data, o); o += 32;

  // Backward compatibility:
  // older wallet_meta accounts stored planet_count as u8, newer ones as u32.
  let planetCount = 0;
  if (data.length >= o + 4) {
    planetCount = readU32(data, o);
  } else if (data.length >= o + 1) {
    planetCount = readU8(data, o);
  }

  return { wallet, planetCount };
}

function deserializePlanetRegistry(data: Buffer): PlanetRegistryAccount {
  if (data.length < DISC + 32 + 32 + 32) {
    throw new Error(`PlanetRegistry account too small: ${data.length} bytes`);
  }

  let o = DISC;
  const wallet = readPubkeyRaw(data, o); o += 32;

  // Backward compatibility:
  // older registry entries stored planet_index as u8, newer ones as u32.
  let planetIndex = 0;
  if (data.length >= DISC + 32 + 4 + 32 + 32) {
    planetIndex = readU32(data, o); o += 4;
  } else {
    planetIndex = readU32(data, o); o += 1;
  }

  const entityPda = readPubkeyRaw(data, o); o += 32;
  const planetPda = readPubkeyRaw(data, o); o += 32;
  const createdAt = data.length >= o + 8 ? readI64(data, o) : 0;
  return { wallet, planetIndex, entityPda, planetPda, createdAt };
}

function deserializeCoordinateRegistry(data: Buffer): CoordinateRegistryAccount {
  if (data.length < DISC + 2 + 2 + 1 + 32 + 32 + 32) {
    throw new Error(`CoordinateRegistry account too small: ${data.length} bytes`);
  }

  let o = DISC;
  const galaxy = readU16(data, o); o += 2;
  const system = readU16(data, o); o += 2;
  const position = readU8(data, o); o += 1;
  const ownerWallet = readPubkeyRaw(data, o); o += 32;
  const entityPda = readPubkeyRaw(data, o); o += 32;
  const planetPda = readPubkeyRaw(data, o);
  return { galaxy, system, position, ownerWallet, entityPda, planetPda };
}

// ─── Deserializers ────────────────────────────────────────────────────────────
export function deserializePlanet(data: Buffer): Planet {
  console.log(`[DESERIALIZE PLANET] Received ${data.length} bytes (expected ~200)`);

  let o = DISC; // 8

  const creator = readPubkey(data, o); o += 32;
  console.log(`[DESERIALIZE] Creator from on-chain planet account: ${creator}`);
  const entity  = readPubkey(data, o); o += 32;
  const owner   = readPubkey(data, o); o += 32;

  const nameRaw = data.slice(o, o + 32); o += 32;
  const name = Buffer.from(nameRaw).toString("utf8").replace(/\0/g, "").trim();

  const galaxy       = readU16(data, o); o += 2;
  const system       = readU16(data, o); o += 2;
  const position     = readU8(data, o);  o += 1;
  const planetIndex  = readU32(data, o);  o += 4;

  const diameter     = readU32(data, o); o += 4;
  const temperature  = readI16(data, o); o += 2;
  const maxFields    = readU16(data, o); o += 2;
  const usedFields   = readU16(data, o); o += 2;

  const metalMine            = readU8(data, o); o += 1;
  const crystalMine          = readU8(data, o); o += 1;
  const deuteriumSynthesizer = readU8(data, o); o += 1;
  const solarPlant           = readU8(data, o); o += 1;
  const fusionReactor        = readU8(data, o); o += 1;
  const roboticsFactory      = readU8(data, o); o += 1;
  const naniteFactory        = readU8(data, o); o += 1;
  const shipyard             = readU8(data, o); o += 1;

  const metalStorage   = readU8(data, o); o += 1;
  const crystalStorage = readU8(data, o); o += 1;
  const deuteriumTank  = readU8(data, o); o += 1;

  const researchLab = readU8(data, o); o += 1;
  const missileSilo = readU8(data, o); o += 1;

  const buildQueueItem   = readU8(data, o); o += 1;
  const buildQueueTarget = readU8(data, o); o += 1;
  const buildFinishTs    = readI64(data, o);

  console.log(`[DESERIALIZE] Parsed researchLab=${researchLab}, missileSilo=${missileSilo}, queueItem=${buildQueueItem}`);

  return {
    creator, entity, owner, name,
    galaxy, system, position, planetIndex,
    diameter, temperature, maxFields, usedFields,
    metalMine, crystalMine, deuteriumSynthesizer, solarPlant,
    fusionReactor, roboticsFactory, naniteFactory, shipyard,
    metalStorage, crystalStorage, deuteriumTank,
    researchLab, missileSilo,
    buildQueueItem, buildQueueTarget, buildFinishTs,
  };
}

export function deserializeResearch(data: Buffer): Research {
  let o = DISC;
  const creator          = readPubkey(data, o); o += 32;
  const energyTech       = readU8(data, o); o += 1;
  const combustionDrive  = readU8(data, o); o += 1;
  const impulseDrive     = readU8(data, o); o += 1;
  const hyperspaceDrive  = readU8(data, o); o += 1;
  const computerTech     = readU8(data, o); o += 1;
  const astrophysics     = readU8(data, o); o += 1;
  const igrNetwork       = readU8(data, o); o += 1;
  const queueItem        = readU8(data, o); o += 1;
  const queueTarget      = readU8(data, o); o += 1;
  const researchFinishTs = readI64(data, o);
  return {
    creator,
    energyTech,
    combustionDrive,
    impulseDrive,
    hyperspaceDrive,
    computerTech,
    astrophysics,
    igrNetwork,
    queueItem,
    queueTarget,
    researchFinishTs,
  };
}

export function deserializeResources(data: Buffer): Resources {
  let o = DISC;
  const metal             = readU64(data, o); o += 8;
  const crystal           = readU64(data, o); o += 8;
  const deuterium         = readU64(data, o); o += 8;
  const metalHour         = readU64(data, o); o += 8;
  const crystalHour       = readU64(data, o); o += 8;
  const deuteriumHour     = readU64(data, o); o += 8;
  const energyProduction  = readU64(data, o); o += 8;
  const energyConsumption = readU64(data, o); o += 8;
  const metalCap          = readU64(data, o); o += 8;
  const crystalCap        = readU64(data, o); o += 8;
  const deuteriumCap      = readU64(data, o); o += 8;
  const lastUpdateTs      = readI64(data, o);
  return {
    metal, crystal, deuterium,
    metalHour, crystalHour, deuteriumHour,
    energyProduction, energyConsumption,
    metalCap, crystalCap, deuteriumCap,
    lastUpdateTs,
  };
}

function deserializeMission(data: Buffer, offset: number): { mission: Mission; bytesRead: number } {
  let o = offset;
  const missionType     = readU8(data, o);     o += 1;
  const targetGalaxy    = readU16(data, o);    o += 2;
  const targetSystem    = readU16(data, o);    o += 2;
  const targetPosition  = readU8(data, o);     o += 1;
  const colonyNameRaw   = data.slice(o, o + 32); o += 32;
  const colonyName      = Buffer.from(colonyNameRaw).toString("utf8").replace(/\0/g, "").trim();
  const departTs        = readI64(data, o);    o += 8;
  const arriveTs        = readI64(data, o);    o += 8;
  const returnTs        = readI64(data, o);    o += 8;
  const sSmallCargo     = readU32(data, o);    o += 4;
  const sLargeCargo     = readU32(data, o);    o += 4;
  const sLightFighter   = readU32(data, o);    o += 4;
  const sHeavyFighter   = readU32(data, o);    o += 4;
  const sCruiser        = readU32(data, o);    o += 4;
  const sBattleship     = readU32(data, o);    o += 4;
  const sBattlecruiser  = readU32(data, o);    o += 4;
  const sBomber         = readU32(data, o);    o += 4;
  const sDestroyer      = readU32(data, o);    o += 4;
  const sDeathstar      = readU32(data, o);    o += 4;
  const sRecycler       = readU32(data, o);    o += 4;
  const sEspionageProbe = readU32(data, o);    o += 4;
  const sColonyShip     = readU32(data, o);    o += 4;
  const cargoMetal      = readU64(data, o);    o += 8;
  const cargoCrystal    = readU64(data, o);    o += 8;
  const cargoDeuterium  = readU64(data, o);    o += 8;
  const applied         = readU8(data, o) !== 0; o += 1;
  return {
    mission: {
      missionType,
      destination: "11111111111111111111111111111111",
      targetGalaxy,
      targetSystem,
      targetPosition,
      colonyName,
      departTs, arriveTs, returnTs,
      sSmallCargo, sLargeCargo, sLightFighter, sHeavyFighter,
      sCruiser, sBattleship, sBattlecruiser, sBomber, sDestroyer,
      sDeathstar, sRecycler, sEspionageProbe, sColonyShip,
      cargoMetal, cargoCrystal, cargoDeuterium, applied,
    },
    bytesRead: o - offset,
  };
}

export function deserializeFleet(data: Buffer): Fleet {
  let o = DISC;
  const creator        = readPubkey(data, o); o += 32;
  const smallCargo     = readU32(data, o); o += 4;
  const largeCargo     = readU32(data, o); o += 4;
  const lightFighter   = readU32(data, o); o += 4;
  const heavyFighter   = readU32(data, o); o += 4;
  const cruiser        = readU32(data, o); o += 4;
  const battleship     = readU32(data, o); o += 4;
  const battlecruiser  = readU32(data, o); o += 4;
  const bomber         = readU32(data, o); o += 4;
  const destroyer      = readU32(data, o); o += 4;
  const deathstar      = readU32(data, o); o += 4;
  const recycler       = readU32(data, o); o += 4;
  const espionageProbe = readU32(data, o); o += 4;
  const colonyShip     = readU32(data, o); o += 4;
  const solarSatellite = readU32(data, o); o += 4;
  const activeMissions = readU8(data, o);  o += 1;
  const missions: Mission[] = [];
  for (let i = 0; i < 4; i++) {
    const { mission, bytesRead } = deserializeMission(data, o);
    missions.push(mission);
    o += bytesRead;
  }
  return {
    creator, smallCargo, largeCargo, lightFighter, heavyFighter,
    cruiser, battleship, battlecruiser, bomber, destroyer, deathstar,
    recycler, espionageProbe, colonyShip, solarSatellite,
    activeMissions, missions,
  };
}

// ─── Static metadata ──────────────────────────────────────────────────────────
export const BUILDINGS = [
  { idx: 0,  key: "metalMine",            name: "Metal Mine",            icon: "⬡",  desc: "Extracts metal from the planet crust." },
  { idx: 1,  key: "crystalMine",          name: "Crystal Mine",          icon: "◈",  desc: "Processes surface crystal formations." },
  { idx: 2,  key: "deuteriumSynthesizer", name: "Deuterium Synthesizer", icon: "◉",  desc: "Extracts deuterium from the atmosphere." },
  { idx: 3,  key: "solarPlant",           name: "Solar Plant",           icon: "☀",  desc: "Converts sunlight to energy." },
  { idx: 4,  key: "fusionReactor",        name: "Fusion Reactor",        icon: "⚛",  desc: "Burns deuterium for high-yield energy." },
  { idx: 5,  key: "roboticsFactory",      name: "Robotics Factory",      icon: "🤖", desc: "Automated workers — halves build time." },
  { idx: 6,  key: "naniteFactory",        name: "Nanite Factory",        icon: "🔬", desc: "Nano assemblers — massive build speed." },
  { idx: 7,  key: "shipyard",             name: "Shipyard",              icon: "🚀", desc: "Constructs ships and defense units." },
  { idx: 8,  key: "metalStorage",         name: "Metal Storage",         icon: "🏗", desc: "Increases metal cap." },
  { idx: 9,  key: "crystalStorage",       name: "Crystal Storage",       icon: "🏗", desc: "Increases crystal cap." },
  { idx: 10, key: "deuteriumTank",        name: "Deuterium Tank",        icon: "🏗", desc: "Increases deuterium cap." },
  { idx: 11, key: "researchLab",          name: "Research Lab",          icon: "🔭", desc: "Required for all technology research." },
  { idx: 12, key: "missileSilo",          name: "Missile Silo",          icon: "🎯", desc: "Stores interplanetary missiles." },
] as const;

export const SHIPS = [
  { key: "smallCargo",     name: "Small Cargo",     icon: "📦", atk: 5,      cargo: 5_000,   cost: { m: 2000,    c: 2000,    d: 0       } },
  { key: "largeCargo",     name: "Large Cargo",      icon: "🚛", atk: 5,      cargo: 25_000,  cost: { m: 6000,    c: 6000,    d: 0       } },
  { key: "lightFighter",   name: "Light Fighter",    icon: "✈",  atk: 50,     cargo: 50,      cost: { m: 3000,    c: 1000,    d: 0       } },
  { key: "heavyFighter",   name: "Heavy Fighter",    icon: "⚡",  atk: 150,    cargo: 100,     cost: { m: 6000,    c: 4000,    d: 0       } },
  { key: "cruiser",        name: "Cruiser",           icon: "🛸", atk: 400,    cargo: 800,     cost: { m: 20000,   c: 7000,    d: 2000    } },
  { key: "battleship",     name: "Battleship",        icon: "⚔",  atk: 1000,   cargo: 1500,    cost: { m: 45000,   c: 15000,   d: 0       } },
  { key: "battlecruiser",  name: "Battlecruiser",     icon: "🔱", atk: 700,    cargo: 750,     cost: { m: 30000,   c: 40000,   d: 15000   } },
  { key: "bomber",         name: "Bomber",            icon: "💣", atk: 1000,   cargo: 500,     cost: { m: 50000,   c: 25000,   d: 15000   } },
  { key: "destroyer",      name: "Destroyer",         icon: "💥", atk: 2000,   cargo: 2000,    cost: { m: 60000,   c: 50000,   d: 15000   } },
  { key: "deathstar",      name: "Deathstar",         icon: "🌑", atk: 200000, cargo: 1000000, cost: { m: 5000000, c: 4000000, d: 1000000 } },
  { key: "recycler",       name: "Recycler",          icon: "♻",  atk: 1,      cargo: 20_000,  cost: { m: 10000,   c: 6000,    d: 2000    } },
  { key: "espionageProbe", name: "Espionage Probe",   icon: "👁",  atk: 0,      cargo: 0,       cost: { m: 0,       c: 1000,    d: 0       } },
  { key: "colonyShip",     name: "Colony Ship",       icon: "🌍", atk: 50,     cargo: 7500,    cost: { m: 10000,   c: 20000,   d: 10000   } },
  { key: "solarSatellite", name: "Solar Satellite",   icon: "🛰",  atk: 1,      cargo: 0,       cost: { m: 0,       c: 2000,    d: 500     } },
] as const;

export const SHIP_TYPE_IDX: Record<string, number> = {
  smallCargo: 0, largeCargo: 1, lightFighter: 2, heavyFighter: 3,
  cruiser: 4, battleship: 5, battlecruiser: 6, bomber: 7,
  destroyer: 8, deathstar: 9, recycler: 10, espionageProbe: 11,
  colonyShip: 12, solarSatellite: 13,
};

export const MISSION_LABELS: Record<number, string> = {
  2: "TRANSPORT",
  5: "COLONIZE",
};

// ─── Cost & time formulas ─────────────────────────────────────────────────────
const BASE_COSTS: Record<number, [number, number, number]> = {
  0:  [60,      15,     0],      1:  [48,      24,     0],
  2:  [225,     75,     0],      3:  [75,      30,     0],
  4:  [900,     360,    900],    5:  [400,     120,    200],
  6:  [1000000, 500000, 100000], 7:  [400,     200,    100],
  8:  [1000,    0,      0],      9:  [1000,    500,    0],
  10: [1000,    1000,   0],      11: [200,     400,    200],
  12: [20,      20,     0],
};

function pow15(n: number): number {
  let r = 1;
  for (let i = 0; i < n; i++) r = r * 1.5;
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

// ─── Display helpers ──────────────────────────────────────────────────────────
export function fmt(n: bigint | number): string {
  if (typeof n === "bigint") {
    return n.toString();
  }
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
    const total   = m.returnTs - m.arriveTs;
    const elapsed = nowTs - m.arriveTs;
    return total <= 0 ? 100 : Math.min(100, Math.floor((elapsed / total) * 100));
  }
  const total   = m.arriveTs - m.departTs;
  const elapsed = nowTs - m.departTs;
  return total <= 0 ? 100 : Math.min(100, Math.floor((elapsed / total) * 100));
}

export function energyEfficiency(res: Resources): number {
  if (res.energyConsumption === 0n) return 100;
  return Math.min(100, Number(res.energyProduction * 100n / res.energyConsumption));
}
