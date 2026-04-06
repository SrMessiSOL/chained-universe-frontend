import React, { useEffect, useState, useCallback, useRef } from "react";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { AnchorProvider } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  GameClient,
  type VaultRecoveryPromptRequest,
  Planet, Resources, Fleet, Mission, PlayerState, Research,
  BUILDINGS, SHIPS, SHIP_TYPE_IDX, MISSION_LABELS,
  upgradeCost, buildTimeSecs,
  fmt, fmtCountdown, missionProgress, energyEfficiency,
} from "./game-state";
import GalaxyTab from "./GalaxyTab";

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab = "overview" | "resources" | "buildings" | "shipyard" | "fleet" | "missions" | "research" | "galaxy";

type LaunchTargetInput =
  | { kind: "transport"; mode: "owned"; destinationEntity: string }
  | { kind: "transport"; mode: "coords"; galaxy: number; system: number; position: number }
  | { kind: "colonize"; galaxy: number; system: number; position: number; colonyName: string };

type ConfirmationState =
  | null
  | { kind: "resolveColonize"; mission: Mission; slotIdx: number };

// ─── CSS ──────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Share+Tech+Mono&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --void: #04040d; --panel: #0b0b1e; --border: #1a1a3a; --purple: #9b5de5;
    --cyan: #00f5d4; --text: #c8d6e5; --dim: #4a5568; --metal: #b8b8d4;
    --crystal: #00f5d4; --deut: #4cc9f0; --danger: #ff006e; --success: #06d6a0;
    --warn: #ffd60a; --glow-p: 0 0 20px rgba(155,93,229,0.4); --glow-c: 0 0 20px rgba(0,245,212,0.4);
  }
  html, body, #root { height: 100%; background: var(--void); color: var(--text);
    font-family: 'Share Tech Mono', monospace; font-size: 13px; overflow: hidden; }
  .starfield { position: fixed; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; }
  .star { position: absolute; border-radius: 50%; background: white;
    animation: twinkle var(--dur) ease-in-out infinite; animation-delay: var(--delay); }
  @keyframes twinkle { 0%,100%{opacity:var(--min-op);transform:scale(1)} 50%{opacity:1;transform:scale(1.4)} }
  .app { position: relative; z-index: 1; height: 100vh; display: grid;
    grid-template-rows: 56px 1fr; grid-template-columns: 220px 1fr;
    grid-template-areas: "header header" "sidebar main"; }
  .header { grid-area: header; display: flex; align-items: center; justify-content: space-between;
    padding: 0 24px; background: rgba(8,8,22,0.95); border-bottom: 1px solid var(--border);
    backdrop-filter: blur(12px); }
  .logo-area { display: flex; align-items: center; gap: 12px; }
  .game-title { font-family: 'Orbitron', sans-serif; font-size: 16px; font-weight: 900; letter-spacing: 3px;
    background: linear-gradient(135deg, var(--purple), var(--cyan));
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
  .loading-overlay { position: fixed; inset: 0; pointer-events: none; background: rgba(4,4,13,0.92);
    z-index: 9999; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 24px; backdrop-filter: blur(8px); }
  .loading-spinner { width: 56px; height: 56px; border: 5px solid var(--border);
    border-top-color: var(--purple); border-radius: 50%; animation: spin 0.9s linear infinite; }
  .loading-text { font-family: 'Orbitron', sans-serif; font-size: 15px; letter-spacing: 3px;
    color: var(--cyan); text-transform: uppercase; text-align: center; animation: pulse 2s ease-in-out infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
  .header-right { display: flex; align-items: center; gap: 12px; }
  .chain-tag { font-size: 10px; letter-spacing: 1px; color: var(--dim);
    border: 1px solid var(--border); padding: 4px 8px; border-radius: 2px; }
  .vault-tag { font-size: 10px; letter-spacing: 1px; color: var(--success);
    border: 1px solid rgba(6,214,160,0.3); padding: 4px 8px; border-radius: 2px;
    background: rgba(6,214,160,0.05); }
  .sidebar { grid-area: sidebar; background: rgba(11,11,30,0.9); border-right: 1px solid var(--border);
    display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden; }
  .planet-card { padding: 20px 16px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
  .planet-coords { font-size: 10px; color: var(--dim); letter-spacing: 1px; margin-bottom: 6px; }
  .planet-name { font-family: 'Orbitron', sans-serif; font-size: 14px; font-weight: 700; color: white; margin-bottom: 2px; }
  .planet-meta { font-size: 10px; color: var(--dim); }
  .fields-bar { margin-top: 10px; height: 3px; background: var(--border); border-radius: 2px; overflow: hidden; }
  .fields-fill { height: 100%; background: linear-gradient(90deg, var(--purple), var(--cyan)); transition: width 0.5s; }
  .fields-label { margin-top: 4px; font-size: 10px; color: var(--dim); display: flex; justify-content: space-between; }
  .res-panel { padding: 14px 16px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
  .res-label { font-size: 9px; letter-spacing: 2px; color: var(--dim); text-transform: uppercase; margin-bottom: 10px; }
  .res-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .res-name { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--dim); }
  .res-dot { width: 6px; height: 6px; border-radius: 50%; }
  .res-val { font-size: 12px; font-weight: 600; }
  .res-rate { font-size: 9px; color: var(--dim); }
  .cap-bar { margin-bottom: 12px; height: 2px; background: var(--border); border-radius: 1px; overflow: hidden; }
  .cap-fill { height: 100%; border-radius: 1px; transition: width 0.5s; }
  .energy-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-top: 1px solid var(--border); }
  .nav { flex: 1 1 0; min-height: 0; padding: 12px 0; overflow-y: auto; display: flex; flex-direction: column; gap: 3px; }
  .nav::-webkit-scrollbar { width: 5px; }
  .nav::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
  .nav-item { display: flex; align-items: center; gap: 10px; padding: 11px 16px; cursor: pointer;
    font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: var(--dim);
    transition: all 0.15s; border-left: 2px solid transparent; }
  .nav-item:hover { color: var(--text); background: rgba(155,93,229,0.05); }
  .nav-item.active { color: var(--cyan); border-left-color: var(--cyan); background: rgba(0,245,212,0.05); }
  .nav-badge { margin-left: auto; font-size: 9px; padding: 2px 6px; background: var(--danger);
    border-radius: 10px; color: white; font-weight: 700; }
  .main { grid-area: main; overflow-y: auto; padding: 24px; scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
  .main::-webkit-scrollbar { width: 4px; }
  .main::-webkit-scrollbar-thumb { background: var(--border); }
  .section-title { font-family: 'Orbitron', sans-serif; font-size: 12px; font-weight: 700;
    letter-spacing: 3px; color: var(--purple); text-transform: uppercase; margin-bottom: 20px;
    padding-bottom: 8px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 10px; }
  .section-title::after { content:''; flex:1; height:1px; background: linear-gradient(90deg, var(--border), transparent); }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .grid-3 { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; }
  .grid-4 { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; }
  .card { background: var(--panel); border: 1px solid var(--border); border-radius: 4px; padding: 16px; transition: border-color 0.2s; }
  .card:hover { border-color: rgba(155,93,229,0.3); }
  .card-label { font-size: 9px; letter-spacing: 2px; color: var(--dim); text-transform: uppercase; margin-bottom: 6px; }
  .card-value { font-family: 'Orbitron', sans-serif; font-size: 20px; font-weight: 700; color: white; }
  .card-sub { font-size: 10px; color: var(--dim); margin-top: 3px; }
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
  .build-btn.can-build:hover { background: linear-gradient(135deg,var(--purple),var(--cyan)); color: var(--void); box-shadow: var(--glow-p); }
  .build-btn.building-now { background: rgba(255,214,10,0.1); border: 1px solid var(--warn); color: var(--warn); cursor: default; }
  .build-btn.finish-btn { background: rgba(6,214,160,0.1); border: 1px solid var(--success); color: var(--success); }
  .build-btn.finish-btn:hover { background: var(--success); color: var(--void); }
  .build-btn.no-funds { background: transparent; border: 1px solid var(--border); color: var(--dim); cursor: not-allowed; }
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
    padding: 6px 10px; border-radius: 2px; border: 1px solid var(--cyan); background: rgba(0,245,212,0.08);
    color: var(--cyan); cursor: pointer; transition: all 0.15s; text-transform: uppercase; flex: 1; }
  .ship-build-btn:hover:not(:disabled) { background: var(--cyan); color: var(--void); box-shadow: var(--glow-c); }
  .ship-build-btn:disabled { border-color: var(--border); color: var(--dim); cursor: not-allowed; background: transparent; }
  .ship-card { background: var(--panel); border: 1px solid var(--border); border-radius: 4px;
    padding: 14px; display: flex; flex-direction: column; align-items: center; gap: 6px; transition: border-color 0.2s; }
  .ship-card:hover { border-color: rgba(0,245,212,0.3); }
  .ship-icon { font-size: 22px; }
  .ship-name { font-size: 9px; color: var(--dim); text-align: center; letter-spacing: 1px; }
  .ship-count { font-family: 'Orbitron', sans-serif; font-size: 18px; font-weight: 700; color: var(--cyan); }
  .ship-count.zero { color: var(--border); }
  .mission-card { background: var(--panel); border: 1px solid var(--border); border-radius: 4px; padding: 16px; margin-bottom: 12px; }
  .mission-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .mission-type-badge { font-size: 10px; letter-spacing: 2px; padding: 3px 8px; border-radius: 2px; font-weight: 700; }
  .mission-type-badge.transport { background:rgba(0,245,212,0.1); color:var(--cyan); border:1px solid rgba(0,245,212,0.3); }
  .mission-type-badge.other { background:rgba(155,93,229,0.1); color:var(--purple); border:1px solid rgba(155,93,229,0.3); }
  .mission-returning { font-size: 10px; color: var(--success); letter-spacing: 1px; }
  .progress-bar { height: 3px; background: var(--border); border-radius: 2px; overflow: hidden; margin-bottom: 8px; }
  .progress-fill { height: 100%; border-radius: 2px; transition: width 1s linear; }
  .progress-fill.outbound { background: linear-gradient(90deg, var(--purple), var(--cyan)); }
  .progress-fill.returning { background: linear-gradient(90deg, var(--cyan), var(--success)); }
  .mission-info { display: flex; justify-content: space-between; font-size: 10px; color: var(--dim); }
  .mission-eta { color: var(--cyan); font-weight: 600; }
  .mission-ships { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px; }
  .mission-ship-badge { font-size: 10px; background: rgba(155,93,229,0.08); border: 1px solid var(--border); border-radius: 2px; padding: 2px 6px; color: var(--text); }
  .apply-btn { font-family: 'Share Tech Mono', monospace; font-size: 10px; letter-spacing: 1px;
    padding: 6px 14px; border-radius: 2px; border: 1px solid var(--success); background: rgba(6,214,160,0.1);
    color: var(--success); cursor: pointer; transition: all 0.15s; margin-top: 10px; }
  .apply-btn:hover:not(:disabled) { background: var(--success); color: var(--void); }
  .apply-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .stat-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid rgba(26,26,58,0.5); }
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
  .modal-backdrop { position: fixed; inset: 0; background: rgba(4,4,13,0.85); z-index: 100;
    display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
  .modal { background: var(--panel); border: 1px solid var(--border); border-radius: 6px; padding: 28px;
    width: 560px; max-height: 85vh; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
  .modal-title { font-family: 'Orbitron', sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 3px;
    color: var(--cyan); margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid var(--border); }
  .modal-section { margin-bottom: 18px; }
  .modal-label { font-size: 9px; letter-spacing: 2px; color: var(--dim); text-transform: uppercase; margin-bottom: 10px; }
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
    padding: 9px 18px; border-radius: 2px; cursor: pointer; transition: all 0.15s; text-transform: uppercase; flex: 1; }
  .modal-btn.primary { border: 1px solid var(--cyan); background: rgba(0,245,212,0.1); color: var(--cyan); }
  .modal-btn.primary:hover:not(:disabled) { background: var(--cyan); color: var(--void); box-shadow: var(--glow-c); }
  .modal-btn.secondary { border: 1px solid var(--border); background: transparent; color: var(--dim); }
  .modal-btn.secondary:hover { color: var(--text); border-color: var(--dim); }
  .modal-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .modal-info-row { font-size: 10px; color: var(--dim); display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid rgba(26,26,58,0.3); }
  .modal-info-row:last-child { border-bottom: none; }
  .modal-info-val { color: var(--text); }
  .landing { height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 32px; position: relative; z-index: 1; }
  .landing-logo { animation: float 4s ease-in-out infinite; }
  @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
  .landing-title { font-family: 'Orbitron', sans-serif; font-size: 42px; font-weight: 900; letter-spacing: 6px;
    text-align: center; background: linear-gradient(135deg,var(--purple) 0%,var(--cyan) 100%);
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
  .create-btn:hover:not(:disabled) { background:linear-gradient(135deg,var(--cyan),var(--purple)); color:var(--void); box-shadow:var(--glow-c); }
  .create-btn:disabled { color:var(--dim); cursor:not-allowed; }
  .spinner { width:40px; height:40px; border:2px solid var(--border); border-top-color:var(--purple); border-radius:50%; animation:spin 0.8s linear infinite; }
  .error-msg { color:var(--danger); font-size:11px; letter-spacing:1px; margin-top:8px; }
  .tag { font-size:9px; letter-spacing:1.5px; padding:2px 6px; border-radius:2px; text-transform:uppercase;
    background:rgba(155,93,229,0.1); border:1px solid rgba(155,93,229,0.3); color:var(--purple); }
  .notice-box { background: rgba(155,93,229,0.05); border: 1px solid rgba(155,93,229,0.2);
    border-radius: 4px; padding: 10px 14px; font-size: 10px; color: var(--dim); letter-spacing: 1px; margin-bottom: 16px; }
  .wallet-adapter-button { font-family:'Share Tech Mono',monospace !important; font-size:11px !important; letter-spacing:1px !important; border-radius:2px !important; }
`;

// ─── Pixel Planet (kept from original) ───────────────────────────────────────
type PlanetBiome = "lava" | "temperate" | "arid" | "ice";
type RGBA = [number, number, number, number];

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rgba = (r: number, g: number, b: number, a = 255): RGBA => [r, g, b, a];

function rgbaToCss([r, g, b, a]: RGBA): string { return `rgba(${r},${g},${b},${a / 255})`; }
function mixColor(a: RGBA, b: RGBA, t: number): RGBA {
  return [Math.round(lerp(a[0], b[0], t)), Math.round(lerp(a[1], b[1], t)), Math.round(lerp(a[2], b[2], t)), Math.round(lerp(a[3], b[3], t))];
}
function mulColor(a: RGBA, f: number): RGBA {
  return [clamp(Math.round(a[0]*f),0,255), clamp(Math.round(a[1]*f),0,255), clamp(Math.round(a[2]*f),0,255), a[3]];
}
function addColor(a: RGBA, amt: number): RGBA {
  return [clamp(a[0]+amt,0,255), clamp(a[1]+amt,0,255), clamp(a[2]+amt,0,255), a[3]];
}

function hashCoords(galaxy: number, system: number, position: number): number {
  let h = 2166136261 >>> 0;
  const str = `${galaxy}:${system}:${position}`;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return function() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function valueNoise2D(x: number, y: number, seed: number): number {
  let n = Math.imul((x|0)^0x27d4eb2d,374761393)^Math.imul((y|0)^0x165667b1,668265263)^seed;
  n = (n^(n>>>13))>>>0; n = Math.imul(n,1274126177)>>>0;
  return (n&0xffff)/0xffff;
}

function smoothNoise2D(x: number, y: number, seed: number): number {
  const x0=Math.floor(x), y0=Math.floor(y), xf=x-x0, yf=y-y0;
  const v00=valueNoise2D(x0,y0,seed), v10=valueNoise2D(x0+1,y0,seed);
  const v01=valueNoise2D(x0,y0+1,seed), v11=valueNoise2D(x0+1,y0+1,seed);
  const sx=xf*xf*(3-2*xf), sy=yf*yf*(3-2*yf);
  return lerp(lerp(v00,v10,sx),lerp(v01,v11,sx),sy);
}

function fbm2D(x: number, y: number, seed: number, octaves=5): number {
  let value=0, amp=0.5, freq=1, norm=0;
  for(let i=0;i<octaves;i++){value+=smoothNoise2D(x*freq,y*freq,seed+i*9973)*amp;norm+=amp;amp*=0.5;freq*=2;}
  return value/norm;
}

function getBiome(position: number): PlanetBiome {
  if(position<=3) return "lava"; if(position<=6) return "temperate"; if(position<=10) return "arid"; return "ice";
}

type PixelPlanetVisual = {
  seed:number; biome:PlanetBiome; basePalette:RGBA[]; atmosphere:RGBA; glow:RGBA;
  cloudPalette:RGBA[]; hasRings:boolean; hasStorm:boolean; craterDensity:number;
  cloudDensity:number; mountainDensity:number; waterLevel:number; banding:number; polarCaps:boolean;
  rotationSpeed:number; cloudDriftSpeed:number;
};

function chooseVisual(planet: Planet): PixelPlanetVisual {
  const position=clamp(planet.position||1,1,15);
  const biome=getBiome(position);
  const seed=hashCoords(planet.galaxy||1,planet.system||1,position);
  const rand=mulberry32(seed);
  const rotationSpeed=0.000015+rand()*0.00003;
  const cloudDriftSpeed=0.00002+rand()*0.000025;
  if(biome==="lava") return { seed,biome,basePalette:[rgba(26,8,10),rgba(72,18,16),rgba(138,34,18),rgba(212,79,18),rgba(255,173,67)],
    atmosphere:rgba(255,104,36,90),glow:rgba(255,98,28,180),cloudPalette:[rgba(255,190,110,32)],
    hasRings:false,hasStorm:rand()>0.65,craterDensity:0.08+rand()*0.05,cloudDensity:0.03+rand()*0.03,
    mountainDensity:0.22+rand()*0.10,waterLevel:0,banding:0.12+rand()*0.10,polarCaps:false,rotationSpeed,cloudDriftSpeed };
  if(biome==="temperate") return { seed,biome,basePalette:[rgba(12,34,56),rgba(28,86,136),rgba(32,126,98),rgba(88,165,101),rgba(186,205,144)],
    atmosphere:rgba(90,185,255,80),glow:rgba(72,198,255,150),cloudPalette:[rgba(248,252,255,95)],
    hasRings:false,hasStorm:rand()>0.72,craterDensity:0.015+rand()*0.02,cloudDensity:0.12+rand()*0.10,
    mountainDensity:0.12+rand()*0.08,waterLevel:0.44+rand()*0.16,banding:0.03+rand()*0.04,polarCaps:rand()>0.55,rotationSpeed,cloudDriftSpeed };
  if(biome==="arid") return { seed,biome,basePalette:[rgba(59,33,20),rgba(111,67,38),rgba(164,103,63),rgba(212,164,109),rgba(241,219,174)],
    atmosphere:rgba(255,194,108,64),glow:rgba(255,191,110,135),cloudPalette:[rgba(245,224,180,42)],
    hasRings:false,hasStorm:rand()>0.52,craterDensity:0.05+rand()*0.06,cloudDensity:0.04+rand()*0.04,
    mountainDensity:0.16+rand()*0.10,waterLevel:rand()>0.88?0.08+rand()*0.08:0,banding:0.10+rand()*0.08,polarCaps:false,rotationSpeed,cloudDriftSpeed };
  return { seed,biome,basePalette:[rgba(21,41,68),rgba(47,86,128),rgba(112,165,197),rgba(195,229,243),rgba(244,250,255)],
    atmosphere:rgba(160,220,255,88),glow:rgba(180,230,255,145),cloudPalette:[rgba(252,252,255,74)],
    hasRings:false,hasStorm:rand()>0.75,craterDensity:0.03+rand()*0.05,cloudDensity:0.08+rand()*0.08,
    mountainDensity:0.10+rand()*0.08,waterLevel:0.10+rand()*0.10,banding:0.05+rand()*0.06,polarCaps:true,rotationSpeed,cloudDriftSpeed };
}

function renderPixelPlanetToCanvas(canvas: HTMLCanvasElement, planet: Planet, opts?: { size?: number; rotationOffset?: number; cloudOffset?: number }) {
  const size = opts?.size ?? 92;
  const visual = chooseVisual(planet);
  const rotationOffset = opts?.rotationOffset ?? 0;
  const cloudOffset = opts?.cloudOffset ?? 0;
  canvas.width = size; canvas.height = size;
  canvas.style.width = `${size}px`; canvas.style.height = `${size}px`;
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;
  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = false;
  const cx = size / 2, cy = size / 2, radius = Math.floor(size * 0.355);
  const rand = mulberry32(visual.seed);
  const lightX = -0.62, lightY = -0.42;
  const tilt = (rand() * 2 - 1) * 0.35;
  const stormCx = (rand() * 1.2 - 0.6) * 0.45;
  const stormCy = (rand() * 1.2 - 0.6) * 0.45;
  const stormR = 0.10 + rand() * 0.08;
  const img = ctx.createImageData(size, size);
  const data = img.data;
  function paletteSample(palette: RGBA[], t: number): RGBA {
    const n = palette.length - 1;
    if (t <= 0) return palette[0]; if (t >= 1) return palette[n];
    const scaled = t * n; const i = Math.floor(scaled); const f = scaled - i;
    return mixColor(palette[i], palette[Math.min(i+1,n)], f);
  }
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const dx = (px - cx) / radius, dy = (py - cy) / radius;
      const rr = dx*dx+dy*dy;
      if (rr > 1) continue;
      const z = Math.sqrt(1 - rr);
      const nx = dx, ny = dy*Math.cos(tilt)-z*Math.sin(tilt), nz = dy*Math.sin(tilt)+z*Math.cos(tilt);
      const shade = clamp(nx*lightX+ny*lightY+nz*0.88,-1,1);
      const lambert = 0.28 + Math.max(0,shade) * 0.85;
      const u = (0.5 + Math.atan2(nx,nz)/(Math.PI*2) + rotationOffset) % 1;
      const v = 0.5 - Math.asin(ny) / Math.PI;
      const continents = fbm2D(u*5.5+11.7, v*5.5+3.2, visual.seed+101, 6);
      const details = fbm2D(u*16.0+0.8, v*16.0+7.3, visual.seed+202, 5);
      const ridges = fbm2D(u*22.0+8.4, v*22.0+9.1, visual.seed+303, 4);
      const micro = fbm2D(u*42.0+2.1, v*42.0+1.6, visual.seed+404, 3);
      const lat = Math.abs(v-0.5)*2;
      const band = (Math.sin((v+u*0.2)*Math.PI*(4+visual.banding*18)+visual.seed*0.001)+1)*0.5;
      let height = continents*0.56+details*0.24+ridges*0.14+micro*0.06+band*visual.banding*0.22;
      if (visual.biome==="temperate"||visual.biome==="ice") height -= visual.waterLevel*0.42;
      else if (visual.biome==="arid") height -= visual.waterLevel*0.20;
      else height += 0.06;
      let color = paletteSample(visual.basePalette, clamp(height,0,1));
      if (visual.biome==="temperate") {
        if (height<0.08) color=mixColor(rgba(7,35,76,255),rgba(42,118,188,255),clamp((height+0.12)/0.20,0,1));
        else { if(height>0.42)color=mixColor(color,rgba(184,188,154,255),0.25); if(height>0.62)color=mixColor(color,rgba(232,234,228,255),0.35); }
      }
      if (visual.biome==="lava") { const magma=fbm2D(u*19+1.3,v*19+2.6,visual.seed+606,5); const crack=fbm2D(u*40+3.7,v*40+5.5,visual.seed+707,3); if(magma>0.66||crack>0.73)color=mixColor(color,rgba(255,129,32,255),0.62); if(magma>0.80)color=mixColor(color,rgba(255,210,92,255),0.74); }
      if (visual.polarCaps&&lat>0.72) color=mixColor(color,rgba(245,248,255,255),clamp((lat-0.72)/0.22,0,1)*0.85);
      const craterNoise=fbm2D(u*31+9.1,v*31+1.4,visual.seed+808,4);
      if(craterNoise>1-visual.craterDensity)color=mulColor(color,0.72);
      if(visual.hasStorm){const sx=u-(0.5+stormCx),sy=v-(0.5+stormCy),sdist=Math.sqrt(sx*sx+sy*sy);if(sdist<stormR){const spiral=Math.sin(Math.atan2(sy,sx)*6+sdist*64-visual.seed*0.002);const stormAmt=clamp((stormR-sdist)/stormR,0,1)*(0.3+(spiral+1)*0.25);color=mixColor(color,visual.cloudPalette[0],stormAmt);}}
      const cloudNoise=fbm2D((u+cloudOffset)*14+5.3,v*14+7.9,visual.seed+1111,5);
      if(cloudNoise>1-visual.cloudDensity)color=mixColor(color,visual.cloudPalette[0],clamp((cloudNoise-(1-visual.cloudDensity))/visual.cloudDensity,0,1)*0.70);
      const rim=Math.pow(1-z,1.6);
      color=mixColor(color,visual.atmosphere,rim*0.65);
      color=mulColor(color,lambert);
      const spec=Math.pow(Math.max(0,shade),18);
      if(visual.biome==="temperate"||visual.biome==="ice")color=addColor(color,Math.round(spec*52));
      else color=addColor(color,Math.round(spec*24));
      const idx=(py*size+px)*4;
      data[idx]=color[0];data[idx+1]=color[1];data[idx+2]=color[2];data[idx+3]=255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

const PixelPlanetCanvas: React.FC<{ planet: Planet; size?: number; rotationOffset?: number; cloudOffset?: number }> = ({ planet, size=92, rotationOffset=0, cloudOffset=0 }) => {
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  React.useEffect(() => {
    if (!ref.current) return;
    renderPixelPlanetToCanvas(ref.current, planet, { size, rotationOffset, cloudOffset });
  }, [planet.galaxy, planet.system, planet.position, size, rotationOffset, cloudOffset]);
  return <canvas ref={ref} width={size} height={size} style={{ display:"block", imageRendering:"pixelated" }} />;
};

const OrbitingPlanetVisual: React.FC<{ planet: Planet; size?: number }> = ({ planet, size=175 }) => {
  const [time, setTime] = React.useState(0);
  const visual = React.useMemo(() => chooseVisual(planet), [planet.galaxy, planet.system, planet.position]);
  React.useEffect(() => {
    let raf = 0; const started = performance.now();
    const tick = (now: number) => { setTime(now - started); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <PixelPlanetCanvas planet={planet} size={size} rotationOffset={(time * visual.rotationSpeed) % 1} cloudOffset={(time * visual.cloudDriftSpeed) % 1} />;
};

// ─── Simple Components ────────────────────────────────────────────────────────
const LogoSVG: React.FC<{ size?: number }> = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <defs>
      <linearGradient id="lg1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#9b5de5" /><stop offset="100%" stopColor="#00f5d4" />
      </linearGradient>
    </defs>
    <rect x="18" y="18" width="48" height="48" rx="8" transform="rotate(45 50 50)" stroke="url(#lg1)" strokeWidth="5" fill="none" />
    <rect x="26" y="26" width="36" height="36" rx="6" transform="rotate(45 50 50)" stroke="url(#lg1)" strokeWidth="4" fill="none" opacity="0.85" />
    <rect x="36" y="36" width="20" height="20" rx="4" transform="rotate(45 50 50)" stroke="url(#lg1)" strokeWidth="3.5" fill="none" opacity="0.7" />
  </svg>
);

const Starfield: React.FC = () => {
  const stars = Array.from({ length: 120 }, (_, i) => ({
    id: i, x: Math.random() * 100, y: Math.random() * 100,
    size: Math.random() * 1.8 + 0.3, dur: (Math.random() * 3 + 2).toFixed(1),
    delay: (Math.random() * 4).toFixed(1), minOp: (Math.random() * 0.2 + 0.05).toFixed(2),
  }));
  return (
    <div className="starfield">
      {stars.map(s => (
        <div key={s.id} className="star" style={{ left:`${s.x}%`, top:`${s.y}%`, width:s.size, height:s.size, "--dur":`${s.dur}s`, "--delay":`${s.delay}s`, "--min-op":s.minOp } as React.CSSProperties} />
      ))}
    </div>
  );
};

const LoadingOverlay: React.FC<{ visible: boolean; message?: string }> = ({ visible, message }) => {
  if (!visible) return null;
  return (
    <div className="loading-overlay">
      <div className="loading-spinner" />
      <div className="loading-text">{message ?? "PROCESSING..."}</div>
      <div style={{ fontSize:"10px", color:"var(--dim)", marginTop:8, letterSpacing:"1px" }}>Please do not refresh the page</div>
    </div>
  );
};

const ResRow: React.FC<{ color: string; label: string; value: bigint; cap: bigint; rate: bigint }> =
  ({ color, label, value, cap, rate }) => {
    const pct = cap > 0n ? Math.min(100, Number(value * 100n / cap)) : 0;
    return (
      <>
        <div className="res-row">
          <div className="res-name"><div className="res-dot" style={{ background: color }} />{label}</div>
          <div><div className="res-val" style={{ color }}>{fmt(value)}</div><div className="res-rate">+{fmt(rate)}/h</div></div>
        </div>
        <div className="cap-bar"><div className="cap-fill" style={{ width:`${pct}%`, background:color }} /></div>
      </>
    );
  };

function useInterpolatedResources(res: Resources | undefined, nowTs: number): Resources | undefined {
  return React.useMemo(() => {
    if (!res) return undefined;
    if (res.lastUpdateTs <= 0) return res;
    const dt = Math.max(0, nowTs - res.lastUpdateTs);
    if (dt === 0) return res;
    const eff = res.energyConsumption === 0n ? 1.0 : Math.min(1.0, Number(res.energyProduction) / Number(res.energyConsumption));
    const produce = (current: bigint, ratePerHour: bigint, cap: bigint): bigint => {
      const gained = (Number(ratePerHour) * dt * eff) / 3600;
      return BigInt(Math.floor(Math.min(Number(current) + gained, Number(cap))));
    };
    return { ...res, metal: produce(res.metal, res.metalHour, res.metalCap), crystal: produce(res.crystal, res.crystalHour, res.crystalCap), deuterium: produce(res.deuterium, res.deuteriumHour, res.deuteriumCap) };
  }, [res, nowTs]);
}

// ─── Vault Recovery Modal ─────────────────────────────────────────────────────
interface VaultRecoveryModalProps {
  request: VaultRecoveryPromptRequest | null;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onSubmit: (password: string) => void;
}

const VaultRecoveryModal: React.FC<VaultRecoveryModalProps> = ({ request, busy=false, error=null, onCancel, onSubmit }) => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  useEffect(() => { setPassword(""); setConfirmPassword(""); }, [request?.mode, request?.wallet]);
  if (!request) return null;
  const isCreate = request.mode === "create";
  const canSubmit = isCreate ? password.trim().length >= 8 && password === confirmPassword : password.trim().length > 0;
  return (
    <div className="modal-backdrop" style={{ zIndex: 12000 }} onClick={e => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div className="modal" style={{ maxWidth:"560px" }}>
        <div className="modal-title" style={{ color:"var(--warn)" }}>{isCreate ? "SECURE VAULT RECOVERY" : "RESTORE VAULT ACCESS"}</div>
        <div className="modal-section">
          <div style={{ fontSize:"11px", color:"var(--text)", lineHeight:1.7, marginBottom:14 }}>
            {isCreate
              ? "Create a recovery password to protect your vault keypair. You will need the same wallet and this password to restore game access on another device."
              : "Enter your recovery password to restore vault access on this device."}
          </div>
          <div style={{ padding:"12px 14px", border:"1px solid rgba(255,214,10,0.35)", background:"rgba(255,214,10,0.08)", borderRadius:4, fontSize:"10px", lineHeight:1.6, color:"var(--text)" }}>
            This password protects your encrypted vault keypair stored on-chain. If lost, vault recovery on other devices will be impossible.
          </div>
        </div>
        <div className="modal-section">
          <div className="modal-label">Recovery Password</div>
          <input className="modal-select" type="password" autoFocus value={password} onChange={e => setPassword(e.target.value)}
            placeholder={isCreate ? "Choose a strong recovery password" : "Enter your recovery password"} disabled={busy} />
        </div>
        {isCreate && (
          <div className="modal-section">
            <div className="modal-label">Confirm Password</div>
            <input className="modal-select" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Repeat the recovery password" disabled={busy} />
            <div style={{ fontSize:"10px", color:"var(--dim)", marginTop:8 }}>Use at least 8 characters.</div>
          </div>
        )}
        {error && <div style={{ color:"var(--danger)", fontSize:"10px", marginBottom:8 }}>{error}</div>}
        <div className="modal-footer">
          <button className="modal-btn secondary" onClick={onCancel} disabled={busy}>CANCEL</button>
          <button className="modal-btn primary" disabled={!canSubmit || busy} onClick={() => onSubmit(password.trim())}>
            {isCreate ? "SAVE RECOVERY PASSWORD" : "RESTORE VAULT"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Confirmation Modal ───────────────────────────────────────────────────────
const ConfirmationModal: React.FC<{
  isOpen: boolean; onClose: () => void; onConfirm: () => void;
  title: string; lines: string[]; confirmLabel: string; tone?: "primary" | "danger"; disabled?: boolean;
}> = ({ isOpen, onClose, onConfirm, title, lines, confirmLabel, tone="primary", disabled=false }) => {
  if (!isOpen) return null;
  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth:"520px" }}>
        <div className="modal-title">{title}</div>
        <div className="modal-section">
          {lines.map((line, i) => (
            <div key={i} style={{ fontSize:"11px", color:line.startsWith("-")?"var(--text)":"var(--dim)", lineHeight:1.6, marginBottom:10 }}>{line}</div>
          ))}
        </div>
        <div className="modal-footer">
          <button className="modal-btn secondary" onClick={onClose} disabled={disabled}>CANCEL</button>
          <button className={`modal-btn ${tone}`} onClick={onConfirm} disabled={disabled}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
};

// ─── Launch Modal ─────────────────────────────────────────────────────────────
const CARGO_SHIP_KEYS = ["smallCargo","largeCargo","recycler","espionageProbe","colonyShip"];

const LaunchModal: React.FC<{
  fleet: Fleet;
  res: Resources;
  ownedPlanets: PlayerState[];
  currentPlanetPda: string;
  onClose: () => void;
  txBusy: boolean;
  onLaunch: (
    ships: Record<string, number>,
    cargo: { metal: bigint; crystal: bigint; deuterium: bigint },
    missionType: number,
    speedFactor: number,
    target: LaunchTargetInput
  ) => Promise<void>;
}> = ({ fleet, res, ownedPlanets, currentPlanetPda, onClose, onLaunch, txBusy }) => {
  const [shipQty, setShipQty] = useState<Record<string, number>>({});
  const [missionType, setMissionType] = useState(2);
  const [cargoM, setCargoM] = useState(0);
  const [cargoC, setCargoC] = useState(0);
  const [cargoD, setCargoD] = useState(0);
  const [speed, setSpeed] = useState(100);
  const [transportMode, setTransportMode] = useState<"owned" | "coords">("owned");
  const selectableOwned = ownedPlanets.filter(p => p.planetPda !== currentPlanetPda);
  const [targetEntity, setTargetEntity] = useState(selectableOwned[0]?.entityPda ?? "");
  const [targetGalaxy, setTargetGalaxy] = useState(1);
  const [targetSystem, setTargetSystem] = useState(1);
  const [targetPosition, setTargetPosition] = useState(1);
  const [colonyName, setColonyName] = useState("Colony");
  const [launching, setLaunching] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  const getQty = (key: string) => shipQty[key] ?? 0;

  const setQty = (key: string, v: number) =>
    setShipQty(prev => ({
      ...prev,
      [key]: Math.max(0, Math.min((fleet as any)[key] ?? 0, v)),
    }));

  const totalSent = Object.values(shipQty).reduce((a, b) => a + b, 0);
  const cargoCap =
    getQty("smallCargo") * 5000 +
    getQty("largeCargo") * 25000 +
    getQty("recycler") * 20000 +
    getQty("cruiser") * 800 +
    getQty("battleship") * 1500;

  const cargoUsed = cargoM + cargoC + cargoD;

  const handleSubmit = async () => {
    try {
      setLocalErr(null);

      if (totalSent <= 0) {
        throw new Error("Select at least one ship.");
      }

      if (cargoUsed > cargoCap) {
        throw new Error("Cargo exceeds fleet capacity.");
      }

      if (fleet.activeMissions >= 4) {
        throw new Error("No mission slots available.");
      }

      if (missionType === 5 && getQty("colonyShip") <= 0) {
        throw new Error("Colonize requires at least 1 colony ship.");
      }

      let target: LaunchTargetInput;

      if (missionType === 2) {
        if (transportMode === "owned") {
          if (!targetEntity) throw new Error("Select a destination planet.");
          target = {
            kind: "transport",
            mode: "owned",
            destinationEntity: targetEntity,
          };
        } else {
          target = {
            kind: "transport",
            mode: "coords",
            galaxy: targetGalaxy,
            system: targetSystem,
            position: targetPosition,
          };
        }
      } else {
        target = {
          kind: "colonize",
          galaxy: targetGalaxy,
          system: targetSystem,
          position: targetPosition,
          colonyName: colonyName.trim() || "Colony",
        };
      }

      setLaunching(true);

      await onLaunch(
        shipQty,
        {
          metal: BigInt(cargoM),
          crystal: BigInt(cargoC),
          deuterium: BigInt(cargoD),
        },
        missionType,
        speed,
        target
      );

      onClose();
    } catch (e: any) {
      setLocalErr(e?.message || String(e));
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-title">⊹ LAUNCH FLEET</div>

        <div className="modal-section">
          <div className="modal-label">Mission Type</div>
          <select
            className="modal-select"
            value={missionType}
            onChange={e => setMissionType(Number(e.target.value))}
          >
            <option value={2}>TRANSPORT</option>
            <option value={5}>COLONIZE</option>
          </select>
        </div>

        {missionType === 2 && (
          <div className="modal-section">
            <div className="modal-label">Target</div>

            <div className="modal-row">
              <span style={{ fontSize: 11, color: "var(--dim)" }}>Mode</span>
              <select
                className="modal-select"
                value={transportMode}
                onChange={e => setTransportMode(e.target.value as "owned" | "coords")}
              >
                <option value="owned">My planets</option>
                <option value="coords">Coordinates</option>
              </select>
            </div>

            {transportMode === "owned" ? (
              <div className="modal-row">
                <span style={{ fontSize: 11, color: "var(--dim)" }}>Destination</span>
                <select
                  className="modal-select"
                  value={targetEntity}
                  onChange={e => setTargetEntity(e.target.value)}
                  disabled={selectableOwned.length === 0}
                >
                  {selectableOwned.length === 0 ? (
                    <option value="">No other planets</option>
                  ) : (
                    selectableOwned.map(p => (
                      <option key={p.entityPda} value={p.entityPda}>
                        {p.planet.name} [{p.planet.galaxy}:{p.planet.system}:{p.planet.position}]
                      </option>
                    ))
                  )}
                </select>
              </div>
            ) : (
              <>
                <div className="modal-row">
                  <span style={{ fontSize: 11, color: "var(--dim)" }}>Galaxy</span>
                  <input
                    className="modal-input"
                    type="number"
                    min={1}
                    max={9}
                    value={targetGalaxy}
                    onChange={e => setTargetGalaxy(Math.max(1, Math.min(9, parseInt(e.target.value) || 1)))}
                  />
                </div>
                <div className="modal-row">
                  <span style={{ fontSize: 11, color: "var(--dim)" }}>System</span>
                  <input
                    className="modal-input"
                    type="number"
                    min={1}
                    max={499}
                    value={targetSystem}
                    onChange={e => setTargetSystem(Math.max(1, Math.min(499, parseInt(e.target.value) || 1)))}
                  />
                </div>
                <div className="modal-row">
                  <span style={{ fontSize: 11, color: "var(--dim)" }}>Position</span>
                  <input
                    className="modal-input"
                    type="number"
                    min={1}
                    max={15}
                    value={targetPosition}
                    onChange={e => setTargetPosition(Math.max(1, Math.min(15, parseInt(e.target.value) || 1)))}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {missionType === 5 && (
          <div className="modal-section">
            <div className="modal-label">Colony Target</div>

            <div className="modal-row">
              <span style={{ fontSize: 11, color: "var(--dim)" }}>Galaxy</span>
              <input
                className="modal-input"
                type="number"
                min={1}
                max={9}
                value={targetGalaxy}
                onChange={e => setTargetGalaxy(Math.max(1, Math.min(9, parseInt(e.target.value) || 1)))}
              />
            </div>

            <div className="modal-row">
              <span style={{ fontSize: 11, color: "var(--dim)" }}>System</span>
              <input
                className="modal-input"
                type="number"
                min={1}
                max={499}
                value={targetSystem}
                onChange={e => setTargetSystem(Math.max(1, Math.min(499, parseInt(e.target.value) || 1)))}
              />
            </div>

            <div className="modal-row">
              <span style={{ fontSize: 11, color: "var(--dim)" }}>Position</span>
              <input
                className="modal-input"
                type="number"
                min={1}
                max={15}
                value={targetPosition}
                onChange={e => setTargetPosition(Math.max(1, Math.min(15, parseInt(e.target.value) || 1)))}
              />
            </div>

            <div className="modal-row">
              <span style={{ fontSize: 11, color: "var(--dim)" }}>Colony Name</span>
              <input
                className="modal-input"
                type="text"
                maxLength={32}
                value={colonyName}
                onChange={e => setColonyName(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="modal-section">
          <div className="modal-label">
            Ships <span style={{ color: "var(--cyan)" }}>{totalSent > 0 ? `${totalSent} selected` : "none"}</span>
          </div>

          <div className="modal-ship-grid">
            {SHIPS.map(ship => {
              const avail = ((fleet as any)[ship.key] as number) ?? 0;
              if (avail === 0) return null;

              return (
                <div key={ship.key} className="modal-ship-row">
                  <div>
                    <div className="modal-ship-label">{ship.icon} {ship.name}</div>
                    <div className="modal-ship-avail">Avail: {avail.toLocaleString()}</div>
                  </div>
                  <input
                    className="modal-input"
                    type="number"
                    min={0}
                    max={avail}
                    value={getQty(ship.key) || ""}
                    placeholder="0"
                    onChange={e => setQty(ship.key, parseInt(e.target.value) || 0)}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {cargoCap > 0 && (
          <div className="modal-section">
            <div className="modal-label">
              Cargo{" "}
              <span style={{ color: cargoUsed > cargoCap ? "var(--danger)" : "var(--dim)" }}>
                {cargoUsed.toLocaleString()} / {cargoCap.toLocaleString()}
              </span>
            </div>

            {[
              { label: "Metal", color: "var(--metal)", val: cargoM, max: Number(res.metal), set: setCargoM },
              { label: "Crystal", color: "var(--crystal)", val: cargoC, max: Number(res.crystal), set: setCargoC },
              { label: "Deuterium", color: "var(--deut)", val: cargoD, max: Number(res.deuterium), set: setCargoD },
            ].map(r => (
              <div key={r.label} className="modal-row">
                <span style={{ color: r.color, fontSize: 11 }}>{r.label} (avail: {fmt(r.max)})</span>
                <input
                  className="modal-input"
                  type="number"
                  min={0}
                  max={r.max}
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
            <span style={{ fontSize: 11, color: "var(--dim)" }}>Speed (10–100%)</span>
            <input
              className="modal-input"
              type="number"
              min={10}
              max={100}
              step={10}
              value={speed}
              onChange={e => setSpeed(Math.max(10, Math.min(100, parseInt(e.target.value) || 100)))}
            />
          </div>
        </div>

        {localErr && <div className="error-msg" style={{ marginBottom: 8 }}>{localErr}</div>}

        <div className="modal-footer">
          <button className="modal-btn secondary" onClick={onClose} disabled={launching || txBusy}>
            CANCEL
          </button>
          <button
            className="modal-btn primary"
            onClick={handleSubmit}
            disabled={launching || txBusy || totalSent === 0 || fleet.activeMissions >= 4}
          >
            {launching ? "LAUNCHING..." : "⊹ LAUNCH"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Research Tab ─────────────────────────────────────────────────────────────
const ResearchTab: React.FC<{
  research: Research; res?: Resources; planet: Planet; txBusy: boolean;
  onResearch: (techIdx: number) => void; onFinishResearch: () => void;
}> = ({ research, res, planet, txBusy, onResearch, onFinishResearch }) => {
  const now = Math.floor(Date.now() / 1000);
  const isResearching = research.queueItem !== 255;
  const researchSecsLeft = isResearching ? Math.max(0, research.researchFinishTs - now) : 0;
  const techs = [
    { idx:0, name:"Energy Technology",              icon:"⚡", field:"energyTech",      labReq:1 },
    { idx:1, name:"Combustion Drive",               icon:"🔥", field:"combustionDrive", labReq:1 },
    { idx:2, name:"Impulse Drive",                  icon:"🚀", field:"impulseDrive",    labReq:5 },
    { idx:3, name:"Hyperspace Drive",               icon:"🌌", field:"hyperspaceDrive", labReq:7 },
    { idx:4, name:"Computer Technology",            icon:"💻", field:"computerTech",    labReq:1 },
    { idx:5, name:"Astrophysics",                   icon:"🔭", field:"astrophysics",    labReq:3 },
    { idx:6, name:"Intergalactic Research Network", icon:"📡", field:"igrNetwork",      labReq:10 },
  ] as const;
  const baseCostsArr = [[0,800,400],[400,0,600],[2000,4000,600],[10000,20000,6000],[0,400,600],[4000,2000,1000],[240000,400000,160000]];
  return (
    <div>
      <div className="section-title">🔬 RESEARCH LAB</div>
      {isResearching && (
        <div className="build-queue-banner" style={{ marginBottom:20 }}>
          <div>
            <div className="build-queue-label">CURRENT RESEARCH</div>
            <div className="build-queue-item-name">{techs.find(t => t.idx === research.queueItem)?.name || "Unknown"}</div>
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
        {techs.map(tech => {
          const level = (research as any)[tech.field] as number ?? 0;
          const costs = baseCostsArr[tech.idx];
          const cm=Math.floor(costs[0]*Math.pow(2,level)), cc=Math.floor(costs[1]*Math.pow(2,level)), cd=Math.floor(costs[2]*Math.pow(2,level));
          const canAfford = !res || (res.metal >= BigInt(cm) && res.crystal >= BigInt(cc) && res.deuterium >= BigInt(cd));
          const canResearch = planet.researchLab >= tech.labReq;
          const isThis = isResearching && research.queueItem === tech.idx;
          return (
            <div key={tech.idx} className="building-card">
              <div className="building-header">
                <div className="building-icon-name"><span className="building-icon">{tech.icon}</span><span className="building-name">{tech.name}</span></div>
                <span className="building-level">Lv {level}</span>
              </div>
              <div className="building-costs">
                {cm>0&&<div className="building-cost-row"><span>Metal</span><span>{fmt(cm)}</span></div>}
                {cc>0&&<div className="building-cost-row"><span>Crystal</span><span>{fmt(cc)}</span></div>}
                {cd>0&&<div className="building-cost-row"><span>Deuterium</span><span>{fmt(cd)}</span></div>}
              </div>
              <button className={`build-btn ${canAfford&&canResearch&&!isResearching?"can-build":isThis?"building-now":"no-funds"}`}
                disabled={txBusy||isResearching||!canAfford||!canResearch}
                onClick={() => onResearch(tech.idx)}>
                {isResearching?"QUEUE FULL":`RESEARCH → Lv ${level+1}`}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const VaultManagerModal: React.FC<{
  open: boolean;
  onClose: () => void;
  vaultReady: boolean;
  vaultAddress: string | null;
  vaultBalance: bigint;
  useVaultSigning: boolean;
  onToggleSigning: (value: boolean) => void;

  depositAmount: string;
  onDepositAmountChange: (value: string) => void;
  onDeposit: () => Promise<void>;

  withdrawAmount: string;
  onWithdrawAmountChange: (value: string) => void;
  onWithdraw: () => Promise<void>;

  busy: boolean;
}> = ({
  open,
  onClose,
  vaultReady,
  vaultAddress,
  vaultBalance,
  useVaultSigning,
  onToggleSigning,

  depositAmount,
  onDepositAmountChange,
  onDeposit,

  withdrawAmount,
  onWithdrawAmountChange,
  onWithdraw,

  busy,
}) => { 
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal" style={{ maxWidth: "560px" }}>
        <div className="modal-title">VAULT MANAGER</div>

        <div className="modal-section">
          <div className="modal-label">Signing Mode</div>
          <div className="modal-row">
            <span style={{ fontSize: 11, color: "var(--dim)" }}>Use vault for gameplay</span>
            <input
              type="checkbox"
              checked={useVaultSigning}
              onChange={e => onToggleSigning(e.target.checked)}
              disabled={busy || !vaultReady}
            />
          </div>
          <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 8 }}>
            {useVaultSigning
              ? "Gameplay signs with vault when available."
              : "Gameplay uses wallet popup signing."}
          </div>
        </div>

        <div className="modal-section">
          <div className="modal-label">Vault Status</div>
          <div className="modal-info-row">
            <span>Ready</span>
            <span className="modal-info-val">{vaultReady ? "YES" : "NO"}</span>
          </div>
          <div className="modal-info-row">
            <span>Vault address</span>
            <span className="modal-info-val">
              {vaultAddress ? `${vaultAddress.slice(0, 4)}…${vaultAddress.slice(-4)}` : "—"}
            </span>
          </div>
          <div className="modal-info-row">
            <span>Balance</span>
            <span className="modal-info-val">{Number(vaultBalance) / 1_000_000_000} SOL</span>
          </div>
        </div>

<div className="modal-section">
  <div className="modal-label">Deposit SOL</div>
  <div className="modal-row">
    <span style={{ fontSize: 11, color: "var(--dim)" }}>Amount (SOL)</span>
    <input
      className="modal-input"
      type="number"
      min="0"
      step="0.001"
      value={depositAmount}
      onChange={e => onDepositAmountChange(e.target.value)}
      disabled={busy || !vaultReady}
    />
  </div>
  <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 8 }}>
    Deposit sends SOL from connected wallet to the vault.
  </div>
</div>
        <div className="modal-section">
          <div className="modal-label">Withdraw SOL</div>
          <div className="modal-row">
            <span style={{ fontSize: 11, color: "var(--dim)" }}>Amount (SOL)</span>
            <input
              className="modal-input"
              type="number"
              min="0"
              step="0.001"
              value={withdrawAmount}
              onChange={e => onWithdrawAmountChange(e.target.value)}
              disabled={busy || !vaultReady}
            />
          </div>
          <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 8 }}>
            Withdraw sends SOL from vault to connected wallet.
          </div>
        </div>

      <div className="modal-footer">
  <button className="modal-btn secondary" onClick={onClose} disabled={busy}>
    CLOSE
  </button>
  <button
    className="modal-btn primary"
    onClick={() => void onDeposit()}
    disabled={busy || !vaultReady}
  >
    DEPOSIT
  </button>
  <button
    className="modal-btn primary"
    onClick={() => void onWithdraw()}
    disabled={busy || !vaultReady}
  >
    WITHDRAW
  </button>
</div>
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
  const [createProgress, setCreateProgress] = useState("");
  const [txBusy, setTxBusy] = useState(false);
  const [txProgress, setTxProgress] = useState("Processing...");
  const [confirmation, setConfirmation] = useState<ConfirmationState>(null);
  const [planetName, setPlanetName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [nowTs, setNowTs] = useState(Math.floor(Date.now() / 1000));
  const [showLaunchModal, setShowLaunchModal] = useState(false);
  const [vaultPrompt, setVaultPrompt] = useState<VaultRecoveryPromptRequest | null>(null);
  const [vaultPromptError, setVaultPromptError] = useState<string | null>(null);
  const [vaultPromptBusy, setVaultPromptBusy] = useState(false);
const [showVaultModal, setShowVaultModal] = useState(false);
const [useVaultSigning, setUseVaultSigning] = useState(true);
const [vaultBalance, setVaultBalance] = useState<bigint>(0n);
const [vaultActionBusy, setVaultActionBusy] = useState(false);
const [withdrawAmount, setWithdrawAmount] = useState("");
const [depositAmount, setDepositAmount] = useState("");

  const clientRef = useRef<GameClient | null>(null);
  const selectedPdaRef = useRef<string | null>(null);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const vaultPromptResolverRef = useRef<{ resolve: (v: string) => void; reject: (r?: unknown) => void } | null>(null);

  const state = planets.find(p => p.planetPda === selectedPlanetPda) ?? planets[0] ?? null;

  useEffect(() => { const id = setInterval(() => setNowTs(Math.floor(Date.now() / 1000)), 1000); return () => clearInterval(id); }, []);
  useEffect(() => { selectedPdaRef.current = selectedPlanetPda; }, [selectedPlanetPda]);

 const handleDepositVault = async () => {
  if (!clientRef.current) return;

  const amountSol = Number(depositAmount);
  if (!Number.isFinite(amountSol) || amountSol <= 0) {
    setError("Invalid deposit amount");
    return;
  }

  setVaultActionBusy(true);
  setError(null);

  try {
    const lamports = Math.floor(amountSol * 1_000_000_000);
    await clientRef.current.depositToVaultLamports(lamports);

    const vaultPk = clientRef.current.getVaultPublicKey();
    if (vaultPk) {
      const nextBalance = await connection.getBalance(vaultPk, "confirmed");
      setVaultBalance(BigInt(nextBalance));
    }

    setDepositAmount("");
    await refresh();
  } catch (e: any) {
    setError(e?.message ?? "Vault deposit failed");
  } finally {
    setVaultActionBusy(false);
  }
};


  const handleWithdrawVault = async () => {
  if (!clientRef.current) return;

  const amountSol = Number(withdrawAmount);
  if (!Number.isFinite(amountSol) || amountSol <= 0) {
    setError("Invalid withdraw amount");
    return;
  }

  setVaultActionBusy(true);
  setError(null);
  try {
    const lamports = Math.floor(amountSol * 1_000_000_000);
    await clientRef.current.withdrawVaultLamports(lamports);

    const vaultPk = clientRef.current.getVaultPublicKey();
    if (vaultPk) {
      const nextBalance = await connection.getBalance(vaultPk, "confirmed");
      setVaultBalance(BigInt(nextBalance));
    }

    setWithdrawAmount("");
    await refresh();
  } catch (e: any) {
    setError(e?.message ?? "Vault withdraw failed");
  } finally {
    setVaultActionBusy(false);
  }
};

  const requestVaultRecoveryPassphrase = useCallback((request: VaultRecoveryPromptRequest): Promise<string> => {
    setVaultPromptBusy(false);
    setVaultPromptError(null);
    setVaultPrompt({ mode: request.mode, wallet: request.wallet });
    return new Promise((resolve, reject) => { vaultPromptResolverRef.current = { resolve, reject }; });
  }, []);

  const handleVaultPromptCancel = useCallback(() => {
    if (vaultPromptBusy) return;
    vaultPromptResolverRef.current?.reject(new Error("User cancelled vault password entry"));
    vaultPromptResolverRef.current = null;
    setVaultPrompt(null);
    setVaultPromptError(null);
    setVaultPromptBusy(false);
    clientRef.current?.clearCachedVaultRecoveryPassphrase();
  }, [vaultPromptBusy]);

  const handleVaultPromptSubmit = useCallback((password: string) => {
    if (vaultPrompt?.mode === "create" && password.length < 8) {
      setVaultPromptError("Recovery password must be at least 8 characters.");
      return;
    }
    setVaultPromptBusy(true);
    vaultPromptResolverRef.current?.resolve(password);
    vaultPromptResolverRef.current = null;
    setVaultPrompt(null);
    setVaultPromptError(null);
    setVaultPromptBusy(false);
  }, [vaultPrompt]);





  const loadAllPlanets = useCallback(async (wallet: PublicKey, preferPda?: string | null) => {
    if (!clientRef.current) return [];
    const loaded = await clientRef.current.findPlanets(wallet);
    setPlanets(loaded);
    if (loaded.length === 0) { setSelectedPlanetPda(null); return loaded; }
    const next = loaded.find(p => p.planetPda === preferPda) ?? loaded.find(p => p.planetPda === selectedPdaRef.current) ?? loaded[0];
    setSelectedPlanetPda(next.planetPda);
    return loaded;
  }, []);

  useEffect(() => {
    if (!connected || !anchorWallet || !publicKey) {
      clientRef.current = null; setPlanets([]); setSelectedPlanetPda(null); setLoading(false); return;
    }
    const provider = new AnchorProvider(connection, anchorWallet, { commitment: "confirmed" });
    clientRef.current = new GameClient(connection, provider, { requestVaultRecoveryPassphrase });
    clientRef.current.setPreferVaultSigning(useVaultSigning);
    setLoading(true); setError(null);
    loadAllPlanets(publicKey).catch(e => setError(e?.message ?? "Failed to load.")).finally(() => setLoading(false));
  }, [connected, anchorWallet, publicKey, connection, loadAllPlanets, requestVaultRecoveryPassphrase]);




  const refresh = useCallback(async () => {
    if (!publicKey || !clientRef.current) return;
    if (refreshPromiseRef.current) return refreshPromiseRef.current;
    const p = loadAllPlanets(publicKey).then(() => { refreshPromiseRef.current = null; }).catch(() => { refreshPromiseRef.current = null; });
    refreshPromiseRef.current = p;
    return p;
  }, [publicKey, loadAllPlanets]);

  useEffect(() => { const id = setInterval(refresh, 6000); return () => clearInterval(id); }, [refresh]);

  const withTx = async (label: string, fn: () => Promise<string | void>) => {
    if (txBusy || !clientRef.current) return;
    setTxBusy(true); setTxProgress(label); setError(null);
    try { await fn(); await refresh(); setTimeout(() => void refresh().catch(() => {}), 1500); }
    catch (e: any) { setError(e?.message ?? `${label} failed`); }
    finally { setTxBusy(false); setTxProgress("Processing..."); }
  };

  useEffect(() => {
  const loadVaultBalance = async () => {
    if (!showVaultModal || !clientRef.current) return;

    const vaultPk = clientRef.current.getVaultPublicKey();
    if (!vaultPk) {
      setVaultBalance(0n);
      return;
    }

    const lamports = await connection.getBalance(vaultPk, "confirmed");
    setVaultBalance(BigInt(lamports));
  };

  void loadVaultBalance();
}, [showVaultModal, connection]);


  const createPlanet = async () => {
    if (!clientRef.current) return;
    setError(null); setCreating(true); setCreateProgress("Preparing vault...");
    try {
      const newState = await clientRef.current.initializePlanet(planetName.trim() || "Homeworld", setCreateProgress);
      if (publicKey) {
        const loaded = await loadAllPlanets(publicKey);
        const newest = [...loaded].sort((a,b) => b.planet.planetIndex - a.planet.planetIndex)[0];
        if (newest) setSelectedPlanetPda(newest.planetPda);
      }
    } catch (e: any) { setError(e?.message ?? "Failed to create planet"); }
    finally { setCreating(false); setCreateProgress(""); }
  };

  const handleLaunch = async (
  ships: Record<string, number>,
  cargo: { metal: bigint; crystal: bigint; deuterium: bigint },
  missionType: number,
  speedFactor: number,
  target: LaunchTargetInput,
) => {
  if (!clientRef.current || !state) return;

  let launchTarget: { galaxy: number; system: number; position: number; colonyName?: string };

  if (target.kind === "transport") {
    if (target.mode === "owned") {
      const dest = planets.find(p => p.entityPda === target.destinationEntity);
      if (!dest) throw new Error("Destination planet not found.");
      launchTarget = {
        galaxy: dest.planet.galaxy,
        system: dest.planet.system,
        position: dest.planet.position,
      };
    } else {
      const sysPlanets = await clientRef.current.getSystemPlanets(target.galaxy, target.system);
      if (!sysPlanets.find(p => p.position === target.position)) {
        throw new Error(`No planet at ${target.galaxy}:${target.system}:${target.position}.`);
      }
      launchTarget = {
        galaxy: target.galaxy,
        system: target.system,
        position: target.position,
      };
    }
  } else {
    const sysPlanets = await clientRef.current.getSystemPlanets(target.galaxy, target.system);
    if (sysPlanets.find(p => p.position === target.position)) {
      throw new Error(`Slot ${target.galaxy}:${target.system}:${target.position} is occupied.`);
    }
    launchTarget = {
      galaxy: target.galaxy,
      system: target.system,
      position: target.position,
      colonyName: target.colonyName,
    };
  }

  await withTx("Launch fleet", () =>
    clientRef.current!.launchFleet(
      new PublicKey(state.entityPda),
      {
        lf: ships.lightFighter,
        hf: ships.heavyFighter,
        cr: ships.cruiser,
        bs: ships.battleship,
        bc: ships.battlecruiser,
        bm: ships.bomber,
        ds: ships.destroyer,
        de: ships.deathstar,
        sc: ships.smallCargo,
        lc: ships.largeCargo,
        rec: ships.recycler,
        ep: ships.espionageProbe,
        col: ships.colonyShip,
      },
      cargo,
      missionType,
      speedFactor,
      launchTarget,
    )
  );
};

  

  const executeResolveColonize = async (mission: Mission, slotIdx: number) => {
    if (!clientRef.current || !state) return;
    setConfirmation(null); setTxBusy(true); setTxProgress("Vault signing: resolving colonize"); setError(null);
    try {
      const { entityPda } = await clientRef.current.resolveColonize(new PublicKey(state.entityPda), mission, slotIdx, Math.floor(Date.now()/1000), setTxProgress);
      if (publicKey) {
        const loaded = await loadAllPlanets(publicKey);
        const colony = loaded.find(p => p.planetPda === entityPda.toBase58());
        if (colony) setSelectedPlanetPda(colony.planetPda);
      }
    } catch (e: any) { setError(e?.message ?? "Resolve colonize failed"); }
    finally { setTxBusy(false); setTxProgress("Processing..."); }
  };

  const liveRes = useInterpolatedResources(state?.resources, nowTs);
  const activeMissionCount = state?.fleet.missions.filter(m => m.missionType !== 0).length ?? 0;
  const vaultReady = clientRef.current?.isVaultReady() ?? false;

  return (
    <>
      <style>{CSS}</style>
      <Starfield />
      <LoadingOverlay visible={(txBusy || creating) && !vaultPrompt} message={creating ? createProgress : txProgress} />

      {!connected && (
        <div className="landing">
          <div className="landing-logo"><LogoSVG size={120} /></div>
          <div>
            <div className="landing-title">GAMESOL</div>
            <div className="landing-sub">On-chain space strategy · Solana</div>
          </div>
          <WalletMultiButton />
        </div>
      )}

      {connected && loading && (
        <div style={{ height:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:24 }}>
          <LogoSVG size={72} />
          <div className="spinner" style={{ width:"56px", height:"56px", borderWidth:"5px" }} />
          <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:"15px", letterSpacing:"3px", color:"var(--cyan)" }}>CONNECTING...</div>
        </div>
      )}

      {connected && !loading && (
        <div className="app">
          <header className="header">
            <div className="logo-area"><LogoSVG size={28} /><span className="game-title">GAMESOL</span></div>
            <div className="header-right">
              <span className="chain-tag">DEVNET</span>
<button
  className="vault-tag"
  onClick={() => setShowVaultModal(true)}
  type="button"
>
  ⚿ VAULT
</button>              {publicKey && <span className="chain-tag">{publicKey.toBase58().slice(0,4)}…{publicKey.toBase58().slice(-4)}</span>}
              <WalletMultiButton />
            </div>
          </header>

          <aside className="sidebar">
            {state ? (
              <>
                {liveRes && (
                  <div className="res-panel">
                    <div className="res-label">Resources</div>
                    <ResRow color="var(--metal)" label="Metal" value={liveRes.metal} cap={liveRes.metalCap} rate={liveRes.metalHour} />
                    <ResRow color="var(--crystal)" label="Crystal" value={liveRes.crystal} cap={liveRes.crystalCap} rate={liveRes.crystalHour} />
                    <ResRow color="var(--deut)" label="Deuterium" value={liveRes.deuterium} cap={liveRes.deuteriumCap} rate={liveRes.deuteriumHour} />
                    <div className="energy-row">
                      <span style={{ color:"var(--dim)", fontSize:10, letterSpacing:1 }}>⚡ ENERGY</span>
                      <span style={{ fontSize:11, fontWeight:600, color: energyEfficiency(liveRes)>=100?"var(--success)":energyEfficiency(liveRes)>=60?"var(--warn)":"var(--danger)" }}>
                        {fmt(liveRes.energyProduction)}/{fmt(liveRes.energyConsumption)} ({energyEfficiency(liveRes)}%)
                      </span>
                    </div>
                  </div>
                )}
                <nav className="nav">
                  {(["overview","resources","buildings","research","shipyard","fleet","missions","galaxy"] as Tab[]).map(t => (
                    <div key={t} className={`nav-item${tab===t?" active":""}`} onClick={() => setTab(t)}>
                      {t==="overview"?"◈":t==="resources"?"⛏":t==="buildings"?"⬡":t==="research"?"🔬":t==="shipyard"?"🚀":t==="fleet"?"◉":t==="missions"?"⊹":"🌌"} {t.charAt(0).toUpperCase()+t.slice(1)}
                      {t==="missions" && activeMissionCount > 0 && <span className="nav-badge">{activeMissionCount}</span>}
                    </div>
                  ))}
                  {planets.length > 1 && (
                    <>
                      <div style={{ padding:"12px 16px 4px", fontSize:"9px", letterSpacing:"2px", color:"var(--dim)", textTransform:"uppercase" }}>Planets</div>
                      {planets.map(p => (
                        <div key={p.planetPda} className={`nav-item${p.planetPda===state.planetPda?" active":""}`} onClick={() => setSelectedPlanetPda(p.planetPda)} style={{ paddingLeft:24 }}>
                          🪐 {p.planet.name || `Planet ${p.planet.planetIndex+1}`}
                        </div>
                      ))}
                    </>
                  )}
                </nav>
              </>
            ) : (
              <div style={{ padding:20, color:"var(--dim)", fontSize:11, letterSpacing:1 }}>
                <div style={{ animation:"pulse 2s ease-in-out infinite" }}>No planet found.</div>
              </div>
            )}
          </aside>

          <main className="main">
            {error && <div style={{ color:"var(--danger)", fontSize:11, letterSpacing:1, marginBottom:16 }}>{error}</div>}
            {!state ? (
              <NoPlanetView planetName={planetName} onNameChange={setPlanetName} onCreate={createPlanet} creating={creating} error={error} />
            ) : tab === "overview" ? (
              <OverviewTab state={state} res={liveRes} nowTs={nowTs} planets={planets}
                onSelectPlanet={setSelectedPlanetPda}
                onFinishBuild={() => withTx("Finish build", () => clientRef.current!.finishBuild(new PublicKey(state.entityPda)))}
                txBusy={txBusy} />
            ) : tab === "resources" ? (
              <ResourcesTab state={state} res={liveRes} nowTs={nowTs}
                onStartBuild={(idx) => withTx("Start build", () => clientRef.current!.startBuild(new PublicKey(state.entityPda), idx))}
                onFinishBuild={() => withTx("Finish build", () => clientRef.current!.finishBuild(new PublicKey(state.entityPda)))}
                txBusy={txBusy} />
            ) : tab === "buildings" ? (
              <BuildingsTab state={state} res={liveRes} nowTs={nowTs}
                onStartBuild={(idx) => withTx("Start build", () => clientRef.current!.startBuild(new PublicKey(state.entityPda), idx))}
                onFinishBuild={() => withTx("Finish build", () => clientRef.current!.finishBuild(new PublicKey(state.entityPda)))}
                txBusy={txBusy} />
            ) : tab === "shipyard" ? (
              <ShipyardTab state={state} res={liveRes} txBusy={txBusy}
                onBuildShip={(shipType, qty) => withTx("Build ship", () => clientRef.current!.buildShip(new PublicKey(state.entityPda), shipType, qty))} />
            ) : tab === "fleet" ? (
              <FleetTab fleet={state.fleet} res={liveRes} txBusy={txBusy} onOpenLaunch={() => setShowLaunchModal(true)} />
            ) : tab === "missions" ? (
              <MissionsTab fleet={state.fleet} nowTs={nowTs} txBusy={txBusy}
                onResolveTransport={(mission, slotIdx) => withTx("Resolve transport", () => clientRef.current!.resolveTransport(new PublicKey(state.entityPda), mission, slotIdx))}
                onResolveColonize={(mission, slotIdx) => setConfirmation({ kind:"resolveColonize", mission, slotIdx })} />
            ) : tab === "research" ? (
              <ResearchTab research={state.research} res={liveRes} planet={state.planet} txBusy={txBusy}
                onResearch={(idx) => withTx("Start research", () => clientRef.current!.startResearch(new PublicKey(state.entityPda), idx))}
                onFinishResearch={() => withTx("Finish research", () => clientRef.current!.finishResearch(new PublicKey(state.entityPda)))} />
            ) : tab === "galaxy" ? (
              <GalaxyTab client={clientRef.current} currentPlanet={state.planet} txBusy={txBusy} />
            ) : null}
          </main>
        </div>
      )}

      {showLaunchModal && state && liveRes && (
        <LaunchModal fleet={state.fleet} res={liveRes} ownedPlanets={planets} currentPlanetPda={state.planetPda}
          onClose={() => setShowLaunchModal(false)} onLaunch={handleLaunch} txBusy={txBusy} />
      )}

      <ConfirmationModal
        isOpen={confirmation !== null}
        onClose={() => setConfirmation(null)}
        onConfirm={() => { if (confirmation?.kind === "resolveColonize") void executeResolveColonize(confirmation.mission, confirmation.slotIdx); }}
        title="RESOLVE COLONIZE"
        lines={["The vault will sign all steps — no wallet popup needed.", "- Create colony account (vault pays rent)", "- Resolve colonize mission (vault signs)"]}
        confirmLabel="RESOLVE COLONY"
        disabled={txBusy}
      />

<VaultManagerModal
  open={showVaultModal}
  onClose={() => setShowVaultModal(false)}
  vaultReady={vaultReady}
  vaultAddress={clientRef.current?.getVaultPublicKey()?.toBase58() ?? null}
  vaultBalance={vaultBalance}
  useVaultSigning={useVaultSigning}
  onToggleSigning={setUseVaultSigning}
  depositAmount={depositAmount}
  onDepositAmountChange={setDepositAmount}
  onDeposit={handleDepositVault}
  withdrawAmount={withdrawAmount}
  onWithdrawAmountChange={setWithdrawAmount}
  onWithdraw={handleWithdrawVault}
  busy={vaultActionBusy}
/>

      <VaultRecoveryModal
        request={vaultPrompt} busy={vaultPromptBusy} error={vaultPromptError}
        onCancel={handleVaultPromptCancel} onSubmit={handleVaultPromptSubmit}
      />
    </>
  );
};

// ─── Sub-views ────────────────────────────────────────────────────────────────
const NoPlanetView: React.FC<{ planetName:string; onNameChange:(v:string)=>void; onCreate:()=>void; creating:boolean; error:string|null }> = ({ planetName, onNameChange, onCreate, creating, error }) => (
  <div className="no-planet">
    <LogoSVG size={64} />
    <div className="no-planet-title">NO PLANET FOUND</div>
    <div className="no-planet-sub">
      This wallet has no initialized planet on-chain.<br />
      Create your homeworld to begin.<br /><br />
      <span style={{ color:"var(--success)", fontSize:10 }}>⚿ After initial setup, the vault keypair signs all gameplay — no wallet popups needed.</span>
    </div>
    <input className="planet-name-input" type="text" placeholder="Planet name (optional)" value={planetName} onChange={e => onNameChange(e.target.value)} maxLength={19} />
    <button className="create-btn" onClick={onCreate} disabled={creating}>
      {creating ? "INITIALIZING..." : "⊹ INITIALIZE HOMEWORLD"}
    </button>
    {error && <div className="error-msg">{error}</div>}
    <div style={{ fontSize:10, color:"var(--dim)", letterSpacing:1, marginTop:12 }}>
      Requires 1 wallet signature · Vault handles everything else
    </div>
  </div>
);

const OverviewTab: React.FC<{ state:PlayerState; planets:PlayerState[]; res?:Resources; nowTs:number; onSelectPlanet:(pda:string)=>void; onFinishBuild:()=>void; txBusy:boolean }> =
  ({ state, planets, res, nowTs, onSelectPlanet, onFinishBuild, txBusy }) => {
    const { planet, fleet } = state;
    const buildInProgress = planet.buildFinishTs > 0 && planet.buildQueueItem !== 255;
    const buildSecsLeft = Math.max(0, planet.buildFinishTs - nowTs);
    const buildBuilding = BUILDINGS.find(b => b.idx === planet.buildQueueItem);
    return (
      <div>
        <div style={{ display:"grid", gridTemplateColumns:planets.length>1?"220px minmax(0,1fr)":"220px", gap:24, alignItems:"start", marginBottom:28 }}>
          <div>
            <div style={{ width:"172px", height:"172px", borderRadius:"6px", overflow:"hidden", marginBottom:"16px", border:"1px solid var(--border)" }}>
              <OrbitingPlanetVisual planet={planet} size={175} />
            </div>
            <div className="card" style={{ width:"172px", padding:"14px 12px" }}>
              <div className="planet-coords">[{planet.galaxy}:{planet.system}:{planet.position}]</div>
              <div className="planet-name">{planet.name || "Unknown"}</div>
              <div className="planet-meta">{planet.diameter.toLocaleString()} km · {planet.temperature}°C</div>
              <div className="fields-bar"><div className="fields-fill" style={{ width:`${(planet.usedFields/planet.maxFields)*100}%` }} /></div>
              <div className="fields-label"><span>FIELDS</span><span>{planet.usedFields}/{planet.maxFields}</span></div>
            </div>
          </div>
          {planets.length > 1 && (
            <div className="card">
              <div className="section-title" style={{ marginBottom:16 }}>PLANET SELECTION</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:12 }}>
                {planets.map(p => (
                  <button key={p.planetPda} onClick={() => onSelectPlanet(p.planetPda)} disabled={txBusy}
                    style={{ textAlign:"left", padding:"14px", border:`1px solid ${p.planetPda===state.planetPda?"var(--cyan)":"var(--border)"}`,
                      background:p.planetPda===state.planetPda?"rgba(0,245,212,0.08)":"transparent",
                      color:p.planetPda===state.planetPda?"var(--cyan)":"var(--text)", cursor:"pointer", borderRadius:4 }}>
                    <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:13 }}>{p.planet.name || `Planet ${p.planet.planetIndex+1}`}</div>
                    <div style={{ fontSize:10, color:"var(--dim)", marginTop:6 }}>[{p.planet.galaxy}:{p.planet.system}:{p.planet.position}]</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="section-title">COMMAND OVERVIEW</div>
        {buildInProgress && buildBuilding && (
          <div className="build-queue-banner">
            <div>
              <div className="build-queue-label">⚙ Building</div>
              <div className="build-queue-item-name">{buildBuilding.icon} {buildBuilding.name} → Lv {planet.buildQueueTarget}</div>
            </div>
            <div className="build-queue-right">
              {buildSecsLeft === 0
                ? <button onClick={onFinishBuild} disabled={txBusy} style={{ fontFamily:"'Orbitron',sans-serif", fontSize:11, padding:"8px 16px", border:"1px solid var(--success)", background:"rgba(6,214,160,0.1)", color:"var(--success)", cursor:"pointer", borderRadius:2, letterSpacing:1 }}>COLLECT</button>
                : <><div className="build-queue-eta">{fmtCountdown(buildSecsLeft)}</div><div style={{ fontSize:9, color:"var(--dim)", marginTop:2, letterSpacing:1 }}>REMAINING</div></>
              }
            </div>
          </div>
        )}
        <div className="grid-4" style={{ marginBottom:28 }}>
          <div className="card"><div className="card-label">Metal / hr</div><div className="card-value" style={{ color:"var(--metal)" }}>{res?fmt(res.metalHour):"—"}</div></div>
          <div className="card"><div className="card-label">Crystal / hr</div><div className="card-value" style={{ color:"var(--crystal)" }}>{res?fmt(res.crystalHour):"—"}</div></div>
          <div className="card"><div className="card-label">Deuterium / hr</div><div className="card-value" style={{ color:"var(--deut)" }}>{res?fmt(res.deuteriumHour):"—"}</div></div>
          <div className="card"><div className="card-label">Energy</div><div className="card-value" style={{ fontSize:14 }}>{res?`${fmt(res.energyProduction)}/${fmt(res.energyConsumption)}`:"—"}</div></div>
        </div>
        <div className="grid-2">
          <div>
            <div className="section-title">PLANET INFO</div>
            <div className="card">
              {[["Name",planet.name||"Unknown"],["Diameter",`${planet.diameter.toLocaleString()} km`],["Temperature",`${planet.temperature}°C`],["Fields",`${planet.usedFields} / ${planet.maxFields}`],["Coordinates",`${planet.galaxy}:${planet.system}:${planet.position}`]].map(([k,v]) => (
                <div key={String(k)} className="stat-row"><span className="stat-key">{k}</span><span className="stat-val">{v}</span></div>
              ))}
            </div>
          </div>
          <div>
            <div className="section-title">KEY BUILDINGS</div>
            <div className="card">
              {BUILDINGS.slice(0,8).map(b => (
                <div key={b.idx} className="stat-row">
                  <span className="stat-key">{b.icon} {b.name}</span>
                  <span className="stat-val" style={{ color:"var(--purple)", fontFamily:"'Orbitron',sans-serif" }}>Lv {(planet as any)[b.key]??0}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

const ResourcesTab: React.FC<{ state:PlayerState; res?:Resources; nowTs:number; onStartBuild:(idx:number)=>void; onFinishBuild:()=>void; txBusy:boolean }> =
  ({ state, res, nowTs, onStartBuild, onFinishBuild, txBusy }) => {
    const { planet } = state;
    const buildInProgress = planet.buildFinishTs > 0 && planet.buildQueueItem !== 255;
    const buildSecsLeft = Math.max(0, planet.buildFinishTs - nowTs);
    return (
      <div>
        <div className="section-title">RESOURCE PRODUCTION</div>
        {buildInProgress && (
          <div className="build-queue-banner" style={{ marginBottom:20 }}>
            <div><div className="build-queue-label">⚙ Constructing</div><div className="build-queue-item-name">{BUILDINGS.find(b=>b.idx===planet.buildQueueItem)?.name} → Lv {planet.buildQueueTarget}</div></div>
            <div className="build-queue-right"><div className="build-queue-eta">{fmtCountdown(buildSecsLeft)}</div>{buildSecsLeft===0&&<button className="build-btn finish-btn" disabled={txBusy} onClick={onFinishBuild}>FINISH BUILD</button>}</div>
          </div>
        )}
        <div className="grid-3">
          {BUILDINGS.filter(b=>[0,1,2,3,4].includes(b.idx)).map(b => {
            const level = (planet as any)[b.key]??0;
            const nextLevel = level+1;
            const [cm,cc,cd] = upgradeCost(b.idx,level);
            const secs = buildTimeSecs(b.idx, nextLevel, planet.roboticsFactory);
            const hasMetal = !res||res.metal>=BigInt(cm), hasCrystal = !res||res.crystal>=BigInt(cc), hasDeut = !res||res.deuterium>=BigInt(cd);
            const canAfford = hasMetal&&hasCrystal&&hasDeut;
            const isQueued = buildInProgress&&planet.buildQueueItem===b.idx;
            const isReady = isQueued&&buildSecsLeft===0;
            let btnClass="build-btn no-funds", btnText="INSUFFICIENT FUNDS";
            if(isReady){btnClass="build-btn finish-btn";btnText="FINISH BUILD";}
            else if(isQueued){btnClass="build-btn building-now";btnText=fmtCountdown(buildSecsLeft);}
            else if(!buildInProgress&&canAfford){btnClass="build-btn can-build";btnText=`BUILD ${fmtCountdown(secs)}`;}
            return (
              <div key={b.idx} className="building-card">
                <div className="building-header"><div className="building-icon-name"><span className="building-icon">{b.icon}</span><span className="building-name">{b.name}</span></div><span className="building-level">Lv {level}</span></div>
                <div className="building-costs">
                  {cm>0&&<div className="building-cost-row"><span>Metal</span><span className={hasMetal?"cost-ok":"cost-bad"}>{fmt(cm)}</span></div>}
                  {cc>0&&<div className="building-cost-row"><span>Crystal</span><span className={hasCrystal?"cost-ok":"cost-bad"}>{fmt(cc)}</span></div>}
                  {cd>0&&<div className="building-cost-row"><span>Deuterium</span><span className={hasDeut?"cost-ok":"cost-bad"}>{fmt(cd)}</span></div>}
                </div>
                <button className={btnClass} disabled={(isQueued&&!isReady)||txBusy} onClick={() => isReady?onFinishBuild():onStartBuild(b.idx)}>{btnText}</button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

const BuildingsTab: React.FC<{ state:PlayerState; res?:Resources; nowTs:number; onStartBuild:(idx:number)=>void; onFinishBuild:()=>void; txBusy:boolean }> =
  ({ state, res, nowTs, onStartBuild, onFinishBuild, txBusy }) => {
    const { planet } = state;
    const buildInProgress = planet.buildFinishTs > 0 && planet.buildQueueItem !== 255;
    const buildSecsLeft = Math.max(0, planet.buildFinishTs - nowTs);
    const infra = [5,6,7,8,9,10,11].map(idx => BUILDINGS[idx]);
    return (
      <div>
        <div className="section-title">INFRASTRUCTURE & STORAGE</div>
        {buildInProgress && (
          <div className="build-queue-banner" style={{ marginBottom:20 }}>
            <div><div className="build-queue-label">⚙ CONSTRUCTING</div><div className="build-queue-item-name">{BUILDINGS.find(b=>b.idx===planet.buildQueueItem)?.name} → Lv {planet.buildQueueTarget}</div></div>
            <div className="build-queue-right"><div className="build-queue-eta">{fmtCountdown(buildSecsLeft)}</div>{buildSecsLeft===0&&<button className="build-btn finish-btn" disabled={txBusy} onClick={onFinishBuild}>FINISH BUILD</button>}</div>
          </div>
        )}
        <div className="grid-3">
          {infra.map(b => {
            const level = (planet as any)[b.key]??0;
            const nextLevel = level+1;
            const [cm,cc,cd] = upgradeCost(b.idx,level);
            const secs = buildTimeSecs(b.idx, nextLevel, planet.roboticsFactory);
            const hasMetal = !res||res.metal>=BigInt(cm), hasCrystal = !res||res.crystal>=BigInt(cc), hasDeut = !res||res.deuterium>=BigInt(cd);
            const canAfford = hasMetal&&hasCrystal&&hasDeut;
            const isQueued = buildInProgress&&planet.buildQueueItem===b.idx;
            const isReady = isQueued&&buildSecsLeft===0;
            let btnClass="build-btn no-funds", btnText="INSUFFICIENT FUNDS";
            if(isReady){btnClass="build-btn finish-btn";btnText="FINISH BUILD";}
            else if(isQueued){btnClass="build-btn building-now";btnText=fmtCountdown(buildSecsLeft);}
            else if(!buildInProgress&&canAfford){btnClass="build-btn can-build";btnText=`BUILD ${fmtCountdown(secs)}`;}
            return (
              <div key={b.idx} className="building-card">
                <div className="building-header"><div className="building-icon-name"><span className="building-icon">{b.icon}</span><span className="building-name">{b.name}</span></div><span className="building-level">Lv {level}</span></div>
                <div style={{ fontSize:"10.5px", color:"var(--dim)", lineHeight:1.45, margin:"10px 0 12px" }}>{b.desc}</div>
                <div className="building-costs">
                  {cm>0&&<div className="building-cost-row"><span>Metal</span><span className={hasMetal?"cost-ok":"cost-bad"}>{fmt(cm)}</span></div>}
                  {cc>0&&<div className="building-cost-row"><span>Crystal</span><span className={hasCrystal?"cost-ok":"cost-bad"}>{fmt(cc)}</span></div>}
                  {cd>0&&<div className="building-cost-row"><span>Deuterium</span><span className={hasDeut?"cost-ok":"cost-bad"}>{fmt(cd)}</span></div>}
                </div>
                <button className={btnClass} disabled={(isQueued&&!isReady)||txBusy} onClick={() => isReady?onFinishBuild():onStartBuild(b.idx)}>{btnText}</button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

const ShipyardTab: React.FC<{ state:PlayerState; res?:Resources; txBusy:boolean; onBuildShip:(shipType:number,qty:number)=>void }> =
  ({ state, res, txBusy, onBuildShip }) => {
    const [quantities, setQuantities] = useState<Record<string,number>>({});
    const { planet, research } = state;
    if (planet.shipyard === 0) return (
      <div><div className="section-title">SHIPYARD</div>
        <div className="notice-box" style={{ textAlign:"center", padding:"40px 20px" }}>
          <div style={{ fontSize:36, marginBottom:12 }}>🚀</div>
          <div style={{ fontSize:13, color:"var(--purple)", letterSpacing:2 }}>SHIPYARD NOT BUILT</div>
          <div style={{ fontSize:11, color:"var(--dim)" }}>Build a Shipyard in the Buildings tab first.</div>
        </div>
      </div>
    );
    const canAfford = (cost: { m:number; c:number; d:number }, qty: number) =>
      !res || (res.metal>=BigInt(cost.m*qty) && res.crystal>=BigInt(cost.c*qty) && res.deuterium>=BigInt(cost.d*qty));
    const visibleShips = SHIPS.filter(s => ["smallCargo","largeCargo","colonyShip"].includes(s.key));
    return (
      <div>
        <div className="section-title">SHIPYARD</div>
        <div style={{ fontSize:10, color:"var(--dim)", letterSpacing:1, marginBottom:24 }}>Shipyard Level {planet.shipyard} · Ships built instantly</div>
        <div className="grid-3">
          {visibleShips.map(ship => {
            const typeIdx = SHIP_TYPE_IDX[ship.key] ?? -1;
            const qty = quantities[ship.key] ?? 1;
            const affordable = canAfford(ship.cost, qty);
            const current = (state.fleet as any)[ship.key] as number ?? 0;
            return (
              <div key={ship.key} className="ship-build-card">
                <div className="ship-build-header">
                  <div className="ship-build-icon-name"><span className="ship-build-icon">{ship.icon}</span><div><div className="ship-build-name">{ship.name}</div></div></div>
                  <div className={`ship-build-count${current===0?" zero":""}`}>{current.toLocaleString()}</div>
                </div>
                <div style={{ fontSize:10, color:"var(--dim)", margin:"10px 0" }}>
                  {ship.cost.m>0&&<div>Metal: {fmt(ship.cost.m*qty)}</div>}
                  {ship.cost.c>0&&<div>Crystal: {fmt(ship.cost.c*qty)}</div>}
                  {ship.cost.d>0&&<div>Deuterium: {fmt(ship.cost.d*qty)}</div>}
                </div>
                <div className="ship-qty-row">
                  <input className="qty-input" type="number" min={1} value={qty} onChange={e => setQuantities(p => ({...p,[ship.key]:Math.max(1,parseInt(e.target.value)||1)}))} />
                  <button className="ship-build-btn" disabled={!affordable||txBusy||typeIdx<0} onClick={() => onBuildShip(typeIdx, qty)}>BUILD ×{qty}</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

const FleetTab: React.FC<{ fleet:Fleet; res?:Resources; txBusy:boolean; onOpenLaunch:()=>void }> =
  ({ fleet, res, txBusy, onOpenLaunch }) => {
    const totalShips = SHIPS.reduce((s,sh) => s+((fleet as any)[sh.key]??0), 0);
    const utilityShips = SHIPS.filter(s => ["smallCargo","largeCargo","recycler","colonyShip"].includes(s.key));
    return (
      <div>
        <div className="section-title">FLEET COMMAND</div>
        <div className="grid-4" style={{ marginBottom:24 }}>
          <div className="card"><div className="card-label">Total Ships</div><div className="card-value">{totalShips.toLocaleString()}</div></div>
          <div className="card"><div className="card-label">Active Missions</div><div className="card-value">{fleet.activeMissions}</div></div>
          <div className="card"><div className="card-label">Mission Slots</div><div className="card-value">{4-fleet.activeMissions} / 4</div></div>
          <div className="card"><div className="card-label">Cargo Capacity</div><div className="card-value" style={{ fontSize:14 }}>{fmt(fleet.smallCargo*5000+fleet.largeCargo*25000+fleet.recycler*20000)}</div></div>
        </div>
        <div style={{ marginBottom:24 }}>
          <button onClick={onOpenLaunch} disabled={txBusy} style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, letterSpacing:1, padding:"10px 20px", border:"1px solid var(--cyan)", background:"rgba(0,245,212,0.1)", color:"var(--cyan)", cursor:"pointer", borderRadius:2, textTransform:"uppercase" }}>⊹ LAUNCH FLEET</button>
        </div>
        <div className="section-title">HANGAR</div>
        <div className="grid-3">
          {utilityShips.map(s => {
            const count = (fleet as any)[s.key]??0;
            return (<div key={s.key} className="ship-card"><div className="ship-icon">{s.icon}</div><div className="ship-name">{s.name}</div><div className={`ship-count${count===0?" zero":""}`}>{count.toLocaleString()}</div></div>);
          })}
        </div>
      </div>
    );
  };

const MissionsTab: React.FC<{ fleet:Fleet; nowTs:number; txBusy:boolean; onResolveTransport:(mission:Mission,slot:number)=>void; onResolveColonize:(mission:Mission,slot:number)=>void }> =
  ({ fleet, nowTs, txBusy, onResolveTransport, onResolveColonize }) => {
    const active = fleet.missions.map((m,i) => ({m,i})).filter(({m}) => m.missionType !== 0);
    if (active.length === 0) return (
      <div><div className="section-title">ACTIVE MISSIONS</div>
        <div style={{ textAlign:"center", padding:"60px 20px", color:"var(--dim)", fontSize:12, letterSpacing:1 }}>
          <div style={{ fontSize:32, marginBottom:12 }}>⊹</div><div>No missions in flight</div>
        </div>
      </div>
    );
    return (
      <div>
        <div className="section-title">ACTIVE MISSIONS</div>
        {active.map(({m,i}) => {
          const progress = missionProgress(m, nowTs);
          const returning = m.applied;
          const etaSecs = returning?Math.max(0,m.returnTs-nowTs):Math.max(0,m.arriveTs-nowTs);
          const typeLabel = MISSION_LABELS[m.missionType]??"UNKNOWN";
          const needsResolution = (m.missionType===2&&((!m.applied&&nowTs>=m.arriveTs)||(m.applied&&m.returnTs>0&&nowTs>=m.returnTs)))||(m.missionType===5&&!m.applied&&nowTs>=m.arriveTs);
          const ships = [{label:"SC",n:m.sSmallCargo},{label:"LC",n:m.sLargeCargo},{label:"LF",n:m.sLightFighter},{label:"COL",n:m.sColonyShip}].filter(s=>s.n>0);
          const hasCargo = m.cargoMetal>0n||m.cargoCrystal>0n||m.cargoDeuterium>0n;
          return (
            <div key={i} className="mission-card">
              <div className="mission-header">
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span className={`mission-type-badge ${m.missionType===2?"transport":"other"}`}>{typeLabel}</span>
                  <span className="tag">SLOT {i}</span>
                  {needsResolution&&<span style={{ fontSize:9, color:"var(--success)", letterSpacing:1, padding:"2px 6px", border:"1px solid rgba(6,214,160,0.4)", borderRadius:2, background:"rgba(6,214,160,0.08)" }}>RESOLVE READY</span>}
                </div>
                {returning&&<span className="mission-returning">↩ RETURNING</span>}
              </div>
              <div className="progress-bar"><div className={`progress-fill ${returning?"returning":"outbound"}`} style={{ width:`${progress}%` }} /></div>
              <div className="mission-info"><span>{returning?"Return ETA":"Arrive ETA"}</span><span className="mission-eta">{etaSecs<=0?"ARRIVED":fmtCountdown(etaSecs)}</span></div>
              <div className="mission-ships">{ships.map(s => <span key={s.label} className="mission-ship-badge">{s.label} ×{s.n.toLocaleString()}</span>)}</div>
              {hasCargo&&<div style={{ marginTop:10, fontSize:10, color:"var(--dim)", display:"flex", gap:16 }}>
                {m.cargoMetal>0n&&<span style={{ color:"var(--metal)" }}>⛏ {fmt(m.cargoMetal)}</span>}
                {m.cargoCrystal>0n&&<span style={{ color:"var(--crystal)" }}>💎 {fmt(m.cargoCrystal)}</span>}
                {m.cargoDeuterium>0n&&<span style={{ color:"var(--deut)" }}>🧪 {fmt(m.cargoDeuterium)}</span>}
              </div>}
              {needsResolution&&(
                <button className="apply-btn" disabled={txBusy} onClick={() => m.missionType===2?onResolveTransport(m,i):onResolveColonize(m,i)}>
                  {m.missionType===2?"RESOLVE TRANSPORT":"RESOLVE COLONIZE"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  };

export default App;