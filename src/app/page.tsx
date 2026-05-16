"use client";

import React, { useEffect, useRef, useState } from "react";
import { ArrowDownTrayIcon, SparklesIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import JSZip from "jszip";

// ── Types ──────────────────────────────────────────────────────────────────────
type GradientKind = "linear" | "radial" | "conic";
type ShapeKind = "circle" | "rounded-square" | "squircle";
type BgKind = "transparent" | "solid" | "paper";

type RenderOptions = {
  gradientKind: GradientKind;
  colorA: string;
  colorB: string;
  angleDeg: number;
  shape: ShapeKind;
  padding: number;
  strokeWidth: number;
  strokeColor: string;
  glow: boolean;
  bgKind: BgKind;
  bgColor: string;
};

// ── Utilities ──────────────────────────────────────────────────────────────────
function hexToRgb(hex: string) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.substring(0, 6), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function buildIco(pngs: { size: number; blob: Blob }[]): Promise<Blob> {
  const items = [...pngs].sort((a, b) => a.size - b.size);
  const bufs = await Promise.all(items.map(async (it) => ({ size: it.size, buf: new Uint8Array(await it.blob.arrayBuffer()) })));
  const headerSize = 6 + bufs.length * 16;
  const icoBuffer = new ArrayBuffer(headerSize + bufs.reduce((a, x) => a + x.buf.length, 0));
  const view = new DataView(icoBuffer);
  const u8 = new Uint8Array(icoBuffer);
  view.setUint16(0, 0, true); view.setUint16(2, 1, true); view.setUint16(4, bufs.length, true);
  let offset = headerSize;
  bufs.forEach((img, i) => {
    const e = 6 + i * 16;
    const w = img.size >= 256 ? 0 : img.size;
    u8[e] = w; u8[e + 1] = w; u8[e + 2] = 0; u8[e + 3] = 0;
    view.setUint16(e + 4, 1, true); view.setUint16(e + 6, 32, true);
    view.setUint32(e + 8, img.buf.length, true); view.setUint32(e + 12, offset, true);
    u8.set(img.buf, offset); offset += img.buf.length;
  });
  return new Blob([icoBuffer], { type: "image/x-icon" });
}

// ── Canvas renderer ────────────────────────────────────────────────────────────
function drawIcon(ctx: CanvasRenderingContext2D, size: number, opts: RenderOptions) {
  const { gradientKind, colorA, colorB, angleDeg, shape, padding, strokeWidth, strokeColor, glow, bgKind, bgColor } = opts;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, size, size);

  if (bgKind === "solid") { ctx.fillStyle = bgColor; ctx.fillRect(0, 0, size, size); }
  else if (bgKind === "paper") {
    const g = ctx.createLinearGradient(0, 0, size, size);
    g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#f5f5f5");
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  }

  const pad = Math.round((padding / 100) * (size / 2));
  const inner = size - pad * 2;
  ctx.save();
  ctx.translate(pad, pad);

  const path = new Path2D();
  if (shape === "circle") {
    path.arc(inner / 2, inner / 2, inner / 2, 0, Math.PI * 2);
  } else if (shape === "rounded-square") {
    const r = inner * 0.2;
    type P2D = Path2D & { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void };
    const p = path as P2D;
    if (p.roundRect) { p.roundRect(0, 0, inner, inner, r); }
    else {
      const [w, h] = [inner, inner];
      p.moveTo(r, 0); p.lineTo(w - r, 0); p.arc(w - r, r, r, -Math.PI / 2, 0);
      p.lineTo(w, h - r); p.arc(w - r, h - r, r, 0, Math.PI / 2);
      p.lineTo(r, h); p.arc(r, h - r, r, Math.PI / 2, Math.PI);
      p.lineTo(0, r); p.arc(r, r, r, Math.PI, (3 * Math.PI) / 2);
      path.closePath();
    }
  } else {
    const n = 4.5, steps = 256;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      const x = (inner / 2) * Math.sign(Math.cos(t)) * Math.pow(Math.abs(Math.cos(t)), 2 / n) + inner / 2;
      const y = (inner / 2) * Math.sign(Math.sin(t)) * Math.pow(Math.abs(Math.sin(t)), 2 / n) + inner / 2;
      if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
    }
    path.closePath();
  }

  if (glow) {
    const cx = size / 2, cy = size / 2;
    const grad = ctx.createRadialGradient(cx, cy, inner * 0.15, cx, cy, inner * 0.75);
    grad.addColorStop(0, `${colorA}55`); grad.addColorStop(1, `${colorB}00`);
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = grad; ctx.fillRect(-pad, -pad, size, size);
    ctx.globalCompositeOperation = "source-over";
  }

  if (gradientKind === "conic") {
    const steps = 360, r = inner / 2;
    ctx.save(); ctx.translate(inner / 2, inner / 2);
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1), a = (angleDeg + i) * (Math.PI / 180);
      const c1 = hexToRgb(colorA), c2 = hexToRgb(colorB);
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, a, a + (2 * Math.PI) / steps); ctx.closePath();
      ctx.fillStyle = `rgb(${Math.round(c1.r + (c2.r - c1.r) * t)},${Math.round(c1.g + (c2.g - c1.g) * t)},${Math.round(c1.b + (c2.b - c1.b) * t)})`;
      ctx.fill();
    }
    ctx.globalCompositeOperation = "destination-in"; ctx.fill(path);
    ctx.globalCompositeOperation = "source-over"; ctx.restore();
  } else {
    let fill: CanvasGradient;
    if (gradientKind === "radial") {
      fill = ctx.createRadialGradient(inner / 2, inner / 2, 0, inner / 2, inner / 2, inner / 2);
    } else {
      const rad = (angleDeg * Math.PI) / 180;
      const [dx, dy, hx, hy] = [Math.cos(rad), Math.sin(rad), inner / 2, inner / 2];
      fill = ctx.createLinearGradient(
        inner / 2 - hx * dx - hy * dy, inner / 2 - hx * dy + hy * dx,
        inner / 2 + hx * dx + hy * dy, inner / 2 + hx * dy - hy * dx,
      );
    }
    fill.addColorStop(0, colorA); fill.addColorStop(1, colorB);
    ctx.save(); ctx.clip(path); ctx.fillStyle = fill; ctx.fillRect(0, 0, inner, inner); ctx.restore();
  }

  if (strokeWidth > 0) { ctx.strokeStyle = strokeColor; ctx.lineWidth = (strokeWidth / 1024) * inner; ctx.stroke(path); }
  ctx.restore();
}

