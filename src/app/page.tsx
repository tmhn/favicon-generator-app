"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  ArrowDownTrayIcon,
  SparklesIcon,
  ArrowPathIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";
import JSZip from "jszip";

// ---------- Types

type GradientKind = "linear" | "radial" | "conic";
type ShapeKind = "circle" | "rounded-square" | "squircle";
type BgKind = "transparent" | "solid" | "paper";

// ---------- Utilities

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

async function buildIcoFromPngs(
  pngBlobs: { size: number; blob: Blob }[]
): Promise<Blob> {
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

  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, count, true);

  let offset = headerSize;
  encoders.forEach((img, i) => {
    const entryPos = 6 + i * 16;
    const w = img.size >= 256 ? 0 : img.size;
    const h = img.size >= 256 ? 0 : img.size;
    u8[entryPos + 0] = w;
    u8[entryPos + 1] = h;
    u8[entryPos + 2] = 0;
    u8[entryPos + 3] = 0;
    view.setUint16(entryPos + 4, 1, true);
    view.setUint16(entryPos + 6, 32, true);
    view.setUint32(entryPos + 8, img.buf.length, true);
    view.setUint32(entryPos + 12, offset, true);
    u8.set(img.buf, offset);
    offset += img.buf.length;
  });

  return new Blob([icoBuffer], { type: "image/x-icon" });
}

// ---------- Tailwind v4 Colors (subset)
const TAILWIND_COLORS = [
  "#0ea5e9", // sky-500
  "#22c55e", // green-500
  "#ef4444", // red-500
  "#f59e0b", // amber-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
  "#14b8a6", // teal-500
  "#6366f1", // indigo-500
];

// ---------- Canvas renderer (same as before)
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

  // clear
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, size, size);

  // background
  if (bgKind === "solid") {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, size, size);
  } else if (bgKind === "paper") {
    const g = ctx.createLinearGradient(0, 0, size, size);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(1, "#f5f5f5");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }

  const pad = Math.round((padding / 100) * (size / 2));
  const inner = size - pad * 2;

  ctx.save();
  ctx.translate(pad, pad);

  // build path
  const path = new Path2D();
  if (shape === "circle") {
    path.arc(inner / 2, inner / 2, inner / 2, 0, Math.PI * 2);
  } else if (shape === "rounded-square") {
    const r = inner * 0.2;
    (
      path as Path2D & {
        roundRect?: (
          x: number,
          y: number,
          w: number,
          h: number,
          r: number
        ) => void;
      }
    ).roundRect?.(0, 0, inner, inner, r);
    // Use a type assertion to extend Path2D with roundRect and closePath if available
    type Path2DExt = Path2D & {
      roundRect?: (
        x: number,
        y: number,
        w: number,
        h: number,
        r: number
      ) => void;
      closePath?: () => void;
    };
    const extPath = path as Path2DExt;
    if (!extPath.roundRect) {
      // fallback
      const rr = r;
      const w = inner;
      const h = inner;
      extPath.moveTo(rr, 0);
      extPath.lineTo(w - rr, 0);
      extPath.arc(w - rr, rr, rr, -Math.PI / 2, 0);
      extPath.lineTo(w, h - rr);
      extPath.arc(w - rr, h - rr, rr, 0, Math.PI / 2);
      extPath.lineTo(rr, h);
      extPath.arc(rr, h - rr, rr, Math.PI / 2, Math.PI);
      extPath.lineTo(0, rr);
      extPath.arc(rr, rr, rr, Math.PI, (3 * Math.PI) / 2);
      extPath.closePath?.();
    }
  } else if (shape === "squircle") {
    const n = 4.5; // superellipse power
    const steps = 256;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * Math.PI * 2;
      const x =
        (inner / 2) *
          Math.sign(Math.cos(t)) *
          Math.pow(Math.abs(Math.cos(t)), 2 / n) +
        inner / 2;
      const y =
        (inner / 2) *
          Math.sign(Math.sin(t)) *
          Math.pow(Math.abs(Math.sin(t)), 2 / n) +
        inner / 2;
      if (i === 0)
        (path as Path2D & { moveTo: (x: number, y: number) => void }).moveTo(
          x,
          y
        );
      else
        (path as Path2D & { lineTo: (x: number, y: number) => void }).lineTo(
          x,
          y
        );
    }
    (path as Path2D & { closePath?: () => void }).closePath?.();
  }

  // ambient glow behind shape
  if (glow) {
    const cx = size / 2;
    const cy = size / 2;
    const grad = ctx.createRadialGradient(
      cx,
      cy,
      inner * 0.15,
      cx,
      cy,
      inner * 0.75
    );
    grad.addColorStop(0, `${colorA}55`);
    grad.addColorStop(1, `${colorB}00`);
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = grad;
    ctx.fillRect(-pad, -pad, size, size);
    ctx.globalCompositeOperation = "source-over";
  }

  // gradient fill clipped to path
  let fill: CanvasGradient | null = null;
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
    fill.addColorStop(0, colorA);
    fill.addColorStop(1, colorB);
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
    // conic fallback: draw many wedges
    const steps = 360;
    const r = inner / 2;
    ctx.save();
    ctx.beginPath();
    ctx.translate(inner / 2, inner / 2);
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const a = (angleDeg + i) * (Math.PI / 180);
      const c1 = hexToRgb(colorA);
      const c2 = hexToRgb(colorB);
      const rr = Math.round(c1.r + (c2.r - c1.r) * t);
      const gg = Math.round(c1.g + (c2.g - c1.g) * t);
      const bb = Math.round(c1.b + (c2.b - c1.b) * t);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, a, a + (2 * Math.PI) / steps);
      ctx.closePath();
      ctx.fillStyle = `rgb(${rr}, ${gg}, ${bb})`;
      ctx.fill();
    }
    // clip result to shape
    ctx.globalCompositeOperation = "destination-in";
    ctx.fill(path);
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
  }

  if (gradientKind !== "conic") {
    ctx.save();
    ctx.clip(path);
    ctx.fillStyle = fill || colorA;
    ctx.fillRect(0, 0, inner, inner);
    ctx.restore();
  }

  // stroke rim
  if (strokeWidth > 0) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = (strokeWidth / 1024) * inner;
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
  padding: number;
  strokeWidth: number;
  strokeColor: string;
  glow: boolean;
  bgKind: BgKind;
  bgColor: string;
};

