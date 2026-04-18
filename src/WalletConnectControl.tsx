import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import type { WalletName } from "@solana/wallet-adapter-base";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { useWallet } from "@solana/wallet-adapter-react";

type ProviderWindow = Window & {
  phantom?: { solana?: { isPhantom?: boolean } };
  solana?: { isPhantom?: boolean };
  solflare?: { isSolflare?: boolean };
  SolflareApp?: unknown;
};

type AdapterWalletOption = {
  kind: "adapter";
  name: WalletName<string>;
  label: string;
  icon: string;
};

type WalletStatusState = {
  tone: "info" | "warn" | "danger";
  text: string;
} | null;

const MOBILE_WALLET_ADAPTER_NAME = "Mobile Wallet Adapter";
const REMOTE_MOBILE_WALLET_ADAPTER_NAME = "Remote Mobile Wallet Adapter";

// Always hide these — they are internal/debugging adapters
const ALWAYS_HIDDEN_WALLET_NAMES = new Set([REMOTE_MOBILE_WALLET_ADAPTER_NAME]);

const PREFERRED_WALLET_STORAGE_KEY = "chained-universe:preferred-wallet";
const LAST_CONNECTED_ADDRESS_STORAGE_KEY = "chained-universe:last-wallet-address";

function getProviderWindow(): ProviderWindow {
  return window as ProviderWindow;
}

function hasInjectedPhantom(): boolean {
  const w = getProviderWindow();
  return !!(w.phantom?.solana?.isPhantom || w.solana?.isPhantom);
}

function hasInjectedSolflare(): boolean {
  const w = getProviderWindow();
  return !!(w.solflare?.isSolflare || w.SolflareApp);
}

/**
 * Returns true when running inside a Capacitor native Android shell.
 * Mirrors the same logic in WalletConnectionProvider so both files agree.
 */
function isNativeAndroid(): boolean {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") return true;
  if (typeof navigator !== "undefined") {
    if (/CapacitorAndroid/i.test(navigator.userAgent ?? "")) return true;
  }
  return false;
}

/**
 * Returns true when running in a plain Android browser (not Capacitor).
 * Used to prefer MWA in the browser wallet list on Android.
 */
function isAndroidBrowser(): boolean {
  if (isNativeAndroid()) return false; // native path handles its own adapter list
  return /android/i.test(typeof navigator !== "undefined" ? navigator.userAgent : "");
}

function shortenAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function readStoredWalletName(): string | null {
  try { return window.localStorage.getItem(PREFERRED_WALLET_STORAGE_KEY); }
  catch { return null; }
}

function storePreferredWallet(walletName: string | null): void {
  try {
    if (walletName) window.localStorage.setItem(PREFERRED_WALLET_STORAGE_KEY, walletName);
    else window.localStorage.removeItem(PREFERRED_WALLET_STORAGE_KEY);
  } catch { /* ignore */ }
}

function storeLastConnectedAddress(address: string | null): void {
  try {
    if (address) window.localStorage.setItem(LAST_CONNECTED_ADDRESS_STORAGE_KEY, address);
    else window.localStorage.removeItem(LAST_CONNECTED_ADDRESS_STORAGE_KEY);
  } catch { /* ignore */ }
}

function formatWalletError(error: unknown, isMobileRuntime: boolean): WalletStatusState {
  const rawMessage =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";
  const message = rawMessage.toLowerCase();

  if (!rawMessage) {
    return {
      tone: "danger",
      text: isMobileRuntime
        ? "Connection handoff failed. Re-open the wallet link and approve the session."
        : "Wallet connection failed. Try again.",
    };
  }
  if (message.includes("user rejected") || message.includes("declined") || message.includes("cancel")) {
    return { tone: "warn", text: "Connection request was dismissed." };
  }
  if (message.includes("wallet not found") || message.includes("not installed") || message.includes("not supported")) {
    return {
      tone: "warn",
      text: isMobileRuntime
        ? rawMessage
        : "No compatible wallet was detected in this browser.",
    };
  }
  if (message.includes("closed") || message.includes("timeout")) {
    return {
      tone: "warn",
      text: "Wallet handshake timed out. Open the wallet again and approve the request.",
    };
  }
  return { tone: "danger", text: rawMessage };
}

