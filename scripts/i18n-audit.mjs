#!/usr/bin/env node
/**
 * i18n audit — lists user-visible literals that bypass t() in the files the
 * auto-locale brief puts in scope (docs/i18n-checkout-and-auto-locale.md, PR 2).
 *
 *   node scripts/i18n-audit.mjs            # report; exit 1 if anything is left
 *   node scripts/i18n-audit.mjs --json     # machine-readable
 *   node scripts/i18n-audit.mjs --summary  # counts per file only
 *
 * What counts as a literal (parsed with the TypeScript compiler, not regex):
 *   • JSX text                                  <p>Hello world</p>
 *   • string literals inside JSX expressions    {cond ? "Yes" : "No"}
 *   • user-facing attributes                    placeholder, title, alt, aria-label…
 *   • toast.*("…") / throw new Error("…")       what the user ends up reading
 *   • UI-copy properties of object literals     { label: "…", title: "…", cta: "…" }
 *   • `error:` / `message:` strings returned by server actions and API routes
 *
 * Exempt on purpose (not "text"): no letters at all, a single token that is a
 * code identifier / URL / path / CSS class / number+unit, brand names and the
 * short allowlist in scripts/i18n-audit.allow.json (each entry carries a reason).
 * A line can opt out with `// i18n-ignore: <reason>` on it or the line above.
 *
 * Out of scope (stay English by design — the brief): app/blog, the keyword
 * landings, app/docs, app/legal, llms.txt, metadata/OG, emails, and the
 * AI-written report content.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const ROOT = process.cwd();
const args = new Set(process.argv.slice(2));

/** In scope: everything a user reads in the product UI. */
const SCOPE_DIRS = ["app", "components"];
/** Path prefixes (posix, relative to the repo root) that are NOT translated. */
const OUT_OF_SCOPE = [
  "app/blog",
  "app/docs",
  "app/legal",
  "app/convertmate-alternative",
  "app/api/inngest",
  "app/api/admin",
  "app/api/v1",
  "app/api/email",
  "app/llms.txt",
  "app/sitemap",
  "app/robots",
  "app/opengraph-image",
  "app/twitter-image",
  "app/icon",
  "app/s/-/opengraph-image",
  "app/internal-opt-out",
  "app/(app)/app/owner",
  "app/(app)/app/internal",
  "components/admin",
  "components/blog",
  "components/legal",
  // AI-written content & prompt-adjacent code: the analyzer prompt is untouched.
  "components/analyzer/ai-",
];

const allowPath = join(ROOT, "scripts", "i18n-audit.allow.json");
const allow = existsSync(allowPath)
  ? JSON.parse(readFileSync(allowPath, "utf8"))
  : { strings: [], files: [] };
const allowStrings = new Set(allow.strings.map((s) => (typeof s === "string" ? s : s.text)));
const allowFiles = new Set(allow.files.map((s) => (typeof s === "string" ? s : s.path)));

const USER_ATTRS = new Set([
  "placeholder",
  "title",
  "alt",
  "aria-label",
  "aria-description",
  "label",
  "description",
  "helperText",
  "emptyText",
  "tooltip",
  "caption",
  "heading",
  "subheading",
  "buttonLabel",
  "cta",
]);
const UI_PROPS = new Set([
  "label",
  "title",
  "description",
  "desc",
  "text",
  "body",
  "subtitle",
  "subtitleText",
  "heading",
  "cta",
  "caption",
  "tagline",
  "hint",
  "placeholder",
  "tooltip",
  "badge",
  "name",
  "error",
  "message",
  "detail",
  "success",
  "warning",
]);
// Props whose string value is a machine value even though the name is generic.
const MACHINE_PROP_VALUE = /^[a-z0-9_.:/#?&=%@\-\[\]{}()*+,|<>~^$!;\s]*$/;

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (
      /\.tsx$/.test(e) ||
      (/\.ts$/.test(e) && /(^|[\\/])(actions|route)\.ts$/.test(p)) ||
      (/\.ts$/.test(e) && /[\\/]app[\\/]actions[\\/]/.test(p))
    )
      out.push(p);
  }
  return out;
}

const posix = (p) => relative(ROOT, p).split(sep).join("/");
const SEO_FILE = /(^|\/)(opengraph-image|twitter-image|icon|apple-icon|sitemap|robots|manifest)(\.|-|\/)/;
const inScope = (rel) =>
  !SEO_FILE.test(rel) &&
  !OUT_OF_SCOPE.some((o) => rel === o || rel.startsWith(o + "/") || rel.startsWith(o)) &&
  !allowFiles.has(rel);

