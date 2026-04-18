import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  BaseMessageSignerWalletAdapter,
  WalletConnectionError,
  WalletDisconnectedError,
  WalletNotReadyError,
  WalletPublicKeyError,
  WalletReadyState,
} from "@solana/wallet-adapter-base";
import type { WalletName } from "@solana/wallet-adapter-base";
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";

type NativeMwaState = {
  connected: boolean;
  publicKey?: string | null;
  accountLabel?: string | null;
  walletUriBase?: string | null;
};

type NativeMwaPlugin = {
  getState(): Promise<NativeMwaState>;
  connect(): Promise<NativeMwaState>;
  disconnect(): Promise<{ disconnected: boolean }>;
  signTransactions(options: { transactions: string[] }): Promise<{ transactions: string[]; connected: boolean }>;
  signMessage(options: { message: string }): Promise<{ signature: string; connected: boolean }>;
};

const MobileWalletAdapterPlugin = registerPlugin<NativeMwaPlugin>("MobileWalletAdapter");

const WALLET_NAME = "Mobile Wallet Adapter" as WalletName<"Mobile Wallet Adapter">;

function isAndroidNative() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

function bytesToBase64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(value: string) {
  return Uint8Array.from(Buffer.from(value, "base64"));
}

function deserializeSignedTransaction<T extends Transaction | VersionedTransaction>(
  original: T,
  bytes: Uint8Array,
): T {
  if (original instanceof VersionedTransaction) {
    return VersionedTransaction.deserialize(bytes) as T;
  }
  return Transaction.from(bytes) as T;
}

export class NativeMobileWalletAdapter extends BaseMessageSignerWalletAdapter<"Mobile Wallet Adapter"> {
  name = WALLET_NAME;
  url = "https://solanamobile.com/wallets";
  icon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop stop-color='%2300FFA3'/%3E%3Cstop offset='1' stop-color='%23DC1FFF'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='48' height='48' rx='12' fill='%230A0F1C'/%3E%3Cpath d='M11 16h26a3 3 0 010 6H11a3 3 0 010-6zm0 10h26a3 3 0 010 6H11a3 3 0 010-6zm0 10h26a3 3 0 010 6H11a3 3 0 010-6z' fill='url(%23g)'/%3E%3C/svg%3E";
  supportedTransactionVersions = null;

  private _publicKey: PublicKey | null = null;
  private _connecting = false;
  private _readyState = isAndroidNative() ? WalletReadyState.Loadable : WalletReadyState.Unsupported;

  get publicKey() {
    return this._publicKey;
  }

  get connecting() {
    return this._connecting;
  }

  get readyState() {
    return this._readyState;
  }

  async autoConnect(): Promise<void> {
    if (!isAndroidNative()) throw new WalletNotReadyError();
    const state = await MobileWalletAdapterPlugin.getState();
    if (!state.connected || !state.publicKey) return;

    this._publicKey = this.parsePublicKey(state.publicKey);
    this.emit("connect", this._publicKey);
  }

  async connect(): Promise<void> {
    if (!isAndroidNative()) throw new WalletNotReadyError();
    if (this.connected) return;

    this._connecting = true;
    try {
      const state = await MobileWalletAdapterPlugin.connect();
      if (!state.connected || !state.publicKey) {
        throw new WalletConnectionError("Mobile wallet connection did not return a public key.");
      }

      this._publicKey = this.parsePublicKey(state.publicKey);
      this.emit("connect", this._publicKey);
    } catch (error: any) {
      throw new WalletConnectionError(error?.message || "Failed to connect with Mobile Wallet Adapter", error);
    } finally {
      this._connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    if (!isAndroidNative()) return;

    try {
      await MobileWalletAdapterPlugin.disconnect();
    } finally {
      if (this._publicKey) {
        this._publicKey = null;
        this.emit("disconnect");
      }
    }
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> {
    const [signed] = await this.signAllTransactions([transaction]);
    return signed;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]> {
    if (!isAndroidNative()) throw new WalletNotReadyError();
    if (!this._publicKey) throw new WalletDisconnectedError();

    try {
      const serialized = transactions.map(transaction => (
        bytesToBase64(transaction.serialize({ requireAllSignatures: false, verifySignatures: false }))
      ));
      const result = await MobileWalletAdapterPlugin.signTransactions({ transactions: serialized });
      return result.transactions.map((value, index) => deserializeSignedTransaction(transactions[index], base64ToBytes(value)));
    } catch (error: any) {
      throw new WalletConnectionError(error?.message || "Failed to sign transaction", error);
    }
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    if (!isAndroidNative()) throw new WalletNotReadyError();
    if (!this._publicKey) throw new WalletDisconnectedError();

    try {
      const result = await MobileWalletAdapterPlugin.signMessage({ message: bytesToBase64(message) });
      return base64ToBytes(result.signature);
    } catch (error: any) {
      throw new WalletConnectionError(error?.message || "Failed to sign message", error);
    }
  }

  private parsePublicKey(rawPublicKey: string) {
    try {
      return new PublicKey(base64ToBytes(rawPublicKey));
    } catch (error) {
      throw new WalletPublicKeyError(error?.toString() || "Failed to decode public key");
    }
  }
}

export default NativeMobileWalletAdapter;
