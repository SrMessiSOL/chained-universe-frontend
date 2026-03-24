import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

import { BUILDINGS, SHIPS, SHIP_TYPES } from "./constants";
import {
  SolarGridClient,
  formatBig, formatNum, formatDuration,
  pendingProduction, buildCost, buildSeconds,
  galaxyDistance, estimateFlightSeconds,
  GameAddresses, OnChainPlanet, OnChainResources, OnChainFleet, GalaxyEntry,
} from "./states/game";

type Page = "overview" | "buildings" | "shipyard" | "fleet" | "galaxy";

// ── Theme ─────────────────────────────────────────────────────────────────────

const C = {
  bg: "#080c14", surface: "#0d1320", border: "#1c2a3a",
  accent: "#00c8f0", accent2: "#00f0a0", warn: "#f0a000",
  danger: "#f04040", text: "#c8d8e8", muted: "#4a6070",
  metal: "#a0b8c8", crystal: "#60c0f0", deut: "#40d890", energy: "#f0c040",
  er: "#a060f0", // purple for ER session state
};

const css = {
  app: { minHeight: "100vh", background: C.bg, color: C.text,
    fontFamily: "'Share Tech Mono','Courier New',monospace", fontSize: "13px" } as React.CSSProperties,
  header: { display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "12px 20px", borderBottom: `1px solid ${C.border}`, background: C.surface } as React.CSSProperties,
  logo: { fontFamily: "'Orbitron',sans-serif", color: C.accent,
    fontSize: "20px", letterSpacing: "3px", margin: 0 } as React.CSSProperties,
  main: { display: "flex", height: "calc(100vh - 49px)" } as React.CSSProperties,
  sidebar: { width: "180px", background: C.surface, borderRight: `1px solid ${C.border}`,
    display: "flex", flexDirection: "column" as const, padding: "12px 0", flexShrink: 0 },
  navBtn: (active: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: "10px", padding: "10px 16px",
    background: active ? `${C.accent}18` : "transparent",
    color: active ? C.accent : C.muted, border: "none",
    borderLeft: active ? `2px solid ${C.accent}` : "2px solid transparent",
    cursor: "pointer", width: "100%", textAlign: "left",
    fontSize: "12px", fontFamily: "inherit", letterSpacing: "1px", textTransform: "uppercase" as const,
  }),
  content: { flex: 1, overflow: "auto", padding: "20px" } as React.CSSProperties,
  resBar: { display: "flex", gap: "0", padding: "8px 20px",
    background: C.surface, borderBottom: `1px solid ${C.border}` } as React.CSSProperties,
  resItem: { display: "flex", alignItems: "center", gap: "6px",
    padding: "0 16px", borderRight: `1px solid ${C.border}` } as React.CSSProperties,
  card: { background: C.surface, border: `1px solid ${C.border}`,
    borderRadius: "4px", padding: "16px", marginBottom: "12px" } as React.CSSProperties,
  table: { width: "100%", borderCollapse: "collapse" as const },
  th: { textAlign: "left" as const, padding: "8px 12px",
    borderBottom: `1px solid ${C.border}`, color: C.muted,
    fontSize: "11px", letterSpacing: "1px", textTransform: "uppercase" as const },
  td: { padding: "10px 12px", borderBottom: `1px solid ${C.border}18` } as React.CSSProperties,
  btn: (variant: "primary"|"secondary"|"danger"|"warn"|"er" = "primary", disabled = false): React.CSSProperties => {
    const col = variant === "primary" ? C.accent : variant === "warn" ? C.warn :
      variant === "danger" ? C.danger : variant === "er" ? C.er : C.muted;
    return {
      padding: "6px 14px", background: disabled ? C.border : `${col}22`,
      color: disabled ? C.muted : col, border: `1px solid ${disabled ? C.border : col}`,
      borderRadius: "3px", cursor: disabled ? "not-allowed" : "pointer",
      fontSize: "11px", fontFamily: "inherit", letterSpacing: "1px", whiteSpace: "nowrap" as const,
    };
  },
  input: { background: "#0a1018", border: `1px solid ${C.border}`, borderRadius: "3px",
    color: C.text, padding: "6px 10px", fontFamily: "inherit",
    fontSize: "13px", width: "100%", boxSizing: "border-box" as const } as React.CSSProperties,
  badge: (color: string): React.CSSProperties => ({
    display: "inline-block", padding: "2px 8px", background: `${color}18`,
    color, border: `1px solid ${color}44`, borderRadius: "2px", fontSize: "10px", letterSpacing: "1px",
  }),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function bnNum(v: BN | number): number { return v instanceof BN ? v.toNumber() : Number(v); }
