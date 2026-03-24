/**
 * SolarGrid Game Client
 *
 * Supports two modes:
 *   BASE MODE  — every action requires a wallet popup (~400ms per tx)
 *   ER SESSION — delegate components once at login, then all actions are
 *                instant (<50ms) with no wallet popups. State commits to
 *                Solana mainnet every 3s and fully settles on end_session.
 *
 * Session lifecycle:
 *   startSession() → delegates planet+resources+fleet to ER (1 wallet popup)
 *   [play normally — all sendTx calls route through Magic Router automatically]
 *   endSession()   → commits final state + undelegates (1 wallet popup)
 */

import {
  Connection,
  PublicKey,
  GetProgramAccountsFilter,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL,
  AccountMeta,
  Keypair,
  SystemProgram,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import { anchor as BoltAnchor } from "@magicblock-labs/bolt-sdk";

import { AnchorProvider, Program, BN, Idl, setProvider } from "@coral-xyz/anchor";
import {
  AddEntity,
  InitializeComponent,
  ApplySystem,
} from "@magicblock-labs/bolt-sdk";
import {
  COMPONENT_PLANET_ID,
  COMPONENT_RESOURCES_ID,
  COMPONENT_FLEET_ID,
  SYSTEM_INITIALIZE_ID,
  SYSTEM_BUILD_ID,
  SYSTEM_PRODUCE_ID,
  SYSTEM_SHIPYARD_ID,
  SYSTEM_LAUNCH_ID,
  SYSTEM_ATTACK_ID,
  SYSTEM_SESSION_ID,
  DELEGATION_PROGRAM_ID,
  ER_RPC,
  MAGIC_CONTEXT_PROGRAM_ID,
  SHARED_WORLD_PDA_STR,
} from "../constants";

// ── Discriminators ─────────────────────────────────────────────────────────────
const DISC_PLANET    = [242, 27, 236, 42, 220, 217, 132, 128];
const DISC_RESOURCES = [252, 239, 111,  79,  54,   7,  67, 233];
const DISC_FLEET     = [109, 207, 251,  48, 106,   2, 136, 163];

// ── Minimal IDLs ──────────────────────────────────────────────────────────────

const PLANET_IDL: Idl = {
  address: COMPONENT_PLANET_ID.toBase58(),
  metadata: { name: "planet", version: "0.1.0", spec: "0.1.0" },
  instructions: [],
  accounts: [{ name: "Planet", discriminator: DISC_PLANET }],
  types: [{
    name: "Planet",
    type: {
      kind: "struct" as const,
      fields: [
        { name: "creator",              type: "pubkey" },
        { name: "entity",               type: "pubkey" },
        { name: "owner",                type: "pubkey" },
        { name: "name",                 type: { array: ["u8", 32] } },
        { name: "galaxy",               type: "u16" },
        { name: "system",               type: "u16" },
        { name: "position",             type: "u8" },
        { name: "diameter",             type: "u32" },
        { name: "temperature",          type: "i16" },
        { name: "maxFields",            type: "u16" },
        { name: "usedFields",           type: "u16" },
        { name: "metalMine",            type: "u8" },
        { name: "crystalMine",          type: "u8" },
        { name: "deuteriumSynthesizer", type: "u8" },
        { name: "solarPlant",           type: "u8" },
        { name: "fusionReactor",        type: "u8" },
        { name: "roboticsFactory",      type: "u8" },
        { name: "naniteFactory",        type: "u8" },
        { name: "shipyard",             type: "u8" },
        { name: "metalStorage",         type: "u8" },
        { name: "crystalStorage",       type: "u8" },
        { name: "deuteriumTank",        type: "u8" },
        { name: "researchLab",          type: "u8" },
        { name: "missileSilo",          type: "u8" },
        { name: "buildQueueItem",       type: "u8" },
        { name: "buildQueueTarget",     type: "u8" },
        { name: "buildFinishTs",        type: "i64" },
        { name: "boltMetadata",         type: { defined: { name: "BoltMetadata" } } },
      ],
    },
  }, {
    name: "BoltMetadata",
    type: { kind: "struct" as const, fields: [{ name: "authority", type: "pubkey" }] },
  }],
} as unknown as Idl;

const RESOURCES_IDL: Idl = {
  address: COMPONENT_RESOURCES_ID.toBase58(),
  metadata: { name: "resources", version: "0.1.0", spec: "0.1.0" },
  instructions: [],
  accounts: [{ name: "Resources", discriminator: DISC_RESOURCES }],
  types: [{
    name: "Resources",
    type: {
      kind: "struct" as const,
      fields: [
        { name: "metal",            type: "u64" },
        { name: "crystal",          type: "u64" },
        { name: "deuterium",        type: "u64" },
        { name: "metalHour",        type: "u64" },
        { name: "crystalHour",      type: "u64" },
        { name: "deuteriumHour",    type: "u64" },
        { name: "energyProduction", type: "u64" },
        { name: "energyConsumption",type: "u64" },
        { name: "metalCap",         type: "u64" },
        { name: "crystalCap",       type: "u64" },
        { name: "deuteriumCap",     type: "u64" },
        { name: "lastUpdateTs",     type: "i64" },
        { name: "boltMetadata",     type: { defined: { name: "BoltMetadata" } } },
      ],
    },
  }, {
    name: "BoltMetadata",
    type: { kind: "struct" as const, fields: [{ name: "authority", type: "pubkey" }] },
  }],
} as unknown as Idl;

const FLEET_IDL: Idl = {
  address: COMPONENT_FLEET_ID.toBase58(),
  metadata: { name: "fleet", version: "0.1.0", spec: "0.1.0" },
  instructions: [],
  accounts: [{ name: "Fleet", discriminator: DISC_FLEET }],
  types: [{
    name: "Fleet",
    type: {
      kind: "struct" as const,
      fields: [
        { name: "smallCargo",      type: "u32" },
        { name: "largeCargo",      type: "u32" },
        { name: "lightFighter",    type: "u32" },
        { name: "heavyFighter",    type: "u32" },
        { name: "cruiser",         type: "u32" },
        { name: "battleship",      type: "u32" },
        { name: "battlecruiser",   type: "u32" },
        { name: "bomber",          type: "u32" },
        { name: "destroyer",       type: "u32" },
        { name: "deathstar",       type: "u32" },
        { name: "recycler",        type: "u32" },
        { name: "espionageProbe",  type: "u32" },
        { name: "colonyShip",      type: "u32" },
        { name: "solarSatellite",  type: "u32" },
        { name: "activeMissions",  type: "u8"  },
        { name: "missions", type: { array: [{ defined: { name: "Mission" } }, 4] } },
        { name: "boltMetadata", type: { defined: { name: "BoltMetadata" } } },
      ],
    },
  }, {
    name: "Mission",
    type: {
      kind: "struct" as const,
      fields: [
        { name: "missionType",     type: "u8"     },
        { name: "destination",     type: "pubkey" },
        { name: "departTs",        type: "i64"    },
        { name: "arriveTs",        type: "i64"    },
        { name: "returnTs",        type: "i64"    },
        { name: "sSmallCargo",     type: "u32"    },
        { name: "sLargeCargo",     type: "u32"    },
        { name: "sLightFighter",   type: "u32"    },
        { name: "sHeavyFighter",   type: "u32"    },
        { name: "sCruiser",        type: "u32"    },
        { name: "sBattleship",     type: "u32"    },
        { name: "sBattlecruiser",  type: "u32"    },
        { name: "sBomber",         type: "u32"    },
        { name: "sDestroyer",      type: "u32"    },
        { name: "sDeathstar",      type: "u32"    },
        { name: "sRecycler",       type: "u32"    },
        { name: "sEspionageProbe", type: "u32"    },
        { name: "sColonyShip",     type: "u32"    },
        { name: "cargoMetal",      type: "u64"    },
        { name: "cargoCrystal",    type: "u64"    },
        { name: "cargoDeuterium",  type: "u64"    },
        { name: "applied",         type: "bool"   },
      ],
    },
  }, {
    name: "BoltMetadata",
    type: { kind: "struct" as const, fields: [{ name: "authority", type: "pubkey" }] },
  }],
} as unknown as Idl;

// ── Public types ───────────────────────────────────────────────────────────────

export interface OnChainPlanet {
  creator: PublicKey;
  entity: PublicKey;
  owner: PublicKey;
  name: string;
  galaxy: number;
  system: number;
  position: number;
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

export interface OnChainResources {
  metal:              BN;
  crystal:            BN;
  deuterium:          BN;
  metal_hour:         BN;
  crystal_hour:       BN;
  deuterium_hour:     BN;
  energy_production:  BN;
  energy_consumption: BN;
  metal_cap:          BN;
  crystal_cap:        BN;
  deuterium_cap:      BN;
  lastUpdateTs:       BN;
}

export interface OnChainMission {
  missionType: number;
  destination: string;
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
  cargoMetal: number;
  cargoCrystal: number;
  cargoDeuterium: number;
  applied: boolean;
}

export interface OnChainFleet {
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
  missions: OnChainMission[];
}

export interface GameAddresses {
  worldPda:     PublicKey;
  entityPda:    PublicKey;
  planetPda:    PublicKey;
  resourcesPda: PublicKey;
  fleetPda:     PublicKey;
}

export interface GalaxyEntry {
  planetPda:   string;
  owner:       string;
  name:        string;
  galaxy:      number;
  system:      number;
  position:    number;
  metalMine:   number;
  crystalMine: number;
  isMe:        boolean;
}

// ── (localStorage removed — all lookups are pure on-chain) ──────────────────

// ── BOLT component PDA derivation ─────────────────────────────────────────────
// Confirmed: seeds = [entity_pubkey], program = component_program_id

function deriveComponentPdas(entityPda: PublicKey) {
  const planetPda = PublicKey.findProgramAddressSync(
    [entityPda.toBuffer()], COMPONENT_PLANET_ID
  )[0];
  const resourcesPda = PublicKey.findProgramAddressSync(
    [entityPda.toBuffer()], COMPONENT_RESOURCES_ID
  )[0];
  const fleetPda = PublicKey.findProgramAddressSync(
    [entityPda.toBuffer()], COMPONENT_FLEET_ID
  )[0];
  return { planetPda, resourcesPda, fleetPda };
}

// ── Patch ApplySystem instruction with raw bytes ───────────────────────────────
// The BOLT SDK JSON-serializes any args type. We bypass this by replacing the
// instruction data directly: disc(8) + u32_le(len) + raw_bytes (Borsh Vec<u8>).

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

// ── SolarGrid Client ───────────────────────────────────────────────────────────

export class SolarGridClient {
  private connection:    Connection;
  private provider:      AnchorProvider;
  private planetProg:    Program<Idl>;
  private resourcesProg: Program<Idl>;
  private fleetProg:     Program<Idl>;

  // ER session state
  private erConnection:  Connection;   // Magic Router RPC — routes automatically
  private sessionActive  = false;
  private erSigner:      Keypair | null = null;  // burner keypair — signs ER txs without wallet popup

  private currentAddresses: GameAddresses | null = null;

  constructor(connection: Connection, provider: AnchorProvider) {
    console.log("[CLIENT] Initializing SolarGridClient");
    this.connection = connection;
    this.provider   = provider;

    setProvider(provider);

    const boltProvider = new (BoltAnchor as any).AnchorProvider(
      connection, provider.wallet, { commitment: "confirmed" }
    );
    (BoltAnchor as any).setProvider(boltProvider);

    this.planetProg    = new Program(PLANET_IDL,    provider);
    this.resourcesProg = new Program(RESOURCES_IDL, provider);
    this.fleetProg     = new Program(FLEET_IDL,     provider);

    // Magic Router: single endpoint that routes to ER or base layer automatically
    // based on whether the destination accounts are currently delegated.
    this.erConnection = new Connection(ER_RPC, "confirmed");
  }

  // ── Internal: send tx through ER when session active, base layer otherwise ──

  private async sendTx(tx: Transaction, label = "tx"): Promise<string> {
    console.log(`[TX:${label}] Sending via ${this.sessionActive ? "ER (no popup)" : "base"}...`);
    try {
      let sig: string;
      if (this.sessionActive && this.erSigner) {
        // ER mode: burner keypair signs — NO wallet popup at all.
        // The burner was funded and authorized during startSession.
        const { blockhash, lastValidBlockHeight } = await this.erConnection.getLatestBlockhash("confirmed");
        tx.recentBlockhash  = blockhash;
        tx.feePayer         = this.erSigner.publicKey;  // burner pays fees on ER
        tx.sign(this.erSigner);
        sig = await this.erConnection.sendRawTransaction(tx.serialize(), {
          skipPreflight: true,
        });
        await this.erConnection.confirmTransaction(
          { signature: sig, blockhash, lastValidBlockHeight },
          "confirmed"
        );
      } else {
        sig = await this.provider.sendAndConfirm(tx, []);
      }
      console.log(`[TX:${label}] Success:`, sig);
      return sig;
    } catch (err: any) {
      console.error(`[TX:${label}] Failed:`, err.message);
      if (err.logs) console.log(`[TX:${label}] Logs:`, err.logs);
      throw err;
    }
  }

  isSessionActive(): boolean { return this.sessionActive; }

  // ── Session management ─────────────────────────────────────────────────────

  /**
   * startSession — delegate planet + resources + fleet to the Ephemeral Rollup.
   *
   * Calls delegate_planet / delegate_resources / delegate_fleet on each component
   * program. After this, all game actions route through the Magic Router to the ER:
   * no wallet popups, <50ms confirmation, state commits to Solana every 3 seconds.
   *
   * Requires 1 wallet approval.
   * Validator: US endpoint by default. Pass a different pubkey for other regions.
   */
  async startSession(
    entityPda: PublicKey,
    validatorPubkey?: PublicKey,
  ): Promise<void> {
    const payer = this.provider.wallet.publicKey;
    const { planetPda, resourcesPda, fleetPda } = deriveComponentPdas(entityPda);

    // ── Step 1: Generate ephemeral burner keypair ──────────────────────────────
    // The burner will sign ALL ER transactions — no wallet popups after this.
    const burner = Keypair.generate();
    console.log("[SESSION] Burner keypair:", burner.publicKey.toBase58());

    // ── Step 2: Fund the burner from the player wallet (one wallet approval) ──
    // We fund it with ~0.01 SOL — enough for hundreds of ER transactions.
    // ER fees are typically 0 or near-zero, but the feePayer account needs rent.
    const fundTx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer,
        toPubkey:   burner.publicKey,
        lamports:   10_000_000, // 0.01 SOL
      }),
    );
    await this.provider.sendAndConfirm(fundTx, []);
    console.log("[SESSION] Burner funded with 0.01 SOL");

    // ── Step 3: Delegate components to the ER ─────────────────────────────────
    // #[component(delegate)] generates a "delegate" instruction in each component
    // program. Discriminator = sha256("global:delegate")[0..8].
    // This MUST be signed by the player wallet (payer), not the burner.
    const DELEGATE_DISC = Buffer.from([90, 147, 75, 178, 85, 88, 4, 137]);
    const SYSTEM_PROGRAM = new PublicKey("11111111111111111111111111111111");

    const buildDelegateIx = (
      componentProgramId: PublicKey,
      componentPda:       PublicKey,
    ): TransactionInstruction => {
      const keys: AccountMeta[] = [
        { pubkey: payer,               isSigner: true,  isWritable: true  }, // payer
        { pubkey: componentPda,        isSigner: false, isWritable: true  }, // pda
        { pubkey: DELEGATION_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SYSTEM_PROGRAM,      isSigner: false, isWritable: false },
        { pubkey: entityPda,           isSigner: false, isWritable: false }, // remaining[0]
      ];
      if (validatorPubkey) {
        keys.push({ pubkey: validatorPubkey, isSigner: false, isWritable: false });
      }
      return new TransactionInstruction({
        keys,
        programId: componentProgramId,
        data: DELEGATE_DISC,
      });
    };

    const delegateTx = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
      buildDelegateIx(COMPONENT_PLANET_ID,    planetPda),
      buildDelegateIx(COMPONENT_RESOURCES_ID, resourcesPda),
      buildDelegateIx(COMPONENT_FLEET_ID,     fleetPda),
    );

    // Delegation goes to base layer — one final wallet popup
    await this.provider.sendAndConfirm(delegateTx, []);
    console.log("[SESSION] Components delegated to ER");

    // ── Step 4: Activate session with burner ───────────────────────────────────
    this.erSigner     = burner;
    this.sessionActive = true;
    console.log("[SESSION] Started — all actions now instant, no wallet popups");
  }

  async endSession(worldPda: PublicKey, entityPda: PublicKey): Promise<void> {
    const payer = this.provider.wallet.publicKey;
    const { planetPda, resourcesPda, fleetPda } = deriveComponentPdas(entityPda);

    // The SDK does not export createUndelegateInstruction.
    // For undelegation, we call the Delegation Program's "undelegate" instruction
    // directly. This must be sent to the ER RPC while accounts are still delegated —
    // the ER validator commits the final state to Solana and returns account ownership.
    //
    // Delegation Program undelegate instruction accounts:
    //   [0] delegation_record   (mut) — PDA: ["delegation", pda]
    //   [1] delegated_account   (mut) — the component PDA
    //   [2] owner_program             — component program ID
    //   [3] reimbursement       (mut) — receives freed rent
    //   [4] system_program

    // createUndelegateInstruction does NOT exist in either bolt-sdk or ephemeral-rollups-sdk
    // in your installed version. Build it manually from the Delegation Program IDL:
    //   discriminator = [3,0,0,0,0,0,0,0]
    //   accounts: validator(signer), delegated_account(mut), owner_program,
    //             delegation_record(mut), delegation_metadata(mut),
    //             commit_state_account, commit_record_account,
    //             rent_reimbursement(mut), fees_vault(mut), system_program
    //
    // Simplified devnet-compatible layout — ER validator triggers commit+undelegate
    // when it sees this instruction arrive on the ER RPC while accounts are delegated.
    const UNDELEGATE_DISC = Buffer.from([3, 0, 0, 0, 0, 0, 0, 0]);
    const SYSTEM_PROGRAM  = new PublicKey("11111111111111111111111111111111");

    const buildUndelegateIx = (
      componentProgramId: PublicKey,
      componentPda:       PublicKey,
    ): TransactionInstruction => {
      const delegationRecord = PublicKey.findProgramAddressSync(
        [Buffer.from("delegation"), componentPda.toBuffer()],
        DELEGATION_PROGRAM_ID,
      )[0];
      return new TransactionInstruction({
        programId: DELEGATION_PROGRAM_ID,
        keys: [
          { pubkey: payer,              isSigner: true,  isWritable: true  }, // validator/caller
          { pubkey: componentPda,       isSigner: false, isWritable: true  }, // delegated_account
          { pubkey: componentProgramId, isSigner: false, isWritable: false }, // owner_program
          { pubkey: delegationRecord,   isSigner: false, isWritable: true  }, // delegation_record
          { pubkey: payer,              isSigner: true,  isWritable: true  }, // rent_reimbursement
          { pubkey: SYSTEM_PROGRAM,     isSigner: false, isWritable: false }, // system_program
        ],
        data: UNDELEGATE_DISC,
      });
    };

    const tx = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }),
      buildUndelegateIx(COMPONENT_PLANET_ID,    planetPda),
      buildUndelegateIx(COMPONENT_RESOURCES_ID, resourcesPda),
      buildUndelegateIx(COMPONENT_FLEET_ID,     fleetPda),
    );

    // endSession is sent to the ER so it commits state, then undelegates.
    // sendTx will use the burner keypair for this since sessionActive is still true.
    await this.sendTx(tx, "end_session");

    // ── Recover remaining burner SOL back to player wallet ────────────────────
    if (this.erSigner) {
      try {
        const burnerBalance = await this.erConnection.getBalance(this.erSigner.publicKey);
        const rentExempt    = 890_880; // ~min rent for 0-byte account
        const refund        = burnerBalance - rentExempt - 5000; // leave enough for fees
        if (refund > 0) {
          const recoverTx = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: this.erSigner.publicKey,
              toPubkey:   this.provider.wallet.publicKey,
              lamports:   refund,
            }),
          );
          const { blockhash, lastValidBlockHeight } = await this.erConnection.getLatestBlockhash("confirmed");
          recoverTx.recentBlockhash = blockhash;
          recoverTx.feePayer        = this.erSigner.publicKey;
          recoverTx.sign(this.erSigner);
          const recoverSig = await this.erConnection.sendRawTransaction(recoverTx.serialize());
          await this.erConnection.confirmTransaction(
            { signature: recoverSig, blockhash, lastValidBlockHeight },
            "confirmed"
          );
          console.log("[SESSION] Recovered burner SOL:", refund / 1e9, "SOL");
        }
      } catch (e) {
        console.warn("[SESSION] Burner SOL recovery failed (non-critical):", e);
      }
    }

    this.erSigner      = null;
    this.sessionActive = false;
    console.log("[SESSION] Ended — state committed to Solana");
  }

  // ── Planet lookup ──────────────────────────────────────────────────────────

  async findExistingPlanet(owner: PublicKey): Promise<GameAddresses | null> {
    console.log("[LOOKUP] Pure on-chain scan for wallet:", owner.toBase58());
    const worldPda = new PublicKey(SHARED_WORLD_PDA_STR);

    // ── Strategy A: memcmp scan on creator field (offset 8) ──────────────────
    // Planet layout: disc(8) + creator(32) + entity(32) + owner(32) + ...
    // creator = the wallet that called initializeWorld.
    const ownerB58 = owner.toBase58();
    let allMatches: { pubkey: PublicKey; dataLen: number; data: Buffer }[] = [];
    try {
      const accounts = await this.connection.getProgramAccounts(COMPONENT_PLANET_ID, {
        commitment: "confirmed",
        filters: [
          { memcmp: { offset: 8, bytes: ownerB58 } }, // creator at offset 8
        ],
      });
      console.log("[LOOKUP] Creator-match accounts:", accounts.length);
      allMatches = accounts.map(a => ({
        pubkey:  a.pubkey,
        dataLen: a.account.data.length,
        data:    a.account.data as Buffer,
      }));
    } catch {}

    // Also try owner field at offset 8+32+32 = 72 (in case creator != owner)
    if (allMatches.length === 0) {
      try {
        const accounts = await this.connection.getProgramAccounts(COMPONENT_PLANET_ID, {
          commitment: "confirmed",
          filters: [
            { memcmp: { offset: 72, bytes: ownerB58 } }, // owner at offset 72
          ],
        });
        console.log("[LOOKUP] Owner-field accounts:", accounts.length);
        allMatches = accounts.map(a => ({
          pubkey:  a.pubkey,
          dataLen: a.account.data.length,
          data:    a.account.data as Buffer,
        }));
      } catch {}
    }

    // Sort largest first — newer layout with entity field is bigger
    allMatches.sort((a, b) => b.dataLen - a.dataLen);

    if (allMatches.length === 0) {
      console.log("[LOOKUP] No planet found for wallet");
      return null;
    }

    for (const { pubkey: planetPda, dataLen, data } of allMatches) {
      console.log("[LOOKUP] Planet PDA:", planetPda.toBase58(), "size:", dataLen);

      // ── Path A: entity PDA embedded in planet account (offset 40, new layout) ─
      // Layout: disc(8) + creator(32) + entity(32) → entity at bytes [40..72]
      if (dataLen >= 72 && data) {
        try {
          const entityFromChain = new PublicKey(data.slice(40, 72));
          // Validate by re-deriving the planet PDA from this entity
          const { planetPda: derived, resourcesPda, fleetPda } = deriveComponentPdas(entityFromChain);
          if (derived.equals(planetPda)) {
            console.log("[LOOKUP] ✓ Entity from on-chain field:", entityFromChain.toBase58());
            return { worldPda, entityPda: entityFromChain, planetPda, resourcesPda, fleetPda };
          }
        } catch {}
      }

      // ── Path B: brute-force scan BOLT World entity accounts (dataSize=48) ───
      // Entity account layout: disc(8) + id(u64=8) + world(Pubkey=32) = 48 bytes
      console.log("[LOOKUP] Falling back to World entity scan...");
      try {
        const WORLD_PROGRAM_ID = new PublicKey("WorLD15A7CrDwLcLy4fRqtaTb9fbd8o8iqiEMUDse2n");
        const worldAccounts = await this.connection.getProgramAccounts(WORLD_PROGRAM_ID, {
          commitment: "confirmed",
          filters: [{ dataSize: 48 }],
        });
        console.log("[LOOKUP] World entity candidates:", worldAccounts.length);
        for (const { pubkey: candidate } of worldAccounts) {
          const { planetPda: derived, resourcesPda, fleetPda } = deriveComponentPdas(candidate);
          if (derived.equals(planetPda)) {
            console.log("[LOOKUP] ✓ World entity match:", candidate.toBase58());
            return { worldPda, entityPda: candidate, planetPda, resourcesPda, fleetPda };
          }
        }
      } catch (e) {
        console.error("[LOOKUP] World entity scan failed:", e);
      }
    }

    console.error("[LOOKUP] No recoverable entity PDA found.");
    return null;
  }

  // ── World initialization ───────────────────────────────────────────────────

  async initializeWorld(planetName = "Homeworld"): Promise<GameAddresses> {
    const payer    = this.provider.wallet.publicKey;
    const worldPda = new PublicKey(SHARED_WORLD_PDA_STR);

    console.log(`[INIT] Creating planet "${planetName}" | Payer: ${payer.toBase58()}`);

    // Tx 1: Create entity
    console.log("[1] Adding entity...");
    const addEntityResult = await AddEntity({ payer, world: worldPda, connection: this.connection });
    const entityTx = addEntityResult.transaction;
    entityTx.recentBlockhash = (await this.connection.getLatestBlockhash("confirmed")).blockhash;
    const entitySig = await this.provider.sendAndConfirm(entityTx, []);
    console.log("[1] Entity created:", entitySig);

    const txDetails = await this.connection.getParsedTransaction(entitySig, {
      maxSupportedTransactionVersion: 0, commitment: "confirmed",
    });
    if (!txDetails?.meta || !txDetails.transaction) throw new Error("Failed to fetch entity tx");

    const accountKeys  = txDetails.transaction.message.accountKeys;
    const preBalances  = txDetails.meta.preBalances  || [];
    const postBalances = txDetails.meta.postBalances || [];
    let entityPda: PublicKey | null = null;
    for (let i = 0; i < accountKeys.length; i++) {
      if (accountKeys[i].pubkey.equals(payer)) continue;
      if ((postBalances[i] || 0) - (preBalances[i] || 0) > 0.0005 * LAMPORTS_PER_SOL) {
        entityPda = accountKeys[i].pubkey; break;
      }
    }
    if (!entityPda) throw new Error("Could not find entity PDA in tx");
    console.log("[1] Entity PDA:", entityPda.toBase58());

    // Tx 2: Initialize components (must confirm before system call)
    console.log("[2] Initializing components...");
    const planetInit    = await InitializeComponent({ payer, entity: entityPda, componentId: COMPONENT_PLANET_ID    });
    const resourcesInit = await InitializeComponent({ payer, entity: entityPda, componentId: COMPONENT_RESOURCES_ID });
    const fleetInit     = await InitializeComponent({ payer, entity: entityPda, componentId: COMPONENT_FLEET_ID     });

    const planetPda    = planetInit.componentPda;
    const resourcesPda = resourcesInit.componentPda;
    const fleetPda     = fleetInit.componentPda;
    console.log("[2] Planet PDA:",    planetPda.toBase58());
    console.log("[2] Resources PDA:", resourcesPda.toBase58());
    console.log("[2] Fleet PDA:",     fleetPda.toBase58());

    const initTx = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
      planetInit.transaction.instructions[0],
      resourcesInit.transaction.instructions[0],
      fleetInit.transaction.instructions[0],
    );
    const initSig = await this.provider.sendAndConfirm(initTx, []);
    console.log("[2] Components confirmed:", initSig);

    // Tx 3: system_initialize — set creator, entity, owner, coordinates, resources
    // Args layout (64 bytes):
    //   [0..8]   now: i64
    //   [8..10]  galaxy: u16 (0 = derive from pubkey)
    //   [10..12] system: u16
    //   [12]     position: u8
    //   [13..32] name: 19 bytes UTF-8
    //   [32..64] entity_pda: 32 bytes (stored on-chain for cache-free reconnect)
    console.log("[3] Running system_initialize...");
    const nameBytes = Buffer.from(planetName.slice(0, 19), "utf8");
    const args      = Buffer.alloc(64, 0);
    args.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000)), 0);
    nameBytes.copy(args, 13);
    entityPda.toBuffer().copy(args, 32);

    const { transaction: initSysTx } = await ApplySystem({
      authority: payer,
      systemId:  SYSTEM_INITIALIZE_ID,
      world:     worldPda,
      entities: [{
        entity: entityPda,
        components: [
          { componentId: COMPONENT_PLANET_ID    },
          { componentId: COMPONENT_RESOURCES_ID },
          { componentId: COMPONENT_FLEET_ID     },
        ],
      }],
      args: [],
    });

    const sysTx = new Transaction().add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
      patchApplyArgs(initSysTx.instructions[0], args),
    );
    const sig = await this.provider.sendAndConfirm(sysTx, []);
    console.log("[3] system_initialize confirmed:", sig);

    const addresses: GameAddresses = { worldPda, entityPda, planetPda, resourcesPda, fleetPda };
    this.currentAddresses = addresses;
    console.log("🎉 Planet created! PDA:", planetPda.toBase58());
    return addresses;
  }

  getAddresses(): GameAddresses | null { return this.currentAddresses; }

  // ── Fetch ──────────────────────────────────────────────────────────────────

  async fetchPlanet(planetPda: PublicKey): Promise<OnChainPlanet | null> {
    console.log("[FETCH] Planet:", planetPda.toBase58());
    try {
      const raw = await (this.planetProg.account as any)["planet"].fetch(planetPda) as any;
      const bn  = (v: any): number => v instanceof BN ? v.toNumber() : Number(v);
      return {
        creator: raw.creator as PublicKey,
        entity:  raw.entity  as PublicKey,
        owner:   raw.owner   as PublicKey,
        name: Buffer.from(raw.name).toString("utf8").replace(/\0/g, "").trim() || "Homeworld",
        galaxy: raw.galaxy, system: raw.system, position: raw.position,
        diameter: raw.diameter || 12800, temperature: raw.temperature,
        maxFields: raw.maxFields || 163, usedFields: raw.usedFields || 0,
        metalMine: raw.metalMine, crystalMine: raw.crystalMine,
        deuteriumSynthesizer: raw.deuteriumSynthesizer, solarPlant: raw.solarPlant,
        fusionReactor: raw.fusionReactor, roboticsFactory: raw.roboticsFactory,
        naniteFactory: raw.naniteFactory, shipyard: raw.shipyard,
        metalStorage: raw.metalStorage, crystalStorage: raw.crystalStorage,
        deuteriumTank: raw.deuteriumTank, researchLab: raw.researchLab,
        missileSilo: raw.missileSilo, buildQueueItem: raw.buildQueueItem,
        buildQueueTarget: raw.buildQueueTarget, buildFinishTs: bn(raw.buildFinishTs),
      };
    } catch (e) {
      console.error("[FETCH] Planet failed:", e);
      return null;
    }
  }

  async fetchResources(pda: PublicKey): Promise<OnChainResources | null> {
    // When session is active, read from ER (most up-to-date state).
    // When not, read from base layer.
    const conn = this.sessionActive ? this.erConnection : this.connection;
    try {
      const account = await conn.getAccountInfo(pda);
      if (!account) return null;
      const data = account.data;
      // Layout: disc(8) + user fields + bolt_metadata(32 at end)
      const resources: OnChainResources = {
        metal:              new BN(data.slice(8,   16),  "le"),
        crystal:            new BN(data.slice(16,  24),  "le"),
        deuterium:          new BN(data.slice(24,  32),  "le"),
        metal_hour:         new BN(data.slice(32,  40),  "le"),
        crystal_hour:       new BN(data.slice(40,  48),  "le"),
        deuterium_hour:     new BN(data.slice(48,  56),  "le"),
        energy_production:  new BN(data.slice(56,  64),  "le"),
        energy_consumption: new BN(data.slice(64,  72),  "le"),
        metal_cap:          new BN(data.slice(72,  80),  "le"),
        crystal_cap:        new BN(data.slice(80,  88),  "le"),
        deuterium_cap:      new BN(data.slice(88,  96),  "le"),
        lastUpdateTs:       new BN(data.slice(96,  104), "le"),
      };
      // Sanity check: lastUpdateTs must be a valid Unix timestamp
      const nowSec = Math.floor(Date.now() / 1000);
      const tsRaw  = resources.lastUpdateTs;
      const tsValid = !tsRaw.ltn(0)
        && tsRaw.gt(new BN(1_577_836_800))
        && tsRaw.lt(new BN(nowSec + 86_400));
      if (!tsValid) {
        console.warn("[FETCH] lastUpdateTs corrupt:", tsRaw.toString(), "→ resetting to 0");
        resources.lastUpdateTs = new BN(0);
      }
      console.log("[FETCH] Resources:", {
        metal: resources.metal.toString(), crystal: resources.crystal.toString(),
        deuterium: resources.deuterium.toString(), lastUpdateTs: resources.lastUpdateTs.toString(),
      });
      return resources;
    } catch (err) {
      console.error("[FETCH] Resources failed:", err);
      return null;
    }
  }

  async fetchFleet(fleetPda: PublicKey): Promise<OnChainFleet | null> {
    console.log("[FETCH] Fleet:", fleetPda.toBase58());
    try {
      const raw = await (this.fleetProg.account as any)["fleet"].fetch(fleetPda) as any;
      const bn  = (v: any): number => v instanceof BN ? v.toNumber() : Number(v);
      const missions = (raw.missions || [])
        .filter((m: any) => m.missionType !== 0)
        .map((m: any) => ({
          missionType: m.missionType, destination: (m.destination as PublicKey).toBase58(),
          departTs: bn(m.departTs), arriveTs: bn(m.arriveTs), returnTs: bn(m.returnTs),
          sSmallCargo: m.sSmallCargo, sLargeCargo: m.sLargeCargo,
          sLightFighter: m.sLightFighter, sHeavyFighter: m.sHeavyFighter,
          sCruiser: m.sCruiser, sBattleship: m.sBattleship, sBattlecruiser: m.sBattlecruiser,
          sBomber: m.sBomber, sDestroyer: m.sDestroyer, sDeathstar: m.sDeathstar,
          sRecycler: m.sRecycler, sEspionageProbe: m.sEspionageProbe, sColonyShip: m.sColonyShip,
          cargoMetal: bn(m.cargoMetal), cargoCrystal: bn(m.cargoCrystal),
          cargoDeuterium: bn(m.cargoDeuterium), applied: m.applied,
        }));
      return {
        smallCargo: raw.smallCargo, largeCargo: raw.largeCargo,
        lightFighter: raw.lightFighter, heavyFighter: raw.heavyFighter,
        cruiser: raw.cruiser, battleship: raw.battleship, battlecruiser: raw.battlecruiser,
        bomber: raw.bomber, destroyer: raw.destroyer, deathstar: raw.deathstar,
        recycler: raw.recycler, espionageProbe: raw.espionageProbe,
        colonyShip: raw.colonyShip, solarSatellite: raw.solarSatellite,
        activeMissions: raw.activeMissions, missions,
      };
    } catch (e) {
      console.error("[FETCH] Fleet failed:", e);
      return null;
    }
  }

  // ── Galaxy scan ────────────────────────────────────────────────────────────

  async scanGalaxy(galaxy: number, system: number, myOwner?: PublicKey): Promise<GalaxyEntry[]> {
    console.log("[SCAN] Galaxy", galaxy, "system", system);
    try {
      const accounts = await this.connection.getProgramAccounts(COMPONENT_PLANET_ID, {
        commitment: "confirmed",
      });
      const results: GalaxyEntry[] = [];
      for (const { pubkey, account } of accounts) {
        try {
          const data = account.data;
          const isNewLayout = data.length >= 206;
          const isMidLayout = !isNewLayout && data.length >= 174;
          const ownerOff  = 8;
          const nameOff   = isNewLayout ? 104 : isMidLayout ? 72 : 40;
          const galaxyOff = isNewLayout ? 136 : isMidLayout ? 104 : 72;
          const systemOff = isNewLayout ? 138 : isMidLayout ? 106 : 74;
          const posOff    = isNewLayout ? 140 : isMidLayout ? 108 : 76;
          const mineOff   = isNewLayout ? 151 : isMidLayout ? 119 : 87;
          if (data.length < galaxyOff + 4) continue;
          const galaxyV = data.readUInt16LE(galaxyOff);
          const systemV = data.readUInt16LE(systemOff);
          if (galaxyV !== galaxy || systemV !== system) continue;
          const owner     = new PublicKey(data.slice(ownerOff, ownerOff + 32));
          const nameRaw   = data.slice(nameOff, nameOff + 32);
          const positionV = data.readUInt8(posOff);
          const metalMine = data.length > mineOff ? data.readUInt8(mineOff) : 0;
          const name      = Buffer.from(nameRaw).toString("utf8").replace(/\0/g, "").trim() || "Unknown";
          results.push({
            planetPda: pubkey.toBase58(), owner: owner.toBase58(), name,
            galaxy: galaxyV, system: systemV, position: positionV,
            metalMine, crystalMine: 0,
            isMe: myOwner ? owner.equals(myOwner) : false,
          });
        } catch {}
      }
      results.sort((a, b) => a.position - b.position);
      console.log("[SCAN] Found", results.length, "planets");
      return results;
    } catch (e) {
      console.error("[SCAN] Failed:", e);
      return [];
    }
  }

  // ── Game actions ───────────────────────────────────────────────────────────

  async startBuild(worldPda: PublicKey, entityPda: PublicKey, buildingIdx: number): Promise<string> {
    const args = Buffer.alloc(10);
    args.writeUInt8(0, 0);
    args.writeUInt8(buildingIdx, 1);
    args.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000)), 2);
    const { transaction: tx } = await ApplySystem({
      authority: this.provider.wallet.publicKey, systemId: SYSTEM_BUILD_ID, world: worldPda,
      entities: [{ entity: entityPda, components: [
        { componentId: COMPONENT_PLANET_ID }, { componentId: COMPONENT_RESOURCES_ID },
      ]}], args: [],
    });
    return this.sendTx(new Transaction().add(patchApplyArgs(tx.instructions[0], args)), "start_build");
  }

  async finishBuild(worldPda: PublicKey, entityPda: PublicKey): Promise<string> {
    const args = Buffer.alloc(10);
    args.writeUInt8(1, 0);
    args.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000)), 2);
    const { transaction: tx } = await ApplySystem({
      authority: this.provider.wallet.publicKey, systemId: SYSTEM_BUILD_ID, world: worldPda,
      entities: [{ entity: entityPda, components: [
        { componentId: COMPONENT_PLANET_ID }, { componentId: COMPONENT_RESOURCES_ID },
      ]}], args: [],
    });
    return this.sendTx(new Transaction().add(patchApplyArgs(tx.instructions[0], args)), "finish_build");
  }

  async buildShip(worldPda: PublicKey, entityPda: PublicKey, shipType: number, quantity: number): Promise<string> {
    const args = Buffer.alloc(13);
    args.writeUInt8(shipType, 0);
    args.writeUInt32LE(quantity, 1);
    args.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000)), 5);
    const { transaction: tx } = await ApplySystem({
      authority: this.provider.wallet.publicKey, systemId: SYSTEM_SHIPYARD_ID, world: worldPda,
      entities: [{ entity: entityPda, components: [
        { componentId: COMPONENT_FLEET_ID }, { componentId: COMPONENT_RESOURCES_ID },
      ]}], args: [],
    });
    return this.sendTx(new Transaction().add(patchApplyArgs(tx.instructions[0], args)), "build_ship");
  }

  async settleProduction(worldPda: PublicKey, entityPda: PublicKey): Promise<string> {
    const args = Buffer.alloc(8);
    args.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000)), 0);
    const { transaction: tx } = await ApplySystem({
      authority: this.provider.wallet.publicKey, systemId: SYSTEM_PRODUCE_ID, world: worldPda,
      entities: [{ entity: entityPda, components: [{ componentId: COMPONENT_RESOURCES_ID }] }],
      args: [],
    });
    return this.sendTx(new Transaction().add(patchApplyArgs(tx.instructions[0], args)), "settle");
  }

  async launchFleet(
    worldPda: PublicKey, entityPda: PublicKey,
    ships: { lf?:number; hf?:number; cr?:number; bs?:number; bc?:number;
             bm?:number; ds?:number; de?:number; sc?:number; lc?:number;
             rec?:number; ep?:number; col?:number },
    cargo: { metal?:number; crystal?:number; deuterium?:number },
    missionType: number, flightSeconds: number, speedFactor = 100,
  ): Promise<string> {
    const args = Buffer.alloc(94, 0);
    args.writeUInt8(missionType, 0);
    args.writeUInt32LE(ships.lf  ?? 0, 1);  args.writeUInt32LE(ships.hf  ?? 0, 5);
    args.writeUInt32LE(ships.cr  ?? 0, 9);  args.writeUInt32LE(ships.bs  ?? 0, 13);
    args.writeUInt32LE(ships.bc  ?? 0, 17); args.writeUInt32LE(ships.bm  ?? 0, 21);
    args.writeUInt32LE(ships.ds  ?? 0, 25); args.writeUInt32LE(ships.de  ?? 0, 29);
    args.writeUInt32LE(ships.sc  ?? 0, 33); args.writeUInt32LE(ships.lc  ?? 0, 37);
    args.writeUInt32LE(ships.rec ?? 0, 41); args.writeUInt32LE(ships.ep  ?? 0, 45);
    args.writeUInt32LE(ships.col ?? 0, 49);
    args.writeBigUInt64LE(BigInt(cargo.metal     ?? 0), 53);
    args.writeBigUInt64LE(BigInt(cargo.crystal   ?? 0), 61);
    args.writeBigUInt64LE(BigInt(cargo.deuterium ?? 0), 69);
    args.writeUInt8(speedFactor, 77);
    args.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000)), 78);
    args.writeBigInt64LE(BigInt(flightSeconds), 86);
    const { transaction: tx } = await ApplySystem({
      authority: this.provider.wallet.publicKey, systemId: SYSTEM_LAUNCH_ID, world: worldPda,
      entities: [{ entity: entityPda, components: [
        { componentId: COMPONENT_FLEET_ID }, { componentId: COMPONENT_RESOURCES_ID },
      ]}], args: [],
    });
    return this.sendTx(new Transaction().add(patchApplyArgs(tx.instructions[0], args)), "launch");
  }
}

