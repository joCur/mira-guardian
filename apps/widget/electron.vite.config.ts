import { readFileSync } from "node:fs";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";

// Die Version wird beim Bauen eingebacken statt zur Laufzeit über
// app.getVersion() ermittelt. Letzteres sucht die package.json der App und
// liefert ohne sie stillschweigend die Electron-Version — je nach Startart also
// eine völlig andere Zahl. Die Release-Pipeline patcht diese package.json vor
// dem Bauen, hier steht damit immer der Stand, der auch ausgeliefert wird.
const { version, repository } = JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8"));

// Aus der Repository-Adresse wird die Release-Übersicht, auf die der
// Update-Hinweis für die Änderungshinweise verlinkt. Abgeleitet statt doppelt
// gepflegt, damit ein Umzug des Repositorys nur an einer Stelle nachzuziehen ist.
const releasesUrl = `${String(repository.url).replace(/^git\+/, "").replace(/\.git$/, "")}/releases`;

export default defineConfig({
  main: {
    build: { outDir: "out/main" },
    define: {
      __APP_VERSION__: JSON.stringify(version),
      __RELEASES_URL__: JSON.stringify(releasesUrl),
    },
  },
  preload: { build: { outDir: "out/preload" } },
  renderer: { plugins: [react()], build: { outDir: "out/renderer" } },
});
