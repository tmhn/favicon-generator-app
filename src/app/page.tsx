"use client";

import React, { useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import { ArrowPathIcon } from "@heroicons/react/20/solid";

const Icon = {
  Download: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" {...props}>
      <path d="M3 16.5A2.5 2.5 0 0 0 5.5 19h13A2.5 2.5 0 0 0 21 16.5a1 1 0 1 0-2 0 .5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5 1 1 0 1 0-2 0Z" />
      <path d="M12 3a1 1 0 0 1 1 1v8.586l2.293-2.293a1 1 0 1 1 1.414 1.414l-4.004 4.004a1 1 0 0 1-1.414 0L7.286 11.707a1 1 0 1 1 1.414-1.414L11 12.586V4a1 1 0 0 1 1-1Z" />
    </svg>
  ),
  Shuffle: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" {...props}>
      <path d="M14.59 7 12 9.59 10.59 8.17 13.76 5H20v6.24l-1.41-1.41V7h-4Zm-5.18 10L3 10.59 4.41 9.17 9.41 14.17 16.59 7H20v3l-1.41-1.41h-1.59l-7.77 7.77ZM20 14.76 21.41 16.17 18.24 19H12v-1.59h5.17L20 14.76Z" />
    </svg>
  ),
};

/**
 * Favicon Generator – single‑file React app.
 *
 * Goals
 * - Split screen: live preview (left) + controls (right)
 * - Generate crisp PNGs at multiple sizes and an ICO containing multiple sizes
 * - Options: gradient type & direction, colors, shape, padding, glow, stroke, bg
 * - Clean, modern UI with Tailwind (assumed present by the host)
 *
 * Drop this file into a React project (Vite/Next) and render <FaviconStudio />
 */

// ---------- Types

type GradientKind = "linear" | "radial" | "conic";

type ShapeKind = "circle" | "rounded-square" | "squircle";

type BgKind = "transparent" | "solid" | "paper";

// ---------- Utilities

