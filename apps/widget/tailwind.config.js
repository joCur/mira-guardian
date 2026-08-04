import catppuccin from "@catppuccin/tailwindcss";

const FONT_STACK = [
  '"JetBrainsMono Nerd Font"',
  '"JetBrains Mono"',
  "ui-monospace",
  "SFMono-Regular",
  "Menlo",
  "monospace",
];

export default {
  content: ["./src/renderer/index.html", "./src/renderer/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Die ganze Oberfläche läuft auf JetBrains Mono — `sans` und `mono` sind
      // absichtlich identisch, damit `font-mono` an Pfaden/Codes nichts ändert.
      // Wer die Nerd-Font-Variante installiert hat, bekommt sie samt Icon-Glyphen;
      // sonst greift das gebündelte @fontsource-JetBrains-Mono (metrisch gleich).
      fontFamily: {
        sans: FONT_STACK,
        mono: FONT_STACK,
      },
      // Die Typo-Skala des Widgets — der eine Ort, an dem Schriftgrößen gedreht
      // werden. Vorher standen die Werte als `text-[12.5px]` an 169 Einzelstellen;
      // so sind unbemerkt 13 Stufen entstanden, fünf davon auf halben Pixeln.
      //
      // Ganzzahlig ist Pflicht: bei halben Pixeln landen die Glyphen-Konturen auf
      // 1x-Displays zwischen dem Raster und wirken unscharf.
      //
      // Bewusst enger als der Tailwind-Standard (12/14/16/18/20/24) — der ist auf
      // Fließtext ausgelegt, unser Fenster ist dicht und braucht zusätzlich
      // Stufen unter 12 px. Nur die Größe, keine Zeilenhöhe: die erben die
      // Elemente wie bisher von ihrem Umfeld.
      fontSize: {
        "2xs": "10px", // Mini-Badges
        xs: "11px", // Labels, Sektionsköpfe, Meta-Zeilen
        sm: "12px", // Sekundärtext, Dateinamen in Listen
        base: "13px", // Grundtext
        md: "14px", // Zwischenüberschrift
        lg: "15px", // Titel, Detail-Überschrift
        xl: "17px", // Dialog-Überschrift
        "2xl": "19px", // Tab-Überschrift
      },
    },
  },
  // prefix: "ctp" is REQUIRED — without it the plugin registers colours as
  // `bg-base`/`text-green`, but this codebase uses `bg-ctp-base`/`text-ctp-green`.
  // (The `ctp` in the CSS var name `--ctp-*` is unrelated to the class prefix.)
  plugins: [catppuccin({ prefix: "ctp", defaultFlavour: "mocha" })],
};
