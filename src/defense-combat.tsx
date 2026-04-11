/**
 * defense-combat.tsx
 *
 * Contains:
 * 1. DefenseTab    — OGame defense structures with full tech requirements
 * 2. CombatReportModal — displays combat simulation results
 * 3. Updated ShipyardTab logic hooks (exported)
 * 4. OGame complete tech tree requirements (re-exported for use in App.tsx)
 *
 * Defense structures (OGame accurate):
 *   Rocket Launcher, Light Laser, Heavy Laser, Gauss Cannon,
 *   Ion Cannon, Plasma Turret, Small Shield Dome, Large Shield Dome
 *
 * Weapons/Armour/Shielding tech fully connected to combat engine.
 */

import React, { useState } from "react";
import { Planet, Research, Resources, fmt } from "./game-state";
import {
  DEFENSE_STATS, DEFENSE_REQUIREMENTS, SHIP_REQUIREMENTS,
  RESEARCH_REQUIREMENTS, BUILDING_REQUIREMENTS, Requirement,
  simulateCombat, CombatResult, CombatSide, CombatUnit,
  SHIP_STATS,
} from "./combat-engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DefenseState {
  rocketLauncher: number;
  lightLaser: number;
  heavyLaser: number;
  gaussCannon: number;
  ionCannon: number;
  plasmaTurret: number;
  smallShieldDome: number;
  largeShieldDome: number;
}

// Extended Research that includes all OGame techs
export interface FullResearch {
  energyTech: number;
  laserTech: number;
  ionTech: number;
  hyperspaceTech: number;
  plasmaTech: number;
  combustionDrive: number;
  impulseDrive: number;
  hyperspaceDrive: number;
  espionageTech: number;
  computerTech: number;
  astrophysics: number;
  igrNetwork: number;
  gravitonTech: number;
  weaponsTech: number;
  shieldingTech: number;
  armourTech: number;
  // Legacy mapping
  combustionDrive_: number;
}

// ─── Requirement checker ──────────────────────────────────────────────────────

export function checkRequirements(
  reqs: Requirement[],
  planet: Planet,
  research: Record<string, number>,
): { met: boolean; unmet: Array<{ label: string; have: number; need: number }> } {
  const unmet: Array<{ label: string; have: number; need: number }> = [];
  for (const req of reqs) {
    if (req.type === "building") {
      const have = (planet as any)[req.key] ?? 0;
      if (have < req.level) unmet.push({ label: req.key, have, need: req.level });
    } else {
      const have = research[req.key] ?? 0;
      if (have < req.level) unmet.push({ label: req.key, have, need: req.level });
    }
  }
  return { met: unmet.length === 0, unmet };
}

// ─── Defense structures metadata ─────────────────────────────────────────────

const DEFENSE_DEFS = [
  {
    key: "rocketLauncher",
    name: "Rocket Launcher",
    icon: "🚀",
    desc: "The cheapest and most basic defense. High volume, low cost.",
    cost: { m: 2000, c: 0, d: 0 },
    singleOnly: false,
  },
  {
    key: "lightLaser",
    name: "Light Laser",
    icon: "🔴",
    desc: "Fast firing energy weapon. Effective against light ships.",
    cost: { m: 1500, c: 500, d: 0 },
    singleOnly: false,
  },
  {
    key: "heavyLaser",
    name: "Heavy Laser",
    icon: "🟠",
    desc: "High damage laser cannon. Rapid fire against fighters.",
    cost: { m: 6000, c: 2000, d: 0 },
    singleOnly: false,
  },
  {
    key: "gaussCannon",
    name: "Gauss Cannon",
    icon: "⚡",
    desc: "High-powered magnetic railgun. Excellent against heavy ships.",
    cost: { m: 20000, c: 15000, d: 2000 },
    singleOnly: false,
  },
  {
    key: "ionCannon",
    name: "Ion Cannon",
    icon: "🔵",
    desc: "Disrupts shields before destroying hull. High shield strength.",
    cost: { m: 5000, c: 3000, d: 0 },
    singleOnly: false,
  },
  {
    key: "plasmaTurret",
    name: "Plasma Turret",
    icon: "🟣",
    desc: "The most powerful defense. Devastating against all ship classes.",
    cost: { m: 50000, c: 50000, d: 30000 },
    singleOnly: false,
  },
  {
    key: "smallShieldDome",
    name: "Small Shield Dome",
    icon: "🛡",
    desc: "Planetary shield that absorbs incoming fire. Only one per planet.",
    cost: { m: 10000, c: 10000, d: 0 },
    singleOnly: true,
  },
  {
    key: "largeShieldDome",
    name: "Large Shield Dome",
    icon: "🏰",
    desc: "Massive planetary shield. Supersedes the small dome. One per planet.",
    cost: { m: 50000, c: 50000, d: 0 },
    singleOnly: true,
  },
] as const;

