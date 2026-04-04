import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

import { Connection, Keypair, SendTransactionError } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { InitializeNewWorld } from "@magicblock-labs/bolt-sdk";

function getDefaultKeypairPath() {
  if (process.env.KEYPAIR) return process.env.KEYPAIR;

  try {
    const out = execSync("solana config get", { stdio: ["ignore", "pipe", "ignore"] }).toString();
    const match = out.match(/Keypair Path:\s*(.+)/i);
    if (match?.[1]) return match[1].trim();
  } catch {
    // ignore and fallback below
  }

  return path.join(os.homedir(), ".config", "solana", "id.json");
}

async function main() {
  const rpc = process.env.RPC_URL || "https://api.devnet.solana.com";
  const keypairPath = getDefaultKeypairPath();

  const secret = Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, "utf8")));
  const kp = Keypair.fromSecretKey(secret);

  const connection = new Connection(rpc, "confirmed");
  const wallet = new Wallet(kp);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

  const balance = await connection.getBalance(kp.publicKey, "confirmed");

  console.log("RPC:", rpc);
  console.log("Keypair:", keypairPath);
  console.log("Payer:", kp.publicKey.toBase58());
  console.log("Balance:", (balance / 1e9).toFixed(4), "SOL");

  if (balance < 0.05 * 1e9) {
    throw new Error("Payer has low balance. Fund this exact payer on devnet before initializing world.");
  }

  const { transaction, worldPda } = await InitializeNewWorld({
    payer: kp.publicKey,
    connection,
  });

  const sig = await provider.sendAndConfirm(transaction, [], { commitment: "confirmed" });

  console.log("\n✅ Shared world initialized");
  console.log("World PDA:", worldPda.toBase58());
  console.log("Tx:", sig);
  console.log("\nSet this in your frontend .env:");
  console.log(`VITE_SHARED_WORLD_PDA=${worldPda.toBase58()}`);
}

main().catch(async (err) => {
  console.error("\n❌ Failed to initialize shared world");
  console.error(err?.message || err);

  if (err instanceof SendTransactionError) {
    try {
      const logs = await err.getLogs();
      if (logs?.length) {
        console.error("\nTransaction logs:");
        for (const line of logs) console.error(line);
      }
    } catch {
      // ignore log fetch failures
    }
  }

  process.exit(1);
});