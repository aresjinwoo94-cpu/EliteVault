"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Fix {
  title: string;
  impact: "high" | "medium" | "low";
  effort: "S" | "M" | "L";
}

export function TopFixes({ fixes }: { fixes: Fix[] }) {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="size-4 text-champagne-400" />
        <h3 className="text-sm font-medium">Top fixes — ranked by leverage</h3>
      </div>

      <ol className="space-y-2">
        {fixes.map((f, i) => (
          <motion.li
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="flex items-center gap-3 rounded-xl border border-white/[0.04] bg-white/[0.02] p-3.5 hover:border-white/[0.1] transition-colors"
          >
            <span className="font-serif text-2xl text-gold-gradient tnum w-7 text-center">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white font-medium leading-tight">
                {f.title}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <Badge
                  variant={
                    f.impact === "high"
                      ? "danger"
                      : f.impact === "medium"
                        ? "warning"
                        : "default"
                  }
                >
                  {f.impact} impact
                </Badge>
                <span className="text-[10px] text-white/30">·</span>
                <span className="text-[10px] text-white/50">
                  Effort: {f.effort === "S" ? "<1h" : f.effort === "M" ? "1-4h" : ">4h"}
                </span>
              </div>
            </div>
            <ArrowUpRight className="size-4 text-white/20" />
          </motion.li>
        ))}
      </ol>
    </Card>
  );
}
