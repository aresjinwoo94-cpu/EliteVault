import type { TeaserId } from "./teasers";

export type ToolId = "analyzer" | "library" | "simulator";

export type ToolShot = { src: string; w: number; h: number; caption: string };

export type ToolAction =
  | { kind: "teaser"; teaserId: TeaserId; label: string }
  | { kind: "link"; href: string; label: string }
  | { kind: "note"; text: string };

export type ToolCardData = {
  id: ToolId;
  name: string;
  line: string;
  pill: string;
  shots: ToolShot[];
  actions: ToolAction[];
};

export type ToolkitLabels = {
  seeIt: string;
  lbPrev: string;
  lbNext: string;
  lbCounter: string; // "{i} / {n}"
  dPotential: string;
  dYourStore: string;
  dTop: string;
  dBreakEven: string;
  dDays: string;
};
