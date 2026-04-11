/**
 * MarketTab.tsx
 *
 * P2P resource-for-ANTIMATTER market tab for Chained Universe / SolarGrid.
 *
 * Integration:
 *   1. Add `MarketClient` instance next to `GameClient` in App.tsx.
 *   2. Add `"market"` to the Tab union type and nav items.
 *   3. Render <MarketTab ... /> in the tab switch.
 *   4. Pass `antimatterBalance` (already tracked in App.tsx) as a prop.
 *
 * The component is fully self-contained: it manages its own offer list,
 * polling, and modal state. It calls back to App via `onTxStart/onTxEnd`
 * so the parent can show the global loading overlay.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import {
  MarketClient,
  MarketOffer,
  ResourceType,
  ANTIMATTER_SCALE,
  RESOURCE_LABELS,
  RESOURCE_COLORS,
  RESOURCE_ICONS,
  formatAm,
  formatResource,
  pricePerKDisplay,
  amRawFromDisplay,
  describeError,
  CreateOfferParams,
} from "./market-client";
import type { PlayerState, Resources } from "./game-state";

// ─── Types ─────────────────────────────────────────────────────────────────────

type MarketView = "buy" | "sell" | "myoffers";

interface MarketTabProps {
  /** Initialised MarketClient. Null if market program not yet deployed. */
  client: MarketClient | null;
  /** Current planet state — used to show resource holdings. */
  state: PlayerState | null;
  /** Live interpolated resources (from App.tsx). */
  liveRes: Resources | undefined;
  /** Raw ANTIMATTER balance of the connected wallet. */
  antimatterBalance: bigint;
  /** Called before each tx so App can show the loading overlay. */
  onTxStart: (label: string) => void;
  /** Called after each tx (success or fail). */
  onTxEnd: (error?: string) => void;
  /** Global tx busy flag — disables all buttons when true. */
  txBusy: boolean;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

const AntimatterIcon: React.FC<{ size?: number }> = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"
    style={{ display: "inline-block", verticalAlign: "middle" }}>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" opacity="0.9"/>
    <circle cx="12" cy="12" r="2.2" fill="currentColor"/>
    <ellipse cx="12" cy="12" rx="8" ry="3.2" stroke="currentColor" strokeWidth="1.4" opacity="0.8"/>
    <ellipse cx="12" cy="12" rx="3.2" ry="8" stroke="currentColor" strokeWidth="1.4" opacity="0.55" transform="rotate(35 12 12)"/>
  </svg>
);

const ResourcePill: React.FC<{ type: ResourceType; amount?: bigint; label?: string }> = ({ type, amount, label }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "2px 8px", borderRadius: 12,
    fontSize: 10, letterSpacing: 0.5,
    background: `${RESOURCE_COLORS[type]}18`,
    border: `1px solid ${RESOURCE_COLORS[type]}44`,
    color: RESOURCE_COLORS[type],
  }}>
    {RESOURCE_ICONS[type]}
    {label ?? RESOURCE_LABELS[type]}
    {amount !== undefined && <strong>{formatResource(amount)}</strong>}
  </span>
);

const AmPill: React.FC<{ amount: bigint; muted?: boolean }> = ({ amount, muted }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 5,
    padding: "2px 8px", borderRadius: 12,
    fontSize: 10, letterSpacing: 0.5,
    background: muted ? "rgba(255,214,10,0.05)" : "rgba(255,214,10,0.13)",
    border: "1px solid rgba(255,214,10,0.35)",
    color: "var(--warn)",
    fontFamily: "'Orbitron', sans-serif",
    fontWeight: 700,
  }}>
    <AntimatterIcon size={10}/>
    {formatAm(amount, 2)}
  </span>
);

// ─── Offer row card ────────────────────────────────────────────────────────────

