import React, { useRef, useEffect, useState, useCallback } from "react";

interface SystemPlanetEntry {
  position: number;
  name: string;
  isOwned: boolean; // true if this planet belongs to the connected wallet
}

interface GalaxyMapProps {
  currentGalaxy: number;
  currentSystem: number;
  systemPlanets: SystemPlanetEntry[];
  ownedSlots: Set<string>; // "g:s:p" keys
  viewedGalaxy: number;
  viewedSystem: number;
  onTransport: (position: number) => void;
  onColonize: (position: number) => void;
}

const GalaxyMap: React.FC<GalaxyMapProps> = ({
  currentGalaxy,
  currentSystem,
  systemPlanets,
  viewedGalaxy,
  viewedSystem,
  onTransport,
  onColonize,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 });
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
  // Popup for action buttons — shown when hovering a slot
  const [popupSlot, setPopupSlot] = useState<{ slot: number; x: number; y: number; hasPlanet: boolean; isOwned: boolean } | null>(null);

  const width = 760;
  const height = 460;
  const centerX = width / 2;
  const centerY = height / 2;

  const getSlotXY = useCallback((slot: number) => {
    const angle = (slot * (Math.PI * 2)) / 15 - 0.6;
    const distance = 55 + slot * 19;
    return {
      x: centerX + Math.cos(angle) * distance * scale + offsetX,
      y: centerY + Math.sin(angle) * distance * scale + offsetY,
    };
  }, [scale, offsetX, offsetY, centerX, centerY]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    // Background
    const grad = ctx.createRadialGradient(centerX, centerY, 50, centerX, centerY, 400);
    grad.addColorStop(0, "#0a0a1f");
    grad.addColorStop(1, "#04040d");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Orbit rings
    ctx.strokeStyle = "#1a1a3a";
    ctx.lineWidth = 1;
    for (let i = 1; i <= 15; i++) {
      const radius = 55 + i * 19;
      ctx.beginPath();
      ctx.arc(centerX + offsetX, centerY + offsetY, radius * scale, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Sun
    ctx.fillStyle = "#ffdd44";
    ctx.shadowBlur = 40;
    ctx.shadowColor = "#ffaa00";
    ctx.beginPath();
    ctx.arc(centerX + offsetX, centerY + offsetY, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    const allSlots = Array.from({ length: 15 }, (_, i) => i + 1);

    allSlots.forEach((slot) => {
      const { x, y } = getSlotXY(slot);
      const slotData = systemPlanets.find(p => p.position === slot);
      const hasPlanet = !!slotData;
      const isOwned = slotData?.isOwned ?? false;
      const isHovered = hoveredSlot === slot;

      ctx.save();

      if (isOwned) {
        // Owned planet: cyan glow
        ctx.shadowBlur = isHovered ? 40 : 28;
        ctx.shadowColor = "#00f5d4";
        ctx.fillStyle = "#00f5d4";
        ctx.beginPath();
        ctx.arc(x, y, isHovered ? 13 : 11.5, 0, Math.PI * 2);
        ctx.fill();
        // Glow ring
        ctx.strokeStyle = "#00f5d4";
        ctx.lineWidth = 2.8;
        ctx.globalAlpha = isHovered ? 0.7 : 0.45;
        ctx.beginPath();
        ctx.arc(x, y, 17, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (hasPlanet) {
        // Foreign planet: blue
        ctx.shadowBlur = isHovered ? 20 : 0;
        ctx.shadowColor = "#88aaff";
        ctx.fillStyle = isHovered ? "#aaccff" : "#88aaff";
        ctx.beginPath();
        ctx.arc(x, y, isHovered ? 10 : 7.8, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Empty slot: dim dot
        ctx.fillStyle = isHovered ? "rgba(155,93,229,0.6)" : "rgba(26,26,58,0.8)";
        ctx.strokeStyle = isHovered ? "rgba(155,93,229,0.8)" : "#1a1a3a";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, isHovered ? 7 : 4, 0, Math.PI * 2);
        ctx.fill();
        if (isHovered) ctx.stroke();
      }
      ctx.restore();

      // Labels
      if (hasPlanet) {
        ctx.fillStyle = isOwned ? "#00f5d4" : "#c8d6e5";
        ctx.font = isOwned ? "bold 12px Orbitron, sans-serif" : "10px Orbitron, sans-serif";
        ctx.textAlign = "center";
        ctx.shadowBlur = 8;
        ctx.shadowColor = "#000";
        const displayName = (slotData!.name.length > 12 ? slotData!.name.slice(0, 12) + "…" : slotData!.name);
        ctx.fillText(displayName, x, y + (isOwned ? 28 : 24));
        if (isOwned) {
          ctx.fillStyle = "#ffd700";
          ctx.font = "bold 12px Orbitron, sans-serif";
          ctx.fillText("★ YOURS", x, y - 22);
        }
        ctx.shadowBlur = 0;
      } else if (isHovered) {
        // Show slot number on hover for empty slots
        ctx.fillStyle = "rgba(155,93,229,0.8)";
        ctx.font = "10px Share Tech Mono, monospace";
        ctx.textAlign = "center";
        ctx.fillText(`slot ${slot}`, x, y + 20);
      }
    });

    // Hover info banner
    if (hoveredSlot) {
      const slotData = systemPlanets.find(p => p.position === hoveredSlot);
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(12, 12, 280, 28);
      ctx.fillStyle = slotData?.isOwned ? "#00f5d4" : slotData ? "#c8d6e5" : "rgba(155,93,229,0.9)";
      ctx.font = "11px Share Tech Mono, monospace";
      ctx.textAlign = "left";
      ctx.fillText(
        `Slot ${hoveredSlot} · ${slotData?.name ?? "Empty — click to colonize"}`,
        20, 30
      );
    }
  }, [systemPlanets, scale, offsetX, offsetY, hoveredSlot, getSlotXY]);

  useEffect(() => { draw(); }, [draw]);

  const getMousePos = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const scaleX = canvasRef.current!.width / rect.width;
    const scaleY = canvasRef.current!.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const findHoveredSlot = useCallback((px: number, py: number): number | null => {
    for (let slot = 1; slot <= 15; slot++) {
      const { x, y } = getSlotXY(slot);
      const dx = px - x, dy = py - y;
      if (dx * dx + dy * dy < 225) return slot;  // 15px radius hit area
    }
    return null;
  }, [getSlotXY]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      const dx = e.clientX - lastMouse.x;
      const dy = e.clientY - lastMouse.y;
      setOffsetX(p => p + dx);
      setOffsetY(p => p + dy);
      setLastMouse({ x: e.clientX, y: e.clientY });
      setHoveredSlot(null);
      setPopupSlot(null);
      return;
    }
    const pos = getMousePos(e);
    const found = findHoveredSlot(pos.x, pos.y);
    setHoveredSlot(found);

    if (found !== null) {
      const { x, y } = getSlotXY(found);
      const rect = canvasRef.current!.getBoundingClientRect();
      const canvasScaleX = rect.width / canvasRef.current!.width;
      const canvasScaleY = rect.height / canvasRef.current!.height;
      const slotData = systemPlanets.find(p => p.position === found);
      setPopupSlot({
        slot: found,
        x: x * canvasScaleX + rect.left,
        y: y * canvasScaleY + rect.top,
        hasPlanet: !!slotData,
        isOwned: slotData?.isOwned ?? false,
      });
    } else {
      setPopupSlot(null);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setLastMouse({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleMouseLeave = () => {
    setIsDragging(false);
    setHoveredSlot(null);
    setPopupSlot(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    setScale(prev => Math.max(0.4, Math.min(3.0, prev * delta)));
    setPopupSlot(null);
  };

  const resetView = () => { setScale(1); setOffsetX(0); setOffsetY(0); setPopupSlot(null); };

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: "780px", margin: "0 auto 28px" }}>
      <div className="section-title" style={{ marginBottom: 12 }}>
        SYSTEM VIEW — [{viewedGalaxy}:{viewedSystem}]
      </div>

      {/* Canvas map */}
      <div style={{ position: "relative" }}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onWheel={handleWheel}
          style={{
            border: "1px solid var(--border)",
            borderRadius: "4px",
            cursor: isDragging ? "grabbing" : "grab",
            background: "#05050f",
            width: "100%",
            maxWidth: "780px",
            display: "block",
          }}
        />

        {/* Hover popup with action buttons */}
        {popupSlot && (
          <div
            style={{
              position: "fixed",
              left: popupSlot.x + 16,
              top: popupSlot.y - 20,
              zIndex: 300,
              background: "rgba(8,8,22,0.97)",
              border: `1px solid ${popupSlot.isOwned ? "rgba(0,245,212,0.5)" : popupSlot.hasPlanet ? "rgba(136,170,255,0.5)" : "rgba(155,93,229,0.5)"}`,
              borderRadius: 4,
              padding: "10px 12px",
              minWidth: 140,
              pointerEvents: "auto",
              boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
            }}
            onMouseEnter={() => setPopupSlot(popupSlot)} // keep popup alive on hover
            onMouseLeave={() => setPopupSlot(null)}
          >
            <div style={{ fontSize: 10, color: "var(--dim)", letterSpacing: 1, marginBottom: 6 }}>
              SLOT {popupSlot.slot}
            </div>
            {popupSlot.hasPlanet ? (
              <>
                <div style={{
                  fontSize: 11,
                  color: popupSlot.isOwned ? "var(--cyan)" : "var(--text)",
                  fontFamily: "'Orbitron', sans-serif",
                  marginBottom: 8,
                  fontWeight: 700,
                }}>
                  {systemPlanets.find(p => p.position === popupSlot.slot)?.name ?? `Planet ${popupSlot.slot}`}
                  {popupSlot.isOwned && " ★"}
                </div>
                <button
                  onClick={() => { onTransport(popupSlot.slot); setPopupSlot(null); }}
                  style={{
                    width: "100%", padding: "6px 0", fontSize: 10, letterSpacing: 1,
                    border: "1px solid rgba(0,245,212,0.45)", background: "rgba(0,245,212,0.08)",
                    color: "var(--cyan)", cursor: "pointer", borderRadius: 2,
                    fontFamily: "'Share Tech Mono', monospace", textTransform: "uppercase",
                  }}
                >
                  ⊹ Transport
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 11, color: "var(--dim)", marginBottom: 8 }}>
                  Empty slot
                </div>
                <button
                  onClick={() => { onColonize(popupSlot.slot); setPopupSlot(null); }}
                  style={{
                    width: "100%", padding: "6px 0", fontSize: 10, letterSpacing: 1,
                    border: "1px solid rgba(155,93,229,0.45)", background: "rgba(155,93,229,0.08)",
                    color: "var(--purple)", cursor: "pointer", borderRadius: 2,
                    fontFamily: "'Share Tech Mono', monospace", textTransform: "uppercase",
                  }}
                >
                  🌍 Colonize
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Controls row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <div style={{ fontSize: "10px", color: "var(--dim)" }}>
          DRAG to pan · SCROLL to zoom · Hover planets for actions
        </div>
        <button onClick={resetView} className="build-btn" style={{ padding: "6px 12px", fontSize: "10px", width: "auto" }}>
          RESET VIEW
        </button>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
        {[
          { color: "#00f5d4", label: "Your planets" },
          { color: "#88aaff", label: "Other planets" },
          { color: "rgba(155,93,229,0.5)", label: "Empty (colonizable)" },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--dim)" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
};

export default GalaxyMap;