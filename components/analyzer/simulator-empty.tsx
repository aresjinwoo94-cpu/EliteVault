"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { TrendingUp, Sparkles, AlertCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { triggerSimulation } from "@/app/actions/meta-simulator";

type Country =
  | "US" | "CA" | "UK" | "AU"
  | "EU-W" | "EU-S" | "LATAM" | "INDIA-SEA" | "WW";
type ProductType = "physical" | "digital" | "subscription" | "service";
type Competitiveness = "low" | "medium" | "high" | "extreme";

const COUNTRY_OPTIONS: { value: Country; label: string }[] = [
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
  { value: "UK", label: "United Kingdom" },
  { value: "AU", label: "Australia" },
  { value: "EU-W", label: "Western Europe (DE/FR/NL)" },
  { value: "EU-S", label: "Southern Europe (ES/IT/PT)" },
  { value: "LATAM", label: "Latin America" },
  { value: "INDIA-SEA", label: "India / Southeast Asia" },
  { value: "WW", label: "Worldwide (mixed)" },
];

/**
 * The empty / form state of the Meta Campaign Scenario Modeler.
 *
 * Shown when:
 *   - Scale user, on a succeeded analysis, no simulation exists yet, OR
 *   - The previous simulation failed (we let them re-submit).
 *
 * On submit, calls the server action which queues an Inngest run and
 * returns the simulation ID. The parent then starts polling that ID.
 */
