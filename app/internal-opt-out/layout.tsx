import type { Metadata } from "next";

// Internal QA utility (analytics opt-out toggle): never an indexable page.
export const metadata: Metadata = {
  title: "Analytics opt-out",
  robots: { index: false, follow: false },
};

export default function InternalOptOutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
