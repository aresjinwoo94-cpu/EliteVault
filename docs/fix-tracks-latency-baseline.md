# Analyzer latency baseline — WP-0 (brief §5)

Measured 2026-10-08 with `node scripts/analyzer-latency-report.mjs` (read-only, prod `analyses` + `timings`).
`time` = finished_at − created_at (what the user waits, queue included). p50/p90 over SUCCEEDED audits.

| Window | n | OK | Refunds | p50 | p90 |
|---|---|---|---|---|---|
| Since 2026-10-02 (post speed-fix, **the baseline**) | 47 | 46 | 1 (the "?" row, pre-timings) | **20 s** | **38 s** |
| Last 10 | 10 | 10 | 0 | 18 s | 47 s |
| Since 2026-09-24 (includes the broken pre-fix period) | 116 | 97 | 19 | 36 s | 103 s |

By model since 10-02: gemini-3.5-flash-lite p50 18 s / p90 38 s (n=28); gemini-3.1-flash-lite p50 23 s / p90 47 s (n=18).
Vision p50 ≈ 5–7 s, capture p50 ≈ 7–8 s.

## Notes
- The brief quotes p50 ≈ 42 s; that is the pre-2026-10-02 figure. Real baseline today is ~20 s.
- Method: production traffic (not a fixed 5-store set), because a controlled run needs a deploy of the change under test.
  After each WP that touches the report/schema, re-run with `--since <merge date>` and compare.
- **Revert rule (brief §5):** p50 up by more than ~2 s (i.e. > ~22 s) or success rate below ~98 % → revert and notify.