function canAfford(res: OnChainResources|null, m:number, c:number, d:number, live:{metal:BN,crystal:BN,deuterium:BN}): boolean {
  if (!res) return false;
  return bnNum(live.metal)>=m && bnNum(live.crystal)>=c && bnNum(live.deuterium)>=d;
}
function energyColor(prod:number, cons:number): string {
  if (prod>=cons) return C.accent2; if (prod>=cons*0.8) return C.warn; return C.danger;
}

function StatusBar({ msg, ok }: { msg:string; ok?:boolean }) {
  if (!msg) return null;
  return <div style={{ padding:"8px 16px", background: ok===false?`${C.danger}18`:`${C.accent2}18`,
    border:`1px solid ${ok===false?C.danger:C.accent2}44`, borderRadius:"3px",
    color: ok===false?C.danger:C.accent2, marginBottom:"12px", fontSize:"12px" }}>{msg}</div>;
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { connected, publicKey } = useWallet();

  const [page, setPage]               = useState<Page>("overview");
  const [addresses, setAddresses]     = useState<GameAddresses|null>(null);
  const [planet, setPlanet]           = useState<OnChainPlanet|null>(null);
  const [resources, setResources]     = useState<OnChainResources|null>(null);
  const [fleet, setFleet]             = useState<OnChainFleet|null>(null);
  const [liveRes, setLiveRes]         = useState<{metal:BN,crystal:BN,deuterium:BN}>(
    { metal: new BN(0), crystal: new BN(0), deuterium: new BN(0) }
  );
  const [galaxyEntries, setGalaxyEntries] = useState<GalaxyEntry[]>([]);
  const [planetName, setPlanetName]   = useState("Homeworld");
  const [status, setStatus]           = useState<{msg:string;ok?:boolean}|null>(null);
  const [loading, setLoading]         = useState(false);
  const [txBusy, setTxBusy]           = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [countdowns, setCountdowns]   = useState<Record<string,number>>({});
  const [shipQty, setShipQty]         = useState<Record<string,number>>({});
  const shipQtyRef = useRef<Record<string,number>>({});  // uncontrolled backing store
  const [galaXY, setGalaXY]           = useState({ galaxy:1, system:1 });
  const galaXYRef = useRef({ galaxy:1, system:1 });
  const [buildRemaining, setBuildRemaining] = useState(0);

  const clientRef = useRef<SolarGridClient|null>(null);
  const pollRef   = useRef<ReturnType<typeof setInterval>|null>(null);

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!connected || !publicKey || !wallet) return;
    const provider = new AnchorProvider(connection, wallet, { commitment:"confirmed" });
    clientRef.current = new SolarGridClient(connection, provider);
    (async () => {
      setLoading(true);
      setStatus({ msg:"Scanning for your planet..." });
      try {
        const existing = await clientRef.current!.findExistingPlanet(publicKey);
        if (existing) { setAddresses(existing); setStatus(null); }
        else setStatus({ msg:"No planet found — create one below" });
      } catch (e:any) { setStatus({ msg:"Load error: "+e.message, ok:false }); }
      finally { setLoading(false); }
    })();
  }, [connected, publicKey, wallet, connection]);

  // ── Poll ──────────────────────────────────────────────────────────────────

  const poll = useCallback(async () => {
    if (!addresses || !clientRef.current) return;
    try {
      const [p,r,f] = await Promise.all([
        clientRef.current.fetchPlanet(addresses.planetPda),
        clientRef.current.fetchResources(addresses.resourcesPda),
        clientRef.current.fetchFleet(addresses.fleetPda),
      ]);
      if (p) setPlanet(p); if (r) setResources(r); if (f) setFleet(f);
    } catch {}
  }, [addresses]);

  useEffect(() => {
    if (!addresses) return;
    poll();
    pollRef.current = setInterval(poll, sessionActive ? 3000 : 6000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [addresses, poll, sessionActive]);

  // ── Tickers ───────────────────────────────────────────────────────────────

  // Live resource ticker — only updates liveRes state, not the whole page.
  // Inputs in ShipyardPage/GalaxyPage are uncontrolled (ref-based) to avoid focus loss.
  const liveResRef = useRef(liveRes);
  useEffect(() => {
    if (!resources) return;
    const tick = () => {
      const next = pendingProduction(resources, Math.floor(Date.now()/1000));
      // Only update state when a value actually changes (avoids spurious re-renders)
      if (
        !next.metal.eq(liveResRef.current.metal) ||
        !next.crystal.eq(liveResRef.current.crystal) ||
        !next.deuterium.eq(liveResRef.current.deuterium)
      ) {
        liveResRef.current = next;
        setLiveRes(next);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [resources]);

  useEffect(() => {
    if (!planet) return;
    const id = setInterval(() => setBuildRemaining(Math.max(0, planet.buildFinishTs - Math.floor(Date.now()/1000))), 1000);
    setBuildRemaining(Math.max(0, planet.buildFinishTs - Math.floor(Date.now()/1000)));
    return () => clearInterval(id);
  }, [planet?.buildFinishTs]);

  useEffect(() => {
    if (!fleet) return;
    const id = setInterval(() => {
      const now = Math.floor(Date.now()/1000);
      const m: Record<string,number> = {};
      (fleet.missions||[]).forEach((ms,i) => {
        if (ms.missionType===0) return;
        m[i] = Math.max(0, (ms.applied?ms.returnTs:ms.arriveTs) - now);
      });
      setCountdowns(m);
    }, 1000);
    return () => clearInterval(id);
  }, [fleet?.missions]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const withTx = async (label:string, fn:()=>Promise<string>) => {
    if (txBusy) return;
    setTxBusy(true);
    setStatus({ msg:`${label}…` });
    try {
      await fn();
      setStatus({ msg:`${label} confirmed!`, ok:true });
      setTimeout(poll, sessionActive ? 500 : 2000);
    } catch (e:any) {
      setStatus({ msg:`${label} failed: ${e.message?.slice(0,80)}`, ok:false });
    } finally { setTxBusy(false); }
  };

  const handleCreate = async () => {
    if (!clientRef.current) return;
    setLoading(true); setStatus({ msg:"Creating planet (3 txns)…" });
    try {
      const addrs = await clientRef.current.initializeWorld(planetName||"Homeworld");
      setAddresses(addrs); setStatus(null); setTimeout(poll, 2000);
    } catch (e:any) { setStatus({ msg:"Creation failed: "+e.message, ok:false }); }
    finally { setLoading(false); }
  };

  // ── Session actions ────────────────────────────────────────────────────────

  const handleStartSession = async () => {
    if (!addresses || !clientRef.current || txBusy) return;
    setTxBusy(true);
    setStatus({ msg:"Starting session (1 wallet approval)…" });
    try {
      await clientRef.current.startSession(addresses.entityPda);
      setSessionActive(true);
      setStatus({ msg:"⚡ Session active — instant transactions, no wallet popups!", ok:true });
      // Poll faster during session since ER commits every 3s
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(poll, 3000);
    } catch (e:any) {
      setStatus({ msg:"Session start failed: "+e.message, ok:false });
    } finally { setTxBusy(false); }
  };

  const handleEndSession = async () => {
    if (!addresses || !clientRef.current || txBusy) return;
    setTxBusy(true);
    setStatus({ msg:"Saving to Solana (1 wallet approval)…" });
    try {
      await clientRef.current.endSession(addresses.worldPda, addresses.entityPda);
      setSessionActive(false);
      setStatus({ msg:"State saved to Solana ✓", ok:true });
      // Slow poll back down
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(poll, 6000);
      setTimeout(poll, 1000);
    } catch (e:any) {
      setStatus({ msg:"Session end failed: "+e.message, ok:false });
    } finally { setTxBusy(false); }
  };

  const handleUpgrade = (idx:number) => {
    if (!addresses||!clientRef.current) return;
    const b = BUILDINGS[idx];
    withTx(`Upgrade ${b.name}`, () =>
      clientRef.current!.startBuild(addresses.worldPda, addresses.entityPda, idx));
  };

  const handleFinishBuild = () => {
    if (!addresses||!clientRef.current) return;
    withTx("Complete build", async () => {
      const sig = await clientRef.current!.finishBuild(addresses.worldPda, addresses.entityPda);
      setPlanet(prev => prev ? { ...prev, buildQueueItem:255, buildQueueTarget:0, buildFinishTs:0 } : prev);
      return sig;
    });
  };

  const handleBuildShip = (shipKey:string) => {
    if (!addresses||!clientRef.current) return;
    const qty  = shipQtyRef.current[shipKey] ?? shipQty[shipKey] ?? 1;
    const type = SHIP_TYPES[shipKey];
    withTx(`Build ${qty}× ${shipKey}`, () =>
      clientRef.current!.buildShip(addresses.worldPda, addresses.entityPda, type, qty));
  };

  const handleScanGalaxy = async () => {
    if (!clientRef.current||!publicKey) return;
    setLoading(true);
    try { setGalaxyEntries(await clientRef.current.scanGalaxy(galaXY.galaxy, galaXY.system, publicKey)); }
    catch {} finally { setLoading(false); }
  };

  // ── Computed ──────────────────────────────────────────────────────────────

  const energyProd = bnNum(resources?.energy_production ?? 0);
  const energyCons = bnNum(resources?.energy_consumption ?? 0);
  const efficiency = energyCons===0?100:Math.min(100,Math.round((energyProd/energyCons)*100));

  // ── Sub-pages ─────────────────────────────────────────────────────────────

  function OverviewPage() {
    return (
      <div>
        <div style={{ ...css.card, borderColor: C.accent+"44" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div>
              <h2 style={{ color:C.accent, fontFamily:"'Orbitron',sans-serif", margin:"0 0 4px" }}>
                {planet?.name||"—"}
              </h2>
              <div style={{ color:C.muted, fontSize:"12px" }}>
                {planet?`${planet.galaxy}:${planet.system}:${planet.position}`:"—"}
                {planet?` · ${planet.temperature}°C · Ø${planet.diameter?.toLocaleString()}km`:""}
              </div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ color:C.muted, fontSize:"11px" }}>FIELDS</div>
              <div style={{ color:C.text }}>{planet?.usedFields??"—"} / {planet?.maxFields??"—"}</div>
            </div>
          </div>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"12px", marginBottom:"12px" }}>
          {[
            { label:"METAL",     val:liveRes.metal,    cap:resources?.metal_cap,    rh:resources?.metal_hour,    color:C.metal   },
            { label:"CRYSTAL",   val:liveRes.crystal,  cap:resources?.crystal_cap,  rh:resources?.crystal_hour,  color:C.crystal },
            { label:"DEUTERIUM", val:liveRes.deuterium,cap:resources?.deuterium_cap,rh:resources?.deuterium_hour,color:C.deut    },
          ].map(r => (
            <div key={r.label} style={{ ...css.card, borderColor:r.color+"44" }}>
              <div style={{ color:C.muted, fontSize:"10px", letterSpacing:"2px", marginBottom:"6px" }}>{r.label}</div>
              <div style={{ color:r.color, fontSize:"20px", fontFamily:"'Orbitron',sans-serif" }}>{formatBig(r.val)}</div>
              <div style={{ color:C.muted, fontSize:"11px", marginTop:"4px" }}>
                / {formatBig(r.cap??0)} · +{formatBig(r.rh??0)}/h
              </div>
              {r.cap && <div style={{ marginTop:"8px", height:"3px", background:C.border, borderRadius:"2px" }}>
                <div style={{ height:"100%", background:r.color, borderRadius:"2px", transition:"width 1s linear",
                  width:`${Math.min(100,(bnNum(r.val)/bnNum(r.cap))*100)}%` }} />
              </div>}
            </div>
          ))}
        </div>

        <div style={css.card}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <span style={{ color:C.muted, fontSize:"10px", letterSpacing:"2px" }}>ENERGY  </span>
              <span style={{ color:energyColor(energyProd,energyCons) }}>{energyProd} / {energyCons}</span>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
              <div style={{ width:"120px", height:"4px", background:C.border, borderRadius:"2px" }}>
                <div style={{ height:"100%", background:energyColor(energyProd,energyCons), width:`${efficiency}%`, borderRadius:"2px" }} />
              </div>
              <span style={{ color:energyColor(energyProd,energyCons), fontSize:"12px" }}>{efficiency}%</span>
            </div>
          </div>
        </div>

        {planet && planet.buildFinishTs > 0 && (
          <div style={{ ...css.card, borderColor:(buildRemaining===0?C.accent2:C.warn)+"44" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <span style={{ color:C.muted, fontSize:"10px", letterSpacing:"2px" }}>
                  {buildRemaining===0?"COMPLETED":"BUILDING"}{"  "}
                </span>
                <span>{BUILDINGS[planet.buildQueueItem]?.name} → Lv {planet.buildQueueTarget}</span>
              </div>
              <div style={{ display:"flex", gap:"10px", alignItems:"center" }}>
                {buildRemaining > 0
                  ? <span style={{ color:C.warn, fontFamily:"'Orbitron',sans-serif" }}>{formatDuration(buildRemaining)}</span>
                  : <button style={css.btn("primary",txBusy)} disabled={txBusy} onClick={handleFinishBuild}>COLLECT</button>
                }
              </div>
            </div>
          </div>
        )}

        {fleet && fleet.missions.filter(m=>m.missionType!==0).length>0 && (
          <div style={css.card}>
            <div style={{ color:C.muted, fontSize:"10px", letterSpacing:"2px", marginBottom:"8px" }}>ACTIVE MISSIONS</div>
            {fleet.missions.map((m,i) => {
              if (m.missionType===0) return null;
              const labels = ["","ATTACK","TRANSPORT","DEPLOY","ESPIONAGE","COLONIZE","RECYCLE"];
              return (
                <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", borderBottom:`1px solid ${C.border}18` }}>
                  <span style={css.badge(m.missionType===1?C.danger:C.accent)}>{labels[m.missionType]||"MISSION"}</span>
                  <span style={{ color:C.text }}>{formatDuration(countdowns[i]??0)}</span>
                  <span style={{ color:C.muted }}>{m.applied?"RETURNING":"EN ROUTE"}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function BuildingsPage() {
    const buildInProgress = planet ? planet.buildFinishTs > 0 && buildRemaining > 0 : false;
    const buildReady      = planet ? planet.buildFinishTs > 0 && buildRemaining === 0 : false;
    const queueFree       = planet ? !buildInProgress && !buildReady : false;
    const queuedIdx       = (planet && planet.buildFinishTs > 0) ? planet.buildQueueItem : 255;

    return (
      <div>
        <h2 style={{ color:C.accent, fontFamily:"'Orbitron',sans-serif", marginTop:0 }}>Buildings</h2>

        {(buildInProgress||buildReady) && planet && queuedIdx!==255 && (
          <div style={{ ...css.card, borderColor:(buildReady?C.accent2:C.warn)+"66", marginBottom:"16px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <span style={{ color:C.muted, fontSize:"10px", letterSpacing:"2px" }}>
                  {buildReady?"COMPLETED":"BUILDING"}{"  "}
                </span>
                <span style={{ color:C.text }}>{BUILDINGS[queuedIdx]?.name} → Level {planet.buildQueueTarget}</span>
              </div>
              <div style={{ display:"flex", gap:"12px", alignItems:"center" }}>
                {buildInProgress && <span style={{ color:C.warn, fontFamily:"'Orbitron',sans-serif" }}>{formatDuration(buildRemaining)}</span>}
                {buildReady && <button style={css.btn("primary",txBusy)} disabled={txBusy} onClick={handleFinishBuild}>✓ COLLECT</button>}
              </div>
            </div>
          </div>
        )}

        <table style={css.table}>
          <thead><tr>{["Building","Lv","Next Cost","Time",""].map(h=><th key={h} style={css.th}>{h}</th>)}</tr></thead>
          <tbody>
            {BUILDINGS.map((b,i) => {
              const lv      = planet?(planet as any)[b.key]??0:0;
              const cost    = buildCost(i,lv);
              const dur     = buildSeconds(i,lv+1,planet?.roboticsFactory??0);
              const affordable = canAfford(resources,cost.m,cost.c,cost.d,liveRes);
              const isQueued   = queuedIdx===i;
              const canStart   = queueFree && !!planet && planet.usedFields<planet.maxFields && affordable && !txBusy;
              return (
                <tr key={b.key} style={{ background:isQueued?`${C.warn}08`:"transparent" }}>
                  <td style={css.td}><span style={{ marginRight:"8px" }}>{b.icon}</span><span style={{ color:C.text }}>{b.name}</span>
                    <div style={{ color:C.muted, fontSize:"11px" }}>{b.desc}</div></td>
                  <td style={{ ...css.td, color:C.accent, fontFamily:"'Orbitron',sans-serif" }}>{lv}</td>
                  <td style={{ ...css.td, fontSize:"11px" }}>
                    {cost.m>0&&<span style={{ color:C.metal }}>M:{formatNum(cost.m)} </span>}
                    {cost.c>0&&<span style={{ color:C.crystal }}>C:{formatNum(cost.c)} </span>}
                    {cost.d>0&&<span style={{ color:C.deut }}>D:{formatNum(cost.d)}</span>}
                  </td>
                  <td style={{ ...css.td, color:C.muted }}>{formatDuration(dur)}</td>
                  <td style={css.td}>
                    {isQueued&&buildInProgress ? <span style={{ color:C.warn }}>{formatDuration(buildRemaining)}</span>
                      : isQueued&&buildReady ? <button style={css.btn("primary",txBusy)} disabled={txBusy} onClick={handleFinishBuild}>✓ COLLECT</button>
                      : <button style={css.btn("primary",!canStart)} disabled={!canStart} onClick={()=>handleUpgrade(i)}>
                          {!queueFree?"BUSY":!affordable?"NO FUNDS":"UPGRADE"}
                        </button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  function ShipyardPage() {
    if (!planet?.shipyard) return (
      <div style={{ textAlign:"center", padding:"60px 0", color:C.muted }}>
        Build a <span style={{ color:C.accent }}>Shipyard</span> first (Buildings tab)
      </div>
    );
    return (
      <div>
        <h2 style={{ color:C.accent, fontFamily:"'Orbitron',sans-serif", marginTop:0 }}>
          Shipyard <span style={{ fontSize:"14px", color:C.muted }}>Lv {planet.shipyard}</span>
        </h2>
        <table style={css.table}>
          <thead><tr>{["Ship","Atk","Cargo","Cost","Qty",""].map(h=><th key={h} style={css.th}>{h}</th>)}</tr></thead>
          <tbody>
            {SHIPS.map(s => {
              const qty = shipQty[s.key]||1;
              const cost = { m:s.cost.m*qty, c:s.cost.c*qty, d:s.cost.d*qty };
              const affordable = canAfford(resources,cost.m,cost.c,cost.d,liveRes);
              return (
                <tr key={s.key}>
                  <td style={css.td}><span style={{ marginRight:"8px" }}>{s.icon}</span><span style={{ color:C.text }}>{s.name}</span>
                    <div style={{ color:C.muted, fontSize:"11px" }}>Fleet: {(fleet as any)?.[s.key]??0}</div></td>
                  <td style={{ ...css.td, color:C.danger }}>{formatNum(s.atk)}</td>
                  <td style={{ ...css.td, color:C.crystal }}>{s.cargo?formatNum(s.cargo):"—"}</td>
                  <td style={{ ...css.td, fontSize:"11px" }}>
                    {s.cost.m>0&&<span style={{ color:C.metal }}>M:{formatNum(cost.m)} </span>}
                    {s.cost.c>0&&<span style={{ color:C.crystal }}>C:{formatNum(cost.c)} </span>}
                    {s.cost.d>0&&<span style={{ color:C.deut }}>D:{formatNum(cost.d)}</span>}
                  </td>
                  <td style={{ ...css.td, width:"80px" }}>
                    <input
                      type="number" min={1}
                      style={{ ...css.input, width:"70px" }}
                      defaultValue={shipQtyRef.current[s.key] ?? 1}
                      onBlur={e => { shipQtyRef.current[s.key] = Math.max(1, parseInt(e.target.value)||1); }}
                      onChange={e => { shipQtyRef.current[s.key] = Math.max(1, parseInt(e.target.value)||1); }}
                      key={s.key}
                    />
                  </td>
                  <td style={css.td}>
                    <button style={css.btn("primary",txBusy||!affordable)} disabled={txBusy||!affordable} onClick={()=>handleBuildShip(s.key)}>BUILD</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  function FleetPage() {
    const missions = (fleet?.missions??[]).filter(m=>m.missionType!==0);
    const missionLabels = ["","Attack","Transport","Deploy","Espionage","Colonize","Recycle"];
    return (
      <div>
        <h2 style={{ color:C.accent, fontFamily:"'Orbitron',sans-serif", marginTop:0 }}>Fleet</h2>
        <div style={css.card}>
          <div style={{ color:C.muted, fontSize:"10px", letterSpacing:"2px", marginBottom:"12px" }}>STATIONED</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))", gap:"8px" }}>
            {SHIPS.map(s => {
              const count = (fleet as any)?.[s.key]??0;
              if (!count) return null;
              return <div key={s.key} style={{ display:"flex", gap:"8px", alignItems:"center" }}>
                <span>{s.icon}</span>
                <div>
                  <div style={{ color:C.text, fontSize:"12px" }}>{s.name}</div>
                  <div style={{ color:C.accent, fontFamily:"'Orbitron',sans-serif" }}>{count.toLocaleString()}</div>
                </div>
              </div>;
            })}
            {SHIPS.every(s=>!(fleet as any)?.[s.key]) && <div style={{ color:C.muted, gridColumn:"1/-1" }}>No ships stationed</div>}
          </div>
        </div>
        {missions.length>0 && (
          <div style={css.card}>
            <div style={{ color:C.muted, fontSize:"10px", letterSpacing:"2px", marginBottom:"12px" }}>IN FLIGHT</div>
            {missions.map((m,i) => (
              <div key={i} style={{ padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"6px" }}>
                  <span style={css.badge(m.missionType===1?C.danger:C.accent)}>{missionLabels[m.missionType]}</span>
                  <span style={{ color:C.muted, fontSize:"11px" }}>{m.applied?"RETURNING":"EN ROUTE"} · ETA {formatDuration(countdowns[i]??0)}</span>
                </div>
                <div style={{ fontSize:"11px", color:C.muted, display:"flex", gap:"12px", flexWrap:"wrap" }}>
                  {m.sLightFighter>0&&<span>LF:{m.sLightFighter}</span>}
                  {m.sHeavyFighter>0&&<span>HF:{m.sHeavyFighter}</span>}
                  {m.sCruiser>0&&<span>CR:{m.sCruiser}</span>}
                  {m.sBattleship>0&&<span>BS:{m.sBattleship}</span>}
                  {m.sSmallCargo>0&&<span>SC:{m.sSmallCargo}</span>}
                  {m.sLargeCargo>0&&<span>LC:{m.sLargeCargo}</span>}
                  {m.cargoMetal>0&&<span style={{ color:C.metal }}>M:{formatNum(m.cargoMetal)}</span>}
                  {m.cargoCrystal>0&&<span style={{ color:C.crystal }}>C:{formatNum(m.cargoCrystal)}</span>}
                  {m.cargoDeuterium>0&&<span style={{ color:C.deut }}>D:{formatNum(m.cargoDeuterium)}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function GalaxyPage() {
    return (
      <div>
        <h2 style={{ color:C.accent, fontFamily:"'Orbitron',sans-serif", marginTop:0 }}>Galaxy</h2>
        <div style={{ display:"flex", gap:"10px", marginBottom:"16px", alignItems:"center" }}>
          <span style={{ color:C.muted }}>G:</span>
          <input type="number" min={1} max={9} style={{ ...css.input, width:"60px" }}
            defaultValue={galaXYRef.current.galaxy}
            onChange={e=>{ const v=parseInt(e.target.value)||1; galaXYRef.current.galaxy=v; setGalaXY(p=>({...p,galaxy:v})); }}
          />
          <span style={{ color:C.muted }}>S:</span>
          <input type="number" min={1} max={499} style={{ ...css.input, width:"70px" }}
            defaultValue={galaXYRef.current.system}
            onChange={e=>{ const v=parseInt(e.target.value)||1; galaXYRef.current.system=v; setGalaXY(p=>({...p,system:v})); }}
          />
          <button style={css.btn("primary",loading)} disabled={loading} onClick={handleScanGalaxy}>
            {loading?"SCANNING…":"SCAN"}
          </button>
        </div>
        {galaxyEntries.length===0 ? (
          <div style={{ color:C.muted, textAlign:"center", padding:"40px" }}>Enter coordinates and scan</div>
        ) : (
          <table style={css.table}>
            <thead><tr>{["Pos","Name","Owner","Metal Mine","Distance"].map(h=><th key={h} style={css.th}>{h}</th>)}</tr></thead>
            <tbody>
              {galaxyEntries.map(e => {
                const dist = planet ? galaxyDistance(planet.galaxy,planet.system,planet.position,e.galaxy,e.system,e.position) : 0;
                return (
                  <tr key={e.planetPda} style={{ background:e.isMe?`${C.accent}08`:"transparent" }}>
                    <td style={{ ...css.td, color:C.accent }}>{e.position}</td>
                    <td style={css.td}>{e.name}{e.isMe&&<span style={{ ...css.badge(C.accent2), marginLeft:"8px" }}>YOU</span>}</td>
                    <td style={{ ...css.td, color:C.muted, fontSize:"11px" }}>{e.isMe?"—":e.owner.slice(0,8)+"…"}</td>
                    <td style={{ ...css.td, color:C.metal }}>{e.metalMine}</td>
                    <td style={{ ...css.td, color:C.muted }}>{dist?formatNum(dist):"—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  const navItems = [
    { page:"overview" as Page,  icon:"◎", label:"Overview"  },
    { page:"buildings" as Page, icon:"⬡", label:"Buildings" },
    { page:"shipyard" as Page,  icon:"🚀", label:"Shipyard"  },
    { page:"fleet" as Page,     icon:"⚔", label:"Fleet"     },
    { page:"galaxy" as Page,    icon:"✦", label:"Galaxy"    },
  ];

  return (
    <div style={css.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&family=Share+Tech+Mono&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; background: ${C.bg}; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
        button { transition: opacity 0.15s; }
        button:hover:not(:disabled) { opacity: 0.8; }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.4} }
        @keyframes er-glow { 0%,100%{box-shadow:0 0 6px ${C.er}44}50%{box-shadow:0 0 14px ${C.er}88} }
      `}</style>

      <header style={css.header}>
        <h1 style={css.logo}>SOLAR GRID</h1>
        <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
          {loading && <span style={{ color:C.muted, animation:"pulse 1.5s infinite" }}>●</span>}

          {/* ER Session button */}
          {addresses && (
            sessionActive ? (
              <button
                style={{ ...css.btn("er", txBusy), animation:"er-glow 2s ease-in-out infinite" }}
                disabled={txBusy}
                onClick={handleEndSession}
                title="Commit state to Solana and end instant-action session"
              >
                ⚡ SAVE & EXIT SESSION
              </button>
            ) : (
              <button
                style={css.btn("er", txBusy||loading)}
                disabled={txBusy||loading}
                onClick={handleStartSession}
                title="Delegate to Ephemeral Rollup for instant transactions (no wallet popups)"
              >
                ⚡ START SESSION
              </button>
            )
          )}

          {/* ER status badge */}
          {sessionActive && (
            <span style={{ ...css.badge(C.er), animation:"er-glow 2s ease-in-out infinite" }}>
              ER ACTIVE
            </span>
          )}

          <WalletMultiButton />
        </div>
      </header>

      {!connected ? (
        <div style={{ textAlign:"center", padding:"120px 20px", color:C.muted }}>
          <div style={{ fontSize:"48px", marginBottom:"16px" }}>◎</div>
          <div style={{ fontFamily:"'Orbitron',sans-serif", color:C.accent, marginBottom:"8px" }}>SOLAR GRID</div>
          <div>Connect your wallet to colonize the galaxy</div>
        </div>
      ) : !addresses ? (
        <div style={{ maxWidth:"440px", margin:"80px auto", padding:"0 20px" }}>
          <div style={css.card}>
            <h2 style={{ color:C.accent, fontFamily:"'Orbitron',sans-serif", marginTop:0 }}>Establish Colony</h2>
            {status && <StatusBar msg={status.msg} ok={status.ok} />}
            <div style={{ marginBottom:"12px" }}>
              <label style={{ color:C.muted, fontSize:"11px", letterSpacing:"1px" }}>PLANET NAME</label>
              <input style={{ ...css.input, marginTop:"6px" }} value={planetName}
                onChange={e=>setPlanetName(e.target.value)} placeholder="Homeworld" />
            </div>
            <button style={{ ...css.btn("primary",loading), width:"100%", padding:"12px", fontSize:"13px" }}
              disabled={loading} onClick={handleCreate}>
              {loading?"DEPLOYING… (3 txns)":"COLONIZE"}
            </button>
            <div style={{ color:C.muted, fontSize:"11px", marginTop:"10px", textAlign:"center" }}>
              Requires 3 wallet approvals
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Resource bar */}
          <div style={css.resBar}>
            {[
              { label:"⬡ METAL",   val:liveRes.metal,    cap:resources?.metal_cap,    color:C.metal   },
              { label:"◈ CRYSTAL", val:liveRes.crystal,  cap:resources?.crystal_cap,  color:C.crystal },
              { label:"◉ DEUT",    val:liveRes.deuterium,cap:resources?.deuterium_cap,color:C.deut    },
            ].map(r=>(
              <div key={r.label} style={css.resItem}>
                <span style={{ color:C.muted, fontSize:"10px", letterSpacing:"1px" }}>{r.label}</span>
                <span style={{ color:r.color, fontFamily:"'Orbitron',sans-serif", fontSize:"13px" }}>{formatBig(r.val)}</span>
                <span style={{ color:C.muted, fontSize:"10px" }}>/ {formatBig(r.cap??0)}</span>
              </div>
            ))}
            <div style={{ ...css.resItem, marginLeft:"auto" }}>
              <span style={{ color:C.muted, fontSize:"10px" }}>⚡</span>
              <span style={{ color:energyColor(energyProd,energyCons), fontSize:"12px" }}>{energyProd}/{energyCons}</span>
            </div>
          </div>

          <div style={css.main}>
            <aside style={css.sidebar}>
              {navItems.map(n=>(
                <button key={n.page} style={css.navBtn(page===n.page)}
                  onClick={()=>{ setPage(n.page); if (n.page==="galaxy") handleScanGalaxy(); }}>
                  <span>{n.icon}</span><span>{n.label}</span>
                </button>
              ))}
              <div style={{ marginTop:"auto", padding:"16px", borderTop:`1px solid ${C.border}` }}>
                <div style={{ color:C.muted, fontSize:"10px", letterSpacing:"1px", marginBottom:"4px" }}>COLONY</div>
                <div style={{ color:C.text, fontSize:"12px" }}>{planet?.name||"—"}</div>
                <div style={{ color:C.muted, fontSize:"10px", marginTop:"2px" }}>
                  {planet?`${planet.galaxy}:${planet.system}:${planet.position}`:"—"}
                </div>
                {/* Session info at bottom of sidebar */}
                <div style={{ marginTop:"8px", padding:"6px 8px", background: sessionActive?`${C.er}12`:`${C.border}44`,
                  borderRadius:"3px", border:`1px solid ${sessionActive?C.er:C.border}44` }}>
                  <div style={{ color:sessionActive?C.er:C.muted, fontSize:"10px" }}>
                    {sessionActive?"⚡ ER ACTIVE":"● BASE MODE"}
                  </div>
                  <div style={{ color:C.muted, fontSize:"9px", marginTop:"2px" }}>
                    {sessionActive?"Instant txns · No popups":"Click START SESSION"}
                  </div>
                </div>
              </div>
            </aside>

            <main style={css.content}>
              {status && <StatusBar msg={status.msg} ok={status.ok} />}
              {page==="overview"  && <OverviewPage />}
              {page==="buildings" && <BuildingsPage />}
              {page==="shipyard"  && <ShipyardPage />}
              {page==="fleet"     && <FleetPage />}
              {page==="galaxy"    && <GalaxyPage />}
            </main>
          </div>
        </>
      )}
    </div>
  );
}