const DEFAULTS: RenderOptions = {
  gradientKind: "linear",
  colorA: "#0ea5e9",
  colorB: "#22c55e",
  angleDeg: 110,
  shape: "circle",
  padding: 6,
  strokeWidth: 6,
  strokeColor: "#00000010",
  glow: false,
  bgKind: "transparent",
  bgColor: "#ffffff",
};

const RECOMMENDED_SIZES = [16, 32, 48, 64, 128, 256];
const PRESET_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024] as const;

export default function FaviconGenerator() {
  const [opts, setOpts] = useState<RenderOptions>(() => DEFAULTS);
  const [sizes, setSizes] = useState<number[]>(RECOMMENDED_SIZES);
  const [filename, setFilename] = useState("favicon");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderSize = 1024;

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = renderSize;
    c.height = renderSize;
    const ctx = c.getContext("2d")!;
    drawIcon(ctx, renderSize, opts);
  }, [opts]);

  async function exportQuick() {
    const zip = new JSZip();
    for (const s of RECOMMENDED_SIZES) {
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
    const ico = await buildIcoFromPngs(
      await Promise.all(
        RECOMMENDED_SIZES.map(async (s) => {
          const c = document.createElement("canvas");
          c.width = s;
          c.height = s;
          const ctx = c.getContext("2d")!;
          drawIcon(ctx, s, opts);
          const blob = await new Promise<Blob | null>((res) =>
            c.toBlob(res, "image/png")
          );
          return { size: s, blob: blob! };
        })
      )
    );
    zip.file(`${filename}.ico`, ico);

    const zipBlob = await zip.generateAsync({ type: "blob" });
    downloadBlob(zipBlob, `${filename}-favicons.zip`);
  }

  function randomize() {
    const rand = <T,>(arr: T[]): T =>
      arr[Math.floor(Math.random() * arr.length)];
    setOpts({
      gradientKind: rand(["linear", "radial", "conic"]),
      colorA: rand(TAILWIND_COLORS),
      colorB: rand(TAILWIND_COLORS),
      angleDeg: Math.floor(Math.random() * 360),
      shape: rand(["circle", "rounded-square", "squircle"]),
      padding: Math.floor(Math.random() * 15),
      strokeWidth: Math.floor(Math.random() * 10),
      strokeColor: rand(TAILWIND_COLORS),
      glow: Math.random() < 0.5,
      bgKind: rand(["transparent", "solid", "paper"]),
      bgColor: rand(TAILWIND_COLORS),
    });
  }

  function resetDesign() {
    // Reset the design options and export sizes to the recommended set
    setOpts(DEFAULTS);
    setSizes([...RECOMMENDED_SIZES]);
    // If you also want to reset the file base name:
    // setFilename("favicon");
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
      <div className="relative flex items-center justify-center p-8 lg:p-12 bg-white">
        <canvas
          ref={canvasRef}
          className="w-full max-w-[720px] aspect-square rounded-3xl shadow-sm ring-1 ring-black/5 bg-neutral-100"
        />
      </div>

      <div className="bg-neutral-50 border-l border-black/5 p-6 lg:p-10">
        <div className="max-w-xl mx-auto space-y-8">
          <header>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <SparklesIcon className="h-5 w-5" />
              Favicon Studio
            </h1>
            <p className="text-neutral-600 mt-1">
              Quickly design and export favicons in recommended sizes.
            </p>
          </header>

          <div className="space-y-2">
            <ControlLabel>File name</ControlLabel>
            <input
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="w-full rounded-xl border border-black/10 px-3 py-2 bg-white"
            />
          </div>

          <section className="space-y-3">
            <ControlLabel>Tailwind Colors</ControlLabel>
            <div className="flex flex-wrap gap-2">
              {TAILWIND_COLORS.map((c) => (
                <button
                  key={c}
                  title={c}
                  onClick={(e) => {
                    if (e.shiftKey) setOpts({ ...opts, colorB: c });
                    else setOpts({ ...opts, colorA: c });
                  }}
                  style={{ background: c }}
                  className="w-8 h-8 rounded-full ring-1 ring-black/10 hover:cursor-pointer"
                />
              ))}
            </div>
            <p className="text-xs text-neutral-500">
              Click = start • Shift+click = end
            </p>

            {/* Collapsible advanced panel */}
            <details className="group rounded-xl border border-black/10 bg-white open:shadow-sm">
              <summary className="cursor-pointer select-none px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-medium">More options</span>
                <ChevronDownIcon className="h-4 w-4 transition-transform group-open:rotate-180" />
              </summary>
              <div className="px-4 pb-4 pt-0 space-y-6">
                {/* Custom colors */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <ControlLabel>Start color</ControlLabel>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={opts.colorA}
                        onChange={(e) =>
                          setOpts({ ...opts, colorA: e.target.value })
                        }
                        className="h-10 w-14 rounded-md border border-black/10"
                      />
                      <input
                        type="text"
                        value={opts.colorA}
                        onChange={(e) =>
                          setOpts({ ...opts, colorA: e.target.value })
                        }
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
                        onChange={(e) =>
                          setOpts({ ...opts, colorB: e.target.value })
                        }
                        className="h-10 w-14 rounded-md border border-black/10"
                      />
                      <input
                        type="text"
                        value={opts.colorB}
                        onChange={(e) =>
                          setOpts({ ...opts, colorB: e.target.value })
                        }
                        className="flex-1 rounded-xl border border-black/10 px-3 py-2 bg-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Gradient kind + angle */}
                <div className="space-y-3">
                  <ControlLabel>Gradient</ControlLabel>
                  <div className="grid grid-cols-3 gap-2">
                    {(["linear", "radial", "conic"] as GradientKind[]).map(
                      (k) => (
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
                      )
                    )}
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
                          setOpts({
                            ...opts,
                            angleDeg: parseInt(e.target.value, 10),
                          })
                        }
                        className="w-full"
                      />
                    </div>
                  )}
                </div>

                {/* Shape & padding */}
                <div className="space-y-3">
                  <ControlLabel>Shape & padding</ControlLabel>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      ["circle", "rounded-square", "squircle"] as ShapeKind[]
                    ).map((s) => (
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
                    ))}
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
                        setOpts({
                          ...opts,
                          padding: parseInt(e.target.value, 10),
                        })
                      }
                      className="w-full"
                    />
                  </div>
                </div>

                {/* Stroke & glow */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <ControlLabel>Stroke (rim)</ControlLabel>
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
                    <div>
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
                    </div>
                  </div>
                </div>

                {/* Background */}
                <div className="space-y-3">
                  <ControlLabel>Background</ControlLabel>
                  <div className="grid grid-cols-3 gap-2">
                    {(["transparent", "solid", "paper"] as BgKind[]).map(
                      (b) => (
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
                      )
                    )}
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
                </div>
              </div>
            </details>
          </section>

          <section className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={exportQuick}
              className="px-4 py-2 rounded-xl bg-black text-white flex items-center gap-2 hover:opacity-90 hover:cursor-pointer"
            >
              <ArrowDownTrayIcon className="h-4 w-4" />
              Quick Download
            </button>
            <button
              onClick={randomize}
              className="px-4 py-2 rounded-xl bg-pink-600 text-white flex items-center gap-2 hover:opacity-90 hover:cursor-pointer"
            >
              <ArrowPathIcon className="h-4 w-4" />
              Random
            </button>
            <button
              onClick={resetDesign}
              className="px-4 py-2 rounded-xl border border-black/10 bg-white hover:border-black/20 inline-flex items-center gap-2 hover:cursor-pointer"
            >
              <ArrowPathIcon className="h-5 w-5" />
              <span>Reset</span>
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
