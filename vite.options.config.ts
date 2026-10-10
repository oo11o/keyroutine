import { defineConfig } from "vite";

// The third build pass, for the same reason the worker needs the second one:
// Rollup's iife output format rejects multiple inputs outright, so every
// separately-loaded script in the extension gets its own config. publicDir and
// emptyOutDir are off so this doesn't clobber what the first pass wrote.
//
// The options page used to be plain JS in public/, copied verbatim, precisely
// to avoid this third pass. It stopped being worth it once the page became the
// stack builder: it now shares core/schema.ts, core/stepMeta.ts and
// core/configStore.ts with the runtime, and a hand-maintained JS copy of any of
// that would drift the first time a step type changed.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: {
      input: { options: "src/options/main.ts" },
      output: { format: "iife", entryFileNames: "[name].js" }
    }
  }
});
