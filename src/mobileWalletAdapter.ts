import {
  createDefaultAuthorizationCache,
  registerMwa,
} from "@solana-mobile/wallet-standard-mobile";

const PUBLIC_APP_URL = ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_PUBLIC_APP_URL
  || "https://chained-universe.vercel.app");

const APP_NAME = "GAMESOL";
const APP_DESCRIPTION = "On-chain space strategy on Solana devnet";
const DEVNET_CHAIN = "solana:devnet";
export const MOBILE_WALLET_STATUS_EVENT = "chained-universe:mobile-wallet-status";

let hasRegisteredMwa = false;

function buildAppIconUrl() {
  try {
    return new URL("/favicon.ico", PUBLIC_APP_URL).toString();
  } catch {
    return "https://chained-universe.vercel.app/favicon.ico";
  }
}

function shouldRegisterMwa() {
  if (typeof window === "undefined") return false;
  return /android/i.test(window.navigator.userAgent);
}

export function registerMobileWalletAdapter() {
  if (hasRegisteredMwa || !shouldRegisterMwa()) return;

  registerMwa({
    appIdentity: {
      name: APP_NAME,
      uri: PUBLIC_APP_URL,
      icon: buildAppIconUrl(),
    },
    authorizationCache: createDefaultAuthorizationCache(),
    chains: [DEVNET_CHAIN],
    chainSelector: {
      select: async chains => chains.find(chain => chain === DEVNET_CHAIN) ?? chains[0],
    },
    onWalletNotFound: async () => {
      window.dispatchEvent(new CustomEvent(MOBILE_WALLET_STATUS_EVENT, {
        detail: {
          code: "wallet_not_found",
          message: "No Solana Mobile Wallet Adapter wallet responded on this device.",
        },
      }));
    },
  });

  hasRegisteredMwa = true;
}

export { APP_DESCRIPTION, APP_NAME, DEVNET_CHAIN, PUBLIC_APP_URL };
