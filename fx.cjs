const fs=require("fs");const p="scripts/tests/library-card-l3.test.ts";let s=fs.readFileSync(p,"utf8");
const r=(a,b)=>{if(!s.includes(a))throw new Error(a);s=s.split(a).join(b)};
r('toCardPayload\(raw as unknown as Record<string, unknown>\)','toCardPayload\(r\)');
r('relative z-10 flex shrink-0 items-center gap-1[','relative z-10 flex shrink-0 items-center gap-3[');
r('["SecretBrand", "secretbrand", "teardown", "ctr"]','["SecretBrand", "secretbrand", "hero", "stuff"]');
fs.writeFileSync(p,s);
