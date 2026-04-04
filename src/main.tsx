import React from "react";
import ReactDOM from "react-dom/client";
import { Buffer } from "buffer";
import process from "process";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./index.css";

if (!(globalThis as any).Buffer) (globalThis as any).Buffer = Buffer;
if (!(globalThis as any).process) (globalThis as any).process = process;

const wallets = [new PhantomWalletAdapter(), new SolflareWalletAdapter()];

async function bootstrap() {
  const { default: App } = await import("./App");

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ConnectionProvider endpoint="https://api.devnet.solana.com">
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>
            <App />
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </React.StrictMode>
  );
}

bootstrap();