// ── Pure utility functions ─────────────────────────────────────────────────────

export function formatNum(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return Math.floor(n).toLocaleString();
}

export function formatBig(n: BN | number, _decimals = 0): string {
  const val = n instanceof BN ? n : new BN(n);
  if (val.gte(new BN(1_000_000_000))) return val.div(new BN(1_000_000_000)).toString() + "B";
  if (val.gte(new BN(1_000_000)))     return val.div(new BN(1_000_000)).toString() + "M";
  if (val.gte(new BN(1_000)))         return val.div(new BN(1_000)).toString() + "K";
  return val.toString();
}

export function formatDuration(secs: number): string {
  secs = Math.max(0, Math.floor(secs));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return [h, m, s].map(v => String(v).padStart(2, "0")).join(":");
}

export function pendingProduction(res: OnChainResources, nowSec: number): { metal: BN; crystal: BN; deuterium: BN } {
  const nowBn = new BN(nowSec);
  const last  = res.lastUpdateTs;
  if (last.isZero() || nowBn.lte(last)) return { metal: res.metal, crystal: res.crystal, deuterium: res.deuterium };
  const dt  = nowBn.sub(last);
  let eff   = new BN(10000);
  if (!res.energy_consumption.isZero())
    eff = BN.min(res.energy_production.mul(new BN(10000)).div(res.energy_consumption), new BN(10000));
  const hr  = new BN(3600), sc = new BN(10000);
  return {
    metal:     BN.min(res.metal.add(res.metal_hour.mul(dt).mul(eff).div(hr).div(sc)),     res.metal_cap),
    crystal:   BN.min(res.crystal.add(res.crystal_hour.mul(dt).mul(eff).div(hr).div(sc)), res.crystal_cap),
    deuterium: BN.min(res.deuterium.add(res.deuterium_hour.mul(dt).mul(eff).div(hr).div(sc)), res.deuterium_cap),
  };
}