export const WalletConnectControl: React.FC = () => {
  const { wallets, wallet, connected, connecting, publicKey, select, connect, disconnect } = useWallet();

  const [open, setOpen] = useState(false);
  const [pendingWalletName, setPendingWalletName] = useState<WalletName<string> | null>(null);
  const [status, setStatus] = useState<WalletStatusState>(null);
  const [isCompactViewport, setIsCompactViewport] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false,
  );
  const menuRef = useRef<HTMLDivElement | null>(null);

  const nativeAndroid = isNativeAndroid();
  const androidBrowser = isAndroidBrowser();
  // "mobile runtime" = native APK or Android browser — affects copy + error messages
  const isMobileRuntime = nativeAndroid || androidBrowser;
  const useCenteredWalletModal = androidBrowser || isCompactViewport;

  // On native Android the WalletConnectionProvider only registers NativeMobileWalletAdapter,
  // so there will be exactly one adapter entry in `wallets`. We still go through the
  // standard flow so autoConnect + stored preference work correctly.
  const hasMWAOption = wallets.some(
    ({ adapter }) => adapter.name.toString() === MOBILE_WALLET_ADAPTER_NAME,
  );

  const adapterOptions = useMemo<AdapterWalletOption[]>(() => {
    return wallets
      .filter(({ adapter, readyState }) => {
        const label = adapter.name.toString();

        if (ALWAYS_HIDDEN_WALLET_NAMES.has(label)) return false;

        // On native Android only MWA is registered — show it always.
        if (nativeAndroid) return true;

        // On Android browser: prefer MWA if available; hide extension adapters.
        if (androidBrowser && hasMWAOption) {
          return label === MOBILE_WALLET_ADAPTER_NAME;
        }

        // Desktop / iOS browser: only show installed extension adapters.
        if (label === "Phantom") return readyState === WalletReadyState.Installed || hasInjectedPhantom();
        if (label === "Solflare") return readyState === WalletReadyState.Installed || hasInjectedSolflare();
        return readyState !== WalletReadyState.Unsupported;
      })
      .map(({ adapter }) => ({
        kind: "adapter" as const,
        name: adapter.name,
        label:
          adapter.name.toString() === MOBILE_WALLET_ADAPTER_NAME
            ? "Mobile Wallet Adapter"
            : adapter.name.toString(),
        icon: adapter.icon,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [wallets, nativeAndroid, androidBrowser, hasMWAOption]);

  // ── Auto-connect MWA on native Android ──────────────────────────────────────
  // When the app launches the WalletProvider's autoConnect will handle most cases,
  // but if there is no cached session we need to kick off the connect() call once
  // the adapter is selected so the MWA intent fires immediately.
  useEffect(() => {
    if (!nativeAndroid) return;
    if (connected || connecting || pendingWalletName) return;
    if (!wallets.length) return;

    // NativeMobileWalletAdapter is the only registered wallet — select it.
    const mwaAdapter = wallets.find(
      ({ adapter }) => adapter.name.toString() === MOBILE_WALLET_ADAPTER_NAME,
    );
    if (!mwaAdapter) return;

    // Only auto-trigger if it's not already selected
    if (wallet?.adapter.name === mwaAdapter.adapter.name) return;

    select(mwaAdapter.adapter.name);
    setPendingWalletName(mwaAdapter.adapter.name);
  }, [nativeAndroid, connected, connecting, pendingWalletName, wallets, wallet, select]);

  const connectToWallet = useCallback(
    (walletName: WalletName<string>) => {
      setStatus({
        tone: "info",
        text: isMobileRuntime
          ? "Opening wallet approval flow..."
          : `Preparing ${walletName.toString()}...`,
      });
      setOpen(false);
      setPendingWalletName(walletName);
      storePreferredWallet(walletName.toString());
      select(walletName);
    },
    [isMobileRuntime, select],
  );

  const handlePrimaryAction = useCallback(async () => {
    if (connected) {
      setStatus({ tone: "info", text: "Disconnecting wallet session..." });
      await disconnect();
      setOpen(false);
      return;
    }

    // On native Android the MWA connect is triggered by the pendingWalletName
    // useEffect above — tapping the button just re-triggers it.
    if (nativeAndroid) {
      const mwaAdapter = wallets.find(
        ({ adapter }) => adapter.name.toString() === MOBILE_WALLET_ADAPTER_NAME,
      );
      if (mwaAdapter) {
        connectToWallet(mwaAdapter.adapter.name);
      }
      return;
    }

    setStatus(null);
    setOpen((v) => !v);
  }, [connected, disconnect, nativeAndroid, wallets, connectToWallet]);

  // ── Persist connection state ─────────────────────────────────────────────────
  useEffect(() => {
    if (connected && publicKey) {
      storeLastConnectedAddress(publicKey.toBase58());
      if (wallet?.adapter.name) storePreferredWallet(wallet.adapter.name.toString());
      setStatus(isMobileRuntime ? null : {
        tone: "info",
        text: "Wallet linked.",
      });
      return;
    }
    storeLastConnectedAddress(null);
  }, [connected, isMobileRuntime, publicKey, wallet]);

  useEffect(() => {
    const handleResize = () => setIsCompactViewport(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // ── Restore preferred wallet on mount ───────────────────────────────────────
  useEffect(() => {
    if (!wallets.length || connected || wallet?.adapter.name) return;
    // On native Android skip stored preference — MWA autoConnect handles it.
    if (nativeAndroid) return;

    const preferredName = readStoredWalletName();
    if (!preferredName) return;
    const preferred = wallets.find(({ adapter }) => adapter.name.toString() === preferredName);
    if (preferred) select(preferred.adapter.name);
  }, [connected, nativeAndroid, select, wallet, wallets]);

  // ── Fire connect() once adapter is selected ──────────────────────────────────
  useEffect(() => {
    if (!pendingWalletName) return;
    if (wallet?.adapter.name !== pendingWalletName) return;

    let cancelled = false;
    void (async () => {
      try {
        await connect();
      } catch (error: unknown) {
        if (!cancelled) setStatus(formatWalletError(error, isMobileRuntime));
      } finally {
        if (!cancelled) setPendingWalletName(null);
      }
    })();

    return () => { cancelled = true; };
  }, [connect, isMobileRuntime, pendingWalletName, wallet]);

  // ── Close dropdown on outside click ─────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  const buttonLabel =
    connected && publicKey
      ? shortenAddress(publicKey.toBase58())
      : connecting || pendingWalletName
        ? "Linking..."
        : isMobileRuntime
          ? "Connect Wallet"
          : "Select Wallet";

  const statusColor =
    status?.tone === "danger"
      ? "var(--danger)"
      : status?.tone === "warn"
        ? "var(--warn)"
        : "rgba(200,214,229,0.72)";
  const showStatus = !!status && (!isMobileRuntime || !connected || status?.tone !== "info");

  return (
    <div style={{ position: "relative" }} ref={menuRef}>
      <button
        className="wallet-adapter-button wallet-adapter-button-trigger"
        type="button"
        onClick={() => void handlePrimaryAction()}
        disabled={connecting || !!pendingWalletName}
      >
        {buttonLabel}
      </button>

      {showStatus && (
        <div
          style={{
            marginTop: 6,
            maxWidth: 280,
            fontSize: 10,
            lineHeight: 1.45,
            letterSpacing: 0.4,
            color: statusColor,
            textAlign: "right",
          }}
        >
          {status.text}
        </div>
      )}

      {/* Wallet selector dropdown — only shown on non-native-Android */}
      {open && !connected && !nativeAndroid && (
        <>
          {useCenteredWalletModal && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(2, 6, 18, 0.72)",
                backdropFilter: "blur(10px)",
                zIndex: 999,
              }}
              onClick={() => setOpen(false)}
            />
          )}
          <div
            style={{
              position: useCenteredWalletModal ? "fixed" : "absolute",
              top: useCenteredWalletModal ? "50%" : "calc(100% + 8px)",
              right: useCenteredWalletModal ? "auto" : 0,
              left: useCenteredWalletModal ? "50%" : "auto",
              transform: useCenteredWalletModal ? "translate(-50%, -50%)" : "none",
              width: useCenteredWalletModal ? "min(320px, calc(100vw - 32px))" : "auto",
              minWidth: useCenteredWalletModal ? "auto" : 260,
              background: "rgba(8,10,22,0.96)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 16,
              padding: useCenteredWalletModal ? 12 : 8,
              boxShadow: "0 16px 48px rgba(0,0,0,0.35)",
              zIndex: 1000,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                padding: "4px 12px 10px",
                color: "rgba(200,214,229,0.72)",
                fontSize: 10,
                letterSpacing: 1.2,
                textAlign: useCenteredWalletModal ? "center" : "left",
              }}
            >
              {androidBrowser ? "MOBILE WALLET ADAPTER" : "WALLET LINK"}
            </div>

            {adapterOptions.length > 0 ? (
              adapterOptions.map((option) => (
                <button
                  key={option.name.toString()}
                  type="button"
                  onClick={() => connectToWallet(option.name)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    border: "none",
                    borderRadius: 12,
                    background: "transparent",
                    color: "white",
                    padding: "12px",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <img src={option.icon} alt="" style={{ width: 20, height: 20, borderRadius: 4 }} />
                  <span>{option.label}</span>
                  <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--success)" }}>
                    Connect
                  </span>
                </button>
              ))
            ) : (
              <div
                style={{
                  color: "var(--warn)",
                  fontSize: 11,
                  lineHeight: 1.5,
                  padding: "8px 12px 4px",
                }}
              >
                {androidBrowser
                  ? "No compatible Mobile Wallet Adapter wallet is available in this browser."
                  : "No supported wallet is currently available in this browser."}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default WalletConnectControl;
