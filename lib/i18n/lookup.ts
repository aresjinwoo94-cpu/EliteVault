/**
 * Dotted-path lookup in a translation dictionary. Import-free on purpose:
 * the client provider needs it, and it must not drag a dictionary into the
 * browser bundle.
 */
export type Dict = { [key: string]: string | Dict };

export function lookup(dict: Dict, path: string): string | undefined {
  let cur: string | Dict | undefined = dict;
  for (const key of path.split(".")) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = cur[key];
    if (cur === undefined) return undefined;
  }
  return typeof cur === "string" ? cur : undefined;
}

/** Fills `{name}` placeholders: fill("Hi {who}", { who: "Ana" }) → "Hi Ana". */
export function fill(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
