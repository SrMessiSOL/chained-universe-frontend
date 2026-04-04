<<<<<<< HEAD
import React, { useEffect, useState, useCallback, useRef } from "react";
=======
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
>>>>>>> 1d25215687246c877ab376ad413894febd400d90
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
<<<<<<< HEAD
import {
  GameClient,
  Planet, Resources, Fleet, Mission, PlayerState,
  BUILDINGS, SHIPS, SHIP_TYPE_IDX, MISSION_LABELS,
  upgradeCost, buildTimeSecs,
  fmt, fmtCountdown, missionProgress, energyEfficiency, Research,
} from "./game";
import GalaxyTab from "./GalaxyTab";


// ─── Types ────────────────────────────────────────────────────────────────────
type Tab = "overview" | "resources" | "buildings" | "shipyard" | "fleet" | "missions" | "research" | "galaxy";

type LaunchTargetInput =
  | { kind: "transport"; mode: "owned"; destinationEntity: string }
  | { kind: "transport"; mode: "coords"; galaxy: number; system: number; position: number }
  | { kind: "colonize"; galaxy: number; system: number; position: number; colonyName: string };

type PendingColonizeMission = {
  sourceEntityPda: string;
  slot: number;
  galaxy: number;
  system: number;
  position: number;
  colonyName: string;
};

const PENDING_COLONIZE_KEY = "pending_colonize_missions";