// ─── DefenseTab component ─────────────────────────────────────────────────────

interface DefenseTabProps {
  planet: Planet;
  research: Record<string, number>;
  defense: DefenseState;
  res?: Resources;
  txBusy: boolean;
  onBuildDefense: (defenseKey: string, qty: number) => void;
}

export const DefenseTab: React.FC<DefenseTabProps> = ({
  planet, research, defense, res, txBusy, onBuildDefense,
}) => {
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const canAfford = (cost: { m: number; c: number; d: number }, qty: number): boolean => {
    if (!res) return true;
    return (
      res.metal >= BigInt(cost.m * qty) &&
      res.crystal >= BigInt(cost.c * qty) &&
      res.deuterium >= BigInt(cost.d * qty)
    );
  };

  if (planet.shipyard === 0) {
    return (
      <div>
        <div className="section-title">🛡 DEFENSE</div>
        <div className="notice-box" style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🛡</div>
          <div style={{ fontSize: 13, color: "var(--purple)", letterSpacing: 2 }}>SHIPYARD REQUIRED</div>
          <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 6 }}>Build a Shipyard (Level 1) to access defense structures.</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="section-title">🛡 PLANETARY DEFENSE</div>

      {/* Defense overview */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="res-label" style={{ marginBottom: 10 }}>CURRENT DEFENSES</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
          {DEFENSE_DEFS.map(def => {
            const count = (defense as any)[def.key] as number ?? 0;
            if (count === 0) return null;
            return (
              <div key={def.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "rgba(0,0,0,0.3)", borderRadius: 3, border: "1px solid var(--border)" }}>
                <span style={{ fontSize: 16 }}>{def.icon}</span>
                <div>
                  <div style={{ fontSize: 9, color: "var(--dim)", letterSpacing: 1 }}>{def.name.toUpperCase()}</div>
                  <div style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 13, fontWeight: 700, color: "var(--cyan)" }}>{count.toLocaleString()}</div>
                </div>
              </div>
            );
          })}
          {Object.values(defense).every(v => v === 0) && (
            <div style={{ fontSize: 11, color: "var(--dim)", letterSpacing: 1, gridColumn: "1 / -1" }}>No defenses built yet.</div>
          )}
        </div>
      </div>

      {/* Build cards */}
      <div className="grid-3">
        {DEFENSE_DEFS.map(def => {
          const reqs = DEFENSE_REQUIREMENTS[def.key] ?? [];
          const { met, unmet } = checkRequirements(reqs, planet, research);
          const currentCount = (defense as any)[def.key] as number ?? 0;
          const qty = Math.max(1, quantities[def.key] ?? 1);
          const affordable = canAfford(def.cost, qty);
          const stats = DEFENSE_STATS[def.key];
          const isMaxed = def.singleOnly && currentCount >= 1;

          return (
            <div key={def.key} className="building-card" style={{ borderColor: !met ? "rgba(255,0,110,0.15)" : undefined }}>
              {/* Header */}
              <div className="building-header">
                <div className="building-icon-name">
                  <span className="building-icon">{def.icon}</span>
                  <span className="building-name">{def.name}</span>
                </div>
                <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 13, fontWeight: 700, color: currentCount > 0 ? "var(--cyan)" : "var(--border)" }}>
                  {currentCount.toLocaleString()}
                </span>
              </div>

              {/* Stats */}
              <div style={{ fontSize: 9, color: "var(--dim)", display: "flex", gap: 10 }}>
                <span>⚔ {stats?.attack.toLocaleString()}</span>
                <span>🛡 {stats?.shield.toLocaleString()}</span>
                <span>💛 {stats?.hull.toLocaleString()}</span>
              </div>

              {/* Description */}
              <div style={{ fontSize: 10, color: "var(--dim)", lineHeight: 1.5 }}>{def.desc}</div>

              {/* Cost */}
              <div className="building-costs">
                {def.cost.m > 0 && (
                  <div className="building-cost-row">
                    <span>Metal</span>
                    <span className={!res || res.metal >= BigInt(def.cost.m * qty) ? "cost-ok" : "cost-bad"}>
                      {fmt(def.cost.m * qty)}
                    </span>
                  </div>
                )}
                {def.cost.c > 0 && (
                  <div className="building-cost-row">
                    <span>Crystal</span>
                    <span className={!res || res.crystal >= BigInt(def.cost.c * qty) ? "cost-ok" : "cost-bad"}>
                      {fmt(def.cost.c * qty)}
                    </span>
                  </div>
                )}
                {def.cost.d > 0 && (
                  <div className="building-cost-row">
                    <span>Deuterium</span>
                    <span className={!res || res.deuterium >= BigInt(def.cost.d * qty) ? "cost-ok" : "cost-bad"}>
                      {fmt(def.cost.d * qty)}
                    </span>
                  </div>
                )}
              </div>

              {/* Requirements (when not met) */}
              {!met && (
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {unmet.map((r, i) => (
                    <div key={i} style={{ fontSize: 9, color: "var(--danger)", letterSpacing: 0.5 }}>
                      ✗ {r.label} Lv {r.need} (have {r.have})
                    </div>
                  ))}
                </div>
              )}

              {/* Quantity + build button */}
              {isMaxed ? (
                <button className="build-btn" disabled style={{ border: "1px solid var(--success)", color: "var(--success)", background: "rgba(6,214,160,0.06)", cursor: "default" }}>
                  ✓ INSTALLED
                </button>
              ) : !met ? (
                <button className="build-btn no-funds" disabled>REQUIREMENTS NOT MET</button>
              ) : (
                <div className="ship-qty-row">
                  {!def.singleOnly && (
                    <input
                      className="qty-input"
                      type="number" min={1} value={qty}
                      onChange={e => setQuantities(prev => ({ ...prev, [def.key]: Math.max(1, parseInt(e.target.value) || 1) }))}
                      disabled={txBusy}
                    />
                  )}
                  <button
                    className={`ship-build-btn${!affordable ? "" : ""}`}
                    disabled={txBusy || !affordable || !met}
                    onClick={() => onBuildDefense(def.key, def.singleOnly ? 1 : qty)}
                    style={{ flex: 1 }}
                  >
                    {def.singleOnly ? "BUILD" : `BUILD ×${qty}`}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Full OGame Tech Tree ResearchTab replacement ─────────────────────────────

const ALL_TECHS = [
  // Energy branch
  { idx: 0,  key: "energyTech",     name: "Energy Technology",             icon: "⚡", labReq: 1,  baseCost: [0, 800, 400] },
  { idx: 1,  key: "laserTech",      name: "Laser Technology",              icon: "🔴", labReq: 1,  baseCost: [200, 100, 0] },
  { idx: 2,  key: "ionTech",        name: "Ion Technology",                icon: "🔵", labReq: 4,  baseCost: [1000, 300, 100] },
  { idx: 3,  key: "hyperspaceTech", name: "Hyperspace Technology",         icon: "🌌", labReq: 7,  baseCost: [0, 4000, 2000] },
  { idx: 4,  key: "plasmaTech",     name: "Plasma Technology",             icon: "🟣", labReq: 4,  baseCost: [2000, 4000, 1000] },
  // Drive branch
  { idx: 5,  key: "combustionDrive",name: "Combustion Drive",              icon: "🔥", labReq: 1,  baseCost: [400, 0, 600] },
  { idx: 6,  key: "impulseDrive",   name: "Impulse Drive",                 icon: "🚀", labReq: 2,  baseCost: [2000, 4000, 600] },
  { idx: 7,  key: "hyperspaceDrive",name: "Hyperspace Drive",              icon: "💠", labReq: 7,  baseCost: [10000, 20000, 6000] },
  // Info branch
  { idx: 8,  key: "espionageTech",  name: "Espionage Technology",          icon: "👁", labReq: 3,  baseCost: [200, 1000, 200] },
  { idx: 9,  key: "computerTech",   name: "Computer Technology",           icon: "💻", labReq: 1,  baseCost: [0, 400, 600] },
  { idx: 10, key: "astrophysics",   name: "Astrophysics",                  icon: "🔭", labReq: 3,  baseCost: [4000, 2000, 1000] },
  { idx: 11, key: "igrNetwork",     name: "Intergalactic Research Network",icon: "📡", labReq: 10, baseCost: [240000, 400000, 160000] },
  { idx: 12, key: "gravitonTech",   name: "Graviton Technology",           icon: "🌑", labReq: 12, baseCost: [0, 0, 300000] },
  // Combat branch
  { idx: 13, key: "weaponsTech",    name: "Weapons Technology",            icon: "⚔", labReq: 4,  baseCost: [800, 200, 0] },
  { idx: 14, key: "shieldingTech",  name: "Shielding Technology",          icon: "🛡", labReq: 6,  baseCost: [200, 600, 0] },
  { idx: 15, key: "armourTech",     name: "Armour Technology",             icon: "🔩", labReq: 2,  baseCost: [1000, 0, 0] },
] as const;

interface FullResearchTabProps {
  research: Record<string, number>;
  res?: Resources;
  planet: Planet;
  txBusy: boolean;
  isResearching: boolean;
  researchingIdx: number;
  researchSecsLeft: number;
  antimatterBalance: bigint;
  antimatterEnabled: boolean;
  onResearch: (key: string) => void;
  onFinishResearch: () => void;
  onInstantFinish: () => void;
  fmtCountdown: (s: number) => string;
}

export const FullResearchTab: React.FC<FullResearchTabProps> = ({
  research, res, planet, txBusy, isResearching, researchingIdx, researchSecsLeft,
  antimatterBalance, antimatterEnabled, onResearch, onFinishResearch, onInstantFinish, fmtCountdown,
}) => {
  const [filter, setFilter] = useState<"all" | "combat" | "drives" | "info">("all");

  const filtered = ALL_TECHS.filter(t => {
    if (filter === "combat") return ["weaponsTech", "shieldingTech", "armourTech", "laserTech", "ionTech", "plasmaTech"].includes(t.key);
    if (filter === "drives") return ["combustionDrive", "impulseDrive", "hyperspaceDrive", "hyperspaceTech"].includes(t.key);
    if (filter === "info") return ["espionageTech", "computerTech", "astrophysics", "igrNetwork", "gravitonTech"].includes(t.key);
    return true;
  });

  return (
    <div>
      <div className="section-title">🔬 RESEARCH LAB</div>

      {/* In-progress banner */}
      {isResearching && (
        <div className="build-queue-banner" style={{ marginBottom: 20 }}>
          <div>
            <div className="build-queue-label">CURRENT RESEARCH</div>
            <div className="build-queue-item-name">
              {ALL_TECHS.find(t => t.idx === researchingIdx)?.name ?? "Unknown Tech"}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            <div className="build-queue-eta">{fmtCountdown(researchSecsLeft)}</div>
            <button className="build-btn finish-btn" disabled={txBusy || researchSecsLeft > 0} onClick={onFinishResearch}>
              {researchSecsLeft > 0 ? "IN PROGRESS" : "FINISH RESEARCH"}
            </button>
            {antimatterEnabled && researchSecsLeft > 0 && (
              <button
                className="build-btn"
                disabled={txBusy || antimatterBalance < BigInt(researchSecsLeft)}
                onClick={onInstantFinish}
                style={{ border: "1px solid rgba(255,214,10,0.45)", color: antimatterBalance >= BigInt(researchSecsLeft) ? "var(--warn)" : "var(--dim)", background: "rgba(255,214,10,0.06)" }}
              >
                INSTANT {researchSecsLeft.toLocaleString()} AM
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filter buttons */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        {(["all", "combat", "drives", "info"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 9, letterSpacing: 1, padding: "5px 10px", border: `1px solid ${filter === f ? "var(--purple)" : "var(--border)"}`, background: filter === f ? "rgba(155,93,229,0.15)" : "transparent", color: filter === f ? "var(--purple)" : "var(--dim)", cursor: "pointer", borderRadius: 2, textTransform: "uppercase" }}>
            {f}
          </button>
        ))}
      </div>

      <div className="grid-3">
        {filtered.map(tech => {
          const level = research[tech.key] ?? 0;
          const [bm, bc, bd] = tech.baseCost;
          const mult = Math.pow(2, level);
          const cm = Math.floor(bm * mult);
          const cc = Math.floor(bc * mult);
          const cd = Math.floor(bd * mult);
          const canAfford = !res || (res.metal >= BigInt(cm) && res.crystal >= BigInt(cc) && res.deuterium >= BigInt(cd));
          const reqs = RESEARCH_REQUIREMENTS[tech.key] ?? [];
          const { met, unmet } = checkRequirements(reqs, planet, research);
          const isThis = isResearching && researchingIdx === tech.idx;

          let btnClass = "build-btn no-funds", btnText = "REQUIREMENTS NOT MET";
          if (!met) { btnClass = "build-btn no-funds"; btnText = "REQUIREMENTS NOT MET"; }
          else if (isThis) { btnClass = "build-btn building-now"; btnText = fmtCountdown(researchSecsLeft); }
          else if (isResearching) { btnClass = "build-btn no-funds"; btnText = "QUEUE FULL"; }
          else if (!canAfford) { btnClass = "build-btn no-funds"; btnText = "INSUFFICIENT FUNDS"; }
          else { btnClass = "build-btn can-build"; btnText = `RESEARCH → Lv ${level + 1}`; }

          return (
            <div key={tech.idx} className="building-card">
              <div className="building-header">
                <div className="building-icon-name">
                  <span className="building-icon">{tech.icon}</span>
                  <span className="building-name">{tech.name}</span>
                </div>
                <span className="building-level">Lv {level}</span>
              </div>

              <div className="building-costs">
                {cm > 0 && <div className="building-cost-row"><span>Metal</span><span className={!res || res.metal >= BigInt(cm) ? "cost-ok" : "cost-bad"}>{fmt(cm)}</span></div>}
                {cc > 0 && <div className="building-cost-row"><span>Crystal</span><span className={!res || res.crystal >= BigInt(cc) ? "cost-ok" : "cost-bad"}>{fmt(cc)}</span></div>}
                {cd > 0 && <div className="building-cost-row"><span>Deuterium</span><span className={!res || res.deuterium >= BigInt(cd) ? "cost-ok" : "cost-bad"}>{fmt(cd)}</span></div>}
              </div>

              {!met && unmet.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {unmet.map((r, i) => (
                    <div key={i} style={{ fontSize: 9, color: "var(--danger)" }}>✗ {r.label} Lv {r.need}</div>
                  ))}
                </div>
              )}

              <button
                className={btnClass}
                disabled={txBusy || !met || isResearching || !canAfford}
                onClick={() => onResearch(tech.key)}
              >
                {btnText}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Combat Report Modal ──────────────────────────────────────────────────────

interface CombatReportModalProps {
  result: CombatResult | null;
  onClose: () => void;
}

export const CombatReportModal: React.FC<CombatReportModalProps> = ({ result, onClose }) => {
  if (!result) return null;
  const [showLog, setShowLog] = useState(false);

  const winnerColor = result.winner === "attacker" ? "var(--success)" : result.winner === "defender" ? "var(--danger)" : "var(--warn)";
  const winnerLabel = result.winner === "attacker" ? "⚔ ATTACKER WINS" : result.winner === "defender" ? "🛡 DEFENDER WINS" : "⊹ DRAW";

  return (
    <div className="modal-backdrop" style={{ zIndex: 300 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 640, borderColor: winnerColor }}>
        <div className="modal-title" style={{ color: winnerColor }}>{winnerLabel}</div>

        {/* Summary */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <div className="card" style={{ padding: 12 }}>
            <div className="res-label">ATTACKER LOSSES</div>
            {Object.keys(result.attackerLosses).length === 0
              ? <div style={{ fontSize: 11, color: "var(--success)" }}>No losses</div>
              : Object.entries(result.attackerLosses).map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 3 }}>
                  <span style={{ color: "var(--dim)" }}>{k}</span>
                  <span style={{ color: "var(--danger)" }}>−{v.toLocaleString()}</span>
                </div>
              ))}
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div className="res-label">DEFENDER LOSSES</div>
            {Object.keys(result.defenderLosses).length === 0
              ? <div style={{ fontSize: 11, color: "var(--success)" }}>No losses</div>
              : Object.entries(result.defenderLosses).map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 3 }}>
                  <span style={{ color: "var(--dim)" }}>{k}</span>
                  <span style={{ color: "var(--danger)" }}>−{v.toLocaleString()}</span>
                </div>
              ))}
          </div>
        </div>

        {/* Debris field */}
        <div className="card" style={{ padding: 12, marginBottom: 16, borderColor: "rgba(184,184,212,0.2)" }}>
          <div className="res-label">DEBRIS FIELD (30% of losses)</div>
          <div style={{ display: "flex", gap: 20 }}>
            <span style={{ color: "var(--metal)", fontSize: 12 }}>⛏ {result.debrisField.metal.toLocaleString()} metal</span>
            <span style={{ color: "var(--crystal)", fontSize: 12 }}>💎 {result.debrisField.crystal.toLocaleString()} crystal</span>
            {result.moonChance > 0 && <span style={{ color: "var(--warn)", fontSize: 11 }}>🌙 Moon chance: {result.moonChance}%</span>}
          </div>
        </div>

        {/* Round-by-round summary */}
        <div className="res-label" style={{ marginBottom: 8 }}>ROUND SUMMARY ({result.rounds.length} rounds)</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
          {result.rounds.map(r => (
            <div key={r.round} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", background: "rgba(0,0,0,0.3)", borderRadius: 3, fontSize: 10 }}>
              <span style={{ color: "var(--dim)", fontFamily: "'Orbitron',sans-serif", fontSize: 9 }}>R{r.round}</span>
              <span style={{ color: "var(--danger)" }}>
                Atk lost: {Object.values(r.attackerLosses).reduce((a, b) => a + b, 0)}
              </span>
              <span style={{ color: "var(--danger)" }}>
                Def lost: {Object.values(r.defenderLosses).reduce((a, b) => a + b, 0)}
              </span>
              <span style={{ color: "var(--dim)", marginLeft: "auto" }}>
                {Object.values(r.attackerRemaining).reduce((a, b) => a + b, 0)} vs {Object.values(r.defenderRemaining).reduce((a, b) => a + b, 0)}
              </span>
            </div>
          ))}
        </div>

        {/* Combat log toggle */}
        <button onClick={() => setShowLog(v => !v)} style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: 1, padding: "5px 12px", border: "1px solid var(--border)", background: "transparent", color: "var(--dim)", cursor: "pointer", borderRadius: 2, marginBottom: 8 }}>
          {showLog ? "HIDE" : "SHOW"} COMBAT LOG
        </button>
        {showLog && (
          <div style={{ maxHeight: 200, overflowY: "auto", padding: "8px 10px", background: "rgba(0,0,0,0.4)", borderRadius: 3, fontSize: 9, color: "var(--dim)", fontFamily: "'Share Tech Mono',monospace", lineHeight: 1.7 }}>
            {result.combatLog.map((line, i) => (
              <div key={i} style={{ color: line.startsWith("---") ? "var(--purple)" : line.startsWith("Result") ? winnerColor : "var(--dim)" }}>
                {line}
              </div>
            ))}
          </div>
        )}

        <div className="modal-footer">
          <button className="modal-btn secondary" onClick={onClose}>CLOSE</button>
        </div>
      </div>
    </div>
  );
};

// ─── Combat simulator UI (pre-battle) ─────────────────────────────────────────

interface CombatSimulatorProps {
  attackerFleet: Record<string, number>;
  attackerResearch: Record<string, number>;
  defenderDefense: DefenseState;
  defenderFleet?: Record<string, number>;
  defenderResearch?: Record<string, number>;
  onClose: () => void;
}

export const CombatSimulatorModal: React.FC<CombatSimulatorProps> = ({
  attackerFleet, attackerResearch, defenderDefense, defenderFleet = {}, defenderResearch = {}, onClose,
}) => {
  const [result, setResult] = useState<CombatResult | null>(null);
  const [simCount, setSimCount] = useState(10);

  const runSim = () => {
    const atkUnits: CombatUnit[] = Object.entries(attackerFleet)
      .filter(([, n]) => n > 0)
      .map(([key, count]) => {
        const stats = SHIP_STATS[key];
        if (!stats) return null;
        return {
          id: key,
          name: key,
          icon: "🚀",
          count,
          baseAttack: stats.attack,
          baseShield: stats.shield,
          baseHull: stats.hull,
          rapidFire: stats.rapidFire,
        };
      })
      .filter(Boolean) as CombatUnit[];

    const defShips: CombatUnit[] = Object.entries(defenderFleet)
      .filter(([, n]) => n > 0)
      .map(([key, count]) => {
        const stats = SHIP_STATS[key];
        if (!stats) return null;
        return { id: key, name: key, icon: "🛡", count, baseAttack: stats.attack, baseShield: stats.shield, baseHull: stats.hull, rapidFire: stats.rapidFire };
      })
      .filter(Boolean) as CombatUnit[];

    const defDefenses: CombatUnit[] = Object.entries(defenderDefense)
      .filter(([, n]) => n > 0)
      .map(([key, count]) => {
        const stats = DEFENSE_STATS[key];
        if (!stats) return null;
        return { id: key, name: key, icon: "🛡", count, baseAttack: stats.attack, baseShield: stats.shield, baseHull: stats.hull, rapidFire: {} };
      })
      .filter(Boolean) as CombatUnit[];

    const attSide: CombatSide = {
      units: atkUnits,
      weaponsTech: attackerResearch["weaponsTech"] ?? 0,
      shieldingTech: attackerResearch["shieldingTech"] ?? 0,
      armorTech: attackerResearch["armourTech"] ?? 0,
    };

    const defSide: CombatSide = {
      units: [...defShips, ...defDefenses],
      weaponsTech: defenderResearch["weaponsTech"] ?? 0,
      shieldingTech: defenderResearch["shieldingTech"] ?? 0,
      armorTech: defenderResearch["armourTech"] ?? 0,
    };

    // Run multiple simulations and take the last result for display
    let lastResult: CombatResult | null = null;
    for (let i = 0; i < simCount; i++) {
      lastResult = simulateCombat(attSide, defSide);
    }
    setResult(lastResult);
  };

  if (result) {
    return <CombatReportModal result={result} onClose={() => setResult(null)} />;
  }

  return (
    <div className="modal-backdrop" style={{ zIndex: 300 }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-title">⚔ COMBAT SIMULATOR</div>

        <div className="modal-section">
          <div className="modal-label">Your attacking fleet</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {Object.entries(attackerFleet).filter(([, n]) => n > 0).map(([k, n]) => (
              <span key={k} style={{ fontSize: 10, padding: "2px 8px", border: "1px solid var(--border)", borderRadius: 2, color: "var(--text)" }}>
                {k} ×{n.toLocaleString()}
              </span>
            ))}
            {Object.values(attackerFleet).every(n => n === 0) && <span style={{ fontSize: 11, color: "var(--dim)" }}>No ships selected</span>}
          </div>
        </div>

        <div className="modal-section">
          <div className="modal-label">Defender defenses</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {Object.entries(defenderDefense).filter(([, n]) => n > 0).map(([k, n]) => (
              <span key={k} style={{ fontSize: 10, padding: "2px 8px", border: "1px solid rgba(255,0,110,0.3)", borderRadius: 2, color: "var(--danger)" }}>
                {k} ×{n.toLocaleString()}
              </span>
            ))}
            {Object.values(defenderDefense).every(n => n === 0) && <span style={{ fontSize: 11, color: "var(--success)" }}>No defenses</span>}
          </div>
        </div>

        <div className="modal-row">
          <span style={{ fontSize: 11, color: "var(--dim)" }}>Simulation rounds</span>
          <select className="modal-select" value={simCount} onChange={e => setSimCount(Number(e.target.value))} style={{ width: 80 }}>
            <option value={1}>1</option>
            <option value={10}>10</option>
            <option value={100}>100</option>
          </select>
        </div>

        <div className="modal-footer">
          <button className="modal-btn secondary" onClick={onClose}>CANCEL</button>
          <button className="modal-btn primary" onClick={runSim} disabled={Object.values(attackerFleet).every(n => n === 0)}>
            ⚔ SIMULATE
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Export updated ship requirements checker ─────────────────────────────────

export function checkShipReqsFull(
  shipKey: string,
  planet: Planet,
  research: Record<string, number>,
): { met: boolean; unmet: Array<{ label: string; have: number; need: number }> } {
  const reqs = SHIP_REQUIREMENTS[shipKey] ?? [];
  return checkRequirements(reqs, planet, research);
}

// ─── All tech keys for the research state ─────────────────────────────────────

export const ALL_TECH_KEYS = ALL_TECHS.map(t => t.key);

// Helper to build full research map from partial game-state research
export function buildFullResearchMap(research: any): Record<string, number> {
  const map: Record<string, number> = {};
  for (const key of ALL_TECH_KEYS) {
    // Map legacy keys
    map[key] = research[key] ?? research["combustionDrive"] ?? 0;
  }
  // Override with exact fields from the research object
  for (const k of Object.keys(research)) {
    map[k] = research[k];
  }
  return map;
}