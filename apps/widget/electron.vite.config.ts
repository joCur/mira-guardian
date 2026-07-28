import { readFileSync } from "node:fs";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";

// Die Version wird beim Bauen eingebacken statt zur Laufzeit über
// app.getVersion() ermittelt. Letzteres sucht die package.json der App und
// liefert ohne sie stillschweigend die Electron-Version — je nach Startart also
// eine völlig andere Zahl. Die Release-Pipeline patcht diese package.json vor
// dem Bauen, hier steht damit immer der Stand, der auch ausgeliefert wird.
const { version } = JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8"));

export default defineConfig({
  main: {
    build: { outDir: "out/main" },
    define: { __APP_VERSION__: JSON.stringify(version) },
  },
  preload: { build: { outDir: "out/preload" } },
  renderer: { plugins: [react()], build: { outDir: "out/renderer" } },
});