function loadPendingColonizeMissions(): PendingColonizeMission[] {
  try {
    const raw = localStorage.getItem(PENDING_COLONIZE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePendingColonizeMission(mission: PendingColonizeMission): void {
  const missions = loadPendingColonizeMissions().filter(
    (entry) => !(entry.sourceEntityPda === mission.sourceEntityPda && entry.slot === mission.slot),
  );
  missions.push(mission);
  localStorage.setItem(PENDING_COLONIZE_KEY, JSON.stringify(missions));
}

function getPendingColonizeMission(sourceEntityPda: string, slot: number): PendingColonizeMission | null {
  const missions = loadPendingColonizeMissions();
  return missions.find((entry) => entry.sourceEntityPda === sourceEntityPda && entry.slot === slot) ?? null;
}

function removePendingColonizeMission(sourceEntityPda: string, slot: number): void {
  const missions = loadPendingColonizeMissions();
  const remaining = missions.filter((entry) => !(entry.sourceEntityPda === sourceEntityPda && entry.slot === slot));
  localStorage.setItem(PENDING_COLONIZE_KEY, JSON.stringify(remaining));
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Share+Tech+Mono&display=swap');

  *, *::before, *::after { 
    box-sizing: border-box; 
    margin: 0; 
    padding: 0; 
  }

    :root {
    --void:    #04040d;
    --panel:   #0b0b1e;
    --border:  #1a1a3a;
    --purple:  #9b5de5;
    --cyan:    #00f5d4;
    --text:    #c8d6e5;
    --dim:     #4a5568;
    --metal:   #b8b8d4;
    --crystal: #00f5d4;
    --deut:    #4cc9f0;
    --danger:  #ff006e;
    --success: #06d6a0;
    --warn:    #ffd60a;
    --glow-p:  0 0 20px rgba(155,93,229,0.4);
    --glow-c:  0 0 20px rgba(0,245,212,0.4);
  }

  html, body, #root { 
    height: 100%; 
    background: var(--void); 
    color: var(--text);
    font-family: 'Share Tech Mono', monospace; 
    font-size: 13px; 
    overflow: hidden; 
  }

  .starfield { 
    position: fixed; 
    inset: 0; 
    z-index: 0; 
    overflow: hidden; 
    pointer-events: none; 
  }

  .star { 
    position: absolute; 
    border-radius: 50%; 
    background: white;
    animation: twinkle var(--dur) ease-in-out infinite; 
    animation-delay: var(--delay); 
  }

  @keyframes twinkle { 
    0%,100%{opacity:var(--min-op);transform:scale(1)} 
    50%{opacity:1;transform:scale(1.4)} 
  }

  .app { 
    position: relative; 
    z-index: 1; 
    height: 100vh; 
    display: grid;
    grid-template-rows: 56px 1fr; 
    grid-template-columns: 220px 1fr;
    grid-template-areas: "header header" "sidebar main"; 
  }

  .header { 
    grid-area: header; 
    display: flex; 
    align-items: center; 
    justify-content: space-between;
    padding: 0 24px; 
    background: rgba(8,8,22,0.95); 
    border-bottom: 1px solid var(--border);
    backdrop-filter: blur(12px); 
  }

  .logo-area { display: flex; align-items: center; gap: 12px; }
  .game-title { 
    font-family: 'Orbitron', sans-serif; 
    font-size: 16px; 
    font-weight: 900;
    letter-spacing: 3px; 
    background: linear-gradient(135deg, var(--purple), var(--cyan));
    -webkit-background-clip: text; 
    -webkit-text-fill-color: transparent; 
  }

  /* ==================== LOADING OVERLAY ==================== */
.loading-overlay {
  position: fixed;
  inset: 0;
  background: rgba(4, 4, 13, 0.92);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  backdrop-filter: blur(8px);
}

.loading-spinner {
  width: 56px;
  height: 56px;
  border: 5px solid var(--border);
  border-top-color: var(--purple);
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}

.loading-text {
  font-family: 'Orbitron', sans-serif;
  font-size: 15px;
  letter-spacing: 3px;
  color: var(--cyan);
  text-transform: uppercase;
  text-align: center;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

  .header-right { display: flex; align-items: center; gap: 12px; }
  .chain-tag { 
    font-size: 10px; 
    letter-spacing: 1px; 
    color: var(--dim);
    border: 1px solid var(--border); 
    padding: 4px 8px; 
    border-radius: 2px; 
  }

  /* ==================== SIDEBAR ==================== */
.sidebar {
  grid-area: sidebar;
  background: rgba(11,11,30,0.9);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.planet-card {
  padding: 20px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

  .planet-coords { 
    font-size: 10px; 
    color: var(--dim); 
    letter-spacing: 1px; 
    margin-bottom: 6px; 
  }
  .planet-name { 
    font-family: 'Orbitron', sans-serif; 
    font-size: 14px; 
    font-weight: 700; 
    color: white; 
    margin-bottom: 2px; 
  }
  .planet-meta { 
    font-size: 10px; 
    color: var(--dim); 
  }
  .fields-bar { 
    margin-top: 10px; 
    height: 3px; 
    background: var(--border); 
    border-radius: 2px; 
    overflow: hidden; 
  }
  .fields-fill { 
    height: 100%; 
    background: linear-gradient(90deg, var(--purple), var(--cyan)); 
    transition: width 0.5s; 
  }
  .fields-label { 
    margin-top: 4px; 
    font-size: 10px; 
    color: var(--dim); 
    display: flex; 
    justify-content: space-between; 
  }

  .res-panel {
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .res-label { 
    font-size: 9px; 
    letter-spacing: 2px; 
    color: var(--dim); 
    text-transform: uppercase; 
    margin-bottom: 10px; 
  }
  .res-row { 
    display: flex; 
    align-items: center; 
    justify-content: space-between; 
    margin-bottom: 8px; 
  }
  .res-name { 
    display: flex; 
    align-items: center; 
    gap: 6px; 
    font-size: 11px; 
    color: var(--dim); 
  }
  .res-dot { 
    width: 6px; 
    height: 6px; 
    border-radius: 50%; 
  }
  .res-val { 
    font-size: 12px; 
    font-weight: 600; 
  }
  .res-rate { 
    font-size: 9px; 
    color: var(--dim); 
  }
  .cap-bar { 
    margin-bottom: 12px; 
    height: 2px; 
    background: var(--border); 
    border-radius: 1px; 
    overflow: hidden; 
  }
  .cap-fill { 
    height: 100%; 
    border-radius: 1px; 
    transition: width 0.5s; 
  }
  .energy-row { 
    display: flex; 
    align-items: center; 
    justify-content: space-between;
    padding: 8px 0; 
    border-top: 1px solid var(--border); 
  }

  /* Nav (Scrollable Tab Menu) */
  .nav {
  flex: 1 1 0;           /* Changed from 1 1 auto */
  min-height: 0;
  padding: 12px 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.nav::-webkit-scrollbar {
  width: 5px;
}
.nav::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 4px;
}
.nav::-webkit-scrollbar-thumb:hover {
  background: var(--cyan);
}

  .nav-item { 
    display: flex; 
    align-items: center; 
    gap: 10px; 
    padding: 11px 16px; 
    cursor: pointer;
    font-size: 11px; 
    letter-spacing: 1.5px; 
    text-transform: uppercase; 
    color: var(--dim);
    transition: all 0.15s; 
    border-left: 2px solid transparent; 
  }

  .nav-item:hover { 
    color: var(--text); 
    background: rgba(155,93,229,0.05); 
  }

  .nav-item.active { 
    color: var(--cyan); 
    border-left-color: var(--cyan); 
    background: rgba(0,245,212,0.05); 
  }

  .nav-badge { 
    margin-left: auto; 
    font-size: 9px; 
    padding: 2px 6px;
    background: var(--danger); 
    border-radius: 10px; 
    color: white; 
    font-weight: 700; 
  }

  /* ==================== MAIN CONTENT ==================== */
  .main { 
    grid-area: main; 
    overflow-y: auto; 
    padding: 24px;
    scrollbar-width: thin; 
    scrollbar-color: var(--border) transparent; 
  }
  .main::-webkit-scrollbar { width: 4px; }
  .main::-webkit-scrollbar-thumb { background: var(--border); }

  /* Rest of your styles (unchanged) */
  .section-title { 
    font-family: 'Orbitron', sans-serif; 
    font-size: 12px; 
    font-weight: 700;
    letter-spacing: 3px; 
    color: var(--purple); 
    text-transform: uppercase; 
    margin-bottom: 20px;
    padding-bottom: 8px; 
    border-bottom: 1px solid var(--border);
    display: flex; 
    align-items: center; 
    gap: 10px; 
  }
  .section-title::after { 
    content:''; 
    flex:1; 
    height:1px; 
    background: linear-gradient(90deg, var(--border), transparent); 
  }

  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .grid-3 { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; }
  .grid-4 { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; }

  .card { 
    background: var(--panel); 
    border: 1px solid var(--border); 
    border-radius: 4px; 
    padding: 16px; 
    transition: border-color 0.2s; 
  }
  .card:hover { border-color: rgba(155,93,229,0.3); }

  .card-label { 
    font-size: 9px; 
    letter-spacing: 2px; 
    color: var(--dim); 
    text-transform: uppercase; 
    margin-bottom: 6px; 
  }
  .card-value { 
    font-family: 'Orbitron', sans-serif; 
    font-size: 20px; 
    font-weight: 700; 
    color: white; 
  }
  .card-sub { 
    font-size: 10px; 
    color: var(--dim); 
    margin-top: 3px; 
  }

  .building-card { background: var(--panel); border: 1px solid var(--border); border-radius: 4px;
    padding: 14px; display: flex; flex-direction: column; gap: 8px; transition: all 0.2s; }
  .building-card:hover { border-color: rgba(155,93,229,0.4); }
  .building-header { display: flex; align-items: center; justify-content: space-between; }
  .building-icon-name { display: flex; align-items: center; gap: 8px; }
  .building-icon { font-size: 16px; }
  .building-name { font-size: 11px; color: var(--text); }
  .building-level { font-family: 'Orbitron', sans-serif; font-size: 16px; font-weight: 700; color: var(--purple); }
  .building-costs { font-size: 10px; color: var(--dim); display: flex; flex-direction: column; gap: 2px; }
  .building-cost-row { display: flex; justify-content: space-between; }
  .cost-ok { color: var(--text); } .cost-bad { color: var(--danger); }
  .build-btn { font-family: 'Share Tech Mono', monospace; font-size: 10px; letter-spacing: 1px;
    padding: 6px 10px; border-radius: 2px; border: none; cursor: pointer; transition: all 0.15s;
    text-transform: uppercase; width: 100%; }
  .build-btn.can-build { background: linear-gradient(135deg,rgba(155,93,229,0.2),rgba(0,245,212,0.1));
    border: 1px solid var(--purple); color: var(--purple); }
  .build-btn.can-build:hover { background: linear-gradient(135deg,var(--purple),var(--cyan));
    color: var(--void); box-shadow: var(--glow-p); }
  .build-btn.building-now { background: rgba(255,214,10,0.1); border: 1px solid var(--warn);
    color: var(--warn); cursor: default; }
  .build-btn.finish-btn { background: rgba(6,214,160,0.1); border: 1px solid var(--success); color: var(--success); }
  .build-btn.finish-btn:hover { background: var(--success); color: var(--void); }
  .build-btn.no-funds { background: transparent; border: 1px solid var(--border); color: var(--dim); cursor: not-allowed; }

  /* Shipyard cards */
  .ship-build-card { background: var(--panel); border: 1px solid var(--border); border-radius: 4px;
    padding: 14px; display: flex; flex-direction: column; gap: 8px; transition: border-color 0.2s; }
  .ship-build-card:hover { border-color: rgba(0,245,212,0.3); }
  .ship-build-header { display: flex; align-items: center; justify-content: space-between; }
  .ship-build-icon-name { display: flex; align-items: center; gap: 8px; }
  .ship-build-icon { font-size: 20px; }
  .ship-build-name { font-size: 11px; color: var(--text); }
  .ship-build-count { font-family: 'Orbitron', sans-serif; font-size: 14px; font-weight: 700; color: var(--cyan); }
  .ship-build-count.zero { color: var(--border); }
  .ship-build-stats { font-size: 9px; color: var(--dim); display: flex; gap: 10px; }
  .ship-qty-row { display: flex; align-items: center; gap: 6px; }
  .qty-input { width: 60px; padding: 4px 6px; font-size: 11px; border-radius: 2px; text-align: center; }
  .ship-build-btn { font-family: 'Share Tech Mono', monospace; font-size: 10px; letter-spacing: 1px;
    padding: 6px 10px; border-radius: 2px; border: 1px solid var(--cyan);
    background: rgba(0,245,212,0.08); color: var(--cyan); cursor: pointer; transition: all 0.15s;
    text-transform: uppercase; flex: 1; }
  .ship-build-btn:hover:not(:disabled) { background: var(--cyan); color: var(--void); box-shadow: var(--glow-c); }
  .ship-build-btn:disabled { border-color: var(--border); color: var(--dim); cursor: not-allowed; background: transparent; }

  /* Fleet hangar cards */
  .ship-card { background: var(--panel); border: 1px solid var(--border); border-radius: 4px;
    padding: 14px; display: flex; flex-direction: column; align-items: center; gap: 6px;
    transition: border-color 0.2s; position: relative; }
  .ship-card:hover { border-color: rgba(0,245,212,0.3); }
  .ship-icon { font-size: 22px; }
  .ship-name { font-size: 9px; color: var(--dim); text-align: center; letter-spacing: 1px; }
  .ship-count { font-family: 'Orbitron', sans-serif; font-size: 18px; font-weight: 700; color: var(--cyan); }
  .ship-count.zero { color: var(--border); }
  .launch-btn { font-size: 9px; letter-spacing: 1px; padding: 3px 8px; border-radius: 2px;
    border: 1px solid var(--purple); background: rgba(155,93,229,0.08); color: var(--purple);
    cursor: pointer; transition: all 0.15s; margin-top: 2px; }
  .launch-btn:hover { background: var(--purple); color: var(--void); }

  /* Mission cards */
  .mission-card { background: var(--panel); border: 1px solid var(--border); border-radius: 4px; padding: 16px; margin-bottom: 12px; }
  .mission-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .mission-type-badge { font-size: 10px; letter-spacing: 2px; padding: 3px 8px; border-radius: 2px; font-weight: 700; }
  .mission-type-badge.attack    { background:rgba(255,0,110,0.15); color:var(--danger); border:1px solid rgba(255,0,110,0.3); }
  .mission-type-badge.transport { background:rgba(0,245,212,0.1);  color:var(--cyan);   border:1px solid rgba(0,245,212,0.3); }
  .mission-type-badge.other     { background:rgba(155,93,229,0.1); color:var(--purple); border:1px solid rgba(155,93,229,0.3); }
  .mission-returning { font-size: 10px; color: var(--success); letter-spacing: 1px; }
  .progress-bar { height: 3px; background: var(--border); border-radius: 2px; overflow: hidden; margin-bottom: 8px; }
  .progress-fill { height: 100%; border-radius: 2px; transition: width 1s linear; }
  .progress-fill.outbound  { background: linear-gradient(90deg, var(--purple), var(--cyan)); }
  .progress-fill.returning { background: linear-gradient(90deg, var(--cyan), var(--success)); }
  .mission-info { display: flex; justify-content: space-between; font-size: 10px; color: var(--dim); }
  .mission-eta { color: var(--cyan); font-weight: 600; }
  .mission-ships { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px; }
  .mission-ship-badge { font-size: 10px; background: rgba(155,93,229,0.08);
    border: 1px solid var(--border); border-radius: 2px; padding: 2px 6px; color: var(--text); }
  .apply-btn { font-family: 'Share Tech Mono', monospace; font-size: 10px; letter-spacing: 1px;
    padding: 6px 14px; border-radius: 2px; border: 1px solid var(--success);
    background: rgba(6,214,160,0.1); color: var(--success); cursor: pointer;
    transition: all 0.15s; margin-top: 10px; }
  .apply-btn:hover:not(:disabled) { background: var(--success); color: var(--void); }
  .apply-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .apply-btn.danger { border-color: var(--danger); background: rgba(255,0,110,0.08); color: var(--danger); }
  .apply-btn.danger:hover:not(:disabled) { background: var(--danger); color: var(--void); }

  .stat-row { display: flex; align-items: center; justify-content: space-between;
    padding: 10px 0; border-bottom: 1px solid rgba(26,26,58,0.5); }
  .stat-row:last-child { border-bottom: none; }
  .stat-key { color: var(--dim); font-size: 11px; letter-spacing: 1px; }
  .stat-val { font-size: 11px; color: var(--text); }

  .build-queue-banner { background: rgba(255,214,10,0.05); border: 1px solid rgba(255,214,10,0.2);
    border-radius: 4px; padding: 12px 16px; margin-bottom: 20px;
    display: flex; align-items: center; justify-content: space-between; }
  .build-queue-label { font-size: 10px; color: var(--warn); letter-spacing: 2px; text-transform: uppercase; }
  .build-queue-item-name { font-size: 13px; color: var(--text); margin-top: 2px; }
  .build-queue-right { text-align: right; }
  .build-queue-eta { font-family: 'Orbitron', sans-serif; font-size: 16px; font-weight: 700; color: var(--warn); }

  /* Launch Fleet Modal */
  .modal-backdrop { position: fixed; inset: 0; background: rgba(4,4,13,0.85);
    z-index: 100; display: flex; align-items: center; justify-content: center;
    backdrop-filter: blur(4px); }
  .modal { background: var(--panel); border: 1px solid var(--border); border-radius: 6px;
    padding: 28px; width: 560px; max-height: 85vh; overflow-y: auto;
    scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
  .modal-title { font-family: 'Orbitron', sans-serif; font-size: 13px; font-weight: 700;
    letter-spacing: 3px; color: var(--cyan); margin-bottom: 20px;
    padding-bottom: 10px; border-bottom: 1px solid var(--border); }
  .modal-section { margin-bottom: 18px; }
  .modal-label { font-size: 9px; letter-spacing: 2px; color: var(--dim);
    text-transform: uppercase; margin-bottom: 10px; }
  .modal-ship-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
  .modal-ship-row { display: flex; align-items: center; justify-content: space-between;
    background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 3px; padding: 6px 8px; }
  .modal-ship-label { font-size: 10px; color: var(--text); display: flex; align-items: center; gap: 5px; }
  .modal-ship-avail { font-size: 9px; color: var(--dim); }
  .modal-input { width: 64px; padding: 4px 6px; font-size: 11px; border-radius: 2px; text-align: right; }
  .modal-select { padding: 6px 10px; font-size: 11px; border-radius: 2px; width: 100%; }
  .modal-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .modal-footer { display: flex; gap: 10px; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border); }
  .modal-btn { font-family: 'Share Tech Mono', monospace; font-size: 11px; letter-spacing: 1px;
    padding: 9px 18px; border-radius: 2px; cursor: pointer; transition: all 0.15s;
    text-transform: uppercase; flex: 1; }
  .modal-btn.primary { border: 1px solid var(--cyan); background: rgba(0,245,212,0.1);
    color: var(--cyan); }
  .modal-btn.primary:hover:not(:disabled) { background: var(--cyan); color: var(--void); box-shadow: var(--glow-c); }
  .modal-btn.secondary { border: 1px solid var(--border); background: transparent; color: var(--dim); }
  .modal-btn.secondary:hover { color: var(--text); border-color: var(--dim); }
  .modal-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .modal-btn.danger { border: 1px solid var(--danger); background: rgba(255,0,110,0.08); color: var(--danger); }
  .modal-btn.danger:hover:not(:disabled) { background: var(--danger); color: var(--void); }
  .modal-info-row { font-size: 10px; color: var(--dim); display: flex; justify-content: space-between;
    padding: 4px 0; border-bottom: 1px solid rgba(26,26,58,0.3); }
  .modal-info-row:last-child { border-bottom: none; }
  .modal-info-val { color: var(--text); }

  .landing { height: 100vh; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 32px; position: relative; z-index: 1; }
  .landing-logo { animation: float 4s ease-in-out infinite; }
  @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
  .landing-title { font-family: 'Orbitron', sans-serif; font-size: 42px; font-weight: 900;
    letter-spacing: 6px; text-align: center;
    background: linear-gradient(135deg,var(--purple) 0%,var(--cyan) 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .landing-sub { font-size: 12px; letter-spacing: 3px; color: var(--dim); text-transform: uppercase; text-align: center; }

  .no-planet { max-width: 480px; margin: 80px auto; padding: 0 40px; text-align: center; }
  .no-planet-title { font-family:'Orbitron',sans-serif; font-size:16px; color:var(--purple); letter-spacing:3px; margin:24px 0 10px; }
  .no-planet-sub { color:var(--dim); font-size:11px; letter-spacing:1px; line-height:1.8; margin-bottom:32px; }
  .planet-name-input { background:var(--panel); border:1px solid var(--border); border-radius:3px;
    padding:10px 14px; color:var(--text); font-family:'Share Tech Mono',monospace; font-size:13px;
    letter-spacing:1px; outline:none; width:100%; text-align:center; margin-bottom:12px; }
  .create-btn { font-family:'Orbitron',sans-serif; font-size:12px; font-weight:700; letter-spacing:2px;
    padding:13px 24px; border:2px solid var(--cyan); border-radius:3px;
    background:linear-gradient(135deg,rgba(0,245,212,0.1),rgba(155,93,229,0.05));
    color:var(--cyan); cursor:pointer; transition:all 0.2s; width:100%; text-transform:uppercase; }
  .create-btn:hover:not(:disabled) { background:linear-gradient(135deg,var(--cyan),var(--purple));
    color:var(--void); box-shadow:var(--glow-c); }
  .create-btn:disabled { color:var(--dim); cursor:not-allowed; }

  .spinner { width:40px; height:40px; border:2px solid var(--border); border-top-color:var(--purple);
    border-radius:50%; animation:spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .error-msg { color:var(--danger); font-size:11px; letter-spacing:1px; margin-top:8px; }
  .success-msg { color:var(--success); font-size:11px; letter-spacing:1px; margin-top:8px; }

  .tag { font-size:9px; letter-spacing:1.5px; padding:2px 6px; border-radius:2px; text-transform:uppercase;
    background:rgba(155,93,229,0.1); border:1px solid rgba(155,93,229,0.3); color:var(--purple); }
  .pulse { animation: pulse 2s ease-in-out infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  @keyframes er-pulse { 0%,100%{box-shadow:0 0 6px rgba(160,96,240,0.4)} 50%{box-shadow:0 0 14px rgba(160,96,240,0.8)} }

  .wallet-adapter-button { font-family:'Share Tech Mono',monospace !important; font-size:11px !important;
    letter-spacing:1px !important; border-radius:2px !important; }

  .notice-box { background: rgba(155,93,229,0.05); border: 1px solid rgba(155,93,229,0.2);
    border-radius: 4px; padding: 10px 14px; font-size: 10px; color: var(--dim);
    letter-spacing: 1px; margin-bottom: 16px; }
  .notice-box.warn { background: rgba(255,0,110,0.05); border-color: rgba(255,0,110,0.2); color: var(--danger); }
`;

const LoadingOverlay: React.FC<{ visible: boolean; message?: string }> = ({ visible, message }) => {
  if (!visible) return null;

  return (
    <div className="loading-overlay">
      <div className="loading-spinner" />
      <div className="loading-text">
        {message ?? "PROCESSING ON-CHAIN TRANSACTION..."}
      </div>
      <div style={{ fontSize: "10px", color: "var(--dim)", marginTop: 8, letterSpacing: "1px" }}>
        Please do not refresh the page
      </div>
    </div>
  );
};
// ─── Procedural Pixel Planet + Orbit System ──────────────────────────────────

type PlanetBiome = "lava" | "temperate" | "arid" | "ice";
type RGBA = [number, number, number, number];

type PixelPlanetVisual = {
  seed: number;
  biome: PlanetBiome;

  // Main surface palettes
  basePalette: RGBA[];
  atmosphere: RGBA;
  glow: RGBA;
  cloudPalette: RGBA[];
  ringPalette: RGBA[];

  // Visual traits
  hasRings: boolean;
  hasStorm: boolean;
  craterDensity: number;
  cloudDensity: number;
  mountainDensity: number;
  waterLevel: number;
  banding: number;
  polarCaps: boolean;

  // Orbit / motion params
  orbitRadius: number;
  orbitSpeed: number;      // radians per ms
  orbitTiltY: number;      // ellipse squish
  initialAngle: number;
  rotationSpeed: number;   // texture rotation
  cloudDriftSpeed: number; // cloud layer movement
  ringTiltDeg: number;
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rgba = (r: number, g: number, b: number, a = 255): RGBA => [r, g, b, a];

function rgbaToCss([r, g, b, a]: RGBA): string {
  return `rgba(${r}, ${g}, ${b}, ${a / 255})`;
}

function mixColor(a: RGBA, b: RGBA, t: number): RGBA {
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
    Math.round(lerp(a[3], b[3], t)),
  ];
}

function mulColor(a: RGBA, f: number): RGBA {
  return [
    clamp(Math.round(a[0] * f), 0, 255),
    clamp(Math.round(a[1] * f), 0, 255),
    clamp(Math.round(a[2] * f), 0, 255),
    a[3],
  ];
}

function addColor(a: RGBA, amt: number): RGBA {
  return [
    clamp(a[0] + amt, 0, 255),
    clamp(a[1] + amt, 0, 255),
    clamp(a[2] + amt, 0, 255),
    a[3],
  ];
}

function hashCoords(galaxy: number, system: number, position: number): number {
  let h = 2166136261 >>> 0;
  const str = `${galaxy}:${system}:${position}`;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function valueNoise2D(x: number, y: number, seed: number): number {
  let n =
    Math.imul((x | 0) ^ 0x27d4eb2d, 374761393) ^
    Math.imul((y | 0) ^ 0x165667b1, 668265263) ^
    seed;
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return (n & 0xffff) / 0xffff;
}

function smoothNoise2D(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const xf = x - x0;
  const yf = y - y0;

  const v00 = valueNoise2D(x0, y0, seed);
  const v10 = valueNoise2D(x0 + 1, y0, seed);
  const v01 = valueNoise2D(x0, y0 + 1, seed);
  const v11 = valueNoise2D(x0 + 1, y0 + 1, seed);

  const sx = xf * xf * (3 - 2 * xf);
  const sy = yf * yf * (3 - 2 * yf);

  const ix0 = lerp(v00, v10, sx);
  const ix1 = lerp(v01, v11, sx);
  return lerp(ix0, ix1, sy);
}

function fbm2D(x: number, y: number, seed: number, octaves = 5): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;

  for (let i = 0; i < octaves; i++) {
    value += smoothNoise2D(x * freq, y * freq, seed + i * 9973) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }

  return value / norm;
}

function getBiome(position: number): PlanetBiome {
  if (position <= 3) return "lava";
  if (position <= 6) return "temperate";
  if (position <= 10) return "arid";
  return "ice";
}

function paletteSample(palette: RGBA[], t: number): RGBA {
  const n = palette.length - 1;
  if (t <= 0) return palette[0];
  if (t >= 1) return palette[n];

  const scaled = t * n;
  const i = Math.floor(scaled);
  const f = scaled - i;
  return mixColor(palette[i], palette[Math.min(i + 1, n)], f);
}

function chooseVisual(planet: Planet): PixelPlanetVisual {
  const position = clamp(planet.position || 1, 1, 15);
  const biome = getBiome(position);
  const seed = hashCoords(planet.galaxy || 1, planet.system || 1, position);
  const rand = mulberry32(seed);

  const orbitRadius = 16 + position * 3.6;
  const orbitSpeed = 0.00025 + (16 - position) * 0.000015 + rand() * 0.00012;
  const orbitTiltY = 0.52 + rand() * 0.16;
  const initialAngle = rand() * Math.PI * 2;
  const rotationSpeed = 0.000015 + rand() * 0.00003;
  const cloudDriftSpeed = 0.00002 + rand() * 0.000025;
  const ringTiltDeg = -12 + rand() * 24;

  if (biome === "lava") {
    return {
      seed,
      biome,
      basePalette: [
        rgba(26, 8, 10),
        rgba(72, 18, 16),
        rgba(138, 34, 18),
        rgba(212, 79, 18),
        rgba(255, 173, 67),
      ],
      atmosphere: rgba(255, 104, 36, 90),
      glow: rgba(255, 98, 28, 180),
      cloudPalette: [rgba(255, 190, 110, 32), rgba(255, 130, 60, 24)],
      ringPalette: [rgba(140, 70, 40, 120), rgba(255, 150, 70, 80)],
      hasRings: false,
      hasStorm: rand() > 0.65,
      craterDensity: 0.08 + rand() * 0.05,
      cloudDensity: 0.03 + rand() * 0.03,
      mountainDensity: 0.22 + rand() * 0.10,
      waterLevel: 0.0,
      banding: 0.12 + rand() * 0.10,
      polarCaps: false,
      orbitRadius,
      orbitSpeed,
      orbitTiltY,
      initialAngle,
      rotationSpeed,
      cloudDriftSpeed,
      ringTiltDeg,
    };
  }

  if (biome === "temperate") {
    return {
      seed,
      biome,
      basePalette: [
        rgba(12, 34, 56),
        rgba(28, 86, 136),
        rgba(32, 126, 98),
        rgba(88, 165, 101),
        rgba(186, 205, 144),
      ],
      atmosphere: rgba(90, 185, 255, 80),
      glow: rgba(72, 198, 255, 150),
      cloudPalette: [rgba(248, 252, 255, 95), rgba(210, 235, 255, 60)],
      ringPalette: [rgba(180, 210, 225, 90), rgba(235, 245, 255, 60)],
      hasRings: false,
      hasStorm: rand() > 0.72,
      craterDensity: 0.015 + rand() * 0.02,
      cloudDensity: 0.12 + rand() * 0.10,
      mountainDensity: 0.12 + rand() * 0.08,
      waterLevel: 0.44 + rand() * 0.16,
      banding: 0.03 + rand() * 0.04,
      polarCaps: rand() > 0.55,
      orbitRadius,
      orbitSpeed,
      orbitTiltY,
      initialAngle,
      rotationSpeed,
      cloudDriftSpeed,
      ringTiltDeg,
    };
  }

  if (biome === "arid") {
    return {
      seed,
      biome,
      basePalette: [
        rgba(59, 33, 20),
        rgba(111, 67, 38),
        rgba(164, 103, 63),
        rgba(212, 164, 109),
        rgba(241, 219, 174),
      ],
      atmosphere: rgba(255, 194, 108, 64),
      glow: rgba(255, 191, 110, 135),
      cloudPalette: [rgba(245, 224, 180, 42), rgba(255, 236, 200, 28)],
      ringPalette: [rgba(166, 132, 92, 105), rgba(240, 214, 174, 76)],
      hasRings: false,
      hasStorm: rand() > 0.52,
      craterDensity: 0.05 + rand() * 0.06,
      cloudDensity: 0.04 + rand() * 0.04,
      mountainDensity: 0.16 + rand() * 0.10,
      waterLevel: rand() > 0.88 ? 0.08 + rand() * 0.08 : 0.0,
      banding: 0.10 + rand() * 0.08,
      polarCaps: false,
      orbitRadius,
      orbitSpeed,
      orbitTiltY,
      initialAngle,
      rotationSpeed,
      cloudDriftSpeed,
      ringTiltDeg,
    };
  }

  return {
    seed,
    biome,
    basePalette: [
      rgba(21, 41, 68),
      rgba(47, 86, 128),
      rgba(112, 165, 197),
      rgba(195, 229, 243),
      rgba(244, 250, 255),
    ],
    atmosphere: rgba(160, 220, 255, 88),
    glow: rgba(180, 230, 255, 145),
    cloudPalette: [rgba(252, 252, 255, 74), rgba(225, 242, 255, 48)],
    ringPalette: [rgba(210, 228, 244, 92), rgba(255, 255, 255, 60)],
    hasRings: false,
    hasStorm: rand() > 0.75,
    craterDensity: 0.03 + rand() * 0.05,
    cloudDensity: 0.08 + rand() * 0.08,
    mountainDensity: 0.10 + rand() * 0.08,
    waterLevel: 0.10 + rand() * 0.10,
    banding: 0.05 + rand() * 0.06,
    polarCaps: true,
    orbitRadius,
    orbitSpeed,
    orbitTiltY,
    initialAngle,
    rotationSpeed,
    cloudDriftSpeed,
    ringTiltDeg,
  };
}

function drawFilledCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  color: RGBA
) {
  ctx.fillStyle = rgbaToCss(color);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawPixelRings(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  planetRadius: number,
  palette: RGBA[],
  tiltDeg: number,
  seed: number
) {
  const rand = mulberry32(seed ^ 0x91e10da5);
  const angle = (tiltDeg * Math.PI) / 180;

  const innerRx = planetRadius * 1.18;
  const outerRx = planetRadius * 1.62;
  const innerRy = innerRx * 0.26;
  const outerRy = outerRx * 0.26;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.translate(-cx, -cy);

  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const col = paletteSample(palette, t);
    const rx = lerp(innerRx, outerRx, t);
    const ry = lerp(innerRy, outerRy, t);

    ctx.strokeStyle = rgbaToCss(col);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  for (let i = 0; i < 140; i++) {
    const a = rand() * Math.PI * 2;
    const t = rand();
    const rx = lerp(innerRx, outerRx, t);
    const ry = lerp(innerRy, outerRy, t);
    const x = cx + Math.cos(a) * rx;
    const y = cy + Math.sin(a) * ry;

    ctx.fillStyle = rgbaToCss(palette[Math.floor(rand() * palette.length)]);
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }

  ctx.restore();
}

function renderPixelPlanetToCanvas(
  canvas: HTMLCanvasElement,
  planet: Planet,
  opts?: { size?: number; rotationOffset?: number; cloudOffset?: number }
) {
  const size = opts?.size ?? 92;
  const scale = window.devicePixelRatio > 1 ? 2 : 1;
  const visual = chooseVisual(planet);
  const rotationOffset = opts?.rotationOffset ?? 0;
  const cloudOffset = opts?.cloudOffset ?? 0;

  canvas.width = size;
  canvas.height = size;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = false;

  const cx = size / 2;
  const cy = size / 2;
  const radius = Math.floor(size * 0.355);

  const rand = mulberry32(visual.seed);
  const lightX = -0.62;
  const lightY = -0.42;
  const tilt = (rand() * 2 - 1) * 0.35;

 if (visual.hasRings) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2);
  ctx.clip();
  drawPixelRings(ctx, cx, cy, radius, visual.ringPalette, visual.ringTiltDeg, visual.seed ^ 0x00abcdef);
  ctx.restore();
}

  const img = ctx.createImageData(size, size);
  const data = img.data;

  const stormCx = (rand() * 1.2 - 0.6) * 0.45;
  const stormCy = (rand() * 1.2 - 0.6) * 0.45;
  const stormR = 0.10 + rand() * 0.08;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const dx = (px - cx) / radius;
      const dy = (py - cy) / radius;

      const rr = dx * dx + dy * dy;
      if (rr > 1) continue;

      const z = Math.sqrt(1 - rr);
      const nx = dx;
      const ny = dy * Math.cos(tilt) - z * Math.sin(tilt);
      const nz = dy * Math.sin(tilt) + z * Math.cos(tilt);

      const shade = clamp(nx * lightX + ny * lightY + nz * 0.88, -1, 1);
      const lambert = 0.28 + Math.max(0, shade) * 0.85;

      const u = (0.5 + Math.atan2(nx, nz) / (Math.PI * 2) + rotationOffset) % 1;
      const v = 0.5 - Math.asin(ny) / Math.PI;

      const continents = fbm2D(u * 5.5 + 11.7, v * 5.5 + 3.2, visual.seed + 101, 6);
      const details = fbm2D(u * 16.0 + 0.8, v * 16.0 + 7.3, visual.seed + 202, 5);
      const ridges = fbm2D(u * 22.0 + 8.4, v * 22.0 + 9.1, visual.seed + 303, 4);
      const micro = fbm2D(u * 42.0 + 2.1, v * 42.0 + 1.6, visual.seed + 404, 3);

      const lat = Math.abs(v - 0.5) * 2;
      const band =
        (Math.sin((v + u * 0.2) * Math.PI * (4 + visual.banding * 18) + visual.seed * 0.001) + 1) * 0.5;

      let height =
        continents * 0.56 +
        details * 0.24 +
        ridges * 0.14 +
        micro * 0.06 +
        band * visual.banding * 0.22;

      if (visual.biome === "temperate" || visual.biome === "ice") {
        height -= visual.waterLevel * 0.42;
      } else if (visual.biome === "arid") {
        height -= visual.waterLevel * 0.20;
      } else {
        height += 0.06;
      }

      let baseT = clamp(height, 0, 1);
      let color = paletteSample(visual.basePalette, baseT);

      if (visual.biome === "temperate") {
        const oceanMask = height < 0.08;
        if (oceanMask) {
          const oceanDeep = rgba(7, 35, 76, 255);
          const oceanShallow = rgba(42, 118, 188, 255);
          color = mixColor(oceanDeep, oceanShallow, clamp((height + 0.12) / 0.20, 0, 1));
        } else {
          if (height > 0.42) color = mixColor(color, rgba(184, 188, 154, 255), 0.25);
          if (height > 0.62) color = mixColor(color, rgba(232, 234, 228, 255), 0.35);
        }
      }

      if (visual.biome === "arid") {
        const canyon = fbm2D(u * 24 + 4.4, v * 24 + 8.8, visual.seed + 505, 4);
        if (canyon > 0.67) color = mixColor(color, rgba(115, 62, 30, 255), 0.35);
        if (height > 0.58) color = mixColor(color, rgba(250, 226, 190, 255), 0.22);
      }

      if (visual.biome === "lava") {
        const magma = fbm2D(u * 19 + 1.3, v * 19 + 2.6, visual.seed + 606, 5);
        const crack = fbm2D(u * 40 + 3.7, v * 40 + 5.5, visual.seed + 707, 3);
        if (magma > 0.66 || crack > 0.73) {
          color = mixColor(color, rgba(255, 129, 32, 255), 0.62);
        }
        if (magma > 0.80) {
          color = mixColor(color, rgba(255, 210, 92, 255), 0.74);
        }
      }

      if (visual.biome === "ice") {
        if (height < 0.06) {
          color = mixColor(rgba(70, 126, 178, 255), rgba(128, 190, 226, 255), clamp((height + 0.08) / 0.14, 0, 1));
        } else {
          color = mixColor(color, rgba(245, 249, 255, 255), 0.18 + lat * 0.10);
        }
      }

      if (visual.polarCaps && lat > 0.72) {
        const iceBlend = clamp((lat - 0.72) / 0.22, 0, 1);
        color = mixColor(color, rgba(245, 248, 255, 255), iceBlend * 0.85);
      }

      const craterNoise = fbm2D(u * 31 + 9.1, v * 31 + 1.4, visual.seed + 808, 4);
      if (craterNoise > 1 - visual.craterDensity) {
        color = mulColor(color, 0.72);
      }

      const mountainNoise = fbm2D(u * 26 + 2.9, v * 26 + 6.8, visual.seed + 909, 4);
      if (mountainNoise > 1 - visual.mountainDensity) {
        color = addColor(color, 14);
      }

      if (visual.hasStorm) {
        const sx = u - (0.5 + stormCx);
        const sy = v - (0.5 + stormCy);
        const sdist = Math.sqrt(sx * sx + sy * sy);
        if (sdist < stormR) {
          const spiral = Math.sin(Math.atan2(sy, sx) * 6 + sdist * 64 - visual.seed * 0.002);
          const stormAmt = clamp((stormR - sdist) / stormR, 0, 1) * (0.3 + (spiral + 1) * 0.25);
          color = mixColor(color, visual.cloudPalette[0], stormAmt);
        }
      }

      const cloudNoise = fbm2D((u + cloudOffset) * 14 + 5.3, v * 14 + 7.9, visual.seed + 1111, 5);
      if (cloudNoise > 1 - visual.cloudDensity) {
        const amt = clamp((cloudNoise - (1 - visual.cloudDensity)) / visual.cloudDensity, 0, 1);
        color = mixColor(color, visual.cloudPalette[0], amt * 0.70);
      }

      const rim = Math.pow(1 - z, 1.6);
      color = mixColor(color, visual.atmosphere, rim * 0.65);

      color = mulColor(color, lambert);

      const spec = Math.pow(Math.max(0, shade), 18);
      if (visual.biome === "temperate" || visual.biome === "ice") {
        color = addColor(color, Math.round(spec * 52));
      } else {
        color = addColor(color, Math.round(spec * 24));
      }

      const idx = (py * size + px) * 4;
      data[idx] = color[0];
      data[idx + 1] = color[1];
      data[idx + 2] = color[2];
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);



  if (visual.hasRings) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 1, 0, Math.PI);
    ctx.clip();
    drawFilledCircle(ctx, -999, -999, 1, rgba(0, 0, 0, 0));
    drawPixelRings(ctx, cx, cy, radius, visual.ringPalette, visual.ringTiltDeg, visual.seed ^ 0x00abcdef);
    ctx.restore();
  }
}

const PixelPlanetCanvas: React.FC<{
  planet: Planet;
  size?: number;
  rotationOffset?: number;
  cloudOffset?: number;
}> = ({ planet, size = 92, rotationOffset = 0, cloudOffset = 0 }) => {
  const ref = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    if (!ref.current) return;
    renderPixelPlanetToCanvas(ref.current, planet, {
  size,
  rotationOffset,
  cloudOffset,
});
  }, [
    planet.galaxy,
    planet.system,
    planet.position,
    planet.temperature,
    planet.diameter,
    planet.name,
    size,
    rotationOffset,
    cloudOffset,
  ]);

  return (
<canvas
  ref={ref}
  width={size}
  height={size}
  style={{
    display: "absolute",
    imageRendering: "pixelated",
    margin: 0,
    padding: 0,
  }}
/>
  );
};

// ─── Requirement Error Modal (Works for Ships + Buildings) ───────────────────
interface RequirementErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  requirements?: string[];
}

const RequirementErrorModal: React.FC<RequirementErrorModalProps> = ({
  isOpen,
  onClose,
  title,
  message,
  requirements = [],
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: "460px" }}>
        <div className="modal-title" style={{ color: "var(--danger)" }}>
          {title}
        </div>

        <div style={{ padding: "16px 0", fontSize: "13px", color: "var(--text)", lineHeight: "1.5" }}>
          {message}
        </div>

        {requirements.length > 0 && (
          <div style={{ 
            margin: "16px 0", 
            padding: "14px", 
            background: "rgba(255,0,110,0.08)", 
            borderRadius: "4px", 
            border: "1px solid rgba(255,0,110,0.3)" 
          }}>
            <div style={{ fontSize: "10px", color: "var(--danger)", marginBottom: "10px", letterSpacing: "1px" }}>
              YOU NEED:
            </div>
            <ul style={{ fontSize: "11.5px", color: "var(--dim)", paddingLeft: "20px", lineHeight: "1.6" }}>
              {requirements.map((req, i) => (
                <li key={i}>{req}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="modal-footer">
          <button className="modal-btn primary" onClick={onClose}>
            GOT IT
          </button>
        </div>
      </div>
    </div>
  );
};


const OrbitingPlanetCardVisual: React.FC<{
  planet: Planet;
  size?: number;
  planetSize?: number;
}> = ({ planet, size = 200, planetSize = 200 }) => {
  const [time, setTime] = React.useState(0);

  const visual = React.useMemo(
    () => chooseVisual(planet),
    [planet.galaxy, planet.system, planet.position]
  );

  React.useEffect(() => {
    let raf = 0;
    const started = performance.now();

    const tick = (now: number) => {
      setTime(now - started);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const rotationOffset = (time * visual.rotationSpeed) % 1;
  const cloudOffset = (time * visual.cloudDriftSpeed) % 1;

  return (

 
        <PixelPlanetCanvas
          planet={planet}
          size={planetSize}
          rotationOffset={rotationOffset}
          cloudOffset={cloudOffset}
        />
  );
};
// ─── Logo SVG ─────────────────────────────────────────────────────────────────
const LogoSVG: React.FC<{ size?: number }> = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="lg1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#9b5de5" />
        <stop offset="100%" stopColor="#00f5d4" />
      </linearGradient>
      <filter id="glow">
        <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
        <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <rect x="18" y="18" width="48" height="48" rx="8" ry="8" transform="rotate(45 50 50)"
      stroke="url(#lg1)" strokeWidth="5" fill="none" filter="url(#glow)" />
    <rect x="26" y="26" width="36" height="36" rx="6" ry="6" transform="rotate(45 50 50)"
      stroke="url(#lg1)" strokeWidth="4" fill="none" filter="url(#glow)" opacity="0.85" />
    <rect x="36" y="36" width="20" height="20" rx="4" ry="4" transform="rotate(45 50 50)"
      stroke="url(#lg1)" strokeWidth="3.5" fill="none" filter="url(#glow)" opacity="0.7" />
  </svg>
);

// ─── Starfield ────────────────────────────────────────────────────────────────
const Starfield: React.FC = () => {
  const stars = Array.from({ length: 120 }, (_, i) => ({
    id: i, x: Math.random() * 100, y: Math.random() * 100,
    size: Math.random() * 1.8 + 0.3,
    dur: (Math.random() * 3 + 2).toFixed(1),
    delay: (Math.random() * 4).toFixed(1),
    minOp: (Math.random() * 0.2 + 0.05).toFixed(2),
  }));
  return (
    <div className="starfield">
      {stars.map(s => (
        <div key={s.id} className="star" style={{
          left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size,
          "--dur": `${s.dur}s`, "--delay": `${s.delay}s`, "--min-op": s.minOp,
        } as React.CSSProperties} />
      ))}
    </div>
  );
};

// ─── Resource row ─────────────────────────────────────────────────────────────
const ResRow: React.FC<{ color: string; label: string; value: bigint; cap: bigint; rate: bigint }> =
  ({ color, label, value, cap, rate }) => {
    const pct = cap > 0n ? Math.min(100, Number(value * 100n / cap)) : 0;
    return (
      <>
        <div className="res-row">
          <div className="res-name"><div className="res-dot" style={{ background: color }} />{label}</div>
          <div>
            <div className="res-val" style={{ color }}>{fmt(value)}</div>
            <div className="res-rate">+{fmt(rate)}/h</div>
          </div>
        </div>
        <div className="cap-bar">
          <div className="cap-fill" style={{ width: `${pct}%`, background: color }} />
        </div>
      </>
    );
  };

// ─── Live resource interpolation ─────────────────────────────────────────────
function useInterpolatedResources(res: Resources | undefined, nowTs: number): Resources | undefined {
  return React.useMemo(() => {
    if (!res) return undefined;
    if (res.lastUpdateTs <= 0) return res;
    const dt = Math.max(0, nowTs - res.lastUpdateTs);
    if (dt === 0) return res;
    const eff = res.energyConsumption === 0n
      ? 1.0
      : Math.min(1.0, Number(res.energyProduction) / Number(res.energyConsumption));
    const produce = (current: bigint, ratePerHour: bigint, cap: bigint): bigint => {
      const gained = (Number(ratePerHour) * dt * eff) / 3600;
      const next = Number(current) + gained;
      return BigInt(Math.floor(Math.min(next, Number(cap))));
    };
    return {
      ...res,
      metal: produce(res.metal, res.metalHour, res.metalCap),
      crystal: produce(res.crystal, res.crystalHour, res.crystalCap),
      deuterium: produce(res.deuterium, res.deuteriumHour, res.deuteriumCap),
    };
  }, [res, nowTs]);
}

// ─── Launch Fleet Modal ───────────────────────────────────────────────────────
interface LaunchModalProps {
  fleet: Fleet;
  res: Resources;
  ownedPlanets: PlayerState[];
  currentPlanetPda: string;
  onClose: () => void;
  onLaunch: (
    ships: Record<string, number>,
    cargo: { metal: bigint; crystal: bigint; deuterium: bigint },
    missionType: number,
    flightSecs: number,
    speedFactor: number,
    target: LaunchTargetInput,
  ) => Promise<void>;
  txBusy: boolean;
}
const COMBAT_SHIPS = ["lightFighter","heavyFighter","cruiser","battleship","battlecruiser","bomber","destroyer","deathstar"];
const CARGO_SHIPS = ["smallCargo","largeCargo","recycler","espionageProbe","colonyShip","solarSatellite"];
const LaunchModal: React.FC<LaunchModalProps> = ({ fleet, res, ownedPlanets, currentPlanetPda, onClose, onLaunch, txBusy }) => {
  const [shipQty, setShipQty] = useState<Record<string,number>>({});
  const [missionType, setMissionType] = useState(2);
  const [cargoM, setCargoM] = useState(0);
  const [cargoC, setCargoC] = useState(0);
  const [cargoD, setCargoD] = useState(0);
  const [flightH, setFlightH] = useState(1);
  const [speed, setSpeed] = useState(100);
  const [transportMode, setTransportMode] = useState<"owned" | "coords">("owned");
  const selectableOwnedPlanets = ownedPlanets.filter((planetState) => planetState.planetPda !== currentPlanetPda);
  const [targetEntity, setTargetEntity] = useState(selectableOwnedPlanets[0]?.entityPda ?? "");
  const [targetGalaxy, setTargetGalaxy] = useState(1);
  const [targetSystem, setTargetSystem] = useState(1);
  const [targetPosition, setTargetPosition] = useState(1);
  const [colonyName, setColonyName] = useState("Colony");
  const [launching, setLaunching] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const getQty = (key: string) => shipQty[key] ?? 0;
  const setQty = (key: string, v: number) => setShipQty(p => ({ ...p, [key]: Math.max(0, Math.min((fleet as any)[key] ?? 0, v)) }));
  const totalSent = Object.values(shipQty).reduce((a, b) => a + b, 0);
  const cargoCap = getQty("smallCargo") * 5000 + getQty("largeCargo") * 25000
    + getQty("recycler") * 20000 + getQty("cruiser") * 800 + getQty("battleship") * 1500;
  const cargoUsed = cargoM + cargoC + cargoD;
  const needsTarget = missionType === 2 || missionType === 5;
  const handleLaunch = async () => {
    setLocalErr(null);
    if (totalSent === 0) { setLocalErr("Select at least one ship."); return; }
    if (cargoUsed > cargoCap) { setLocalErr("Cargo exceeds capacity."); return; }
    if (missionType === 2 && transportMode === "owned" && !targetEntity.trim()) { setLocalErr("Choose one of your registered planets for transport."); return; }
    if (missionType === 5 && getQty("colonyShip") <= 0) { setLocalErr("Colonize missions require at least one colony ship."); return; }
    setLaunching(true);
    try {
      const target: LaunchTargetInput = missionType === 2
        ? (transportMode === "owned"
            ? { kind: "transport", mode: "owned", destinationEntity: targetEntity.trim() }
            : { kind: "transport", mode: "coords", galaxy: targetGalaxy, system: targetSystem, position: targetPosition })
        : {
            kind: "colonize",
            galaxy: targetGalaxy,
            system: targetSystem,
            position: targetPosition,
            colonyName: colonyName.trim() || "Colony",
          };
      await onLaunch(
        shipQty,
        { metal: BigInt(cargoM), crystal: BigInt(cargoC), deuterium: BigInt(cargoD) },
        missionType,
        flightH * 3600,
        speed,
        target,
      );
      onClose();
    } catch (e: any) {
      setLocalErr(e?.message ?? "Launch failed");
    } finally {
      setLaunching(false);
    }
  };
  const allShipKeys = [...COMBAT_SHIPS, ...CARGO_SHIPS];
  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-title">⊹ LAUNCH FLEET</div>
        <div className="modal-section">
          <div className="modal-label">Mission Type</div>
          <select className="modal-select" value={missionType}
            onChange={e => setMissionType(Number(e.target.value))}>
            <option value={2}>TRANSPORT</option>
            <option value={5}>COLONIZE</option>
          </select>
        </div>
        {needsTarget && (
          <div className="modal-section">
            {missionType === 2 ? (
              <>
                <div className="modal-label">Transport Target</div>
                <div className="modal-row">
                  <span style={{ fontSize: 11, color: "var(--dim)" }}>Target mode</span>
                  <select className="modal-select" value={transportMode} onChange={e => setTransportMode(e.target.value as "owned" | "coords")}>
                    <option value="owned">My registered planets</option>
                    <option value="coords">Coordinates</option>
                  </select>
                </div>
                {transportMode === "owned" ? (
                  <>
                    <div className="modal-row">
                      <span style={{ fontSize: 11, color: "var(--dim)" }}>Destination planet</span>
                      <select
                        className="modal-select"
                        value={targetEntity}
                        onChange={e => setTargetEntity(e.target.value)}
                        disabled={selectableOwnedPlanets.length === 0}
                      >
                        {selectableOwnedPlanets.length === 0 ? (
                          <option value="">No other registered planets</option>
                        ) : (
                          selectableOwnedPlanets.map((planetState) => (
                            <option key={planetState.entityPda} value={planetState.entityPda}>
                              {planetState.planet.name || `Planet ${planetState.planet.planetIndex + 1}`} [{planetState.planet.galaxy}:{planetState.planet.system}:{planetState.planet.position}]
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="modal-row">
                      <span style={{ fontSize: 11, color: "var(--dim)" }}>Galaxy</span>
                      <input className="modal-input" type="number" min={1} max={9} value={targetGalaxy}
                        onChange={e => setTargetGalaxy(Math.max(1, Math.min(9, parseInt(e.target.value) || 1)))} />
                    </div>
                    <div className="modal-row">
                      <span style={{ fontSize: 11, color: "var(--dim)" }}>System</span>
                      <input className="modal-input" type="number" min={1} max={499} value={targetSystem}
                        onChange={e => setTargetSystem(Math.max(1, Math.min(499, parseInt(e.target.value) || 1)))} />
                    </div>
                    <div className="modal-row">
                      <span style={{ fontSize: 11, color: "var(--dim)" }}>Position</span>
                      <input className="modal-input" type="number" min={1} max={15} value={targetPosition}
                        onChange={e => setTargetPosition(Math.max(1, Math.min(15, parseInt(e.target.value) || 1)))} />
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                <div className="modal-label">Colonize Target</div>
                <div className="modal-row">
                  <span style={{ fontSize: 11, color: "var(--dim)" }}>Galaxy</span>
                  <input className="modal-input" type="number" min={1} max={9} value={targetGalaxy}
                    onChange={e => setTargetGalaxy(Math.max(1, Math.min(9, parseInt(e.target.value) || 1)))} />
                </div>
                <div className="modal-row">
                  <span style={{ fontSize: 11, color: "var(--dim)" }}>System</span>
                  <input className="modal-input" type="number" min={1} max={499} value={targetSystem}
                    onChange={e => setTargetSystem(Math.max(1, Math.min(499, parseInt(e.target.value) || 1)))} />
                </div>
                <div className="modal-row">
                  <span style={{ fontSize: 11, color: "var(--dim)" }}>Position</span>
                  <input className="modal-input" type="number" min={1} max={15} value={targetPosition}
                    onChange={e => setTargetPosition(Math.max(1, Math.min(15, parseInt(e.target.value) || 1)))} />
                </div>
                <div className="modal-row">
                  <span style={{ fontSize: 11, color: "var(--dim)" }}>Colony Name</span>
                  <input className="modal-input" type="text" maxLength={32} value={colonyName}
                    onChange={e => setColonyName(e.target.value)} />
                </div>
              </>
            )}
          </div>
        )}
        <div className="modal-section">
          <div className="modal-label">Ships <span style={{ color: "var(--cyan)" }}>{totalSent > 0 ? `${totalSent} selected` : "none selected"}</span></div>
          <div className="modal-ship-grid">
            {allShipKeys.map(key => {
              const ship = SHIPS.find(s => s.key === key)!;
              const avail = (fleet as any)[key] as number ?? 0;
              if (avail === 0) return null;
              return (
                <div key={key} className="modal-ship-row">
                  <div>
                    <div className="modal-ship-label">{ship.icon} {ship.name}</div>
                    <div className="modal-ship-avail">Avail: {avail.toLocaleString()}</div>
                  </div>
                  <input className="modal-input" type="number" min={0} max={avail}
                    value={getQty(key) || ""}
                    placeholder="0"
                    onChange={e => setQty(key, parseInt(e.target.value) || 0)}
                  />
                </div>
              );
            })}
          </div>
        </div>
        {cargoCap > 0 && missionType !== 4 && (
          <div className="modal-section">
            <div className="modal-label">Cargo <span style={{ color: cargoUsed > cargoCap ? "var(--danger)" : "var(--dim)" }}>
              {cargoUsed.toLocaleString()} / {cargoCap.toLocaleString()}
            </span></div>
            {[
              { label: "Metal", color: "var(--metal)", val: cargoM, max: Number(res.metal), set: setCargoM },
              { label: "Crystal", color: "var(--crystal)", val: cargoC, max: Number(res.crystal), set: setCargoC },
              { label: "Deuterium", color: "var(--deut)", val: cargoD, max: Number(res.deuterium), set: setCargoD },
            ].map(r => (
              <div key={r.label} className="modal-row">
                <span style={{ color: r.color, fontSize: 11 }}>{r.label} (avail: {fmt(r.max)})</span>
                <input className="modal-input" type="number" min={0} max={r.max}
                  value={r.val || ""}
                  placeholder="0"
                  onChange={e => r.set(Math.max(0, Math.min(r.max, parseInt(e.target.value) || 0)))}
                />
              </div>
            ))}
          </div>
        )}
        <div className="modal-section">
          <div className="modal-label">Flight Parameters</div>
          <div className="modal-row">
            <span style={{ fontSize: 11, color: "var(--dim)" }}>Flight duration (hours)</span>
            <input className="modal-input" type="number" min={1} max={240}
              value={flightH}
              onChange={e => setFlightH(Math.max(1, parseInt(e.target.value) || 1))}
            />
          </div>
          <div className="modal-row">
            <span style={{ fontSize: 11, color: "var(--dim)" }}>Speed factor (10–100%)</span>
            <input className="modal-input" type="number" min={10} max={100} step={10}
              value={speed}
              onChange={e => setSpeed(Math.max(10, Math.min(100, parseInt(e.target.value) || 100)))}
            />
          </div>
        </div>
        <div style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--border)",
          borderRadius: 3, padding: "10px 12px", marginBottom: 8 }}>
          <div className="modal-info-row">
            <span>Mission</span>
            <span className="modal-info-val">{MISSION_LABELS[missionType]}</span>
          </div>
          <div className="modal-info-row">
            <span>Ships dispatched</span>
            <span className="modal-info-val">{totalSent.toLocaleString()}</span>
          </div>
          <div className="modal-info-row">
            <span>Arrive ETA</span>
            <span className="modal-info-val">{flightH}h from now</span>
          </div>
          <div className="modal-info-row">
            <span>Mission slots free</span>
            <span className="modal-info-val">{4 - fleet.activeMissions} / 4</span>
          </div>
        </div>
        {localErr && <div className="error-msg" style={{ marginBottom: 8 }}>{localErr}</div>}
        <div className="modal-footer">
          <button className="modal-btn secondary" onClick={onClose} disabled={launching || txBusy}>CANCEL</button>
          <button className="modal-btn primary" onClick={handleLaunch}
            disabled={launching || txBusy || totalSent === 0 || fleet.activeMissions >= 4}>
            {launching ? "LAUNCHING..." : "⊹ LAUNCH"}
          </button>
        </div>
      </div>
    </div>
  );
};


// ─── Attack Apply Modal ───────────────────────────────────────────────────────
interface AttackApplyModalProps {
  mission: Mission;
  slotIdx: number;
  myEntityPda: string;
  onClose: () => void;
  onApply: (defenderWallet: string, slot: number) => Promise<void>;
  txBusy: boolean;
}
const AttackApplyModal: React.FC<AttackApplyModalProps> = ({ mission, slotIdx, onClose, onApply, txBusy }) => {
  const [defenderWallet, setDefenderWallet] = useState(mission.destination === "11111111111111111111111111111111" ? "" : mission.destination);
  const [applying, setApplying] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const handleApply = async () => {
    setLocalErr(null);
    if (!defenderWallet.trim()) { setLocalErr("Enter the defender's wallet address."); return; }
    setApplying(true);
    try {
      await onApply(defenderWallet.trim(), slotIdx);
      onClose();
    } catch (e: any) {
      setLocalErr(e?.message ?? "Attack failed");
    } finally {
      setApplying(false);
    }
  };
  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: 420 }}>
        <div className="modal-title" style={{ color: "var(--danger)" }}>⚔ RESOLVE BATTLE — SLOT {slotIdx}</div>
        <div className="notice-box warn">
          Fleet has arrived! Resolve combat to apply battle results on-chain.
        </div>
        <div className="modal-section">
          <div className="modal-label">Defender Wallet Address</div>
          <input
            style={{ width: "100%", padding: "6px 10px", fontSize: 11, borderRadius: 2,
              background: "rgba(0,0,0,0.4)", border: "1px solid var(--border)",
              color: "var(--text)", fontFamily: "'Share Tech Mono', monospace" }}
            placeholder="Defender's wallet pubkey"
            value={defenderWallet}
            onChange={e => setDefenderWallet(e.target.value.trim())}
          />
        </div>
        {localErr && <div className="error-msg">{localErr}</div>}
        <div className="modal-footer">
          <button className="modal-btn secondary" onClick={onClose} disabled={applying || txBusy}>CANCEL</button>
          <button className="modal-btn danger" onClick={handleApply} disabled={applying || txBusy}>
            {applying ? "RESOLVING..." : "⚔ RESOLVE BATTLE"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Research Tab ─────────────────────────────────────────────────────────────
const ResearchTab: React.FC<{
  research: Research;
  res?: Resources;
  planet: Planet;
  txBusy: boolean;
  onResearch: (techIdx: number) => void;
  onFinishResearch: () => void;
}> = ({ research, res, planet, txBusy, onResearch, onFinishResearch }) => {
  const now = Math.floor(Date.now() / 1000);
  const isResearching = research.queueItem !== 255;
  const researchSecsLeft = isResearching ? Math.max(0, research.researchFinishTs - now) : 0;

  const techs = [
    { idx: 0, name: "Energy Technology", icon: "⚡", field: "energyTech", unlocks: "Better energy production" },
    { idx: 1, name: "Combustion Drive", icon: "🔥", field: "combustionDrive", unlocks: "Faster transport & colony ships" },
    { idx: 2, name: "Impulse Drive", icon: "🚀", field: "impulseDrive", unlocks: "Faster combat & utility ships" },
    { idx: 3, name: "Hyperspace Drive", icon: "🌌", field: "hyperspaceDrive", unlocks: "Advanced fleet speed" },
    { idx: 4, name: "Computer Technology", icon: "💻", field: "computerTech", unlocks: "Better espionage & research speed" },
    { idx: 5, name: "Astrophysics", icon: "🔭", field: "astrophysics", unlocks: "Colonization & exploration" },
    { idx: 6, name: "Intergalactic Research Network", icon: "📡", field: "igrNetwork", unlocks: "Faster research across planets" },
  ] as const;

  return (
    <div className="tab-content">
      <div className="section-title">🔬 RESEARCH LAB</div>

      {isResearching && (
        <div className="build-queue-banner" style={{ marginBottom: 20 }}>
          <div>
            <div className="build-queue-label">CURRENT RESEARCH</div>
            <div className="build-queue-item-name">
              {techs.find(t => t.idx === research.queueItem)?.name || "Unknown Tech"}
            </div>
          </div>
          <div className="build-queue-right">
            <div className="build-queue-eta">{fmtCountdown(researchSecsLeft)}</div>
            <button className="build-btn finish-btn" disabled={txBusy || researchSecsLeft > 0} onClick={onFinishResearch}>
              {researchSecsLeft > 0 ? "IN PROGRESS" : "FINISH RESEARCH"}
            </button>
          </div>
        </div>
      )}

      <div className="grid-3">
        {techs.map((tech) => {
          const level = (research as any)[tech.field] as number ?? 0;
          const nextLevel = level + 1;

          const baseCosts = [[0,800,400],[400,0,600],[2000,4000,600],[10000,20000,6000],[0,400,600],[4000,2000,1000],[240000,400000,160000]][tech.idx];
          const cm = Math.floor(baseCosts[0] * Math.pow(2, level));
          const cc = Math.floor(baseCosts[1] * Math.pow(2, level));
          const cd = Math.floor(baseCosts[2] * Math.pow(2, level));

          const canAfford = !res || (res.metal >= BigInt(cm) && res.crystal >= BigInt(cc) && res.deuterium >= BigInt(cd));
          const canResearch = planet.researchLab >= [1,1,5,7,1,3,10][tech.idx];

          const isThisTechResearching = isResearching && research.queueItem === tech.idx;

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
                {cm > 0 && <div className="building-cost-row"><span>Metal</span><span>{fmt(cm)}</span></div>}
                {cc > 0 && <div className="building-cost-row"><span>Crystal</span><span>{fmt(cc)}</span></div>}
                {cd > 0 && <div className="building-cost-row"><span>Deuterium</span><span>{fmt(cd)}</span></div>}
              </div>

              {isThisTechResearching && (
                <div className="progress-container" style={{ margin: "12px 0" }}>
                  <div className="progress-bar" style={{ width: researchSecsLeft > 0 ? `${Math.max(5, 100 - Math.floor(researchSecsLeft / 36))}%` : "100%" }} />
                  <div className="progress-text">{fmtCountdown(researchSecsLeft)}</div>
                </div>
              )}

              <div style={{ fontSize: "10px", color: "var(--dim)", marginTop: "4px" }}>
                Unlocks: {tech.unlocks}
              </div>

              <button
                className={`build-btn ${canAfford && canResearch && !isResearching ? "can-build" : isThisTechResearching ? "building-now" : "no-funds"}`}
                disabled={txBusy || isResearching || !canAfford || !canResearch}
                onClick={() => onResearch(tech.idx)}
              >
                {isResearching ? "QUEUE FULL" : `RESEARCH → Lv ${nextLevel}`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Main App ─────────────────────────────────────────────────────────────────
const App: React.FC = () => {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const { connected, publicKey } = useWallet();
  const [planets, setPlanets] = useState<PlayerState[]>([]);
  const [selectedPlanetPda, setSelectedPlanetPda] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createProgress, setCreateProgress] = useState("Creating the Homeworld entity");
  const [txBusy, setTxBusy] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [storedEntityPda, setStoredEntityPda] = useState<string | null>(null);
  const [planetName, setPlanetName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [nowTs, setNowTs] = useState(Math.floor(Date.now() / 1000));
  const [showLaunchModal, setShowLaunchModal] = useState(false);
  const [attackModal, setAttackModal] = useState<{ mission: Mission; slotIdx: number } | null>(null);

  const clientRef = useRef<GameClient | null>(null);
  const selectedPlanetPdaRef = useRef<string | null>(null);
  const state = planets.find((planetState) => planetState.planetPda === selectedPlanetPda) ?? planets[0] ?? null;

  useEffect(() => {
    const id = setInterval(() => setNowTs(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    selectedPlanetPdaRef.current = selectedPlanetPda;
  }, [selectedPlanetPda]);

  const loadAllPlanets = useCallback(async (wallet: PublicKey, preferredPlanetPda?: string | null) => {
    if (!clientRef.current) return [];

    const loadedPlanets = await clientRef.current.findPlanets(wallet);
    const legacyState = loadedPlanets.length > 0 ? null : await clientRef.current.findPlanet(wallet);
    const finalPlanets = loadedPlanets.length > 0
      ? loadedPlanets
      : (legacyState ? [legacyState] : []);
    setPlanets(finalPlanets);

    if (finalPlanets.length === 0) {
      setSelectedPlanetPda(null);
      setStoredEntityPda(null);
      setSessionActive(false);
      return finalPlanets;
    }

    const nextSelectedPlanet =
      finalPlanets.find((planetState) => planetState.planetPda === preferredPlanetPda) ??
      finalPlanets.find((planetState) => planetState.planetPda === selectedPlanetPdaRef.current) ??
      finalPlanets[0];

    setSelectedPlanetPda(nextSelectedPlanet.planetPda);
    setStoredEntityPda(nextSelectedPlanet.entityPda);

    const delegatedPlanet = finalPlanets.find((planetState) => planetState.isDelegated);
    if (delegatedPlanet) {
      setSessionActive(true);
      clientRef.current?.restoreSession();
    } else {
      setSessionActive(false);
    }

    return finalPlanets;
  }, []);

useEffect(() => {
  if (!connected || !anchorWallet || !publicKey) {
    clientRef.current = null;
    setPlanets([]);
    setSelectedPlanetPda(null);
    setLoading(false);
    return;
  }

  const provider = new AnchorProvider(connection, anchorWallet, { commitment: "confirmed" });
  clientRef.current = new GameClient(connection, provider);

  setLoading(true);
  setError(null);

  // Run the heavy lookup with a timeout to prevent hanging
  const loadTimeout = setTimeout(() => {
    if (loading) setError("Loading is taking longer than expected. Please refresh.");
  }, 8000);

  loadAllPlanets(publicKey)
    .catch(e => {
      console.error("findPlanet failed:", e);
      setError(e?.message ?? "Failed to load planet. Please try refreshing.");
    })
    .finally(() => {
      clearTimeout(loadTimeout);
      setLoading(false);
    });
}, [connected, anchorWallet, publicKey, connection, loadAllPlanets]);

// Make refresh more reliable and immediate
const refresh = useCallback(async () => {
  if (!publicKey || !clientRef.current) return;

  try {
    await loadAllPlanets(publicKey);
  } catch (e) {
    console.error("[APP] refresh() failed:", e);
  }
}, [publicKey, loadAllPlanets]);

  useEffect(() => {
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

const withTx = async (label: string, fn: () => Promise<string>) => {
  if (txBusy || !clientRef.current) return;
  
  setTxBusy(true);
  setError(null);

  try {
    await fn();
    await refresh();           // immediate refresh
    setTimeout(refresh, 1500); // extra refresh after propagation
  } catch (e: any) {
    setError(e?.message ?? `${label} failed`);
  } finally {
    setTxBusy(false);
  }
};

  const createPlanet = async () => {
    if (!clientRef.current) return;
    setError(null);
    setCreating(true);
    setCreateProgress("Creating the Homeworld entity");
    try {
      await clientRef.current.initializePlanet(
        planetName.trim() || "Homeworld",
        setCreateProgress,
      );
      if (publicKey) {
        const loadedPlanets = await loadAllPlanets(publicKey);
        const newestPlanet = [...loadedPlanets].sort((a, b) => b.planet.planetIndex - a.planet.planetIndex)[0];
        if (newestPlanet) {
          setSelectedPlanetPda(newestPlanet.planetPda);
          setStoredEntityPda(newestPlanet.entityPda);
        }
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to create planet");
    } finally {
      setCreating(false);
      setCreateProgress("Creating the Homeworld entity");
    }
  };

  const handleStartSession = async () => {
    if (!clientRef.current || !state) return;
    setTxBusy(true);
    setError(null);
    try {
      await clientRef.current.startSession(new PublicKey(state.entityPda));
      setSessionActive(true);
    } catch (e: any) {
      const msg = e?.message ?? "Failed to start session";
      if (msg.includes("already delegated")) setSessionActive(true);
      else setError(msg);
    } finally {
      setTxBusy(false);
    }
  };

  const handleEndSession = async () => {
    if (!clientRef.current || !state) return;
    setTxBusy(true);
    setError(null);
    try {
      await clientRef.current.endSession(new PublicKey(state.entityPda));
      setSessionActive(false);
      setTimeout(refresh, 3000);
    } catch (e: any) {
      setError(e?.message ?? "Failed to end session");
    } finally {
      setTxBusy(false);
    }
  };

  // Handlers
  const handleResearchStart = (idx: number) => {
    if (!clientRef.current || !state) return;
    withTx("Start research", () => clientRef.current!.startResearch(new PublicKey(state.entityPda), idx));
  };

  const handleFinishResearch = () => {
    if (!clientRef.current || !state) return;
    withTx("Finish research", () => clientRef.current!.finishResearch(new PublicKey(state.entityPda)));
  };

  const handleLaunch = async (
    ships: Record<string, number>,
    cargo: { metal: bigint; crystal: bigint; deuterium: bigint },
    missionType: number,
    flightSecs: number,
    speedFactor: number,
    target: LaunchTargetInput,
  ) => {
    if (!clientRef.current || !state) return;
    let launchTarget:
      | { galaxy: number; system: number; position: number; colonyName?: string };

    if (target.kind === "transport") {
      if (target.mode === "owned") {
        const destinationPlanet = planets.find((planetState) => planetState.entityPda === target.destinationEntity);
        if (!destinationPlanet) {
          throw new Error("Selected destination planet could not be found.");
        }
        launchTarget = {
          galaxy: destinationPlanet.planet.galaxy,
          system: destinationPlanet.planet.system,
          position: destinationPlanet.planet.position,
        };
      } else {
        const systemPlanets = await clientRef.current.getSystemPlanets(target.galaxy, target.system);
        const destinationPlanet = systemPlanets.find((planet) => planet.position === target.position);
        if (!destinationPlanet) {
          throw new Error(`No planet found at ${target.galaxy}:${target.system}:${target.position}. Transport requires an occupied slot.`);
        }
        launchTarget = { galaxy: target.galaxy, system: target.system, position: target.position };
      }
    } else {
      const systemPlanets = await clientRef.current.getSystemPlanets(target.galaxy, target.system);
      const occupiedPlanet = systemPlanets.find((planet) => planet.position === target.position);
      if (occupiedPlanet) {
        throw new Error(`Slot ${target.galaxy}:${target.system}:${target.position} is already occupied. Colonization requires an empty slot.`);
      }
      launchTarget = { galaxy: target.galaxy, system: target.system, position: target.position, colonyName: target.colonyName };
    }

    await withTx("Launch fleet", () =>
      clientRef.current!.launchFleet(
        new PublicKey(state.entityPda),
        { lf: ships.lightFighter, hf: ships.heavyFighter, cr: ships.cruiser, bs: ships.battleship,
          bc: ships.battlecruiser, bm: ships.bomber, ds: ships.destroyer, de: ships.deathstar,
          sc: ships.smallCargo, lc: ships.largeCargo, rec: ships.recycler, ep: ships.espionageProbe,
          col: ships.colonyShip },
        cargo,
        missionType,
        flightSecs,
        speedFactor,
        launchTarget,
      ),
    );

  };

  const handleResolveTransport = async (mission: Mission, slotIdx: number) => {
    if (!clientRef.current || !state) return;
    await withTx("Resolve transport", () =>
      clientRef.current!.resolveTransport(
        new PublicKey(state.entityPda),
        mission,
        slotIdx,
      ),
    );
  };

  const handleResolveColonize = async (mission: Mission, slotIdx: number) => {
    if (!clientRef.current || !state) return;
    await withTx("Resolve colonize", async () => {
      await clientRef.current!.resolveColonize(
        new PublicKey(state.entityPda),
        mission,
        slotIdx,
      );
      return "resolved";
    });

    if (publicKey) {
      const loadedPlanets = await loadAllPlanets(publicKey);
      const newestPlanet = [...loadedPlanets].sort((a, b) => b.planet.planetIndex - a.planet.planetIndex)[0];
      if (newestPlanet) {
        setSelectedPlanetPda(newestPlanet.planetPda);
        setStoredEntityPda(newestPlanet.entityPda);
      }
    }
  };

  const res = state?.resources;
  const liveRes = useInterpolatedResources(res, nowTs);
  const activeMissionCount = state?.fleet.missions.filter(m => m.missionType !== 0).length ?? 0;


  return (
    <>
      <style>{CSS}</style>
      <Starfield />
      <LoadingOverlay visible={txBusy || creating} />
      
      {!connected && (
        <div className="landing">
          <div className="landing-logo"><LogoSVG size={120} /></div>
          <div>
            <div className="landing-title">CHAINED UNIVERSE</div>
            <div className="landing-sub">On-chain space strategy · Solana · BOLT ECS</div>
          </div>
          <WalletMultiButton />
        </div>
      )}
{connected && loading && (
  <div style={{ 
    height: "100vh", 
    display: "flex", 
    flexDirection: "column", 
    alignItems: "center", 
    justifyContent: "center", 
    gap: 24,
    background: "var(--void)"
  }}>
    <LogoSVG size={72} />
    <div>
      <div className="spinner" style={{ width: "56px", height: "56px", borderWidth: "5px" }} />
    </div>
    <div style={{ 
      fontFamily: "'Orbitron', sans-serif", 
      fontSize: "15px", 
      letterSpacing: "3px", 
      color: "var(--cyan)" 
    }}>
      CONNECTING TO THE CHAINED UNIVERSE...
    </div>
    <div style={{ fontSize: "11px", color: "var(--dim)", letterSpacing: "1px" }}>
      Fetching planet data • This may take a few seconds
    </div>
  </div>
)}

{connected && creating && (
  <LoadingOverlay visible={creating} message={createProgress} />
)}
      
      {connected && !loading && (
        <div className="app">
          <header className="header">
            <div className="logo-area">
              <LogoSVG size={28} />
              <span className="game-title">CHAINED UNIVERSE</span>
            </div>
            <div className="header-right">
              <span className="chain-tag">DEVNET</span>
              {publicKey && (
                <span className="chain-tag">
                  {publicKey.toBase58().slice(0,4)}…{publicKey.toBase58().slice(-4)}
                </span>
              )}
              {state && (
                sessionActive ? (
                  <button onClick={handleEndSession} disabled={txBusy}
                    style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, letterSpacing:1,
                      padding:"7px 14px", borderRadius:2, border:"1px solid #a060f0",
                      background:"rgba(160,96,240,0.15)", color:"#a060f0",
                      cursor:txBusy?"not-allowed":"pointer", animation:"er-pulse 2s ease-in-out infinite" }}>
                    ⚡ SAVE & EXIT
                  </button>
                ) : (
                  <button onClick={handleStartSession} disabled={txBusy}
                    style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, letterSpacing:1,
                      padding:"7px 14px", borderRadius:2, border:"1px solid #4a5568",
                      background:"transparent", color:"#a060f0", cursor:txBusy?"not-allowed":"pointer" }}>
                    ⚡ START SESSION
                  </button>
                )
              )}
              {sessionActive && (
                <>
                  <span style={{ fontSize:10, letterSpacing:1, padding:"4px 8px", borderRadius:2,
                    background:"rgba(160,96,240,0.1)", border:"1px solid rgba(160,96,240,0.4)",
                    color:"#a060f0", animation:"er-pulse 2s ease-in-out infinite" }}>⚡ ER ACTIVE</span>
                  <span style={{ fontSize:10, letterSpacing:1, padding:"4px 8px", borderRadius:2,
                    background:"rgba(240,160,0,0.1)", border:"1px solid rgba(240,160,0,0.3)",
                    color:"#f0a000" }} title="End session first to save state to Solana.">
                    ⚠ DON'T REFRESH
                  </span>
                </>
              )}
              <WalletMultiButton />
            </div>
          </header>

          <aside className="sidebar">
            {state ? (
              <>
                {false && <div className="planet-card" style={{ paddingBottom: 12 }}>
                  <div className="res-label">Owned Planets</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {planets.map((planetState) => {
                      const isSelected = planetState.planetPda === state.planetPda;
                      return (
                        <button
                          key={planetState.planetPda}
                          className="build-btn"
                          onClick={() => setSelectedPlanetPda(planetState.planetPda)}
                          disabled={txBusy}
                          style={{
                            textAlign: "left",
                            padding: "10px 12px",
                            border: `1px solid ${isSelected ? "var(--cyan)" : "var(--border)"}`,
                            background: isSelected ? "rgba(0,245,212,0.08)" : "rgba(255,255,255,0.02)",
                            color: isSelected ? "var(--cyan)" : "var(--text)",
                          }}
                        >
                          <div style={{ fontSize: 11, fontFamily: "'Orbitron', sans-serif" }}>
                            {planetState.planet.name || `Planet ${planetState.planet.planetIndex + 1}`}
                          </div>
                          <div style={{ fontSize: 9, color: "var(--dim)", marginTop: 4 }}>
                            [{planetState.planet.galaxy}:{planetState.planet.system}:{planetState.planet.position}] • Slot {planetState.planet.planetIndex}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>}

                {liveRes && (
                  <div className="res-panel">
                    <div className="res-label">Resources</div>
                    <ResRow color="var(--metal)" label="Metal" value={liveRes.metal} cap={liveRes.metalCap} rate={liveRes.metalHour} />
                    <ResRow color="var(--crystal)" label="Crystal" value={liveRes.crystal} cap={liveRes.crystalCap} rate={liveRes.crystalHour} />
                    <ResRow color="var(--deut)" label="Deuterium" value={liveRes.deuterium} cap={liveRes.deuteriumCap} rate={liveRes.deuteriumHour} />
                    <div className="energy-row">
                      <span style={{ color:"var(--dim)", fontSize:10, letterSpacing:1 }}>⚡ ENERGY</span>
                      <span style={{ fontSize:11, fontWeight:600,
                        color: energyEfficiency(liveRes) >= 100 ? "var(--success)"
                             : energyEfficiency(liveRes) >= 60 ? "var(--warn)" : "var(--danger)" }}>
                        {fmt(liveRes.energyProduction)}/{fmt(liveRes.energyConsumption)} ({energyEfficiency(liveRes)}%)
                      </span>
                    </div>
                  </div>
                )}
<nav className="nav" style={{ 
  flex: "1 1 0", 
  minHeight: "0", 
  overflowY: "auto", 
  backgroundImage: "none",
  background: "rgba(255,0,0,0.1)"   // ← red background so you can SEE it
  , backgroundColor: "transparent"
}}>
  <div className={`nav-item${tab === "overview" ? " active" : ""}`} onClick={() => setTab("overview")}>◈ Overview</div>
  <div className={`nav-item${tab === "resources" ? " active" : ""}`} onClick={() => setTab("resources")}>⛏ Resources</div>
  <div className={`nav-item${tab === "buildings" ? " active" : ""}`} onClick={() => setTab("buildings")}>⬡ Buildings</div>
  <div className={`nav-item${tab === "research" ? " active" : ""}`} onClick={() => setTab("research")}>🔬 Research</div>
  <div className={`nav-item${tab === "shipyard" ? " active" : ""}`} onClick={() => setTab("shipyard")}>🚀 Shipyard</div>
  <div className={`nav-item${tab === "fleet" ? " active" : ""}`} onClick={() => setTab("fleet")}>◉ Fleet</div>
  <div className={`nav-item${tab === "missions" ? " active" : ""}`} onClick={() => setTab("missions")}>⊹ Missions {activeMissionCount > 0 && <span className="nav-badge">{activeMissionCount}</span>}</div>
  <div className={`nav-item${tab === "galaxy" ? " active" : ""}`} onClick={() => setTab("galaxy")}>🌌 Galaxy</div>
</nav>
              </>
            ) : (
              <div style={{ padding: 20, color: "var(--dim)", fontSize: 11, letterSpacing: 1 }}>
                <div className="pulse">No planet found.</div>
                <div style={{ marginTop: 8, fontSize: 10, color: "var(--purple)" }}>
                  {publicKey?.toBase58().slice(0, 12)}…
                </div>
              </div>
            )}
          </aside>

          <main className="main">
            {error && <div style={{ color:"var(--danger)", fontSize:11, letterSpacing:1, marginBottom:16 }}>{error}</div>}

            {!state ? (
              <NoPlanetView
                planetName={planetName}
                onNameChange={setPlanetName}
                onCreate={createPlanet}
                creating={creating}
                error={error}
              />
            ) : tab === "overview" ? (
              <OverviewTab state={state} res={liveRes} nowTs={nowTs}
                planets={planets}
                onSelectPlanet={(planetPda) => setSelectedPlanetPda(planetPda)}
                onFinishBuild={() => withTx("Finish build", () =>
                  clientRef.current!.finishBuild(new PublicKey(state.entityPda))
                )}
                txBusy={txBusy}
              />
              ) : tab === "resources" ? (
              <ResourcesTab 
                state={state} 
                res={liveRes} 
                nowTs={nowTs} 
                onStartBuild={(idx) => withTx("Start build", () => clientRef.current!.startBuild(new PublicKey(state.entityPda), idx))} 
                onFinishBuild={() => withTx("Finish build", () => clientRef.current!.finishBuild(new PublicKey(state.entityPda)))} 
                txBusy={txBusy} 
              />
            ) : tab === "buildings" ? (
              <BuildingsTab state={state} res={liveRes} nowTs={nowTs}
                onStartBuild={(idx) => withTx("Start build", () =>
                  clientRef.current!.startBuild(new PublicKey(state.entityPda), idx)
                )}
                onFinishBuild={() => withTx("Finish build", () =>
                  clientRef.current!.finishBuild(new PublicKey(state.entityPda))
                )}
                txBusy={txBusy}
              />
            ) : tab === "shipyard" ? (
              <ShipyardTab
                state={state}
                res={liveRes}
                txBusy={txBusy}
                onBuildShip={(shipType, qty) => withTx("Build ship", () =>
                  clientRef.current!.buildShip(new PublicKey(state.entityPda), shipType, qty)
                )}
              />
            ) : tab === "fleet" ? (
              <FleetTab
                fleet={state.fleet}
                res={liveRes}
                txBusy={txBusy}
                onOpenLaunch={() => setShowLaunchModal(true)}
              />
            ) : tab === "missions" ? (
              <MissionsTab
                fleet={state.fleet}
                nowTs={nowTs}
                txBusy={txBusy}
                onOpenAttack={(mission, slot) => setAttackModal({ mission, slotIdx: slot })}
                onResolveTransport={handleResolveTransport}
                onResolveColonize={handleResolveColonize}
              />
            ) : tab === "research" ? (
              <ResearchTab
                research={state.research}
                res={liveRes}
                planet={state.planet}
                txBusy={txBusy}
                onResearch={handleResearchStart}
                onFinishResearch={handleFinishResearch}
              />
            ) : tab === "galaxy" ? (
  <GalaxyTab 
    client={clientRef.current}
    currentPlanet={state.planet}
    txBusy={txBusy}
  />
) : null}
          </main>
        </div>
      )}



      {/* Launch Fleet Modal */}
      {showLaunchModal && state && liveRes && (
        <LaunchModal
          fleet={state.fleet}
          res={liveRes}
          ownedPlanets={planets}
          currentPlanetPda={state.planetPda}
          onClose={() => setShowLaunchModal(false)}
          onLaunch={handleLaunch}
          txBusy={txBusy}
        />
      )}
    </>
  );
};

// ─── No Planet View ───────────────────────────────────────────────────────────
const NoPlanetView: React.FC<{
  planetName: string; onNameChange: (v: string) => void;
  onCreate: () => void; creating: boolean; error: string | null;
}> = ({ planetName, onNameChange, onCreate, creating, error }) => (
  <div className="no-planet">
    <LogoSVG size={64} />
    <div className="no-planet-title">NO PLANET FOUND</div>
    <div className="no-planet-sub">
      This wallet has no initialized planet on-chain.<br />Create your homeworld to begin.
    </div>
    <input className="planet-name-input" type="text" placeholder="Planet name (optional)"
      value={planetName} onChange={e => onNameChange(e.target.value)} maxLength={19} />
    <button className="create-btn" onClick={onCreate} disabled={creating}>
      {creating ? "TRANSMITTING TO CHAIN..." : "⊹ INITIALIZE HOMEWORLD"}
    </button>
    {error && <div className="error-msg">{error}</div>}
    <div style={{ fontSize:10, color:"var(--dim)", letterSpacing:1, marginTop:12 }}>
      Requires 3 wallet approvals · Rent paid in SOL
    </div>
  </div>
);

// ─── Overview Tab ─────────────────────────────────────────────────────────────
const OverviewTab: React.FC<{
  state: PlayerState; 
  planets: PlayerState[];
  res?: Resources; 
  nowTs: number;
  onSelectPlanet: (planetPda: string) => void;
  onFinishBuild: () => void; 
  txBusy: boolean;
}> = ({ state, planets, res, nowTs, onSelectPlanet, onFinishBuild, txBusy }) => {
  const { planet, fleet } = state;
  const buildInProgress = planet.buildFinishTs > 0 && planet.buildQueueItem !== 255;
  const buildSecsLeft = Math.max(0, planet.buildFinishTs - nowTs);
  const buildBuilding = BUILDINGS.find(b => b.idx === planet.buildQueueItem);
  const totalFleet = SHIPS.reduce((s, sh) => s + ((fleet as any)[sh.key] ?? 0), 0);

  return (
    <div>

      <div style={{
        display: "grid",
        gridTemplateColumns: planets.length > 1 ? "220px minmax(0, 1fr)" : "220px",
        gap: 24,
        alignItems: "start",
        marginBottom: 28,
      }}>
      <div className="planet-card" style={{ width: "172px", padding: 0, background: "transparent", border: "none" }}>
<div
  style={{
    width: "172px",
    height: "172px",
    borderRadius: "6px",
    overflow: "hidden",
    marginBottom: "16px",
    border: "1px solid var(--border)",
    position: "relative",
    background: "transparent",
  }}
>
  <OrbitingPlanetCardVisual planet={state.planet} size={200} planetSize={175} />
 
  </div>

  <div className="card" style={{ width: "172px", padding: "14px 12px" }}>
  <div className="planet-coords">
    [{state.planet.galaxy}:{state.planet.system}:{state.planet.position}]
  </div>

  <div className="planet-name">{state.planet.name || "Unknown"}</div>

  <div className="planet-meta">
    {state.planet.diameter.toLocaleString()} km · {state.planet.temperature}°C
  </div>

  <div style={{ fontSize: "9px", letterSpacing: "1px", marginTop: "4px", color: "var(--dim)" }}>
    {state.planet.position <= 3
      ? "☀️ HOT ZONE"
      : state.planet.position <= 6
      ? "🌍 TEMPERATE"
      : state.planet.position <= 10
      ? "🏜️ ARID ZONE"
      : "❄️ FROZEN ZONE"}
  </div>

  <div className="fields-bar">
    <div
      className="fields-fill"
      style={{ width: `${(state.planet.usedFields / state.planet.maxFields) * 100}%` }}
    />
  </div>

  <div className="fields-label">
    <span>FIELDS</span>
    <span>{state.planet.usedFields}/{state.planet.maxFields}</span>
  </div>
  </div>
</div>

      {planets.length > 1 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="section-title" style={{ marginBottom: 16 }}>PLANET SELECTION</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
            {planets.map((planetState) => {
              const isSelected = planetState.planetPda === state.planetPda;
              return (
                <button
                  key={planetState.planetPda}
                  className="build-btn"
                  disabled={txBusy}
                  onClick={() => onSelectPlanet(planetState.planetPda)}
                  style={{
                    textAlign: "left",
                    padding: "14px",
                    border: `1px solid ${isSelected ? "var(--cyan)" : "var(--border)"}`,
                    background: isSelected ? "rgba(0,245,212,0.08)" : "transparent",
                    color: isSelected ? "var(--cyan)" : "var(--text)",
                  }}
                >
                  <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 13 }}>
                    {planetState.planet.name || `Planet ${planetState.planet.planetIndex + 1}`}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 6 }}>
                    [{planetState.planet.galaxy}:{planetState.planet.system}:{planetState.planet.position}]
                  </div>
                  <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 4 }}>
                    {planetState.planet.diameter.toLocaleString()} km Â· {planetState.planet.temperature}Â°C
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      </div>

      <div className="section-title">COMMAND OVERVIEW</div>

      {/* Build Queue Banner */}
      {buildInProgress && buildBuilding && (
        <div className="build-queue-banner">
          <div>
            <div className="build-queue-label">⚙ Building</div>
            <div className="build-queue-item-name">
              {buildBuilding.icon} {buildBuilding.name} → Lv {planet.buildQueueTarget}
            </div>
          </div>
          <div className="build-queue-right">
            {buildSecsLeft === 0 ? (
              <button 
                onClick={onFinishBuild} 
                disabled={txBusy}
                style={{ 
                  fontFamily:"'Orbitron',sans-serif", 
                  fontSize:11, 
                  padding:"8px 16px",
                  border:"1px solid var(--success)", 
                  background:"rgba(6,214,160,0.1)",
                  color:"var(--success)", 
                  cursor:"pointer", 
                  borderRadius:2, 
                  letterSpacing:1 
                }}
              >
                COLLECT
              </button>
            ) : (
              <>
                <div className="build-queue-eta">{fmtCountdown(buildSecsLeft)}</div>
                <div style={{ fontSize:9, color:"var(--dim)", marginTop:2, letterSpacing:1 }}>
                  REMAINING
                </div>
              </>
            )}
          </div>
        </div>
      )}

        {/* Quick Stats Grid */}
      <div className="grid-4" style={{ marginBottom: 28 }}>
                <div className="card">
          <div className="card-label">Metal / hr</div>
          <div className="card-value" style={{ color:"var(--metal)" }}>
            {res ? fmt(res.metalHour) : "—"}
          </div>
        </div>
        <div className="card">
          <div className="card-label">Crystal / hr</div>
          <div className="card-value" style={{ color:"var(--crystal)" }}>
            {res ? fmt(res.crystalHour) : "—"}
          </div>
        </div>
        <div className="card">
          <div className="card-label">Deuterium</div>
          <div className="card-value" style={{ color:"var(--deuterium)" }}>
            {res ? fmt(res.deuteriumHour) : "—"}
          </div>
        </div>
        <div className="card">
          <div className="card-label">Energy</div>
          <div className="card-value" style={{ color:"var(--energy)" }}>
            {res ? fmt(res.energyProduction) : "—"}/
            {res ? fmt(res.energyConsumption) : "—"}
            <span style={{ marginLeft: "6px" }}> </span>
            ({res ? energyEfficiency(res) : "—"}%)
     
          </div>
        </div>

      </div>

      {/* Planet Info + Key Buildings */}
      <div className="grid-2">
        <div>
          <div className="section-title">PLANET INFO</div>
          <div className="card">
            {[
              ["Name", planet.name || "Unknown"],
              ["Diameter", `${planet.diameter.toLocaleString()} km`],
              ["Temperature", `${planet.temperature}°C`],
              ["Fields", `${planet.usedFields} / ${planet.maxFields}`],
              ["Galaxy", planet.galaxy],
              ["System", planet.system],
              ["Position", planet.position],
            ].map(([k, v]) => (
              <div key={String(k)} className="stat-row">
                <span className="stat-key">{k}</span>
                <span className="stat-val">{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="section-title">KEY BUILDINGS</div>
          <div className="card">
            {BUILDINGS.slice(0, 8).map(b => (
              <div key={b.idx} className="stat-row">
                <span className="stat-key">{b.icon} {b.name}</span>
                <span className="stat-val" style={{ 
                  color:"var(--purple)", 
                  fontFamily:"'Orbitron',sans-serif" 
                }}>
                  Lv {(planet as any)[b.key] ?? 0}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>  
    </div>
  );
};

// ─── ResourcesTab ────────────────────────────────────────────────────────────
const ResourcesTab: React.FC<{
  state: PlayerState;
  res?: Resources;
  nowTs: number;
  onStartBuild: (idx: number) => void;
  onFinishBuild: () => void;
  txBusy: boolean;
}> = ({ state, res, nowTs, onStartBuild, onFinishBuild, txBusy }) => {
  const { planet } = state;
  const buildInProgress = planet.buildFinishTs > 0 && planet.buildQueueItem !== 255;
  const buildSecsLeft = Math.max(0, planet.buildFinishTs - nowTs);
  const productionBuildings = BUILDINGS.filter(b => [0,1,2,3,4].includes(b.idx));

  // Exact on-chain formula
  const mineRate = (level: number, base: number): bigint => {
    if (level <= 0) return 0n;
    let result = BigInt(base) * BigInt(level);
    for (let i = 0; i < level; i++) {
      result = (result * 11n) / 10n;
    }
    return result;
  };

  const getProduction = (idx: number, level: number): bigint => {
    switch (idx) {
      case 0: return mineRate(level, 30);                    // Metal Mine
      case 1: return mineRate(level, 20);                    // Crystal Mine
      case 2: {                                              // Deuterium
        const temp = Math.max(240 - (planet.temperature || 0), 0);
        return (mineRate(level, 10) * BigInt(temp)) / 200n;
      }
      case 3: return mineRate(level, 20);                    // Solar Plant
      case 4: return (mineRate(level, 30) * 180n) / 100n;    // Fusion Reactor
      default: return 0n;
    }
  };

  return (
    <div>
      <div className="section-title">RESOURCE PRODUCTION</div>

      {buildInProgress && (
        <div className="build-queue-banner" style={{ marginBottom: 20 }}>
          <div>
            <div className="build-queue-label">⚙ Constructing</div>
            <div className="build-queue-item-name">
              {BUILDINGS.find(b => b.idx === planet.buildQueueItem)?.name} → Lv {planet.buildQueueTarget}
            </div>
          </div>
          <div className="build-queue-right">
            <div className="build-queue-eta">{fmtCountdown(buildSecsLeft)}</div>
            {buildSecsLeft === 0 && (
              <button className="build-btn finish-btn" disabled={txBusy} onClick={onFinishBuild}>
                FINISH BUILD
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid-3">
        {productionBuildings.map(b => {
          const level = (planet as any)[b.key] ?? 0;
          const nextLevel = level + 1;
          const [cm, cc, cd] = upgradeCost(b.idx, level);
          const secs = buildTimeSecs(b.idx, nextLevel, planet.roboticsFactory);

          const hasMetal = res ? res.metal >= BigInt(cm) : false;
          const hasCrystal = res ? res.crystal >= BigInt(cc) : false;
          const hasDeut = res ? res.deuterium >= BigInt(cd) : false;
          const canAfford = hasMetal && hasCrystal && hasDeut;

          const isQueued = buildInProgress && planet.buildQueueItem === b.idx;
          const isReady = isQueued && buildSecsLeft === 0;

          let btnClass = "build-btn no-funds";
          let btnText = "INSUFFICIENT FUNDS";
          if (isReady) { 
            btnClass = "build-btn finish-btn"; 
            btnText = "FINISH BUILD"; 
          } else if (isQueued) { 
            btnClass = "build-btn building-now"; 
            btnText = fmtCountdown(buildSecsLeft); 
          } else if (!buildInProgress && canAfford) { 
            btnClass = "build-btn can-build"; 
            btnText = `BUILD ${fmtCountdown(secs)}`; 
          }

          // === FUTURE TOTAL (what sidebar will show after upgrade) ===
          const futureTotal = getProduction(b.idx, nextLevel);

          const unit = b.idx === 0 ? " metal/hr" :
                      b.idx === 1 ? " crystal/hr" :
                      b.idx === 2 ? " deuterium/hr" : " energy";

          return (
            <div key={b.idx} className="building-card">
              <div className="building-header">
                <div className="building-icon-name">
                  <span className="building-icon">{b.icon}</span>
                  <span className="building-name">{b.name}</span>
                </div>
                <span className="building-level">Lv {level} → <span style={{color:"var(--cyan)"}}>{nextLevel}</span></span>
              </div>

              <div className="building-costs">
                {cm > 0 && <div className="building-cost-row"><span>Metal</span><span className={hasMetal ? "cost-ok" : "cost-bad"}>{fmt(cm)}</span></div>}
                {cc > 0 && <div className="building-cost-row"><span>Crystal</span><span className={hasCrystal ? "cost-ok" : "cost-bad"}>{fmt(cc)}</span></div>}
                {cd > 0 && <div className="building-cost-row"><span>Deuterium</span><span className={hasDeut ? "cost-ok" : "cost-bad"}>{fmt(cd)}</span></div>}
              </div>

              {/* Future total outcome - this is what you asked for */}
              <div style={{ fontSize: "10px", color: "var(--cyan)", margin: "6px 0", fontWeight: 600 }}>
                After upgrade: {fmt(futureTotal)}{unit}
              </div>

              <button
                className={btnClass}
                disabled={(isQueued && !isReady) || txBusy}
                onClick={() => isReady ? onFinishBuild() : onStartBuild(b.idx)}
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

// ─── BuildingsTab ────────────────────────────────────────────────────────────
const BuildingsTab: React.FC<{
  state: PlayerState;
  res?: Resources;
  nowTs: number;
  onStartBuild: (idx: number) => void;
  onFinishBuild: () => void;
  txBusy: boolean;
}> = ({ state, res, nowTs, onStartBuild, onFinishBuild, txBusy }) => {
  const { planet } = state;
  const buildInProgress = planet.buildFinishTs > 0 && planet.buildQueueItem !== 255;
  const buildSecsLeft = Math.max(0, planet.buildFinishTs - nowTs);

  // Infrastructure & Storage only (no resource producers + no Missile Silo)
  const infrastructureBuildings = [
    { 
      idx: 5, 
      name: "Robotics Factory", 
      icon: "🤖", 
      desc: "Automates construction. Significantly reduces build time for all buildings and ships." 
    },
    { 
      idx: 6, 
      name: "Nanite Factory", 
      icon: "🔬", 
      desc: "Advanced nano-assemblers. Massively speeds up all construction processes." 
    },
    { 
      idx: 7, 
      name: "Shipyard", 
      icon: "🚀", 
      desc: "Constructs ships and defense units. Higher levels unlock better and larger ships." 
    },
    { 
      idx: 8, 
      name: "Metal Storage", 
      icon: "🏗", 
      desc: "Increases maximum Metal storage capacity." 
    },
    { 
      idx: 9, 
      name: "Crystal Storage", 
      icon: "🏗", 
      desc: "Increases maximum Crystal storage capacity." 
    },
    { 
      idx: 10, 
      name: "Deuterium Tank", 
      icon: "🏗", 
      desc: "Increases maximum Deuterium storage capacity." 
    },
    { 
      idx: 11, 
      name: "Research Lab", 
      icon: "🔭", 
      desc: "Required for all technology research. Higher levels allow more advanced and faster research." 
    },
  ];

  return (
    <div>
      <div className="section-title">INFRASTRUCTURE & STORAGE</div>

      {buildInProgress && (
        <div className="build-queue-banner" style={{ marginBottom: 20 }}>
          <div>
            <div className="build-queue-label">⚙ CONSTRUCTING</div>
            <div className="build-queue-item-name">
              {BUILDINGS.find(b => b.idx === planet.buildQueueItem)?.name} → Lv {planet.buildQueueTarget}
            </div>
          </div>
          <div className="build-queue-right">
            <div className="build-queue-eta">{fmtCountdown(buildSecsLeft)}</div>
            {buildSecsLeft === 0 && (
              <button 
                className="build-btn finish-btn" 
                disabled={txBusy} 
                onClick={onFinishBuild}
              >
                FINISH BUILD
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid-3">
        {infrastructureBuildings.map((b) => {
          const level = (planet as any)[BUILDINGS[b.idx].key] ?? 0;
          const nextLevel = level + 1;
          const [cm, cc, cd] = upgradeCost(b.idx, level);
          const secs = buildTimeSecs(b.idx, nextLevel, planet.roboticsFactory);

          const hasMetal = res ? res.metal >= BigInt(cm) : false;
          const hasCrystal = res ? res.crystal >= BigInt(cc) : false;
          const hasDeut = res ? res.deuterium >= BigInt(cd) : false;
          const canAfford = hasMetal && hasCrystal && hasDeut;

          const isQueued = buildInProgress && planet.buildQueueItem === b.idx;
          const isReady = isQueued && buildSecsLeft === 0;

          let btnClass = "build-btn no-funds";
          let btnText = "INSUFFICIENT FUNDS";

          if (isReady) { 
            btnClass = "build-btn finish-btn"; 
            btnText = "FINISH BUILD"; 
          } else if (isQueued) { 
            btnClass = "build-btn building-now"; 
            btnText = fmtCountdown(buildSecsLeft); 
          } else if (!buildInProgress && canAfford) { 
            btnClass = "build-btn can-build"; 
            btnText = `BUILD ${fmtCountdown(secs)}`; 
          }

          return (
            <div key={b.idx} className="building-card">
              <div className="building-header">
                <div className="building-icon-name">
                  <span className="building-icon">{b.icon}</span>
                  <span className="building-name">{b.name}</span>
                </div>
                <span className="building-level">Lv {level}</span>
              </div>

              <div style={{ 
                fontSize: "10.5px", 
                color: "var(--dim)", 
                lineHeight: "1.45", 
                margin: "10px 0 12px" 
              }}>
                {b.desc}
              </div>

              <div className="building-costs">
                {cm > 0 && <div className="building-cost-row"><span>Metal</span><span className={hasMetal ? "cost-ok" : "cost-bad"}>{fmt(cm)}</span></div>}
                {cc > 0 && <div className="building-cost-row"><span>Crystal</span><span className={hasCrystal ? "cost-ok" : "cost-bad"}>{fmt(cc)}</span></div>}
                {cd > 0 && <div className="building-cost-row"><span>Deuterium</span><span className={hasDeut ? "cost-ok" : "cost-bad"}>{fmt(cd)}</span></div>}
              </div>

              <button
                className={btnClass}
                disabled={(isQueued && !isReady) || txBusy}
                onClick={() => isReady ? onFinishBuild() : onStartBuild(b.idx)}
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

// ─── Shipyard Tab ─────────────────────────────────────────────────────────────
const ShipyardTab: React.FC<{
  state: PlayerState;
  res?: Resources;
  txBusy: boolean;
  onBuildShip: (shipType: number, qty: number) => void;
}> = ({ state, res, txBusy, onBuildShip }) => {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorInfo, setErrorInfo] = useState<{ title: string; message: string; requirements: string[] } | null>(null);

  const { planet, research } = state;
  const shipyardLevel = planet.shipyard;

  const getQty = (key: string) => quantities[key] ?? 1;
  const setQty = (key: string, v: number) => 
    setQuantities(p => ({ ...p, [key]: Math.max(1, v) }));

  const canAfford = (cost: { m: number; c: number; d: number }, qty: number): boolean => {
    if (!res) return false;
    return (
      res.metal >= BigInt(cost.m * qty) &&
      res.crystal >= BigInt(cost.c * qty) &&
      res.deuterium >= BigInt(cost.d * qty)
    );
  };

  const checkAndBuild = (shipType: number, shipKey: string, qty: number) => {
    const ship = SHIPS.find(s => s.key === shipKey);
    if (!ship) return;

    let requirements: string[] = [];
    let message = "";

    switch (shipType) {
      case 0: // Small Cargo
        if (research.combustionDrive < 2) {
          requirements.push("Combustion Drive ≥ Level 2");
          message = "Small Cargo ships require basic propulsion technology.";
        }
        break;
      case 1: // Large Cargo
        if (research.combustionDrive < 6) {
          requirements.push("Combustion Drive ≥ Level 6");
          message = "Large Cargo ships require advanced propulsion technology.";
        }
        break;
      case 12: // Colony Ship
        if (research.impulseDrive < 3) requirements.push("Impulse Drive ≥ Level 3");
        if (research.astrophysics < 4) requirements.push("Astrophysics ≥ Level 4");
        message = "Colony Ships are used to colonize new planets.";
        break;
    }

    if (requirements.length > 0) {
      setErrorInfo({
        title: `CANNOT BUILD ${ship.name.toUpperCase()}`,
        message,
        requirements
      });
      setShowErrorModal(true);
      return;
    }

    // All good → build
    onBuildShip(shipType, qty);
  };

  // Only show cargo + colony ships
  const visibleShips = SHIPS.filter(s => 
    ["smallCargo", "largeCargo", "colonyShip"].includes(s.key)
  );

  return (
    <div>
      <div className="section-title">SHIPYARD</div>

      {shipyardLevel === 0 ? (
        <div className="notice-box" style={{ textAlign: "center", padding: "40px 20px" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🚀</div>
          <div style={{ fontSize: 13, color: "var(--purple)", letterSpacing: 2 }}>SHIPYARD NOT BUILT</div>
          <div style={{ fontSize: 11, color: "var(--dim)" }}>
            Build a Shipyard in the Buildings tab first.
=======
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
>>>>>>> 1d25215687246c877ab376ad413894febd400d90
          </div>
        </div>
      ) : (
        <>
<<<<<<< HEAD
          <div style={{ fontSize: 10, color: "var(--dim)", letterSpacing: 1, marginBottom: 24 }}>
            Shipyard Level {shipyardLevel} • Ships are built instantly
          </div>

          <div className="grid-3">
            {visibleShips.map(ship => {
              const typeIdx = SHIP_TYPE_IDX[ship.key] ?? -1;
              const qty = getQty(ship.key);
              const affordable = canAfford(ship.cost, qty);
              const current = (state.fleet as any)[ship.key] as number ?? 0;

              return (
                <div key={ship.key} className="ship-build-card">
                  <div className="ship-build-header">
                    <div className="ship-build-icon-name">
                      <span className="ship-build-icon">{ship.icon}</span>
                      <div>
                        <div className="ship-build-name">{ship.name}</div>
                        <div className="ship-build-stats">
                          {ship.cargo > 0 && <span>📦 {fmt(ship.cargo)}</span>}
                        </div>
                      </div>
                    </div>
                    <div className={`ship-build-count${current === 0 ? " zero" : ""}`}>
                      {current.toLocaleString()}
                    </div>
                  </div>

                  <div style={{ fontSize: 10, color: "var(--dim)", margin: "10px 0" }}>
                    {ship.cost.m > 0 && <div>Metal: {fmt(ship.cost.m * qty)}</div>}
                    {ship.cost.c > 0 && <div>Crystal: {fmt(ship.cost.c * qty)}</div>}
                    {ship.cost.d > 0 && <div>Deuterium: {fmt(ship.cost.d * qty)}</div>}
                  </div>

                  <div className="ship-qty-row">
                    <input 
                      className="qty-input" 
                      type="number" 
                      min={1} 
                      value={qty}
                      onChange={e => setQty(ship.key, parseInt(e.target.value) || 1)} 
                    />
                    <button 
                      className="ship-build-btn"
                      disabled={!affordable || txBusy || typeIdx < 0}
                      onClick={() => checkAndBuild(typeIdx, ship.key, qty)}
                    >
                      BUILD ×{qty}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Error Modal */}
      <RequirementErrorModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        title={errorInfo?.title || ""}
        message={errorInfo?.message || ""}
        requirements={errorInfo?.requirements || []}
      />
    </div>
  );
};


// ─── Fleet Tab ────────────────────────────────────────────────────────────────
const FleetTab: React.FC<{
  fleet: Fleet; res?: Resources; txBusy: boolean; onOpenLaunch: () => void;
}> = ({ fleet, res, txBusy, onOpenLaunch }) => {
  const utilityShips = SHIPS.filter(s => ["smallCargo", "largeCargo", "recycler", "colonyShip"].includes(s.key));
  const totalShips = SHIPS.reduce((s, sh) => s + ((fleet as any)[sh.key] ?? 0), 0);
  const slotsAvail = 4 - fleet.activeMissions;
  return (
    <div>
      <div className="section-title">FLEET COMMAND</div>
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="card"><div className="card-label">Total Ships</div><div className="card-value">{totalShips.toLocaleString()}</div></div>
        <div className="card"><div className="card-label">Active Missions</div><div className="card-value">{fleet.activeMissions}</div></div>
        <div className="card">
          <div className="card-label">Mission Slots</div>
          <div className="card-value">{slotsAvail} / 4</div>
          <div className="card-sub">Available</div>
        </div>
        <div className="card">
          <div className="card-label">Cargo Capacity</div>
          <div className="card-value" style={{ fontSize: 14 }}>
            {fmt(fleet.smallCargo * 5000 + fleet.largeCargo * 25000 + fleet.recycler * 20000 + fleet.cruiser * 800 + fleet.battleship * 1500)}
          </div>
        </div>
      </div>
<div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <button onClick={onOpenLaunch} disabled={txBusy}>⊹ LAUNCH FLEET</button>
      </div>

      <div className="section-title">HANGAR — TRANSPORT & COLONIZATION</div>
      <div className="grid-3">
        {utilityShips.map(s => {
          const count = (fleet as any)[s.key] ?? 0;
          return (
            <div key={s.key} className="ship-card">
              <div className="ship-icon">{s.icon}</div>
              <div className="ship-name">{s.name}</div>
              <div className="ship-count">{count.toLocaleString()}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
  
// ─── Missions Tab ─────────────────────────────────────────────────────────────
const MissionsTab: React.FC<{
  fleet: Fleet; nowTs: number; txBusy: boolean;
  onOpenAttack: (mission: Mission, slotIdx: number) => void;
  onResolveTransport: (mission: Mission, slotIdx: number) => void;
  onResolveColonize: (mission: Mission, slotIdx: number) => void;
}> = ({ fleet, nowTs, txBusy, onOpenAttack, onResolveTransport, onResolveColonize }) => {
  const activeMissions = fleet.missions.map((m, i) => ({ m, i })).filter(({ m }) => m.missionType !== 0);
  if (activeMissions.length === 0) {
    return (
      <div>
        <div className="section-title">ACTIVE MISSIONS</div>
        <div style={{ textAlign:"center", padding:"60px 20px", color:"var(--dim)", fontSize:12, letterSpacing:1 }}>
          <div style={{ fontSize:32, marginBottom:12 }}>⊹</div>
          <div>No missions in flight</div>
          <div style={{ fontSize:10, marginTop:8 }}>Launch a fleet from the Fleet tab to begin.</div>
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="section-title">ACTIVE MISSIONS</div>
      {activeMissions.map(({ m, i }) => {
        const progress = missionProgress(m, nowTs);
        const returning = m.applied;
        const etaSecs = returning ? Math.max(0, m.returnTs - nowTs) : Math.max(0, m.arriveTs - nowTs);
        const typeLabel = MISSION_LABELS[m.missionType] ?? "UNKNOWN";
        const typeClass = m.missionType === 2 ? "transport" : "other";
        const needsResolution =
          (m.missionType === 2 && ((!m.applied && nowTs >= m.arriveTs) || (m.applied && m.returnTs > 0 && nowTs >= m.returnTs))) ||
          (m.missionType === 5 && !m.applied && nowTs >= m.arriveTs);
        const returnedHome = m.missionType === 2 && m.applied && nowTs >= m.returnTs;
        const ships = [
          { label: "LF", n: m.sLightFighter }, { label: "HF", n: m.sHeavyFighter },
          { label: "CR", n: m.sCruiser }, { label: "BS", n: m.sBattleship },
          { label: "BC", n: m.sBattlecruiser }, { label: "BM", n: m.sBomber },
          { label: "DS", n: m.sDestroyer }, { label: "DE", n: m.sDeathstar },
          { label: "SC", n: m.sSmallCargo }, { label: "LC", n: m.sLargeCargo },
          { label: "REC", n: m.sRecycler }, { label: "EP", n: m.sEspionageProbe },
          { label: "COL", n: m.sColonyShip },
        ].filter(s => s.n > 0);
        const hasCargo = m.cargoMetal > 0n || m.cargoCrystal > 0n || m.cargoDeuterium > 0n;
        return (
          <div key={i} className="mission-card">
            <div className="mission-header">
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span className={`mission-type-badge ${typeClass}`}>{typeLabel}</span>
                <span className="tag">SLOT {i}</span>
                {needsResolution && (
                  <span style={{ fontSize:9, color:"var(--danger)", letterSpacing:1,
                    padding:"2px 6px", border:"1px solid rgba(255,0,110,0.4)",
                    borderRadius:2, background:"rgba(255,0,110,0.08)" }}>
                    ⚔ RESOLVE REQUIRED
                  </span>
                )}
                {returnedHome && (
                  <span style={{ fontSize:9, color:"var(--success)", letterSpacing:1,
                    padding:"2px 6px", border:"1px solid rgba(6,214,160,0.4)",
                    borderRadius:2, background:"rgba(6,214,160,0.08)" }}>
                    ✓ RETURNED
                  </span>
                )}
              </div>
              {returning && !returnedHome && <span className="mission-returning">↩ RETURNING</span>}
            </div>
            <div className="progress-bar">
              <div className={`progress-fill ${returning ? "returning" : "outbound"}`} style={{ width: `${progress}%` }} />
            </div>
            <div className="mission-info">
              <span>{returning ? "Return ETA" : "Arrive ETA"}</span>
              <span className="mission-eta">{etaSecs <= 0 ? (needsResolution ? "READY TO RESOLVE" : "ARRIVED") : fmtCountdown(etaSecs)}</span>
            </div>
            <div className="mission-info" style={{ marginTop: 4 }}>
              <span>Progress</span><span>{progress}%</span>
            </div>
            <div className="mission-ships">
              {ships.map(s => (
                <span key={s.label} className="mission-ship-badge">{s.label} ×{s.n.toLocaleString()}</span>
              ))}
            </div>
            {hasCargo && (
              <div style={{ marginTop:10, fontSize:10, color:"var(--dim)", display:"flex", gap:16 }}>
                {m.cargoMetal > 0n && <span style={{ color:"var(--metal)" }}>⛏ {fmt(m.cargoMetal)}</span>}
                {m.cargoCrystal > 0n && <span style={{ color:"var(--crystal)" }}>💎 {fmt(m.cargoCrystal)}</span>}
                {m.cargoDeuterium > 0n && <span style={{ color:"var(--deut)" }}>🧪 {fmt(m.cargoDeuterium)}</span>}
              </div>
            )}
            {needsResolution && (
              <button
                className={`apply-btn ${m.missionType === 2 ? "danger" : ""}`}
                disabled={txBusy}
                onClick={() => {
                  if (m.missionType === 2) onResolveTransport(m, i);
                  else if (m.missionType === 5) onResolveColonize(m, i);
                  else onOpenAttack(m, i);
                }}
              >
                {m.missionType === 2 ? "RESOLVE TRANSPORT" : m.missionType === 5 ? "RESOLVE COLONIZE" : "RESOLVE"}
              </button>
            )}
            {returnedHome && (
              <div style={{ marginTop:10, fontSize:10, color:"var(--success)", letterSpacing:1 }}>
                ✓ Fleet returned home. Resources credited on-chain. Refresh to update.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default App;
=======
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
>>>>>>> 1d25215687246c877ab376ad413894febd400d90