const TW_COLORS: { name: string; hex: string }[] = [
  { name: "slate", hex: "#64748B" },
  { name: "gray", hex: "#6B7280" },
  { name: "zinc", hex: "#71717A" },
  { name: "neutral", hex: "#737373" },
  { name: "stone", hex: "#78716C" },
  { name: "red", hex: "#EF4444" },
  { name: "orange", hex: "#F97316" },
  { name: "amber", hex: "#F59E0B" },
  { name: "yellow", hex: "#EAB308" },
  { name: "lime", hex: "#84CC16" },
  { name: "green", hex: "#22C55E" },
  { name: "emerald", hex: "#10B981" },
  { name: "teal", hex: "#14B8A6" },
  { name: "cyan", hex: "#06B6D4" },
  { name: "sky", hex: "#0EA5E9" },
  { name: "blue", hex: "#3B82F6" },
  { name: "indigo", hex: "#6366F1" },
  { name: "violet", hex: "#8B5CF6" },
  { name: "purple", hex: "#A855F7" },
  { name: "fuchsia", hex: "#D946EF" },
  { name: "pink", hex: "#EC4899" },
  { name: "rose", hex: "#F43F5E" },
];

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function hexToRgb(hex: string): { r: number; g: number; b: number; a: number } {
  let h = hex.replace("#", "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const bigint = parseInt(h.substring(0, 6), 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  let a = 255;
  if (h.length === 8) a = parseInt(h.substring(6, 8), 16);
  return { r, g, b, a };
}

function rgbaStr(hex: string, alpha?: number) {
  const { r, g, b } = hexToRgb(hex);
  const a = alpha === undefined ? 1 : alpha;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Build a .ico file with PNG-compressed images (widely supported)
async function buildIcoFromPngs(
  pngBlobs: { size: number; blob: Blob }[]
): Promise<Blob> {
  // ICO file structure:
  // ICONDIR (6 bytes) + N * ICONDIRENTRY (16 bytes) + concatenated images
  // For PNG-compressed entries, bytesInRes is PNG length; image offset points into blob.

  // Sort ascending sizes
  const items = [...pngBlobs].sort((a, b) => a.size - b.size);
  const encoders = await Promise.all(
    items.map(async (it) => ({
      size: it.size,
      buf: new Uint8Array(await it.blob.arrayBuffer()),
    }))
  );

  const count = encoders.length;
  const headerSize = 6 + count * 16;
  const totalImageBytes = encoders.reduce((acc, x) => acc + x.buf.length, 0);
  const icoBuffer = new ArrayBuffer(headerSize + totalImageBytes);
  const view = new DataView(icoBuffer);
  const u8 = new Uint8Array(icoBuffer);

  // ICONDIR
  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type: 1 = icon
  view.setUint16(4, count, true);

  // Directory entries
  let offset = headerSize;
  encoders.forEach((img, i) => {
    const entryPos = 6 + i * 16;
    const w = img.size >= 256 ? 0 : img.size; // 0 denotes 256 in ICO
    const h = img.size >= 256 ? 0 : img.size;
    u8[entryPos + 0] = w; // width
    u8[entryPos + 1] = h; // height
    u8[entryPos + 2] = 0; // color count (0 = PNG truecolor)
    u8[entryPos + 3] = 0; // reserved
    view.setUint16(entryPos + 4, 1, true); // planes
    view.setUint16(entryPos + 6, 32, true); // bit count (informational)
    view.setUint32(entryPos + 8, img.buf.length, true); // bytesInRes
    view.setUint32(entryPos + 12, offset, true); // image offset
    u8.set(img.buf, offset);
    offset += img.buf.length;
  });

  return new Blob([icoBuffer], { type: "image/x-icon" });
}

// ---------- Canvas renderer

function drawIcon(
  ctx: CanvasRenderingContext2D,
  size: number,
  opts: RenderOptions
) {
  const {
    gradientKind,
    colorA,
    colorB,
    angleDeg,
    shape,
    padding,
    strokeWidth,
    strokeColor,
    glow,
    bgKind,
    bgColor,
  } = opts;

  // Clear
  ctx.clearRect(0, 0, size, size);

  // Background
  if (bgKind === "solid") {
    ctx.fillStyle = rgbaStr(bgColor);
    ctx.fillRect(0, 0, size, size);
  } else if (bgKind === "paper") {
    // subtle paper-like off-white
    const grd = ctx.createLinearGradient(0, 0, size, size);
    grd.addColorStop(0, "#ffffff");
    grd.addColorStop(1, "#f7f7f7");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, size, size);
  }
  // transparent = do nothing

  const pad = Math.round((padding / 100) * (size / 2));
  const inner = size - pad * 2;
  const cx = size / 2;
  const cy = size / 2;

  // Path for shape
  ctx.save();
  ctx.translate(pad, pad);

  const path = new Path2D();
  if (shape === "circle") {
    path.arc(inner / 2, inner / 2, inner / 2, 0, Math.PI * 2);
  } else if (shape === "rounded-square") {
    const r = inner * 0.2;
    const w = inner,
      h = inner;
    path.roundRect(0, 0, w, h, r);
  } else if (shape === "squircle") {
    // superellipse n ~ 4 (smooth iOS-like squircle)
    const n = 4.5;
    const w = inner,
      h = inner;
    const steps = 256;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * 2 * Math.PI;
      const x =
        (w / 2) *
          Math.sign(Math.cos(t)) *
          Math.pow(Math.abs(Math.cos(t)), 2 / n) +
        w / 2;
      const y =
        (h / 2) *
          Math.sign(Math.sin(t)) *
          Math.pow(Math.abs(Math.sin(t)), 2 / n) +
        h / 2;
      if (i === 0) (path as any).moveTo(x, y);
      else (path as any).lineTo(x, y);
    }
    (path as any).closePath?.();
  }

  // Glow
  if (glow) {
    const glowRadius = inner * 0.18;
    const grad = ctx.createRadialGradient(
      cx,
      cy,
      inner * 0.2,
      cx,
      cy,
      inner * 0.75
    );
    grad.addColorStop(0, rgbaStr(colorA, 0.35));
    grad.addColorStop(1, rgbaStr(colorB, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }

  // Gradient fill
  let fill: CanvasGradient | string = colorA;
  if (gradientKind === "linear") {
    const rad = (angleDeg * Math.PI) / 180;
    const dx = Math.cos(rad),
      dy = Math.sin(rad);
    const hx = inner / 2,
      hy = inner / 2;
    const x1 = inner / 2 - hx * dx - hy * dy;
    const y1 = inner / 2 - hx * dy + hy * dx;
    const x2 = inner / 2 + hx * dx + hy * dy;
    const y2 = inner / 2 + hx * dy - hy * dx;
    fill = ctx.createLinearGradient(x1, y1, x2, y2);
    (fill as CanvasGradient).addColorStop(0, colorA);
    (fill as CanvasGradient).addColorStop(1, colorB);
  } else if (gradientKind === "radial") {
    const grad = ctx.createRadialGradient(
      inner / 2,
      inner / 2,
      0,
      inner / 2,
      inner / 2,
      inner / 2
    );
    grad.addColorStop(0, colorA);
    grad.addColorStop(1, colorB);
    fill = grad;
  } else if (gradientKind === "conic") {
    // Fake conic by drawing many arcs
    const steps = 360;
    const r = inner / 2;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const ang = ((angleDeg + i) * Math.PI) / 180;
      const col = `linear-gradient(${t})`;
      // Interpolate color manually
      const a = hexToRgb(colorA),
        b = hexToRgb(colorB);
      const rr = Math.round(a.r + (b.r - a.r) * t);
      const gg = Math.round(a.g + (b.g - a.g) * t);
      const bb = Math.round(a.b + (b.b - a.b) * t);
      ctx.beginPath();
      ctx.moveTo(inner / 2, inner / 2);
      ctx.arc(inner / 2, inner / 2, r, ang, ang + (2 * Math.PI) / steps);
      ctx.closePath();
      ctx.fillStyle = `rgb(${rr}, ${gg}, ${bb})`;
      ctx.fill();
    }
  }

  if (gradientKind !== "conic") {
    ctx.fillStyle = fill as CanvasGradient;
    ctx.save();
    ctx.clip(path);
    ctx.fillRect(0, 0, inner, inner);
    ctx.restore();
  } else {
    // conic already drew within inner bounds; clip to shape
    ctx.save();
    ctx.globalCompositeOperation = "destination-in";
    ctx.fill(path);
    ctx.restore();
  }

  // Stroke
  if (strokeWidth > 0) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = (strokeWidth / 1024) * inner; // scale relative to 1024 design
    ctx.stroke(path);
  }

  ctx.restore();
}