export function buildCost(idx: number, currentLevel: number) {
  const bases: [number,number,number][] = [
    [60,15,0],[48,24,0],[225,75,0],[75,30,0],[900,360,900],
    [400,120,200],[1_000_000,500_000,100_000],[400,200,100],
    [1000,0,0],[1000,500,0],[1000,1000,0],[200,400,200],[20,20,0],
  ];
  const [bm,bc,bd] = bases[idx] || [0,0,0];
  const mult = Math.pow(1.5, currentLevel);
  return { m: Math.round(bm*mult), c: Math.round(bc*mult), d: Math.round(bd*mult) };
}

export function buildSeconds(idx: number, level: number, robotics: number): number {
  const { m, c } = buildCost(idx, level - 1);
  return Math.max(1, Math.floor((m + c) / (5 * (1 + robotics))));
}

export function galaxyDistance(g1:number,s1:number,p1:number,g2:number,s2:number,p2:number): number {
  if (g1 !== g2) return 20_000 + Math.abs(g1-g2)*40_000;
  if (s1 !== s2) return 2_700  + Math.abs(s1-s2)*95;
  return 1_000 + Math.abs(p1-p2)*1_000;
}

export function estimateFlightSeconds(distance: number, baseSpeed: number, speedFactor: number): number {
  const speed = baseSpeed * speedFactor / 100;
  if (speed <= 0) return 86400;
  return Math.max(10, Math.floor((35_000/100) * Math.sqrt((10*distance)/speed) + 10));
}
