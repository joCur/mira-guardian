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
      // Die Schriftgrößen sind ansonsten der unveränderte Tailwind-Standard
      // (xs 12 / sm 14 / base 16 / lg 18 / xl 20 px, jeweils mit dessen
      // Zeilenhöhe). Ergänzt ist nur diese eine Stufe *unterhalb* von `xs`:
      // der Standard bietet unter 12 px nichts, und für die Mini-Badges wird
      // 12 px zu groß — im 352 px breiten Toast verdrängen sie sonst den
      // Dateinamen, und die Initialen sprengen den 18-px-Avatarkreis.
      // Ohne Zeilenhöhe, damit die Badges kompakt bleiben.
      fontSize: {
        "2xs": "10px",
      },
    },
  },
  // prefix: "ctp" is REQUIRED — without it the plugin registers colours as
  // `bg-base`/`text-green`, but this codebase uses `bg-ctp-base`/`text-ctp-green`.
  // (The `ctp` in the CSS var name `--ctp-*` is unrelated to the class prefix.)
  plugins: [catppuccin({ prefix: "ctp", defaultFlavour: "mocha" })],
};
