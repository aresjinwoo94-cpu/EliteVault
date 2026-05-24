/**
 * End-to-end Gemini smoke test:
 *   1. Connectivity (free-form prompt)
 *   2. Structured analyzer run against a real screenshot
 */
import { GoogleGenAI, Type } from "@google/genai";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(__dirname, "..", ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

if (!env.GEMINI_API_KEY) {
  console.error("✗ GEMINI_API_KEY not set");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

console.log("=== 1) Connectivity (Flash) ===");
const ping = await ai.models.generateContent({
  model: env.GEMINI_MODEL_FAST ?? "gemini-2.5-flash",
  contents: "Reply with exactly the word: pong",
});
console.log("Response:", ping.text?.trim());
console.log(ping.text?.trim()?.toLowerCase().includes("pong") ? "✓ connectivity" : "✗ unexpected response");

console.log("\n=== 2) Structured JSON (force schema) ===");
const structured = await ai.models.generateContent({
  model: env.GEMINI_MODEL_FAST ?? "gemini-2.5-flash",
  contents:
    "List 3 well-known DTC ecommerce stores with their niche. Return JSON.",
  config: {
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        stores: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              niche: { type: Type.STRING },
            },
            required: ["name", "niche"],
          },
        },
      },
      required: ["stores"],
    },
  },
});
const parsed = JSON.parse(structured.text);
console.log("✓ Got valid JSON with", parsed.stores?.length, "stores");
console.log(parsed.stores?.slice(0, 3));

console.log("\n=== 3) Vision: fetch + analyze a real screenshot ===");
const screenshotRes = await fetch(
  "https://s.wordpress.com/mshots/v1/https%3A%2F%2Fwww.allbirds.com?w=1280&h=800",
);
if (!screenshotRes.ok) {
  console.error("✗ Could not fetch reference screenshot");
  process.exit(0); // not a Gemini failure, skip
}
const buf = Buffer.from(await screenshotRes.arrayBuffer());
console.log(`Got screenshot: ${(buf.length / 1024).toFixed(1)} KB`);

const vision = await ai.models.generateContent({
  model: env.GEMINI_MODEL_FAST ?? "gemini-2.5-flash",
  contents: [
    {
      role: "user",
      parts: [
        { inlineData: { mimeType: "image/jpeg", data: buf.toString("base64") } },
        {
          text: "In one short sentence, what is this website selling? Return JSON {\"description\": \"...\"}.",
        },
      ],
    },
  ],
  config: {
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.OBJECT,
      properties: { description: { type: Type.STRING } },
      required: ["description"],
    },
  },
});
console.log("✓ Vision response:");
console.log(" ", JSON.parse(vision.text).description);

console.log("\n🎉 Gemini is fully wired and producing structured output.");
