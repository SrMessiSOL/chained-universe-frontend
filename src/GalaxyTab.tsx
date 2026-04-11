import React, { useState, useEffect, useRef, useCallback } from "react";
import { GameClient, Planet, PlayerState } from "./game-state";

interface GalaxyTabProps {
  client: GameClient | null;
  currentPlanet: Planet;
  ownedPlanets: PlayerState[];
  txBusy: boolean;
  onLaunchTransport: (galaxy: number, system: number, position: number) => void;
  onLaunchColonize: (galaxy: number, system: number, position: number) => void;
}

const GalaxyTab: React.FC<GalaxyTabProps> = ({
  client, currentPlanet, ownedPlanets, txBusy, onLaunchTransport, onLaunchColonize,
}) => {
  const [galaxy, setGalaxy] = useState(currentPlanet.galaxy);
  const [system, setSystem] = useState(currentPlanet.system);
  const [planets, setPlanets] = useState<Planet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSlot, setActionSlot] = useState<number | null>(null);
  const userHasManuallyScanned = useRef(false);

  // Check if a planet is owned by the connected wallet
  const isMyPlanet = useCallback((p: Planet): boolean =>
    ownedPlanets.some(op =>
      op.planet.galaxy === p.galaxy &&
      op.planet.system === p.system &&
      op.planet.position === p.position,
    ), [ownedPlanets]);

  const loadSystem = useCallback(async (g: number, s: number, manual = false) => {
    if (!client) return;
    if (manual) userHasManuallyScanned.current = true;
    setLoading(true); setError(null); setActionSlot(null);
    try {
      const systemPlanets = await client.getSystemPlanets(g, s);
      setPlanets(systemPlanets);
      setGalaxy(g); setSystem(s);
    } catch (e: any) {
      setError(e?.message || "Failed to load system");
      setPlanets([]);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (!userHasManuallyScanned.current) {
      loadSystem(currentPlanet.galaxy, currentPlanet.system);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const SLOTS = Array.from({ length: 15 }, (_, i) => i + 1);

  return (
    <div>
      <div className="section-title">🌌 GALAXY EXPLORER</div>

      {/* Search bar */}
      <div style={{ marginBottom: 24, display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div>
          <div className="modal-label">Galaxy</div>
          <input type="number" min={1} max={9} value={galaxy}
            onChange={e => setGalaxy(Math.max(1, Math.min(9, parseInt(e.target.value) || 1)))}
            style={{ width: 90, padding: "8px 10px", fontSize: 13, background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 2 }}
          />
        </div>
        <div>
          <div className="modal-label">System</div>
          <input type="number" min={1} max={499} value={system}
            onChange={e => setSystem(Math.max(1, Math.min(499, parseInt(e.target.value) || 1)))}
            style={{ width: 110, padding: "8px 10px", fontSize: 13, background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 2 }}
          />
        </div>
        <button className="build-btn can-build" onClick={() => loadSystem(galaxy, system, true)} disabled={loading || txBusy}
          style={{ padding: "10px 24px", width: "auto" }}>
          {loading ? "SCANNING..." : "SCAN SYSTEM"}
        </button>
        <button className="build-btn" onClick={() => { userHasManuallyScanned.current = false; loadSystem(currentPlanet.galaxy, currentPlanet.system); }}
          disabled={loading || txBusy}
          style={{ padding: "10px 16px", width: "auto", border: "1px solid var(--border)", color: "var(--dim)", background: "transparent" }}>
          MY SYSTEM
        </button>
      </div>

      {error && <div className="error-msg" style={{ marginBottom: 16 }}>{error}</div>}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>
          SYSTEM [{galaxy}:{system}] — {planets.length}/{15} slots occupied
        </div>
        {loading && <div className="spinner" style={{ width: 20, height: 20, border: "2px solid var(--border)", borderTopColor: "var(--cyan)" }}/>}
      </div>

      {/* Slot list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 32 }}>
        {SLOTS.map(slot => {
          const planet = planets.find(p => p.position === slot);
          const mine = planet ? isMyPlanet(planet) : false;
          const isOpen = actionSlot === slot;
          const hasPlanet = !!planet;

          const rowBorder = isOpen
            ? (hasPlanet ? "rgba(0,245,212,0.5)" : "rgba(155,93,229,0.5)")
            : mine ? "rgba(0,245,212,0.25)" : hasPlanet ? "rgba(155,93,229,0.2)" : "var(--border)";

          return (
            <div key={slot}>
              <div
                onClick={() => setActionSlot(prev => prev === slot ? null : slot)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "9px 14px",
                  background: isOpen ? (hasPlanet ? "rgba(0,245,212,0.04)" : "rgba(155,93,229,0.04)") : "var(--panel)",
                  border: `1px solid ${rowBorder}`,
                  borderRadius: isOpen ? "4px 4px 0 0" : 4,
                  cursor: "pointer", transition: "all 0.12s",
                }}
              >
                {/* Slot badge */}
                <div style={{
                  width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: hasPlanet ? (mine ? "rgba(0,245,212,0.15)" : "rgba(155,93,229,0.12)") : "rgba(26,26,58,0.5)",
                  border: `1px solid ${hasPlanet ? (mine ? "rgba(0,245,212,0.5)" : "rgba(155,93,229,0.4)") : "var(--border)"}`,
                  fontSize: 9, fontFamily: "'Orbitron',sans-serif", fontWeight: 700,
                  color: hasPlanet ? (mine ? "var(--cyan)" : "var(--purple)") : "var(--dim)",
                }}>
                  {slot}
                </div>

                {/* Planet info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {hasPlanet ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 11, fontWeight: 700, color: mine ? "var(--cyan)" : "var(--text)" }}>
                        {planet!.name || `Planet ${slot}`}
                      </span>
                      {mine && <span style={{ fontSize: 8, padding: "1px 5px", border: "1px solid rgba(0,245,212,0.4)", borderRadius: 2, color: "var(--cyan)", letterSpacing: 1 }}>★ YOURS</span>}
                      <span style={{ fontSize: 9, color: "var(--dim)", letterSpacing: 0.5 }}>
                        {planet!.diameter.toLocaleString()} km · {planet!.temperature}°C
                      </span>
                    </div>
                  ) : (
                    <span style={{ fontSize: 10, color: "var(--dim)", letterSpacing: 0.5 }}>Empty — colonizable</span>
                  )}
                </div>

                {/* Arrow */}
                <span style={{ fontSize: 10, color: isOpen ? (hasPlanet ? "var(--cyan)" : "var(--purple)") : "var(--dim)", letterSpacing: 1 }}>
                  {isOpen ? "▲" : hasPlanet ? "▼" : "⊕"}
                </span>
              </div>

              {/* Action panel */}
              {isOpen && (
                <div style={{
                  border: `1px solid ${hasPlanet ? "rgba(0,245,212,0.3)" : "rgba(155,93,229,0.3)"}`,
                  borderTop: "none", borderRadius: "0 0 4px 4px",
                  background: "rgba(4,4,13,0.85)", padding: "10px 14px",
                  display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                }}>
                  <span style={{ fontSize: 9, color: "var(--dim)", letterSpacing: 1, marginRight: 4 }}>
                    [{galaxy}:{system}:{slot}]
                  </span>
                  {hasPlanet ? (
                    <>
                      <button
                        className="ship-build-btn"
                        disabled={txBusy}
                        onClick={e => { e.stopPropagation(); setActionSlot(null); onLaunchTransport(galaxy, system, slot); }}
                        style={{ width: "auto", padding: "5px 14px", fontSize: 10 }}
                      >
                        📦 TRANSPORT
                      </button>
                      {!mine && (
                        <button disabled style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: 1, padding: "5px 14px", border: "1px solid rgba(255,0,110,0.3)", background: "rgba(255,0,110,0.06)", color: "rgba(255,0,110,0.5)", borderRadius: 2, cursor: "not-allowed", textTransform: "uppercase" }}
                          title="Attack missions — coming soon">
                          ⚔ ATTACK
                        </button>
                      )}
                      <span style={{ fontSize: 9, color: "var(--dim)", marginLeft: "auto", letterSpacing: 0.5 }}>
                        {mine ? "🏠 Your planet" : "👤 Foreign planet"}
                      </span>
                    </>
                  ) : (
                    <>
                      <button
                        className="build-btn can-build"
                        disabled={txBusy}
                        onClick={e => { e.stopPropagation(); setActionSlot(null); onLaunchColonize(galaxy, system, slot); }}
                        style={{ width: "auto", padding: "5px 14px", fontSize: 10 }}
                      >
                        🌍 COLONIZE
                      </button>
                      <span style={{ fontSize: 9, color: "var(--dim)", letterSpacing: 0.5 }}>Needs Colony Ship + Astrophysics Lv 3</span>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default GalaxyTab;