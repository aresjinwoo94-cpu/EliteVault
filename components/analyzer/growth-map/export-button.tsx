"use client";

import { useState } from "react";
import { Download, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Export the map as a branded PNG (spec §8). Best-effort, client-only:
 * serializes the live SVG, rasterizes it at 2×, then stamps — below the map —
 * the store's rank + its diagnosis feedback, and the EliteVault watermark. So a
 * shared image carries the verdict, not just the picture. Any failure is
 * swallowed (never throws into the report).
 */
export function ExportButton({
  getSvg,
  domain,
  title,
  body,
}: {
  getSvg: () => SVGSVGElement | null;
  domain: string | null;
  /** e.g. "Your store · Steel · Traction" */
  title?: string;
  /** the current-rank diagnosis to bake into the export */
  body?: string;
}) {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onExport() {
    const svg = getSvg();
    if (!svg || busy) return;
    setBusy(true);
    try {
      const clone = svg.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      const vb = (svg.getAttribute("viewBox") ?? "0 0 1120 210")
        .split(" ")
        .map(Number);
      const w = vb[2] || 1120;
      const h = vb[3] || 210;
      const scale = 2;
      const pad = 26;

      const xml = new XMLSerializer().serializeToString(clone);
      const svg64 = `data:image/svg+xml;base64,${btoa(
        unescape(encodeURIComponent(xml)),
      )}`;

      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("svg load failed"));
        img.src = svg64;
      });

      // ── Measure the wrapped feedback text first (a throwaway ctx) ──
      const measure = document.createElement("canvas").getContext("2d")!;
      const bodyFont = "13px system-ui, -apple-system, Segoe UI, sans-serif";
      const titleFont =
        "600 15px system-ui, -apple-system, Segoe UI, sans-serif";
      const wrap = (text: string, maxWidth: number) => {
        measure.font = bodyFont;
        const words = text.split(/\s+/);
        const lines: string[] = [];
        let line = "";
        for (const word of words) {
          const test = line ? `${line} ${word}` : word;
          if (measure.measureText(test).width > maxWidth && line) {
            lines.push(line);
            line = word;
          } else {
            line = test;
          }
        }
        if (line) lines.push(line);
        return lines;
      };

      const hasText = Boolean(title || body);
      const bodyLines = body ? wrap(body, w) : [];
      const titleH = title ? 22 : 0;
      const bodyH = bodyLines.length * 19;
      const textBlockH = hasText ? titleH + bodyH + 14 : 0;
      const footerH = 34;

      const cssW = w + pad * 2;
      const cssH = pad + h + textBlockH + footerH + pad;

      const canvas = document.createElement("canvas");
      canvas.width = cssW * scale;
      canvas.height = cssH * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      ctx.scale(scale, scale);

      // Background
      ctx.fillStyle = "#0A0A0F";
      ctx.fillRect(0, 0, cssW, cssH);
      // Map
      ctx.drawImage(img, pad, pad, w, h);

      let y = pad + h + 18;

      // Feedback block
      if (title) {
        ctx.font = titleFont;
        ctx.fillStyle = "#2DD4BF";
        ctx.fillText(title, pad, y);
        y += titleH;
      }
      if (bodyLines.length) {
        ctx.font = bodyFont;
        ctx.fillStyle = "rgba(255,255,255,0.82)";
        for (const line of bodyLines) {
          ctx.fillText(line, pad, y);
          y += 19;
        }
      }

      // Watermark / attribution
      const wy = cssH - pad + 2;
      ctx.font =
        "600 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillStyle = "#2DD4BF";
      ctx.fillText("EliteVault Growth Map™", pad, wy);
      ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      const attribution = domain
        ? `${domain} · elitevaultapp.com`
        : "elitevaultapp.com";
      const tw = ctx.measureText(attribution).width;
      ctx.fillText(attribution, cssW - pad - tw, wy);

      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `growth-map${domain ? `-${domain.replace(/[^a-z0-9]/gi, "-")}` : ""}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {
      /* best-effort export — ignore */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={onExport} disabled={busy}>
      {done ? <Check className="size-3.5" /> : <Download className="size-3.5" />}
      {done ? "Saved" : "Export (branded)"}
    </Button>
  );
}
