import { Fragment, type ReactNode } from "react";

/**
 * Renders a translated sentence that contains inline elements, keeping the
 * whole sentence as ONE translatable string (word order differs per language):
 *
 *   t("home.headline")  →  "What are we <em>analyzing</em> today?"
 *   <Rich text={t("home.headline")} tags={{ em: (c) => <span className="x">{c}</span> }} />
 *
 * Tags are `<name>…</name>` (no nesting, no attributes); an unknown tag renders
 * its content as plain text. No hooks, so it works in Server and Client
 * Components alike.
 */
export function Rich({
  text,
  tags,
}: {
  text: string;
  tags: Record<string, (children: ReactNode) => ReactNode>;
}) {
  const out: ReactNode[] = [];
  const re = /<(\w+)>([\s\S]*?)<\/\1>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const render = tags[m[1]];
    out.push(<Fragment key={i++}>{render ? render(m[2]) : m[2]}</Fragment>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}
