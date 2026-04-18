import React from "react";
import ReactDOM from "react-dom/client";
import { Buffer } from "buffer";
import process from "process";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./index.css";
import WalletConnectionProvider from "./WalletConnectionProvider";

if (!(globalThis as any).Buffer) (globalThis as any).Buffer = Buffer;
if (!(globalThis as any).process) (globalThis as any).process = process;

async function bootstrap() {
  const { default: App } = await import("./App");

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <WalletConnectionProvider>
        <App />
      </WalletConnectionProvider>
    </React.StrictMode>
  );
}

bootstrap();
