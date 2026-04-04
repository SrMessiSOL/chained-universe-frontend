import React, { useRef, useEffect, useState, useCallback } from "react";
import { Planet } from "./game";

interface GalaxyMapProps {
  currentPlanet: Planet;                    // Used only for "my home system" button / fallback
  systemPlanets?: Array<{ 
    position: number; 
    name: string;
  }>;
}

const GalaxyMap: React.FC<GalaxyMapProps> = ({ currentPlanet, systemPlanets = [] }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [lastMouse, setLastMouse] = useState({ x: 0, y: 0 });
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);

  const width = 760;
  const height = 460;
  const centerX = width / 2;
  const centerY = height / 2;

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
    ctx.strokeStyle = "#334466";
    ctx.lineWidth = 1.5;
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
      const angle = (slot * (Math.PI * 2)) / 15 - 0.6;
      const distance = 55 + slot * 19;
      const x = centerX + Math.cos(angle) * distance * scale + offsetX;
      const y = centerY + Math.sin(angle) * distance * scale + offsetY;

      // Check if this slot has a planet in the scanned system
      const slotData = systemPlanets.find(p => p.position === slot);
      const hasPlanet = !!slotData;

      // Is this the player's own planet? (only highlight if it's in the current viewed system)
      const isMyPlanet = hasPlanet && 
                        slot === currentPlanet.position && 
                        currentPlanet.galaxy === currentPlanet.galaxy && 
                        currentPlanet.system === currentPlanet.system;

      // Planet color
      const planetColor = isMyPlanet ? "#00f5d4" : (hasPlanet ? "#88aaff" : "#334466");

      // Draw planet
      ctx.save();
      if (isMyPlanet) {
        ctx.shadowBlur = 30;
        ctx.shadowColor = "#00f5d4";
      }

      ctx.fillStyle = planetColor;
      ctx.beginPath();
      ctx.arc(x, y, isMyPlanet ? 11.5 : 7.8, 0, Math.PI * 2);
      ctx.fill();

      // Glow ring only for player's planet
      if (isMyPlanet) {
        ctx.strokeStyle = "#00f5d4";
        ctx.lineWidth = 2.8;
        ctx.globalAlpha = 0.45;
        ctx.beginPath();
        ctx.arc(x, y, 17, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      // Label
      if (hasPlanet) {
        ctx.fillStyle = isMyPlanet ? "#00f5d4" : "#c8d6e5";
        ctx.font = isMyPlanet ? "bold 13px Orbitron" : "11px Orbitron";
        ctx.textAlign = "center";
        ctx.shadowBlur = 8;
        ctx.shadowColor = "#000";

        const displayName = slotData!.name.length > 14 
          ? slotData!.name.slice(0, 14) + "..." 
          : slotData!.name;

        ctx.fillText(displayName, x, y + (isMyPlanet ? 29 : 25));

        if (isMyPlanet) {
          ctx.fillStyle = "#ffd700";
          ctx.font = "bold 14px Orbitron";
          ctx.fillText("★ YOU", x, y - 23);
        }
      }
    });

    // Hover info
    if (hoveredSlot) {
      const slotData = systemPlanets.find(p => p.position === hoveredSlot);
      ctx.fillStyle = "rgba(0, 245, 212, 0.95)";
      ctx.font = "12px Share Tech Mono";
      ctx.textAlign = "left";
      ctx.fillText(
        `Position ${hoveredSlot} • ${slotData?.name || "Empty"}`, 
        20, 40
      );
    }
  }, [currentPlanet, systemPlanets, scale, offsetX, offsetY, hoveredSlot]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Mouse handlers (same as before, but improved hit detection)
  const getMousePos = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      const dx = e.clientX - lastMouse.x;
      const dy = e.clientY - lastMouse.y;
      setOffsetX(p => p + dx);
      setOffsetY(p => p + dy);
      setLastMouse({ x: e.clientX, y: e.clientY });
      return;
    }

    const pos = getMousePos(e);
    let found: number | null = null;

    for (let slot = 1; slot <= 15; slot++) {
      const angle = (slot * (Math.PI * 2)) / 15 - 0.6;
      const distance = 55 + slot * 19;
      const x = centerX + Math.cos(angle) * distance * scale + offsetX;
      const y = centerY + Math.sin(angle) * distance * scale + offsetY;

      const dx = pos.x - x;
      const dy = pos.y - y;
      if (dx * dx + dy * dy < 180) {
        found = slot;
        break;
      }
    }
    setHoveredSlot(found);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setLastMouse({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    setScale(prev => Math.max(0.4, Math.min(3.0, prev * delta)));
  };

  const resetView = () => {
    setScale(1);
    setOffsetX(0);
    setOffsetY(0);
  };

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: "780px", margin: "0 auto 28px" }}>
      <div className="section-title" style={{ marginBottom: 12 }}>
        SYSTEM VIEW — [{currentPlanet.galaxy}:{currentPlanet.system}]
      </div>

      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{
          border: "1px solid var(--border)",
          borderRadius: "4px",
          cursor: isDragging ? "grabbing" : "grab",
          background: "#05050f",
        }}
      />

      <div style={{ position: "absolute", bottom: 12, right: 12, display: "flex", gap: 8 }}>
        <button onClick={resetView} className="build-btn" style={{ padding: "6px 12px", fontSize: "10px" }}>
          RESET VIEW
        </button>
      </div>

      <div style={{ fontSize: "10px", color: "var(--dim)", textAlign: "center", marginTop: 8 }}>
        DRAG to pan • SCROLL to zoom • Hover over planets
      </div>
    </div>
  );
};

export default GalaxyMap;