export function SimulatorEmpty({
  analysisId,
  onQueued,
  previousError,
}: {
  analysisId: string;
  onQueued: (simulationId: string) => void;
  previousError?: string | null;
}) {
  const [aov, setAov] = useState("");
  const [budget, setBudget] = useState("");
  const [margin, setMargin] = useState("");
  const [country, setCountry] = useState<Country>("US");
  const [productType, setProductType] = useState<ProductType>("physical");
  const [competitiveness, setCompetitiveness] =
    useState<Competitiveness>("medium");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const aovNum = parseFloat(aov);
    const budgetNum = parseFloat(budget);
    const marginNum = margin.trim() === "" ? null : parseFloat(margin);

    if (!aovNum || aovNum <= 0) {
      toast.error("Enter a valid AOV (e.g. 45)");
      return;
    }
    if (!budgetNum || budgetNum <= 0) {
      toast.error("Enter a valid daily budget (e.g. 50)");
      return;
    }

    startTransition(async () => {
      const res = await triggerSimulation({
        analysisId,
        aovUsd: aovNum,
        dailyBudgetUsd: budgetNum,
        productMarginPct: marginNum,
        country,
        productType,
        competitiveness,
        notes: notes.trim() || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Simulation queued — projecting 3 scenarios");
      onQueued(res.simulationId);
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="relative overflow-hidden p-6 md:p-7 border-champagne-400/15 bg-gradient-to-br from-champagne-400/[0.04] to-signal-600/[0.04]">
        <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-champagne-400/12 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 -bottom-20 size-64 rounded-full bg-signal-600/12 blur-3xl" />

        <div className="relative">
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-champagne-400" />
            <h3 className="font-medium">Meta Campaign Scenario Modeler</h3>
            <Badge variant="gold">
              <Sparkles className="size-3" />
              Scale plan
            </Badge>
          </div>
          <p className="mt-1.5 text-sm text-white/55 leading-relaxed max-w-2xl">
            Project a 7-day Meta Ads campaign across three scenarios — conservative,
            balanced, aggressive — using this audit as input. Each projection is
            an AI estimate, not a guarantee.
          </p>

          {previousError && (() => {
            // Detect quota errors and render a more actionable, less scary
            // variant — the user just needs to wait, not "fix" anything.
            const isQuota = /rate.?limit|quota|429|RESOURCE_EXHAUSTED/i.test(
              previousError,
            );
            if (isQuota) {
              return (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-champagne-400/20 bg-champagne-400/[0.05] p-3">
                  <Clock className="size-4 text-champagne-300 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-champagne-200 font-medium">
                      Hit the AI provider's per-minute quota
                    </p>
                    <p className="text-xs text-white/60 leading-relaxed mt-0.5">
                      Wait ~60 seconds and click submit again. The free-tier
                      cap resets every minute — no charge for the failed run.
                    </p>
                  </div>
                </div>
              );
            }
            return (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-warning/20 bg-warning/[0.05] p-3">
                <AlertCircle className="size-4 text-warning shrink-0 mt-0.5" />
                <p className="text-xs text-white/70 leading-relaxed">
                  <span className="text-warning">Previous run failed: </span>
                  {previousError.slice(0, 240)}
                </p>
              </div>
            );
          })()}

          <form onSubmit={onSubmit} className="mt-6 grid md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="aov" className="text-xs uppercase tracking-widest text-white/40">
                Average Order Value (USD)
              </Label>
              <Input
                id="aov"
                type="number"
                inputMode="decimal"
                placeholder="45"
                value={aov}
                onChange={(e) => setAov(e.target.value)}
                step="0.01"
                min="0"
                required
                disabled={pending}
              />
              <p className="text-[11px] text-white/40">
                Typical order size in your store.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="budget" className="text-xs uppercase tracking-widest text-white/40">
                Daily ad budget (USD)
              </Label>
              <Input
                id="budget"
                type="number"
                inputMode="decimal"
                placeholder="50"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                step="1"
                min="0"
                required
                disabled={pending}
              />
              <p className="text-[11px] text-white/40">
                What you'd realistically spend per day on Meta.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="margin" className="text-xs uppercase tracking-widest text-white/40">
                Gross margin % <span className="text-white/30 normal-case">(optional)</span>
              </Label>
              <Input
                id="margin"
                type="number"
                inputMode="decimal"
                placeholder="65"
                value={margin}
                onChange={(e) => setMargin(e.target.value)}
                step="1"
                min="0"
                max="100"
                disabled={pending}
              />
              <p className="text-[11px] text-white/40">
                Helps us tell you the breakeven ROAS.
              </p>
            </div>

            {/*
              v3.2 realism inputs. The modeler uses these to apply real
              niche benchmarks, country CPM multipliers, and competitive
              context — instead of fake "trending" data we don't have.
              All have sensible defaults (US / physical / medium).
            */}
            <div className="md:col-span-2 pt-2">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] uppercase tracking-widest text-white/40">
                  Realism context
                </span>
                <span className="h-px flex-1 bg-white/[0.06]" />
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-widest text-white/40">
                    Country / region
                  </Label>
                  <Select
                    value={country}
                    onValueChange={(v) => setCountry(v as Country)}
                    disabled={pending}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-white/40">
                    LATAM CPM ≈ 0.25× US — changes the projection materially.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-widest text-white/40">
                    Product type
                  </Label>
                  <Select
                    value={productType}
                    onValueChange={(v) => setProductType(v as ProductType)}
                    disabled={pending}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="physical">Physical goods</SelectItem>
                      <SelectItem value="digital">Digital / download</SelectItem>
                      <SelectItem value="subscription">Subscription</SelectItem>
                      <SelectItem value="service">Service / lead-gen</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-white/40">
                    Subscription tolerates higher CPA (LTV-driven).
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-widest text-white/40">
                    Niche competitiveness
                  </Label>
                  <Select
                    value={competitiveness}
                    onValueChange={(v) => setCompetitiveness(v as Competitiveness)}
                    disabled={pending}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low — new / undiscovered</SelectItem>
                      <SelectItem value="medium">Medium — average</SelectItem>
                      <SelectItem value="high">High — saturated</SelectItem>
                      <SelectItem value="extreme">Extreme — Q4 / supplements</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-white/40">
                    You know your niche better than we can guess.
                  </p>
                </div>
              </div>
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="notes" className="text-xs uppercase tracking-widest text-white/40">
                Notes <span className="text-white/30 normal-case">(optional)</span>
              </Label>
              <Textarea
                id="notes"
                placeholder="e.g. iOS-heavy traffic, returning customer-friendly, seasonal product..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                maxLength={800}
                disabled={pending}
              />
              <p className="text-[11px] text-white/40">
                Anything else the modeler should weigh.
              </p>
            </div>

            <div className="md:col-span-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
              <Button
                type="submit"
                variant="primary"
                disabled={pending}
                className="sm:min-w-48"
              >
                {pending ? "Queueing..." : "Project 3 scenarios →"}
              </Button>
              <p className="text-[11px] text-white/40 leading-relaxed max-w-md">
                Estimates — not predictions. The modeler returns plausible numbers
                a senior media buyer would defend, but real campaigns swing on
                creative, audience and platform variance.
              </p>
            </div>
          </form>
        </div>
      </Card>
    </motion.div>
  );
}
