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
    },
  },
  // prefix: "ctp" is REQUIRED — without it the plugin registers colours as
  // `bg-base`/`text-green`, but this codebase uses `bg-ctp-base`/`text-ctp-green`.
  // (The `ctp` in the CSS var name `--ctp-*` is unrelated to the class prefix.)
  plugins: [catppuccin({ prefix: "ctp", defaultFlavour: "mocha" })],
};