// ---------- Main Component

type RenderOptions = {
  gradientKind: GradientKind;
  colorA: string;
  colorB: string;
  angleDeg: number;
  shape: ShapeKind;
  padding: number; // percent of half-size
  strokeWidth: number; // px at 1024 base
  strokeColor: string;
  glow: boolean;
  bgKind: BgKind;
  bgColor: string;
};

const DEFAULTS: RenderOptions = {
  gradientKind: "linear",
  colorA: "#0ea5ff", // blue
  colorB: "#22c55e", // green
  angleDeg: 110,
  shape: "circle",
  padding: 6,
  strokeWidth: 6,
  strokeColor: "#00000010",
  glow: false,
  bgKind: "transparent",
  bgColor: "#ffffff",
};

const PRESET_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024] as const;

const RECOMMENDED_PNG = [16, 32, 48, 180, 192, 256, 512]; // favicon + apple + PWA
const ICO_SIZES = [16, 32, 48, 64, 128, 256];

export default function FaviconGenerator() {
  const [opts, setOpts] = useState<RenderOptions>(() => DEFAULTS);
  const [sizes, setSizes] = useState<number[]>([16, 32, 48, 64, 128, 256]);
  const [filename, setFilename] = useState("favicon");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderSize = 1024;

  // Render on main canvas
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = renderSize;
    c.height = renderSize;
    const ctx = c.getContext("2d")!;
    drawIcon(ctx, renderSize, opts);
  }, [opts]);

  async function exportPng(size: number) {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d")!;
    drawIcon(ctx, size, opts);
    const blob = await new Promise<Blob | null>((res) =>
      c.toBlob(res, "image/png")
    );
    if (blob) downloadBlob(blob, `${filename}-${size}.png`);
  }

  async function exportAllPngs() {
    for (const s of sizes) await exportPng(s);
  }

  async function exportIco() {
    const pngs: { size: number; blob: Blob }[] = [];
    for (const s of sizes) {
      const c = document.createElement("canvas");
      c.width = s;
      c.height = s;
      const ctx = c.getContext("2d")!;
      drawIcon(ctx, s, opts);
      const blob = await new Promise<Blob | null>((res) =>
        c.toBlob(res, "image/png")
      );
      if (blob) pngs.push({ size: s, blob });
    }
    const ico = await buildIcoFromPngs(pngs);
    downloadBlob(ico, `${filename}.ico`);
  }

  async function exportRecommendedZip() {
    const zip = new JSZip();

    // PNG set
    for (const s of RECOMMENDED_PNG) {
      const c = document.createElement("canvas");
      c.width = s;
      c.height = s;
      const ctx = c.getContext("2d")!;
      drawIcon(ctx, s, opts);
      const blob = await new Promise<Blob | null>((res) =>
        c.toBlob(res, "image/png")
      );
      if (blob) zip.file(`${filename}-${s}.png`, blob);
    }

    // ICO bundle
    const pngs: { size: number; blob: Blob }[] = [];
    for (const s of ICO_SIZES) {
      const c = document.createElement("canvas");
      c.width = s;
      c.height = s;
      const ctx = c.getContext("2d")!;
      drawIcon(ctx, s, opts);
      const blob = await new Promise<Blob | null>((res) =>
        c.toBlob(res, "image/png")
      );
      if (blob) pngs.push({ size: s, blob });
    }
    const ico = await buildIcoFromPngs(pngs);
    zip.file(`${filename}.ico`, ico);

    const out = await zip.generateAsync({ type: "blob" });
    downloadBlob(out, `${filename}-favicon-pack.zip`);
  }

  function randomize() {
    const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
    const colorA = pick(TW_COLORS).hex;
    let colorB = pick(TW_COLORS).hex;
    if (colorB === colorA)
      colorB = pick(TW_COLORS.filter((c) => c.hex !== colorA)).hex;

    setOpts({
      ...opts,
      gradientKind: pick(["linear", "radial", "conic"] as const),
      colorA,
      colorB,
      angleDeg: Math.floor(Math.random() * 360),
      shape: pick(["circle", "rounded-square", "squircle"] as const),
      padding: Math.floor(Math.random() * 16),
      strokeWidth: Math.floor(Math.random() * 12),
      strokeColor: `${pick(TW_COLORS).hex}22`,
      glow: Math.random() > 0.5,
      bgKind: pick(["transparent", "solid", "paper"] as const),
      bgColor: pick(TW_COLORS).hex,
    });
  }

  function ControlLabel({ children }: { children: React.ReactNode }) {
    return (
      <label className="text-xs font-medium text-neutral-600 uppercase tracking-wide">
        {children}
      </label>
    );
  }

  return (
    <div className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-2 bg-neutral-50 text-neutral-900">
      {/* Left: Preview */}
      <div className="relative flex items-center justify-center p-8 lg:p-12 bg-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.03),transparent_60%)]" />
        <div className="relative w-full max-w-[720px] aspect-square rounded-3xl shadow-sm ring-1 ring-black/5 bg-neutral-100">
          <canvas ref={canvasRef} className="w-full h-full rounded-3xl" />
        </div>
        {/* Export CTA */}
        <div className="hidden lg:flex flex-col gap-2 absolute bottom-8 left-1/2 -translate-x-1/2">
          <div className="flex gap-2">
            <button
              onClick={exportIco}
              className="px-4 py-2 rounded-xl bg-black text-white hover:opacity-90"
            >
              Download .ico
            </button>
            <button
              onClick={exportAllPngs}
              className="px-4 py-2 rounded-xl bg-neutral-800 text-white hover:opacity-90"
            >
              Download PNG set
            </button>
          </div>
          <p className="text-center text-xs text-neutral-500">
            Includes sizes: {sizes.join(", ")}
          </p>
        </div>
      </div>

      {/* Right: Controls */}
      <div className="bg-neutral-50 border-l border-black/5 p-6 lg:p-10">
        <div className="max-w-xl mx-auto space-y-8">
          <header>
            <h1 className="text-2xl font-semibold tracking-tight">
              Favicon Studio
            </h1>
            <p className="text-neutral-600 mt-1">
              Design crisp gradient favicons, export as multi‑size PNGs and ICO.
            </p>
          </header>

          {/* File base name */}
          <div className="space-y-2">
            <ControlLabel>File name</ControlLabel>
            <input
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="w-full rounded-xl border border-black/10 px-3 py-2 bg-white"
            />
          </div>

          {/* Colors */}
          <section className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <ControlLabel>Start color</ControlLabel>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={opts.colorA}
                  onChange={(e) => setOpts({ ...opts, colorA: e.target.value })}
                  className="h-10 w-14 rounded-md border border-black/10"
                />
                <input
                  type="text"
                  value={opts.colorA}
                  onChange={(e) => setOpts({ ...opts, colorA: e.target.value })}
                  className="flex-1 rounded-xl border border-black/10 px-3 py-2 bg-white"
                />
              </div>
            </div>
            <div className="space-y-2">
              <ControlLabel>End color</ControlLabel>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={opts.colorB}
                  onChange={(e) => setOpts({ ...opts, colorB: e.target.value })}
                  className="h-10 w-14 rounded-md border border-black/10"
                />
                <input
                  type="text"
                  value={opts.colorB}
                  onChange={(e) => setOpts({ ...opts, colorB: e.target.value })}
                  className="flex-1 rounded-xl border border-black/10 px-3 py-2 bg-white"
                />
              </div>
            </div>
          </section>

          {/* Gradient */}
          <section className="space-y-3">
            <ControlLabel>Gradient</ControlLabel>
            <div className="grid grid-cols-3 gap-2">
              {(["linear", "radial", "conic"] as GradientKind[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setOpts({ ...opts, gradientKind: k })}
                  className={`px-3 py-2 rounded-xl border text-sm ${
                    opts.gradientKind === k
                      ? "border-black bg-white"
                      : "border-black/10 bg-white hover:border-black/20"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
            {opts.gradientKind !== "radial" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-neutral-600">
                    Angle: {opts.angleDeg}°
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={360}
                  value={opts.angleDeg}
                  onChange={(e) =>
                    setOpts({ ...opts, angleDeg: parseInt(e.target.value, 10) })
                  }
                  className="w-full"
                />
              </div>
            )}
          </section>

          {/* Shape */}
          <section className="space-y-3">
            <ControlLabel>Shape</ControlLabel>
            <div className="grid grid-cols-3 gap-2">
              {(["circle", "rounded-square", "squircle"] as ShapeKind[]).map(
                (s) => (
                  <button
                    key={s}
                    onClick={() => setOpts({ ...opts, shape: s })}
                    className={`px-3 py-2 rounded-xl border text-sm ${
                      opts.shape === s
                        ? "border-black bg-white"
                        : "border-black/10 bg-white hover:border-black/20"
                    }`}
                  >
                    {s.replace("-", " ")}
                  </button>
                )
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-600">
                  Padding: {opts.padding}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={20}
                value={opts.padding}
                onChange={(e) =>
                  setOpts({ ...opts, padding: parseInt(e.target.value, 10) })
                }
                className="w-full"
              />
            </div>
          </section>

          {/* Stroke & Glow */}
          <section className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <ControlLabel>Stroke (subtle rim)</ControlLabel>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={20}
                  value={opts.strokeWidth}
                  onChange={(e) =>
                    setOpts({
                      ...opts,
                      strokeWidth: parseInt(e.target.value, 10),
                    })
                  }
                  className="flex-1"
                />
                <input
                  type="color"
                  value={opts.strokeColor}
                  onChange={(e) =>
                    setOpts({ ...opts, strokeColor: e.target.value })
                  }
                  className="h-10 w-14 rounded-md border border-black/10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <ControlLabel>Glow</ControlLabel>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setOpts({ ...opts, glow: !opts.glow })}
                  className={`px-3 py-2 rounded-xl border text-sm ${
                    opts.glow
                      ? "border-black bg-white"
                      : "border-black/10 bg-white hover:border-black/20"
                  }`}
                >
                  {opts.glow ? "On" : "Off"}
                </button>
                <span className="text-sm text-neutral-500">
                  Adds soft ambient halo
                </span>
              </div>
            </div>
          </section>

          {/* Background */}
          <section className="space-y-3">
            <ControlLabel>Background</ControlLabel>
            <div className="grid grid-cols-3 gap-2">
              {(["transparent", "solid", "paper"] as BgKind[]).map((b) => (
                <button
                  key={b}
                  onClick={() => setOpts({ ...opts, bgKind: b })}
                  className={`px-3 py-2 rounded-xl border text-sm ${
                    opts.bgKind === b
                      ? "border-black bg-white"
                      : "border-black/10 bg-white hover:border-black/20"
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
            {opts.bgKind === "solid" && (
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={opts.bgColor}
                  onChange={(e) =>
                    setOpts({ ...opts, bgColor: e.target.value })
                  }
                  className="h-10 w-14 rounded-md border border-black/10"
                />
                <input
                  type="text"
                  value={opts.bgColor}
                  onChange={(e) =>
                    setOpts({ ...opts, bgColor: e.target.value })
                  }
                  className="flex-1 rounded-xl border border-black/10 px-3 py-2 bg-white"
                />
              </div>
            )}
          </section>

          {/* Sizes */}
          <section className="space-y-3">
            <ControlLabel>Export sizes</ControlLabel>
            <div className="flex flex-wrap gap-2">
              {PRESET_SIZES.map((s) => {
                const active = sizes.includes(s);
                return (
                  <button
                    key={s}
                    onClick={() =>
                      setSizes((cur) =>
                        (cur.includes(s)
                          ? cur.filter((x) => x !== s)
                          : [...cur, s]
                        ).sort((a, b) => a - b)
                      )
                    }
                    className={`px-3 py-1.5 rounded-full border text-sm ${
                      active
                        ? "border-black bg-white"
                        : "border-black/10 bg-white hover:border-black/20"
                    }`}
                  >
                    {s}px
                  </button>
                );
              })}
            </div>
          </section>

          {/* Actions (mobile & desktop duplicate) */}
          <section className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={exportRecommendedZip}
              className="px-4 py-2 rounded-xl bg-black text-white hover:opacity-90 inline-flex items-center gap-2"
            >
              <Icon.Download />
              <span>Download (Recommended)</span>
            </button>
            <button
              onClick={() => exportIco()}
              className="px-4 py-2 rounded-xl bg-neutral-900 text-white hover:opacity-90 inline-flex items-center gap-2"
            >
              <Icon.Download />
              <span>.ico only</span>
            </button>
            <button
              onClick={exportAllPngs}
              className="px-4 py-2 rounded-xl bg-neutral-800 text-white hover:opacity-90 inline-flex items-center gap-2"
            >
              <Icon.Download />
              <span>PNG set</span>
            </button>
            <button
              onClick={randomize}
              className="px-4 py-2 rounded-xl border border-black/10 bg-white hover:border-black/20 inline-flex items-center gap-2"
            >
              <ArrowPathIcon className="size-5" />
              <span>Random</span>
            </button>
          </section>

          {/* Tailwind color presets */}
          <section className="space-y-3">
            <label className="text-xs font-medium text-neutral-600 uppercase tracking-wide flex items-center gap-2">
              Tailwind v4 colors
            </label>
            <div className="flex flex-wrap gap-2">
              {TW_COLORS.map((c) => (
                <button
                  key={c.name}
                  title={`${c.name} ${c.hex}`}
                  onClick={(e) => {
                    if (e.shiftKey)
                      setOpts({
                        ...opts,
                        colorB: c.hex,
                      });
                    // shift+click sets end
                    else setOpts({ ...opts, colorA: c.hex }); // click sets start
                  }}
                  className="w-8 h-8 rounded-full ring-1 ring-black/10"
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>
            <p className="text-xs text-neutral-500">
              Click = start color · Shift+Click = end color.
            </p>
          </section>

          {/* Tips */}
          <section className="text-xs text-neutral-500 space-y-1">
            <p>
              Pro tip: try radial gradient + squircle + slight stroke for
              iOS‑style icons.
            </p>
            <p>
              This tool embeds PNGs inside the .ico for crisp results on Windows
              and browsers.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