/** Does this literal read like prose a person would see? */
function looksLikeText(raw, inJsxText = false) {
  const s = raw.replace(/\s+/g, " ").trim();
  if (!s) return false;
  if (!/\p{L}/u.test(s)) return false; // numbers, punctuation, emoji, symbols
  if (allowStrings.has(s)) return false;
  // an i18n key itself (report.handoffAuditToRoadmap) is already translated
  if (/^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9_]+)+$/.test(s)) return false;
  // code samples / HTTP verbs / JSON — technical text, not prose
  if (/^(curl |GET |POST |PUT |DELETE |\{ |<\w+>|npm |npx )/.test(s)) return false;
  // one token that is an identifier / url / path / unit / css class chain
  // (inside JSX text a lowercase word like "requests" IS prose)
  if (!/\s/.test(s) && !(inJsxText && /^[a-z]{2,}[.,:;!?]?$/.test(s))) {
    if (/^(https?:|mailto:|\/|#|\.|@|\{)/.test(s)) return false;
    if (/[/_\\=]|^[a-z][a-zA-Z0-9]*$/.test(s) && !/^[A-Z]/.test(s)) return false; // camelCase / snake / path
    if (/^[a-z0-9-]+$/.test(s)) return false; // kebab / css token
    if (/^\d/.test(s)) return false; // 10x, 3d
    if (s.length <= 2) return false; // "x", "AI"
    if (/^[A-Z0-9_]+$/.test(s)) return false; // CONSTANT, acronyms (CTA, ROAS)
  }
  // a run of tailwind-ish classes
  if (/^([\w:/\[\]().%#!-]+\s)*[\w:/\[\]().%#!-]+$/.test(s) && /(^|\s)(flex|grid|text-|bg-|px-|py-|mt-|mb-|w-|h-|rounded|border|font-|items-|justify-)/.test(s))
    return false;
  return true;
}

function hasIgnore(lines, line) {
  const here = lines[line] ?? "";
  const prev = lines[line - 1] ?? "";
  return /i18n-ignore/.test(here) || /i18n-ignore/.test(prev);
}

const findings = [];
let seen = new Set();

function auditFile(file) {
  const rel = posix(file);
  if (!inScope(rel)) return;
  const src = readFileSync(file, "utf8");
  const lines = src.split(/\r?\n/);
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

  // The component-ish function a node lives in (for tooling that injects a
  // translator hook) and whether the node sits at module level.
  const contextOf = (node) => {
    let comp = null;
    let nearest = null;
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isFunctionLike(p)) {
        nearest ??= p;
        const name =
          (p.name && p.name.getText(sf)) ||
          (ts.isVariableDeclaration(p.parent) && p.parent.name.getText(sf)) ||
          "";
        const isDefault = p.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
        if (/^[A-Z]/.test(name) || isDefault) {
          comp = p;
          break;
        }
      }
    }
    const f = comp ?? nearest;
    return {
      moduleLevel: !f,
      fn: f
        ? {
            name: (f.name && f.name.getText(sf)) || (ts.isVariableDeclaration(f.parent) ? f.parent.name.getText(sf) : "(anonymous)"),
            isAsync: !!f.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword),
            bodyIsBlock: !!f.body && ts.isBlock(f.body),
            bodyStart: f.body && ts.isBlock(f.body) ? f.body.getStart(sf) : null,
            start: f.getStart(sf),
            end: f.getEnd(),
            isComponent: !!comp,
          }
        : null,
    };
  };
  // SEO metadata, JSON-LD and OG images stay in English by design (the brief).
  const inSeoBlock = (node) => {
    for (let p = node.parent; p; p = p.parent) {
      if (ts.isVariableDeclaration(p) && /metadata|jsonld|schema|viewport|^faqs?$/i.test(p.name.getText(sf))) return true;
      if (ts.isFunctionDeclaration(p) && p.name && (/^generate(Metadata|Viewport)$/.test(p.name.text) || /jsonld|schema/i.test(p.name.text))) return true;
    }
    return false;
  };
  seen = new Set();
  const add = (node, kind, text, mode) => {
    if (inSeoBlock(node)) return;
    seen.add(node.getStart(sf));
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    if (hasIgnore(lines, line)) return;
    findings.push({
      file: rel,
      line: line + 1,
      kind,
      text: text.replace(/\s+/g, " ").trim().slice(0, 90),
      full: text,
      mode: mode ?? "expr",
      template: ts.isTemplateExpression(node),
      start: node.getStart(sf),
      end: node.getEnd(),
      ...contextOf(node),
    });
  };

  const inJsxExpression = (node) => {
    for (let p = node.parent; p; p = p.parent) {
      if (p.kind === ts.SyntaxKind.JsxExpression) return true;
      if (
        p.kind === ts.SyntaxKind.Block ||
        p.kind === ts.SyntaxKind.SourceFile ||
        ts.isFunctionLike(p)
      )
        return false;
    }
    return false;
  };

  // Inside a JSX expression a string is text unless it feeds a className/style/key…
  const jsxAttrName = (node) => {
    for (let p = node.parent; p; p = p.parent) {
      if (p.kind === ts.SyntaxKind.JsxAttribute) return p.name.getText(sf);
      if (p.kind === ts.SyntaxKind.JsxElement || p.kind === ts.SyntaxKind.JsxSelfClosingElement || p.kind === ts.SyntaxKind.SourceFile) return null;
    }
    return null;
  };

  const calleeText = (call) => call.expression.getText(sf);

  function visit(node) {
    // <p>Literal text</p>
    if (node.kind === ts.SyntaxKind.JsxText) {
      const t = node.getText(sf);
      const tag = node.parent && ts.isJsxElement(node.parent) ? node.parent.openingElement.tagName.getText(sf) : "";
      // <code>/<kbd>/<pre> hold identifiers and shell commands, not prose.
      if (!/^(code|kbd|pre|samp)$/.test(tag) && looksLikeText(t, true)) add(node, "jsx-text", t, "jsxText");
    }

    // placeholder="…" title="…" aria-label="…"
    if (node.kind === ts.SyntaxKind.JsxAttribute && node.initializer && ts.isStringLiteral(node.initializer)) {
      const name = node.name.getText(sf);
      if (USER_ATTRS.has(name) && looksLikeText(node.initializer.text)) add(node.initializer, `attr:${name}`, node.initializer.text, "attr");
    }

    // items={["PRICING", "FREE DIAGNOSIS"]} — arrays of labels handed to a component
    if (
      ts.isJsxAttribute(node) &&
      node.initializer &&
      ts.isJsxExpression(node.initializer) &&
      node.initializer.expression &&
      ts.isArrayLiteralExpression(node.initializer.expression) &&
      /^(items|labels|options|tags|chips|badges|steps|columns|headings)$/.test(node.name.getText(sf))
    ) {
      for (const el of node.initializer.expression.elements) {
        if ((ts.isStringLiteral(el) || ts.isNoSubstitutionTemplateLiteral(el)) && /\p{L}{2,}/u.test(el.text) && !allowStrings.has(el.text.trim()) && !/^[a-z0-9_-]+$/.test(el.text))
          add(el, `attr-array:${node.name.getText(sf)}`, el.text);
      }
    }

    // {cond ? "A" : "B"}, {"text"}, {`text ${x}`} directly in JSX (not className etc.)
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) &&
      inJsxExpression(node)
    ) {
      const attr = jsxAttrName(node);
      const isAttrValue = attr !== null;
      const text = ts.isTemplateExpression(node)
        ? node.head.text + node.templateSpans.map((s) => " " + s.literal.text).join("")
        : node.text;
      const callParent = node.parent && ts.isCallExpression(node.parent);
      // t("key"), cn("a b"), fill("…")… — string passed to a call is a key/class, skip.
      const argOfCall = callParent && node.parent.arguments.includes(node);
      const isPropKey = node.parent && ts.isElementAccessExpression(node.parent) && node.parent.argumentExpression === node;
      const inIndexOrKey = isPropKey || (node.parent && ts.isPropertyAssignment(node.parent) && node.parent.name === node);
      if (!argOfCall && !inIndexOrKey && !(isAttrValue && !USER_ATTRS.has(attr)) && looksLikeText(text)) {
        // strings compared (=== "x"), used as keys in `in`, etc.
        const p = node.parent;
        const compared = p && ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(p.operatorToken.kind);
        const caseLabel = p && ts.isCaseClause(p);
        if (!compared && !caseLabel) add(node, "jsx-expr", text);
      }
    }

    // toast.error("…") / toast("…")
    if (ts.isCallExpression(node)) {
      const callee = calleeText(node);
      if (/^toast(\.(success|error|info|warning|message|loading))?$/.test(callee)) {
        for (const a of node.arguments) {
          if ((ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) && looksLikeText(a.text)) add(a, "toast", a.text);
          if (ts.isTemplateExpression(a)) add(a, "toast", a.head.text + "${…}");
        }
      }
    }
    // throw new Error("…") — surfaces in UI through catch → toast / error boundary
    if (ts.isNewExpression(node) && node.expression.getText(sf) === "Error" && node.arguments?.length) {
      const a = node.arguments[0];
      if ((ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) && looksLikeText(a.text) && /\s/.test(a.text.trim()) && file.endsWith(".tsx"))
        add(a, "error", a.text);
    }

    // { label: "…", title: "…", error: "…" }
    if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))) {
      const key = node.name.text;
      const v = node.initializer;
      if (UI_PROPS.has(key)) {
        let text = null;
        if (ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v)) text = v.text;
        else if (ts.isTemplateExpression(v)) text = v.head.text + v.templateSpans.map((s) => " " + s.literal.text).join("");
        if (text !== null && looksLikeText(text) && /\s/.test(text.trim()) ) add(v, `prop:${key}`, text);
        // single-word UI props (label: "Pricing") only for the strongest keys
        else if (text !== null && /^(label|title|cta|heading|badge)$/.test(key) && looksLikeText(text) && /^[A-Z][a-z]{2,}/.test(text.trim())) add(v, `prop:${key}`, text);
      }
    }

    // Prose anywhere else in a component/action file: returned from helpers,
    // in arrays, constants, object values… — a string of 3+ words that starts
    // with a capital reads as copy. (Anything already reported above is skipped.)
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) &&
      !seen.has(node.getStart(sf))
    ) {
      const text = ts.isTemplateExpression(node)
        ? node.head.text + node.templateSpans.map((s) => " " + s.literal.text).join("")
        : node.text;
      const p = node.parent;
      const words = text.trim().split(/\s+/).filter((w) => /\p{L}/u.test(w));
      const proseLike = words.length >= (process.env.I18N_AUDIT_LOOSE ? 1 : 3) && /^["“¿¡(]?\p{Lu}/u.test(text.trim()) && /\p{Ll}/u.test(text) && !/[{}<>=;]/.test(text.replace(/\$\{[^}]*\}/g, ""));
      const skipParent =
        !p ||
        ts.isImportDeclaration(p) ||
        ts.isExportDeclaration(p) ||
        ts.isJsxAttribute(p) ||
        ts.isLiteralTypeNode(p) ||
        ts.isCaseClause(p) ||
        ts.isElementAccessExpression(p) ||
        ts.isTypeReferenceNode(p) ||
        (ts.isCallExpression(p) &&
          p.arguments.includes(node) &&
          /^(t|cn|clsx|fill|require|console\.\w+|JSON\.parse|[\w.]*\.(replace|replaceAll|test|match|startsWith|endsWith|includes|split|get|set|has|delete|append|from|select|eq|neq|in|order|insert|rpc|toFixed|padStart|localeCompare|min|max|regex|describe|enum|literal|email|string|url|trim|passthrough|catch|then|find|filter|push|emit|send|log|warn|error|info|debug))$/.test(p.expression.getText(sf))) ||
        (ts.isBinaryExpression(p) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(p.operatorToken.kind));
      if (proseLike && !skipParent && looksLikeText(text)) add(node, "prose", text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
}

export const files = SCOPE_DIRS.flatMap((d) => (existsSync(join(ROOT, d)) ? walk(join(ROOT, d)) : []));

/** Findings for one file (absolute or repo-relative path); used by the extraction tooling. */
export function auditOne(file) {
  findings.length = 0;
  auditFile(join(ROOT, relative(ROOT, join(ROOT, file))));
  return findings.splice(0);
}

function main() {
  files.forEach(auditFile);
  if (args.has("--json")) {
    console.log(JSON.stringify(findings, null, 2));
  } else if (args.has("--summary")) {
    const per = new Map();
    for (const f of findings) per.set(f.file, (per.get(f.file) ?? 0) + 1);
    for (const [f, n] of [...per].sort((a, b) => b[1] - a[1])) console.log(String(n).padStart(4), f);
    console.log(`
${findings.length} literal(s) in ${per.size} file(s) · ${files.length} files scanned`);
  } else {
    let cur = "";
    for (const f of findings) {
      if (f.file !== cur) console.log(`
${(cur = f.file)}`);
      console.log(`  ${String(f.line).padStart(4)}  ${f.kind.padEnd(14)} ${f.text}`);
    }
    console.log(`
${findings.length} untranslated literal(s) in ${new Set(findings.map((f) => f.file)).size} file(s) · ${files.length} files scanned`);
  }
  process.exit(findings.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
