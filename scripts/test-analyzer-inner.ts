(async () => {
  const { runAnalyzerAgent } = await import("../ai/agents/analyzer-agent");
  const { captureScreenshot } = await import("../lib/screenshot");

  const url = process.argv[2] ?? "https://www.allbirds.com";
  console.log(`Capturing screenshot of ${url}…`);
  const shot = await captureScreenshot(url);
  console.log(
    `✓ got ${shot.mediaType} (${Math.round(shot.base64.length / 1024)} KB base64)`,
  );

  console.log("\nRunning Analyzer agent (this may take 20-60s on Gemini Pro)…");
  const t0 = Date.now();
  const result = await runAnalyzerAgent({
    screenshotBase64: shot.base64,
    mediaType: shot.mediaType,
    url,
    persona: { age: "25-35", gender: "any", country: "US" },
  });
  const dt = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`\n✓ Analyzer completed in ${dt}s`);
  console.log("─".repeat(60));
  console.log(`Score: ${result.score}/100`);
  console.log(`Summary: ${result.summary.slice(0, 200)}…`);
  console.log("\nScenarios:");
  for (const [k, v] of Object.entries(result.scenarios)) {
    console.log(`  ${k.padEnd(20)} ${(v * 100).toFixed(2)}%`);
  }
  console.log("\nCategory scores:");
  for (const [k, v] of Object.entries(result.category_scores)) {
    console.log(`  ${k.padEnd(25)} ${v}`);
  }
  console.log(`\n${result.annotations.length} annotations placed.`);
  console.log(
    `Top fix: ${result.top_fixes[0]?.title} (${result.top_fixes[0]?.impact} impact)`,
  );
  console.log(
    `\nBuyer persona: ${result.buyer_persona_response.would_buy ? "WOULD BUY" : "WOULD BOUNCE"}`,
  );
  console.log(`  "${result.buyer_persona_response.headline}"`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