// ── Data ───────────────────────────────────────────────────────────────────────
const PALETTE = [
  { hex: "#0ea5e9", name: "Sky" }, { hex: "#22c55e", name: "Green" },
  { hex: "#ef4444", name: "Red" }, { hex: "#f59e0b", name: "Amber" },
  { hex: "#8b5cf6", name: "Violet" }, { hex: "#ec4899", name: "Pink" },
  { hex: "#14b8a6", name: "Teal" }, { hex: "#6366f1", name: "Indigo" },
];

const DEFAULTS: RenderOptions = {
  gradientKind: "linear", colorA: "#0ea5e9", colorB: "#22c55e",
  angleDeg: 110, shape: "circle", padding: 6,
  strokeWidth: 6, strokeColor: "#00000010", glow: false,
  bgKind: "transparent", bgColor: "#ffffff",
};

const EXPORT_SIZES = [16, 32, 48, 64, 128, 256];

// ── Sub-components ─────────────────────────────────────────────────────────────
function Label({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: "0 0 10px", fontSize: "10px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)" }}>
      {children}
    </p>
  );
}

function Tabs<T extends string>({ options, value, onChange, display }: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  display?: (v: T) => string;
}) {
  return (
    <div style={{ display: "inline-flex", background: "var(--bg-segment)", borderRadius: "8px", padding: "3px", gap: "2px" }}>
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          style={{
            padding: "6px 14px",
            borderRadius: "6px",
            border: "none",
            background: value === opt ? "var(--bg-tab-active)" : "transparent",
            color: value === opt ? "var(--text-primary)" : "var(--text-secondary)",
            fontFamily: "var(--font-syne), Syne, sans-serif",
            fontSize: "12px",
            fontWeight: value === opt ? 600 : 400,
            cursor: "pointer",
            boxShadow: value === opt ? "var(--shadow-sm)" : "none",
            transition: "all 0.15s ease",
            whiteSpace: "nowrap",
          }}
        >
          {display ? display(opt) : opt}
        </button>
      ))}
    </div>
  );
}

