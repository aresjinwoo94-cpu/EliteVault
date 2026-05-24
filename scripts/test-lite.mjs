import { GoogleGenAI, Type } from "@google/genai";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l && !l.startsWith("#") && l.includes("=")).map(l=>[l.slice(0,l.indexOf("=")).trim(), l.slice(l.indexOf("=")+1).trim()]));
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
const model = env.GEMINI_MODEL;
console.log(`Testing ${model}…`);
const r = await fetch("https://s.wordpress.com/mshots/v1/https%3A%2F%2Fwww.allbirds.com?w=640&h=400");
const buf = Buffer.from(await r.arrayBuffer());
const t0 = Date.now();
const res = await ai.models.generateContent({
  model,
  contents: [{ role: "user", parts: [
    { inlineData: { mimeType: "image/jpeg", data: buf.toString("base64") } },
    { text: "Score this homepage 0-100. Return JSON {score:number, why:string}." }
  ]}],
  config: { responseMimeType: "application/json", responseSchema: { type: Type.OBJECT, properties:{score:{type:Type.NUMBER},why:{type:Type.STRING}}, required:["score","why"] } },
});
const dt = ((Date.now()-t0)/1000).toFixed(1);
console.log(`✓ ${dt}s — ${res.text}`);
