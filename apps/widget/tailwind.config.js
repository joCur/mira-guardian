import catppuccin from "@catppuccin/tailwindcss";

export default {
  content: ["./src/renderer/index.html", "./src/renderer/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  // prefix: "ctp" is REQUIRED — without it the plugin registers colours as
  // `bg-base`/`text-green`, but this codebase uses `bg-ctp-base`/`text-ctp-green`.
  // (The `ctp` in the CSS var name `--ctp-*` is unrelated to the class prefix.)
  plugins: [catppuccin({ prefix: "ctp", defaultFlavour: "mocha" })],
};
