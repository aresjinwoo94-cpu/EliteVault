"use client";

import { useState } from "react";
import { Download, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Export the map as a branded PNG (spec §8 — "export compartible con
 * watermark/atribución" → brand distribution). Best-effort, client-only:
 * serializes the live SVG, rasterizes it on a canvas at 2×, stamps the
 * EliteVault watermark, and downloads. Any failure is swallowed (no throw into
 * the report).
 */
export function ExportButton({
  getSvg,
  domain,
}: {
  getSvg: () => SVGSVGElement | null;
  domain: string | null;
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
      const vb = (svg.getAttribute("viewBox") ?? "0 0 1000 380")
        .split(" ")
        .map(Number);
      const w = vb[2] || 1000;
      const h = vb[3] || 380;
      const scale = 2;

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

      const pad = 24;
      const footer = 40;
      const canvas = document.createElement("canvas");
      canvas.width = (w + pad * 2) * scale;
      canvas.height = (h + pad * 2 + footer) * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no 2d context");
      ctx.scale(scale, scale);

      // Background (obsidian) + border.
      ctx.fillStyle = "#0A0A0F";
      ctx.fillRect(0, 0, w + pad * 2, h + pad * 2 + footer);
      ctx.drawImage(img, pad, pad, w, h);

      // Watermark / attribution.
      ctx.font =
        "600 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
      ctx.fillStyle = "#2DD4BF";
      ctx.fillText("EliteVault Growth Map™", pad, h + pad + 26);
      ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      const attribution = domain
        ? `${domain} · elitevaultapp.com`
        : "elitevaultapp.com";
      const tw = ctx.measureText(attribution).width;
      ctx.fillText(attribution, w + pad - tw, h + pad + 26);

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
