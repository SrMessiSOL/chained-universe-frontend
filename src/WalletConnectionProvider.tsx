import React, { type PropsWithChildren, useMemo } from "react";
import { Capacitor } from "@capacitor/core";
import type { Adapter } from "@solana/wallet-adapter-base";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import NativeMobileWalletAdapter from "./NativeMobileWalletAdapter";

const RPC_ENDPOINT = "https://api.devnet.solana.com";

/**
 * Returns true when running inside a Capacitor native Android shell (APK).
 * This covers both the standard `isNativePlatform()` check AND the
 * Android WebView user-agent fallback for older Capacitor setups.
 */
function isNativeAndroid(): boolean {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
    return true;
  }
  // Capacitor WebView injects "CapacitorAndroid" into the UA on some builds
  if (typeof navigator !== "undefined") {
    const ua = navigator.userAgent ?? "";
    if (/CapacitorAndroid/i.test(ua)) return true;
  }
  return false;
}

const WalletLayer: React.FC<PropsWithChildren> = ({ children }) => {
  const wallets = useMemo<Adapter[]>(() => {
    if (isNativeAndroid()) {
      // On native Android APK only use MWA — browser extension adapters
      // will never be injected into a Capacitor WebView and their presence
      // causes the wallet selector to show unusable options.
      return [new NativeMobileWalletAdapter()];
    }

    // Browser (desktop + mobile browsers): use standard extension adapters.
    // Phantom and Solflare each detect whether their extension is present via
    // WalletReadyState; WalletConnectControl already filters out uninstalled ones.
    return [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ];
  }, []);

  return (
    <ConnectionProvider endpoint={RPC_ENDPOINT}>
      {/*
       * autoConnect: true is intentional — on reconnect the adapter will
       * attempt to reuse a cached session without a new popup.
       * On MWA this triggers the wallet app association handshake on mount,
       * which is the desired UX for a native app.
       */}
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};

export const WalletConnectionProvider: React.FC<PropsWithChildren> = ({ children }) => (
  <WalletLayer>{children}</WalletLayer>
);

export default WalletConnectionProvider;
