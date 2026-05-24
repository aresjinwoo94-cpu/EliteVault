import { GoogleGenAI, Type } from "@google/genai";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l && !l.startsWith("#") && l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")).trim(), l.slice(l.indexOf("=")+1).trim()]));
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
const model = env.GEMINI_MODEL;
console.log(`Model: ${model}`);

console.log("Fetching screenshot of allbirds.com…");
const r = await fetch("https://s.wordpress.com/mshots/v1/https%3A%2F%2Fwww.allbirds.com?w=1280&h=800");
const buf = Buffer.from(await r.arrayBuffer());
console.log(`Got ${(buf.length/1024).toFixed(1)} KB`);

console.log(`\nRunning analyzer agent on ${model}…`);
const t0 = Date.now();
const res = await ai.models.generateContent({
  model,
  contents: [{ role: "user", parts: [
    { inlineData: { mimeType: "image/jpeg", data: buf.toString("base64") } },
    { text: "Audit this ecommerce screenshot. Return JSON with: { score: 0-100 number, summary: string up to 200 chars, top_issue: string }." }
  ]}],
  config: {
    systemInstruction: "You are a senior CRO + Meta Ads media buyer. Be brutally honest.",
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        score: { type: Type.NUMBER },
        summary: { type: Type.STRING },
        top_issue: { type: Type.STRING },
      },
      required: ["score","summary","top_issue"]
    }
  }
});
const dt = ((Date.now()-t0)/1000).toFixed(1);
const parsed = JSON.parse(res.text);
console.log(`\n✓ Flash responded in ${dt}s`);
console.log(`  score:     ${parsed.score}`);
console.log(`  summary:   ${parsed.summary}`);
console.log(`  top_issue: ${parsed.top_issue}`);
