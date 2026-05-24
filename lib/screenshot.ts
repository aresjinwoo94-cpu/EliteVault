import "server-only";

/**
 * Capture a high-fidelity full-page screenshot of a URL.
 *
 * Uses ScreenshotOne if SCREENSHOTONE_ACCESS_KEY is set; otherwise falls
 * back to a public mshots placeholder (lower quality but no API needed).
 */
export async function captureScreenshot(url: string): Promise<{
  base64: string;
  mediaType: "image/png" | "image/jpeg";
}> {
  const accessKey = process.env.SCREENSHOTONE_ACCESS_KEY;
  if (accessKey) {
    const params = new URLSearchParams({
      access_key: accessKey,
      url,
      viewport_width: "1440",
      viewport_height: "900",
      device_scale_factor: "2",
      format: "jpg",
      image_quality: "92",
      full_page: "true",
      block_ads: "true",
      block_cookie_banners: "true",
      cache: "true",
      cache_ttl: "86400",
    });
    const res = await fetch(`https://api.screenshotone.com/take?${params}`);
    if (!res.ok) {
      throw new Error(`Screenshot service failed: ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { base64: buf.toString("base64"), mediaType: "image/jpeg" };
  }

  // Free fallback — Wordpress.com mshots. Lower fidelity but works.
  const mshotUrl = `https://s.wordpress.com/mshots/v1/${encodeURIComponent(
    url,
  )}?w=1440&h=900`;
  // mshots may return a 'generating' placeholder on first hit — retry a few times
  for (let i = 0; i < 3; i++) {
    const res = await fetch(mshotUrl);
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 5000) {
        const contentType = res.headers.get("content-type") ?? "image/jpeg";
        return {
          base64: buf.toString("base64"),
          mediaType: contentType.includes("png") ? "image/png" : "image/jpeg",
        };
      }
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error("Screenshot fallback failed after 3 retries");
}