const OfferCard: React.FC<{
  offer: MarketOffer;
  antimatterBalance: bigint;
  txBusy: boolean;
  onBuy: (offer: MarketOffer) => void;
  onCancel: (offer: MarketOffer) => void;
}> = ({ offer, antimatterBalance, txBusy, onBuy, onCancel }) => {
  const canBuy = antimatterBalance >= offer.priceAntimatter;
  const shortSeller = `${offer.seller.slice(0, 4)}...${offer.seller.slice(-4)}`;

  return (
    <div style={{
      background: "var(--panel)",
      border: `1px solid ${offer.isOwn ? "rgba(155,93,229,0.4)" : "var(--border)"}`,
      borderRadius: 4,
      padding: "12px 14px",
      display: "grid",
      gridTemplateColumns: "1fr auto",
      gap: 10,
      alignItems: "center",
      transition: "border-color 0.15s",
    }}>
      {/* Left info */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <ResourcePill type={offer.resourceType} amount={offer.resourceAmount}/>
          {offer.isOwn && (
            <span style={{
              fontSize: 9, letterSpacing: 1.5, padding: "2px 6px",
              border: "1px solid rgba(155,93,229,0.4)", borderRadius: 2,
              color: "var(--purple)", background: "rgba(155,93,229,0.08)",
            }}>YOUR OFFER</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <AmPill amount={offer.priceAntimatter}/>
          <span style={{ fontSize: 9, color: "var(--dim)", letterSpacing: 0.5 }}>
            {pricePerKDisplay(offer)} AM / 1k - by {shortSeller}
          </span>
        </div>
      </div>

      {/* Action */}
      <div>
        {offer.isOwn ? (
          <button
            onClick={() => onCancel(offer)}
            disabled={txBusy}
            style={{
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 10, letterSpacing: 1,
              padding: "7px 12px", borderRadius: 2,
              border: "1px solid rgba(255,0,110,0.4)",
              background: "rgba(255,0,110,0.06)",
              color: "var(--danger)", cursor: "pointer", transition: "all 0.15s",
            }}
          >
            CANCEL
          </button>
        ) : (
          <button
            onClick={() => onBuy(offer)}
            disabled={txBusy || !canBuy}
            title={!canBuy ? `Need ${formatAm(offer.priceAntimatter)} AM` : undefined}
            style={{
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 10, letterSpacing: 1,
              padding: "7px 12px", borderRadius: 2,
              border: canBuy ? "1px solid var(--cyan)" : "1px solid var(--border)",
              background: canBuy ? "rgba(0,245,212,0.08)" : "transparent",
              color: canBuy ? "var(--cyan)" : "var(--dim)",
              cursor: canBuy && !txBusy ? "pointer" : "not-allowed",
              transition: "all 0.15s",
            }}
          >
            BUY
          </button>
        )}
      </div>
    </div>
  );
};

// ─── Create Offer Modal ────────────────────────────────────────────────────────

const CreateOfferModal: React.FC<{
  liveRes: Resources | undefined;
  txBusy: boolean;
  onClose: () => void;
  onSubmit: (params: CreateOfferParams) => Promise<void>;
}> = ({ liveRes, txBusy, onClose, onSubmit }) => {
  const [resourceType, setResourceType] = useState<ResourceType>(ResourceType.Metal);
  const [amountStr, setAmountStr] = useState("");
  const [priceStr, setPriceStr] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  const available: Record<ResourceType, bigint> = {
    [ResourceType.Metal]:     liveRes?.metal     ?? 0n,
    [ResourceType.Crystal]:   liveRes?.crystal   ?? 0n,
    [ResourceType.Deuterium]: liveRes?.deuterium ?? 0n,
  };

  const parsedAmount = BigInt(Math.max(0, parseInt(amountStr) || 0));
  const parsedPrice  = amRawFromDisplay(parseFloat(priceStr) || 0);

  const exceedsAvailable = parsedAmount > available[resourceType];
  const tooSmall = parsedAmount < 1_000n && amountStr !== "";
  const priceTooLow = parsedPrice < ANTIMATTER_SCALE && priceStr !== "";
  const canSubmit = parsedAmount >= 1_000n && parsedPrice >= ANTIMATTER_SCALE && !exceedsAvailable && !submitting;

  const handleSubmit = async () => {
    setLocalErr(null);
    if (parsedAmount < 1_000n) { setLocalErr("Minimum amount is 1,000 resources."); return; }
    if (parsedPrice < ANTIMATTER_SCALE) { setLocalErr("Minimum price is 1.00 ANTIMATTER."); return; }
    if (exceedsAvailable) { setLocalErr("You don't have enough of that resource."); return; }
    setSubmitting(true);
    try {
      await onSubmit({ resourceType, resourceAmount: parsedAmount, priceAntimatter: parsedPrice });
      onClose();
    } catch (e) {
      setLocalErr(describeError(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(4,4,13,0.88)",
        zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center",
        backdropFilter: "blur(6px)",
      }}
      onClick={e => { if (e.target === e.currentTarget && !submitting) onClose(); }}
    >
      <div style={{
        background: "var(--panel)",
        border: "1px solid rgba(0,245,212,0.25)",
        borderRadius: "10px 10px 0 0",
        padding: "24px 20px",
        width: "100%",
        maxWidth: 520,
        maxHeight: "90dvh",
        overflowY: "auto",
        animation: "slideUp 0.22s ease",
      }}>
        {/* Handle */}
        <div style={{ width: 36, height: 3, background: "var(--border)", borderRadius: 2, margin: "0 auto 20px" }}/>

        <div style={{
          fontFamily: "'Orbitron', sans-serif", fontSize: 13, fontWeight: 700,
          letterSpacing: 3, color: "var(--cyan)", marginBottom: 20,
          paddingBottom: 10, borderBottom: "1px solid var(--border)",
        }}>
          + LIST A RESOURCE
        </div>

        {/* Resource type selector */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 9, letterSpacing: 2, color: "var(--dim)", textTransform: "uppercase", marginBottom: 8 }}>
            Resource Type
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {([ResourceType.Metal, ResourceType.Crystal, ResourceType.Deuterium] as const).map(rt => (
              <button
                key={rt}
                onClick={() => setResourceType(rt)}
                style={{
                  flex: 1, padding: "10px 8px",
                  border: `1px solid ${resourceType === rt ? RESOURCE_COLORS[rt] : "var(--border)"}`,
                  background: resourceType === rt ? `${RESOURCE_COLORS[rt]}18` : "transparent",
                  color: resourceType === rt ? RESOURCE_COLORS[rt] : "var(--dim)",
                  borderRadius: 3, cursor: "pointer", transition: "all 0.15s",
                  fontFamily: "'Share Tech Mono', monospace", fontSize: 11, letterSpacing: 1,
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
                }}
              >
                <span style={{ fontSize: 18 }}>{RESOURCE_ICONS[rt]}</span>
                <span>{RESOURCE_LABELS[rt]}</span>
                <span style={{ fontSize: 9, color: "var(--dim)" }}>
                  {formatResource(available[rt])} avail
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Amount */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 9, letterSpacing: 2, color: "var(--dim)", textTransform: "uppercase", marginBottom: 6 }}>
            Amount (min 1,000)
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="number" min={1000} step={1000}
              value={amountStr}
              onChange={e => setAmountStr(e.target.value)}
              placeholder="e.g. 50000"
              style={{
                flex: 1, padding: "10px 12px", borderRadius: 2,
                background: "rgba(0,0,0,0.4)",
                border: `1px solid ${tooSmall || exceedsAvailable ? "var(--danger)" : "var(--border)"}`,
                color: "var(--text)", fontFamily: "'Share Tech Mono', monospace", fontSize: 13,
              }}
            />
            <button
              onClick={() => setAmountStr(available[resourceType].toString())}
              style={{
                padding: "10px 12px", borderRadius: 2,
                border: "1px solid var(--border)", background: "transparent",
                color: "var(--dim)", cursor: "pointer", fontSize: 10, letterSpacing: 1,
                fontFamily: "'Share Tech Mono', monospace",
              }}
            >MAX</button>
          </div>
          {tooSmall && <div style={{ fontSize: 10, color: "var(--danger)", marginTop: 4 }}>Minimum 1,000</div>}
          {exceedsAvailable && <div style={{ fontSize: 10, color: "var(--danger)", marginTop: 4 }}>Exceeds available resources</div>}
        </div>

        {/* Price */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 9, letterSpacing: 2, color: "var(--dim)", textTransform: "uppercase", marginBottom: 6 }}>
            Total Price (ANTIMATTER tokens, min 1.0)
          </div>
          <input
            type="number" min={1} step={0.5}
            value={priceStr}
            onChange={e => setPriceStr(e.target.value)}
            placeholder="e.g. 5.0"
            style={{
              width: "100%", padding: "10px 12px", borderRadius: 2,
              background: "rgba(0,0,0,0.4)",
              border: `1px solid ${priceTooLow ? "var(--danger)" : "var(--border)"}`,
              color: "var(--text)", fontFamily: "'Share Tech Mono', monospace", fontSize: 13,
            }}
          />
          {priceTooLow && <div style={{ fontSize: 10, color: "var(--danger)", marginTop: 4 }}>Minimum 1.0 AM</div>}
        </div>

        {/* Preview */}
        {parsedAmount > 0n && parsedPrice > 0n && (
          <div style={{
            padding: "10px 14px", borderRadius: 3, marginBottom: 16,
            border: "1px solid rgba(0,245,212,0.18)",
            background: "rgba(0,245,212,0.04)",
            fontSize: 10, lineHeight: 1.8,
          }}>
            <div style={{ color: "var(--dim)" }}>Preview</div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Selling</span>
              <ResourcePill type={resourceType} amount={parsedAmount}/>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span>Asking</span>
              <AmPill amount={parsedPrice}/>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span>Rate</span>
              <span style={{ color: "var(--warn)", fontFamily: "'Orbitron', sans-serif", fontSize: 11 }}>
                {formatAm(parsedAmount > 0n ? (parsedPrice * 1000n) / parsedAmount : 0n)} AM / 1k
              </span>
            </div>
          </div>
        )}

        {localErr && <div style={{ color: "var(--danger)", fontSize: 10, marginBottom: 10, letterSpacing: 0.5 }}>{localErr}</div>}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onClose} disabled={submitting}
            style={{
              flex: 1, padding: "12px 16px", borderRadius: 2,
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--dim)", cursor: "pointer",
              fontFamily: "'Share Tech Mono', monospace", fontSize: 11, letterSpacing: 1,
            }}
          >CANCEL</button>
          <button
            onClick={() => void handleSubmit()}
            disabled={!canSubmit || txBusy}
            style={{
              flex: 2, padding: "12px 16px", borderRadius: 2,
              border: `1px solid ${canSubmit ? "var(--cyan)" : "var(--border)"}`,
              background: canSubmit ? "rgba(0,245,212,0.1)" : "transparent",
              color: canSubmit ? "var(--cyan)" : "var(--dim)",
              cursor: canSubmit && !txBusy ? "pointer" : "not-allowed",
              fontFamily: "'Share Tech Mono', monospace", fontSize: 11, letterSpacing: 1,
              transition: "all 0.15s",
            }}
          >
            {submitting ? "LISTING..." : "+ LIST OFFER"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Buy Confirm Modal ─────────────────────────────────────────────────────────

const BuyConfirmModal: React.FC<{
  offer: MarketOffer;
  antimatterBalance: bigint;
  txBusy: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}> = ({ offer, antimatterBalance, txBusy, onClose, onConfirm }) => {
  const [submitting, setSubmitting] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const canAfford = antimatterBalance >= offer.priceAntimatter;

  const handleConfirm = async () => {
    setLocalErr(null);
    setSubmitting(true);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setLocalErr(describeError(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(4,4,13,0.88)",
        zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center",
        backdropFilter: "blur(6px)",
      }}
      onClick={e => { if (e.target === e.currentTarget && !submitting) onClose(); }}
    >
      <div style={{
        background: "var(--panel)",
        border: "1px solid rgba(0,245,212,0.3)",
        borderRadius: 6, padding: "28px",
        width: "min(92vw, 420px)",
        animation: "fadeIn 0.18s ease",
      }}>
        <div style={{
          fontFamily: "'Orbitron', sans-serif", fontSize: 13, fontWeight: 700,
          letterSpacing: 3, color: "var(--cyan)", marginBottom: 20,
          paddingBottom: 10, borderBottom: "1px solid var(--border)",
        }}>
          CONFIRM PURCHASE
        </div>

        {/* Deal summary */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          {[
            { label: "You receive", node: <ResourcePill type={offer.resourceType} amount={offer.resourceAmount}/> },
            { label: "You pay", node: <AmPill amount={offer.priceAntimatter}/> },
            { label: "Rate", node: <span style={{ color: "var(--warn)", fontFamily: "'Orbitron', sans-serif", fontSize: 11 }}>{pricePerKDisplay(offer)} AM / 1k</span> },
            { label: "Seller", node: <span style={{ fontSize: 10, color: "var(--text)" }}>{offer.seller.slice(0, 8)}...{offer.seller.slice(-6)}</span> },
          ].map(({ label, node }) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(26,26,58,0.4)" }}>
              <span style={{ fontSize: 10, color: "var(--dim)" }}>{label}</span>
              {node}
            </div>
          ))}
        </div>

        {!canAfford && (
          <div style={{
            padding: "8px 12px", borderRadius: 3, marginBottom: 14,
            background: "rgba(255,0,110,0.08)", border: "1px solid rgba(255,0,110,0.3)",
            fontSize: 10, color: "var(--danger)", letterSpacing: 0.5,
          }}>
            Insufficient ANTIMATTER. You have {formatAm(antimatterBalance)} AM, need {formatAm(offer.priceAntimatter)} AM.
          </div>
        )}

        {localErr && <div style={{ color: "var(--danger)", fontSize: 10, marginBottom: 10 }}>{localErr}</div>}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onClose} disabled={submitting}
            style={{
              flex: 1, padding: "12px 16px", borderRadius: 2,
              border: "1px solid var(--border)", background: "transparent",
              color: "var(--dim)", cursor: "pointer",
              fontFamily: "'Share Tech Mono', monospace", fontSize: 11, letterSpacing: 1,
            }}
          >CANCEL</button>
          <button
            onClick={() => void handleConfirm()}
            disabled={!canAfford || submitting || txBusy}
            style={{
              flex: 2, padding: "12px 16px", borderRadius: 2,
              border: `1px solid ${canAfford ? "var(--cyan)" : "var(--border)"}`,
              background: canAfford ? "rgba(0,245,212,0.12)" : "transparent",
              color: canAfford ? "var(--cyan)" : "var(--dim)",
              cursor: canAfford && !submitting ? "pointer" : "not-allowed",
              fontFamily: "'Share Tech Mono', monospace", fontSize: 11, letterSpacing: 1,
            }}
          >
            {submitting ? "BUYING..." : "+ CONFIRM BUY"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Market Admin Card ────────────────────────────────────────────────────────

const MarketAdminCard: React.FC<{
  client: MarketClient | null;
  visible: boolean;
  config: import("./market-client").MarketConfig | null;
  escrowInitialized: boolean;
  mintInput: string;
  onMintInputChange: (v: string) => void;
  onSubmit: () => Promise<void>;
  onInitEscrow: () => Promise<void>;
  busy: boolean;
}> = ({ client, visible, config, escrowInitialized, mintInput, onMintInputChange, onSubmit, onInitEscrow, busy }) => {
  if (!visible) return null;
  return (
    <div style={{
      marginBottom: 20,
      padding: "14px 16px",
      background: "linear-gradient(180deg, rgba(255,214,10,0.06), rgba(11,11,30,0.92))",
      border: "1px solid rgba(255,214,10,0.35)",
      borderRadius: 4,
    }}>
      <div style={{
        fontFamily: "'Orbitron', sans-serif", fontSize: 11, fontWeight: 700,
        letterSpacing: 2, color: "var(--warn)", marginBottom: 12,
      }}>
        MARKET ADMIN
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--dim)", padding: "4px 0", borderBottom: "1px solid rgba(26,26,58,0.3)" }}>
          <span>Market Config</span>
          <span style={{ color: config ? "var(--success)" : "var(--warn)" }}>{config ? "INITIALIZED" : "NOT INITIALIZED"}</span>
        </div>
        {config && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--dim)", padding: "4px 0", borderBottom: "1px solid rgba(26,26,58,0.3)" }}>
              <span>ANTIMATTER Mint</span>
              <span style={{ color: "var(--text)", fontSize: 9 }}>{config.antimatterMint.slice(0, 8)}...{config.antimatterMint.slice(-6)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--dim)", padding: "4px 0", borderBottom: "1px solid rgba(26,26,58,0.3)" }}>
              <span>Escrow Account</span>
              <span style={{ color: escrowInitialized ? "var(--success)" : "var(--danger)" }}>
                {escrowInitialized ? "INITIALIZED" : "NOT INITIALIZED"}
              </span>
            </div>
          </>
        )}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
          <input
            type="text"
            value={mintInput}
            onChange={e => onMintInputChange(e.target.value.trim())}
            placeholder="ANTIMATTER mint address"
            disabled={busy}
            spellCheck={false}
            style={{
              flex: 1, padding: "7px 10px", borderRadius: 2,
              background: "rgba(0,0,0,0.4)", border: "1px solid var(--border)",
              color: "var(--text)", fontFamily: "'Share Tech Mono', monospace", fontSize: 11,
            }}
          />
          <button
            onClick={() => void onSubmit()}
            disabled={busy || !mintInput}
            style={{
              padding: "7px 14px", borderRadius: 2, cursor: "pointer",
              border: "1px solid var(--warn)", background: "rgba(255,214,10,0.1)",
              color: "var(--warn)", fontFamily: "'Share Tech Mono', monospace",
              fontSize: 10, letterSpacing: 1, whiteSpace: "nowrap",
              opacity: busy || !mintInput ? 0.4 : 1,
            }}
          >
            {config ? "UPDATE" : "INITIALIZE"}
          </button>
        </div>

        {/* Escrow initialization button - only show when market is initialized but escrow is not */}
        {config && !escrowInitialized && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10, color: "var(--danger)", marginBottom: 8, lineHeight: 1.6 }}>
              The escrow account is not initialized. You must initialize it before offers can be accepted.
            </div>
            <button
              onClick={() => void onInitEscrow()}
              disabled={busy}
              style={{
                width: "100%",
                padding: "10px 14px", borderRadius: 2, cursor: "pointer",
                border: "1px solid var(--cyan)", background: "rgba(0,245,212,0.1)",
                color: "var(--cyan)", fontFamily: "'Share Tech Mono', monospace",
                fontSize: 10, letterSpacing: 1,
                opacity: busy ? 0.4 : 1,
              }}
            >
              INITIALIZE ESCROW
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main MarketTab ────────────────────────────────────────────────────────────

const MarketTab: React.FC<MarketTabProps> = ({
  client,
  state,
  liveRes,
  antimatterBalance,
  onTxStart,
  onTxEnd,
  txBusy,
}) => {
  const [view, setView] = useState<MarketView>("buy");
  const [filterResource, setFilterResource] = useState<ResourceType | undefined>(undefined);
  const [offers, setOffers] = useState<MarketOffer[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [buyTarget, setBuyTarget] = useState<MarketOffer | null>(null);
  const [lastRefresh, setLastRefresh] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Market config state ──────────────────────────────────────────────────
  // undefined = loading, null = not initialized, MarketConfig = initialized
  const [marketConfig, setMarketConfig] = useState<import("./market-client").MarketConfig | null | undefined>(undefined);
  const [marketMintInput, setMarketMintInput] = useState("FAeZLeqohcxNBpwGrbYBLj2TavFqt4353mT6qY6Z7YFh");
  const [escrowInitialized, setEscrowInitialized] = useState(false);

  // Determine if connected wallet is the market admin
  const walletAddress = state?.planet.owner ?? "";
  const isAdmin = !!marketConfig && marketConfig.admin === walletAddress;
  // Also show admin card if market is not yet initialized (anyone can bootstrap on devnet)
  const showAdminCard = !marketConfig;

  // ── Market admin handler ──────────────────────────────────────────────────
  const handleInitializeMarket = useCallback(async () => {
    if (!client) return;
    let mint: PublicKey;
    try {
      mint = new PublicKey(marketMintInput);
    } catch {
      onTxEnd("Invalid mint address.");
      return;
    }
    onTxStart(marketConfig ? "Updating market config..." : "Initializing market...");
    try {
      if (marketConfig) {
        await client.updateMarketConfig(mint);
      } else {
        // Initialize market config
        await client.initializeMarket(mint);
        
        // Also initialize escrow after market
        onTxStart("Initializing escrow...");
        await client.initializeEscrow();
        setEscrowInitialized(true);
      }
      const cfg = await client.getMarketConfig();
      setMarketConfig(cfg);
      if (cfg) setMarketMintInput(cfg.antimatterMint);
      onTxEnd();
    } catch (e: any) {
      onTxEnd(describeError(e));
    }
  }, [client, marketConfig, marketMintInput, onTxStart, onTxEnd]);

  // ── Escrow initialization handler (for existing markets) ──────────────────
  const handleInitializeEscrow = useCallback(async () => {
    if (!client) return;
    onTxStart("Initializing escrow...");
    try {
      await client.initializeEscrow();
      setEscrowInitialized(true);
      onTxEnd();
    } catch (e: any) {
      onTxEnd(describeError(e));
    }
  }, [client, onTxStart, onTxEnd]);

  // ── Data fetching ────────────────────────────────────────────────────────────

  const fetchOffers = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    try {
      // Always re-check config so tab auto-activates after initialization
      const cfg = await client.getMarketConfig();
      setMarketConfig(cfg ?? null);
      if (cfg) setMarketMintInput(cfg.antimatterMint);

      // Check escrow status
      const escrowOk = await client.isEscrowInitialized();
      setEscrowInitialized(escrowOk);

      // Only fetch offers if market is initialized
      if (cfg) {
        const all = await client.fetchAllOffers(filterResource);
        setOffers(all);
      }
      setLastRefresh(Date.now());
    } catch {
      // silently ignore — polling will retry
    } finally {
      setLoading(false);
    }
  }, [client, filterResource]);

  useEffect(() => {
    void fetchOffers();
    pollRef.current = setInterval(() => void fetchOffers(), 8_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchOffers]);

  // Re-fetch when view changes to myoffers
  useEffect(() => {
    if (view === "myoffers") void fetchOffers();
  }, [view, fetchOffers]);

  // ── Filtered views ───────────────────────────────────────────────────────────

  const displayedOffers = useMemo(() => {
    if (view === "myoffers") return offers.filter(o => o.seller === walletAddress);
    if (view === "sell") return [];
    // buy: exclude own offers
    return offers.filter(o => o.seller !== walletAddress);
  }, [offers, view, walletAddress]);

  // ── Transaction handlers ─────────────────────────────────────────────────────

  const handleCreateOffer = async (params: CreateOfferParams) => {
    if (!client) return;
    if (!marketConfig) {
      onTxEnd("Market is not initialized yet. Initialize it first using the admin panel.");
      return;
    }
    onTxStart("Creating listing...");
    try {
      await client.createOffer(params);
      await fetchOffers();
      onTxEnd();
    } catch (e) {
      onTxEnd(describeError(e));
      throw e;
    }
  };

  const handleCancelOffer = async (offer: MarketOffer) => {
    if (!client) return;
    onTxStart("Cancelling offer...");
    try {
      await client.cancelOffer(offer);
      await fetchOffers();
      onTxEnd();
    } catch (e) {
      onTxEnd(describeError(e));
    }
  };

  const handleAcceptOffer = async (offer: MarketOffer) => {
    if (!client) return;
    onTxStart("Purchasing...");
    try {
      await client.acceptOffer(offer);
      await fetchOffers();
      onTxEnd();
    } catch (e) {
      onTxEnd(describeError(e));
      throw e;
    }
  };

  // ── Resource balance summary ─────────────────────────────────────────────────

  const resSummary: { type: ResourceType; amount: bigint }[] = [
    { type: ResourceType.Metal,     amount: liveRes?.metal     ?? 0n },
    { type: ResourceType.Crystal,   amount: liveRes?.crystal   ?? 0n },
    { type: ResourceType.Deuterium, amount: liveRes?.deuterium ?? 0n },
  ];

  // ── Market stats ─────────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const byType: Record<ResourceType, MarketOffer[]> = {
      [ResourceType.Metal]:     [],
      [ResourceType.Crystal]:   [],
      [ResourceType.Deuterium]: [],
    };
    for (const o of offers) {
      if (!o.filled && o.seller !== walletAddress) byType[o.resourceType].push(o);
    }
    return ([ResourceType.Metal, ResourceType.Crystal, ResourceType.Deuterium] as const).map(rt => {
      const list = byType[rt];
      const bestOffer = list.length > 0 ? list[0] : null; // already sorted asc
      return { type: rt, count: list.length, bestPricePerK: bestOffer?.pricePerUnit ?? null };
    });
  }, [offers, walletAddress]);

  // ── Render ───────────────────────────────────────────────────────────────────

  if (!client) {
    return (
      <div>
        <div className="section-title">P2P MARKET</div>
        <div style={{
          textAlign: "center", padding: "60px 20px",
          background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 4,
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>MARKET</div>
          <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 13, color: "var(--purple)", letterSpacing: 2, marginBottom: 8 }}>
            MARKET NOT DEPLOYED
          </div>
          <div style={{ fontSize: 11, color: "var(--dim)" }}>
            Deploy the market Anchor program and pass a MarketClient instance to this tab.
          </div>
        </div>
      </div>
    );
  }

  // ── Not initialized yet banner (loading state) ────────────────────────────
  const marketUninitialized = marketConfig === null; // null = loaded but not on-chain
  const marketLoading = marketConfig === undefined;  // undefined = still fetching

  return (
    <div>
      {/* ── Header ── */}
      <div className="section-title">P2P RESOURCE MARKET</div>

      {/* ── Market Admin Card — shown when not initialized OR to admin ── */}
      <MarketAdminCard
        client={client}
        visible={showAdminCard || isAdmin}
        config={marketConfig ?? null}
        escrowInitialized={escrowInitialized}
        mintInput={marketMintInput}
        onMintInputChange={setMarketMintInput}
        onSubmit={handleInitializeMarket}
        onInitEscrow={handleInitializeEscrow}
        busy={txBusy}
      />

      {/* ── Uninitialized notice for non-admins ── */}
      {marketUninitialized && !showAdminCard && (
        <div style={{
          padding: "14px 16px", marginBottom: 20, borderRadius: 4,
          background: "rgba(255,214,10,0.05)", border: "1px solid rgba(255,214,10,0.25)",
          fontSize: 11, color: "var(--warn)", letterSpacing: 0.5, lineHeight: 1.7,
        }}>
          The market has not been initialized yet. The game admin needs to call
          <strong> initialize_market</strong> with the ANTIMATTER mint address before trading is available.
        </div>
      )}

      {/* ── Loading state ── */}
      {marketLoading && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--dim)", fontSize: 11, animation: "pulse 2s ease-in-out infinite" }}>
          Loading market...
        </div>
      )}

      {/* ── Rest of UI — only shown when initialized ── */}
      {!marketLoading && !marketUninitialized && (<>

      {/* ── Balance strip ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 8, marginBottom: 20,
      }}>
        {resSummary.map(({ type, amount }) => (
          <div key={type} className="card" style={{ padding: "10px 12px" }}>
            <div className="card-label">{RESOURCE_ICONS[type]} {RESOURCE_LABELS[type]}</div>
            <div className="card-value" style={{ color: RESOURCE_COLORS[type], fontSize: 14 }}>
              {formatResource(amount)}
            </div>
          </div>
        ))}
        <div className="card" style={{
          padding: "10px 12px",
          background: "linear-gradient(135deg, rgba(255,214,10,0.08), rgba(11,11,30,0.9))",
          borderColor: "rgba(255,214,10,0.3)",
        }}>
          <div className="card-label" style={{ color: "rgba(255,214,10,0.7)" }}>
            <AntimatterIcon size={11}/> ANTIMATTER
          </div>
          <div className="card-value" style={{
            color: "var(--warn)", fontSize: 14,
            fontFamily: "'Orbitron', sans-serif",
          }}>
            {formatAm(antimatterBalance, 2)}
          </div>
        </div>
      </div>

      {/* ── Market price board ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 20,
        padding: "12px 14px",
        background: "rgba(8,8,22,0.7)",
        border: "1px solid var(--border)", borderRadius: 4,
      }}>
        {stats.map(s => (
          <div key={s.type} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, letterSpacing: 2, color: "var(--dim)", marginBottom: 4 }}>
              {RESOURCE_ICONS[s.type]} {RESOURCE_LABELS[s.type].toUpperCase()}
            </div>
            <div style={{
              fontFamily: "'Orbitron', sans-serif", fontSize: 13, fontWeight: 700,
              color: s.bestPricePerK !== null ? "var(--warn)" : "var(--border)",
            }}>
              {s.bestPricePerK !== null ? `${formatAm(s.bestPricePerK)} AM` : "-"}
            </div>
            <div style={{ fontSize: 9, color: "var(--dim)", marginTop: 2 }}>
              {s.count} offer{s.count !== 1 ? "s" : ""} - best/1k
            </div>
          </div>
        ))}
      </div>

      {/* ── Nav ── */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "1px solid var(--border)" }}>
        {([
          { id: "buy",      label: "BUY",        icon: "BUY" },
          { id: "sell",     label: "SELL",       icon: "SELL" },
          { id: "myoffers", label: "MY OFFERS",  icon: "OFFERS" },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setView(tab.id)}
            style={{
              flex: 1, padding: "10px 8px",
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: 10, letterSpacing: 1.5,
              textTransform: "uppercase",
              background: "transparent",
              border: "none",
              borderBottom: `2px solid ${view === tab.id ? "var(--cyan)" : "transparent"}`,
              color: view === tab.id ? "var(--cyan)" : "var(--dim)",
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Filter chips (buy only) ── */}
      {view === "buy" && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <button
            onClick={() => setFilterResource(undefined)}
            style={{
              padding: "4px 10px", borderRadius: 12,
              border: `1px solid ${filterResource === undefined ? "var(--cyan)" : "var(--border)"}`,
              background: filterResource === undefined ? "rgba(0,245,212,0.1)" : "transparent",
              color: filterResource === undefined ? "var(--cyan)" : "var(--dim)",
              cursor: "pointer", fontSize: 10, letterSpacing: 1,
              fontFamily: "'Share Tech Mono', monospace",
            }}
          >ALL</button>
          {([ResourceType.Metal, ResourceType.Crystal, ResourceType.Deuterium] as const).map(rt => (
            <button
              key={rt}
              onClick={() => setFilterResource(prev => prev === rt ? undefined : rt)}
              style={{
                padding: "4px 10px", borderRadius: 12,
                border: `1px solid ${filterResource === rt ? RESOURCE_COLORS[rt] : "var(--border)"}`,
                background: filterResource === rt ? `${RESOURCE_COLORS[rt]}18` : "transparent",
                color: filterResource === rt ? RESOURCE_COLORS[rt] : "var(--dim)",
                cursor: "pointer", fontSize: 10, letterSpacing: 1,
                fontFamily: "'Share Tech Mono', monospace",
              }}
            >
              {RESOURCE_ICONS[rt]} {RESOURCE_LABELS[rt].toUpperCase()}
            </button>
          ))}
          <span style={{ marginLeft: "auto", fontSize: 9, color: "var(--dim)", alignSelf: "center" }}>
            {loading ? "Refreshing..." : `${displayedOffers.length} offers - ${Math.round((Date.now() - lastRefresh) / 1000)}s ago`}
          </span>
        </div>
      )}

      {/* ── SELL view ── */}
      {view === "sell" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{
            padding: "14px 16px", borderRadius: 4,
            background: "rgba(155,93,229,0.05)",
            border: "1px solid rgba(155,93,229,0.2)",
            fontSize: 10, color: "var(--dim)", lineHeight: 1.8, letterSpacing: 0.5,
          }}>
            <strong style={{ color: "var(--purple)" }}>How it works:</strong> List your resources for ANTIMATTER tokens.
            Buyers pay AM directly to your wallet. No escrow - the buyer receives resources from your planet immediately after the transaction confirms.
            You can cancel an offer at any time before it is accepted.
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            disabled={txBusy || !state}
            style={{
              fontFamily: "'Orbitron', sans-serif",
              fontSize: 12, fontWeight: 700, letterSpacing: 2,
              padding: "14px 20px", borderRadius: 3,
              border: "2px solid var(--cyan)",
              background: "linear-gradient(135deg, rgba(0,245,212,0.1), rgba(155,93,229,0.05))",
              color: "var(--cyan)", cursor: "pointer", transition: "all 0.2s",
              width: "100%", textTransform: "uppercase",
            }}
          >
            + CREATE NEW LISTING
          </button>
          {!state && (
            <div style={{ fontSize: 10, color: "var(--dim)", textAlign: "center" }}>
              No planet loaded - cannot verify resources.
            </div>
          )}
        </div>
      )}

      {/* ── BUY / MY OFFERS offer list ── */}
      {(view === "buy" || view === "myoffers") && (
        <>
          {displayedOffers.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "48px 20px",
              border: "1px dashed var(--border)", borderRadius: 4,
              color: "var(--dim)", fontSize: 11, letterSpacing: 1,
            }}>
              {loading ? (
                <span style={{ animation: "pulse 2s ease-in-out infinite" }}>Loading offers...</span>
              ) : view === "myoffers" ? (
                <>
                  <div style={{ fontSize: 24, marginBottom: 10 }}>OFFERS</div>
                  You have no active listings. Switch to <em>Sell</em> to create one.
                </>
              ) : (
                <>
                  <div style={{ fontSize: 24, marginBottom: 10 }}>EMPTY</div>
                  No offers available yet.{filterResource !== undefined && " Try removing the filter."}
                </>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {displayedOffers.map(offer => (
                <OfferCard
                  key={offer.pubkey}
                  offer={offer}
                  antimatterBalance={antimatterBalance}
                  txBusy={txBusy}
                  onBuy={o => setBuyTarget(o)}
                  onCancel={o => void handleCancelOffer(o)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Modals ── */}
      {showCreateModal && (
        <CreateOfferModal
          liveRes={liveRes}
          txBusy={txBusy}
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateOffer}
        />
      )}

      {buyTarget && (
        <BuyConfirmModal
          offer={buyTarget}
          antimatterBalance={antimatterBalance}
          txBusy={txBusy}
          onClose={() => setBuyTarget(null)}
          onConfirm={() => handleAcceptOffer(buyTarget)}
        />
      )}

      {/* Close the !marketLoading && !marketUninitialized wrapper */}
      </>)}
    </div>
  );
};

export default MarketTab;