import type { StoreEvidence } from "../../../lib/library/store-check";

/** Evidence of a verified store (shared by the Library gate tests). */
export const GOOD_EVIDENCE: StoreEvidence = {
  v: 1, checkedAt: new Date().toISOString(), via: "fetch", reachable: true, status: 200,
  shopify: true, shopifySignals: ["Shopify JS object"], brandMatch: true, brandDetail: "ok",
  productStore: true, productLinks: 12, nicheFit: true, nicheHits: ["skin", "serum"], appLike: false, title: "Foo",
};
