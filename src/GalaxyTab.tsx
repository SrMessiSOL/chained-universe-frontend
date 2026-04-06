import React, { useState, useEffect, useRef, useCallback } from "react";
import GalaxyMap from "./GalaxyMap";
import { GameClient, Planet } from "./game-state";

interface GalaxyTabProps {
  client: GameClient | null;
  currentPlanet: Planet;
  txBusy: boolean;
}

const GalaxyTab: React.FC<GalaxyTabProps> = ({ client, currentPlanet, txBusy }) => {
  const [galaxy, setGalaxy] = useState(currentPlanet.galaxy);
  const [system, setSystem] = useState(currentPlanet.system);
  const [planets, setPlanets] = useState<Planet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userHasManuallyScanned = useRef(false);

  const loadSystem = useCallback(async (g: number, s: number, manual = false) => {
    if (!client) return;

    if (manual) userHasManuallyScanned.current = true;

    setLoading(true);
    setError(null);

    try {
      const systemPlanets = await client.getSystemPlanets(g, s);
      setPlanets(systemPlanets);
      setGalaxy(g);
      setSystem(s);
    } catch (e: any) {
      setError(e?.message || "Failed to load system");
      setPlanets([]);
    } finally {
      setLoading(false);
    }
  }, [client]);

  // Initial load only (once when tab opens)
  useEffect(() => {
    if (!userHasManuallyScanned.current) {
      loadSystem(currentPlanet.galaxy, currentPlanet.system);
    }
  }, []);

  const handleSearch = () => loadSystem(galaxy, system, true);

  const goToMySystem = () => {
    userHasManuallyScanned.current = false;   // allow reset
    setGalaxy(currentPlanet.galaxy);
    setSystem(currentPlanet.system);
    loadSystem(currentPlanet.galaxy, currentPlanet.system);
  };

  const viewedPlanet = planets.find(p => p.galaxy === galaxy && p.system === system) || currentPlanet;

  return (
    <div>
      <div className="section-title">🌌 GALAXY EXPLORER</div>

      <div style={{ marginBottom: 24, display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
        <div>
          <div className="modal-label">Galaxy</div>
          <input
            type="number"
            min={1} max={9}
            value={galaxy}
            onChange={e => setGalaxy(Math.max(1, Math.min(9, parseInt(e.target.value) || 1)))}
            style={{ width: 90, padding: "8px 10px", fontSize: "13px", background: "var(--panel)", border: "1px solid var(--border)" }}
          />
        </div>

        <div>
          <div className="modal-label">System</div>
          <input
            type="number"
            min={1} max={499}
            value={system}
            onChange={e => setSystem(Math.max(1, Math.min(499, parseInt(e.target.value) || 1)))}
            style={{ width: 110, padding: "8px 10px", fontSize: "13px", background: "var(--panel)", border: "1px solid var(--border)" }}
          />
        </div>

        <button 
          className="build-btn can-build" 
          onClick={handleSearch}
          disabled={loading || txBusy}
          style={{ padding: "10px 24px" }}
        >
          {loading ? "SCANNING..." : "SCAN SYSTEM"}
        </button>

        <button 
          className="build-btn" 
          onClick={goToMySystem}
          disabled={loading || txBusy}
        >
          GO TO MY SYSTEM
        </button>
      </div>

      {error && <div className="error-msg" style={{ marginBottom: 16 }}>{error}</div>}

      <GalaxyMap 
        currentPlanet={viewedPlanet}
        systemPlanets={planets.map(p => ({
          position: p.position,
          name: p.name || `Planet ${p.position}`
        }))}
      />

      <div style={{ marginTop: 32 }}>
        <div className="section-title" style={{ fontSize: 12 }}>
          PLANETS IN SYSTEM [{galaxy}:{system}] — {planets.length} found
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "80px", color: "var(--dim)" }}>Scanning on-chain...</div>
        ) : planets.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px", color: "var(--dim)" }}>
            No planets found in this system yet.
          </div>
        ) : (
          <div className="grid-3">
            {planets.map(p => {
              const isMine = p.galaxy === currentPlanet.galaxy && 
                            p.system === currentPlanet.system && 
                            p.position === currentPlanet.position;

              return (
                <div key={p.position} className="card" style={{ borderColor: isMine ? "var(--cyan)" : "var(--border)" }}>
                  <div style={{ fontSize: "11px", color: "var(--dim)" }}>SLOT {p.position}</div>
                  <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: "16px", margin: "8px 0" }}>
                    {p.name || `Planet ${p.position}`}
                  </div>
                  {isMine && <div style={{ color: "var(--cyan)", fontSize: "12px" }}>★ YOUR HOMEWORLD</div>}
                  <div style={{ fontSize: "11px", color: "var(--dim)" }}>
                    {p.diameter.toLocaleString()} km • {p.temperature}°C
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default GalaxyTab;