function Slider({ label, value, min, max, unit = "", onChange }: {
  label: string; value: number; min: number; max: number; unit?: string; onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <span style={{ fontSize: "12px", color: "var(--text-secondary)", minWidth: "52px", flexShrink: 0 }}>{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(+e.target.value)} style={{ flex: 1 }} />
      <span style={{ fontSize: "12px", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums", minWidth: "28px", textAlign: "right" }}>
        {value}{unit}
      </span>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function FaviconGenerator() {
  const [opts, setOpts] = useState<RenderOptions>(DEFAULTS);
  const [filename, setFilename] = useState("favicon");
  const [busy, setBusy] = useState(false);

  const mainCanvas = useRef<HTMLCanvasElement>(null);
  const p16 = useRef<HTMLCanvasElement>(null);
  const p32 = useRef<HTMLCanvasElement>(null);
  const p48 = useRef<HTMLCanvasElement>(null);
  const p64 = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = mainCanvas.current;
    if (!c) return;
    c.width = c.height = 1024;
    drawIcon(c.getContext("2d")!, 1024, opts);
    for (const [ref, sz] of [[p16, 16], [p32, 32], [p48, 48], [p64, 64]] as [React.RefObject<HTMLCanvasElement>, number][]) {
      const pc = ref.current;
      if (!pc) continue;
      pc.width = pc.height = sz;
      drawIcon(pc.getContext("2d")!, sz, opts);
    }
  }, [opts]);

  async function exportZip() {
    setBusy(true);
    try {
      const zip = new JSZip();
      const pngs = await Promise.all(EXPORT_SIZES.map(async (s) => {
        const c = Object.assign(document.createElement("canvas"), { width: s, height: s });
        drawIcon(c.getContext("2d")!, s, opts);
        const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/png"));
        zip.file(`${filename}-${s}.png`, blob);
        return { size: s, blob };
      }));
      zip.file(`${filename}.ico`, await buildIco(pngs));
      downloadBlob(await zip.generateAsync({ type: "blob" }), `${filename}-favicons.zip`);
    } finally { setBusy(false); }
  }

  function randomize() {
    const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    const hexes = PALETTE.map((c) => c.hex);
    setOpts({
      gradientKind: pick(["linear", "radial", "conic"] as GradientKind[]),
      colorA: pick(hexes), colorB: pick(hexes),
      angleDeg: Math.floor(Math.random() * 360),
      shape: pick(["circle", "rounded-square", "squircle"] as ShapeKind[]),
      padding: Math.floor(Math.random() * 15),
      strokeWidth: Math.floor(Math.random() * 10),
      strokeColor: pick(hexes),
      glow: Math.random() < 0.5,
      bgKind: pick(["transparent", "solid", "paper"] as BgKind[]),
      bgColor: pick(hexes),
    });
  }

  // Subtle checkerboard for transparency — very light tones
  const checker = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Crect width='8' height='8' fill='%23e8e6e2'/%3E%3Crect x='8' y='8' width='8' height='8' fill='%23e8e6e2'/%3E%3Crect x='8' y='0' width='8' height='8' fill='%23f5f4f1'/%3E%3Crect x='0' y='8' width='8' height='8' fill='%23f5f4f1'/%3E%3C/svg%3E")`;

  const input: React.CSSProperties = {
    width: "100%", padding: "9px 12px",
    background: "var(--bg-input)", border: "1px solid var(--border)",
    borderRadius: "7px", color: "var(--text-primary)",
    fontFamily: "var(--font-syne), Syne, sans-serif", fontSize: "13px",
    outline: "none", transition: "border-color 0.15s",
  };

  const set = (partial: Partial<RenderOptions>) => setOpts((o) => ({ ...o, ...partial }));

  return (
    <div style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "1fr 400px" }}>

      {/* ── Preview panel ─────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: "36px", padding: "48px",
          background: "var(--bg-preview)",
          backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.07) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      >
        {/* Main canvas */}
        <div
          style={{
            borderRadius: "24px", overflow: "hidden",
            backgroundImage: checker,
            boxShadow: "var(--shadow-canvas)",
          }}
        >
          <canvas
            ref={mainCanvas}
            style={{ display: "block", width: "min(56vw, 460px)", height: "min(56vw, 460px)", borderRadius: "24px" }}
          />
        </div>

        {/* Size strip */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: "20px" }}>
          {([{ ref: p16, size: 16 }, { ref: p32, size: 32 }, { ref: p48, size: 48 }, { ref: p64, size: 64 }]).map(({ ref, size }) => (
            <div key={size} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
              <div style={{ borderRadius: size <= 16 ? "3px" : size <= 32 ? "5px" : "7px", overflow: "hidden", backgroundImage: checker, boxShadow: "0 1px 6px rgba(0,0,0,0.08), 0 0 0 1px var(--border)" }}>
                <canvas
                  ref={ref}
                  style={{ display: "block", width: `${size * 2}px`, height: `${size * 2}px`, imageRendering: "pixelated" }}
                />
              </div>
              <span style={{ fontSize: "10px", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{size}px</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Controls panel ────────────────────────────────────────────────── */}
      <div
        style={{
          background: "var(--bg-panel)", borderLeft: "1px solid var(--border)",
          overflowY: "auto", padding: "40px 32px",
          display: "flex", flexDirection: "column", gap: "32px",
        }}
      >

        {/* Header */}
        <header className="fade-up">
          <h1 style={{ margin: "0 0 6px", fontFamily: "var(--font-display), 'DM Serif Display', serif", fontSize: "28px", fontWeight: 400, color: "var(--text-primary)", lineHeight: 1.15 }}>
            Favicon Studio
          </h1>
          <p style={{ margin: 0, fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Design · preview · export in all sizes
          </p>
        </header>

        {/* File name */}
        <div className="fade-up d1">
          <Label>Output name</Label>
          <div style={{ position: "relative" }}>
            <input
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              style={{ ...input, paddingRight: "72px" }}
              onFocus={(e) => (e.target.style.borderColor = "var(--border-focus)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
            />
            <span style={{ position: "absolute", right: "11px", top: "50%", transform: "translateY(-50%)", fontSize: "11px", color: "var(--text-muted)" }}>
              .ico / .png
            </span>
          </div>
        </div>

        {/* Gradient */}
        <div className="fade-up d2">
          <Label>Gradient</Label>
          <Tabs
            options={["linear", "radial", "conic"] as const}
            value={opts.gradientKind}
            onChange={(v) => set({ gradientKind: v })}
          />
          {opts.gradientKind !== "radial" && (
            <div style={{ marginTop: "16px" }}>
              <Slider label="Angle" value={opts.angleDeg} min={0} max={360} unit="°" onChange={(v) => set({ angleDeg: v })} />
            </div>
          )}
        </div>

        {/* Colors */}
        <div className="fade-up d3">
          <Label>Colors</Label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "7px", marginBottom: "14px" }}>
            {PALETTE.map(({ hex, name }) => (
              <button
                key={hex}
                title={`${name} — click: start · shift+click: end`}
                onClick={(e) => e.shiftKey ? set({ colorB: hex }) : set({ colorA: hex })}
                style={{
                  width: "32px", height: "32px", borderRadius: "50%",
                  background: hex, border: (opts.colorA === hex || opts.colorB === hex) ? "2.5px solid var(--accent)" : "2.5px solid transparent",
                  outline: "3px solid transparent",
                  outlineOffset: "-1px",
                  cursor: "pointer", transition: "transform 0.1s ease",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.1)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
              />
            ))}
          </div>
          <p style={{ margin: "0 0 14px", fontSize: "11px", color: "var(--text-muted)" }}>
            Click = start &nbsp;·&nbsp; Shift+click = end
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            {[["Start", "colorA", opts.colorA], ["End", "colorB", opts.colorB]].map(([label, key, value]) => (
              <div key={key as string}>
                <p style={{ margin: "0 0 6px", fontSize: "10px", color: "var(--text-muted)", letterSpacing: "0.06em" }}>{label as string}</p>
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <input type="color" value={value as string} onChange={(e) => set({ [key as string]: e.target.value })} style={{ width: "36px", height: "34px", flexShrink: 0 }} />
                  <input
                    type="text" value={value as string}
                    onChange={(e) => set({ [key as string]: e.target.value })}
                    style={{ ...input, padding: "7px 10px", fontSize: "12px" }}
                    onFocus={(e) => (e.target.style.borderColor = "var(--border-focus)")}
                    onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Shape */}
        <div className="fade-up d4">
          <Label>Shape</Label>
          <Tabs
            options={["circle", "rounded-square", "squircle"] as const}
            value={opts.shape}
            onChange={(v) => set({ shape: v })}
            display={(v) => v === "rounded-square" ? "Rounded" : v.charAt(0).toUpperCase() + v.slice(1)}
          />
          <div style={{ marginTop: "16px" }}>
            <Slider label="Padding" value={opts.padding} min={0} max={20} unit="%" onChange={(v) => set({ padding: v })} />
          </div>
        </div>

        {/* Effects */}
        <div className="fade-up d5">
          <Label>Effects</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ flex: 1 }}>
                <Slider label="Stroke" value={opts.strokeWidth} min={0} max={20} onChange={(v) => set({ strokeWidth: v })} />
              </div>
              <input
                type="color"
                value={opts.strokeColor.length >= 7 ? opts.strokeColor.slice(0, 7) : "#000000"}
                onChange={(e) => set({ strokeColor: e.target.value })}
                style={{ width: "34px", height: "30px", flexShrink: 0 }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Ambient glow</span>
              <button
                onClick={() => set({ glow: !opts.glow })}
                style={{
                  padding: "5px 14px", borderRadius: "20px",
                  border: "1px solid " + (opts.glow ? "var(--accent)" : "var(--border)"),
                  background: opts.glow ? "var(--accent)" : "transparent",
                  color: opts.glow ? "#ffffff" : "var(--text-secondary)",
                  fontSize: "11px", fontFamily: "var(--font-syne), Syne, sans-serif",
                  fontWeight: 600, cursor: "pointer", letterSpacing: "0.06em",
                  transition: "all 0.15s ease",
                }}
              >
                {opts.glow ? "ON" : "OFF"}
              </button>
            </div>
          </div>
        </div>

        {/* Background */}
        <div className="fade-up d6">
          <Label>Background</Label>
          <Tabs
            options={["transparent", "solid", "paper"] as const}
            value={opts.bgKind}
            onChange={(v) => set({ bgKind: v })}
            display={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
          />
          {opts.bgKind === "solid" && (
            <div style={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "12px" }}>
              <input type="color" value={opts.bgColor} onChange={(e) => set({ bgColor: e.target.value })} style={{ width: "36px", height: "34px", flexShrink: 0 }} />
              <input
                type="text" value={opts.bgColor} onChange={(e) => set({ bgColor: e.target.value })}
                style={{ ...input, padding: "7px 10px", fontSize: "12px" }}
                onFocus={(e) => (e.target.style.borderColor = "var(--border-focus)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", paddingBottom: "4px" }}>
          <button
            onClick={exportZip}
            disabled={busy}
            style={{
              width: "100%", padding: "13px",
              borderRadius: "9px", border: "none",
              background: busy ? "var(--bg-segment)" : "var(--accent)",
              color: busy ? "var(--text-muted)" : "#ffffff",
              fontFamily: "var(--font-syne), Syne, sans-serif",
              fontSize: "14px", fontWeight: 700,
              cursor: busy ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              transition: "opacity 0.15s ease",
              letterSpacing: "0.01em",
            }}
            onMouseEnter={(e) => { if (!busy) (e.currentTarget.style.opacity = "0.88"); }}
            onMouseLeave={(e) => { (e.currentTarget.style.opacity = "1"); }}
          >
            <ArrowDownTrayIcon style={{ width: "16px", height: "16px" }} />
            {busy ? "Generating…" : "Download ZIP"}
          </button>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            {[
              { label: "Randomize", icon: SparklesIcon, onClick: randomize },
              { label: "Reset", icon: ArrowPathIcon, onClick: () => setOpts(DEFAULTS) },
            ].map(({ label, icon: Icon, onClick }) => (
              <button
                key={label}
                onClick={onClick}
                style={{
                  padding: "10px", borderRadius: "8px",
                  border: "1px solid var(--border)", background: "transparent",
                  color: "var(--text-secondary)",
                  fontFamily: "var(--font-syne), Syne, sans-serif",
                  fontSize: "13px", fontWeight: 500,
                  cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--border-focus)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
              >
                <Icon style={{ width: "14px", height: "14px" }} />
                {label}
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
