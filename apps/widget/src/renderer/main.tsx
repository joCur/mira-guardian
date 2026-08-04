import React from "react";
import { createRoot } from "react-dom/client";
import { AppRoot } from "./AppRoot.js";
import { ToastApp } from "./components/Toast.js";
// Fallback für alle, die "JetBrainsMono Nerd Font" nicht installiert haben.
// 700 ist Pflicht: ohne den Schnitt fettet Chromium `font-bold` synthetisch,
// was besonders auf Displays ohne HiDPI verschmiert wirkt.
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/700.css";
import "./index.css";

export function App() { return <AppRoot />; }

// "#toast" lädt dieselbe Bundle-Datei im kleinen Toast-Fenster — dort rendert
// nur die Toast-Karte, nicht die App.
const el = document.getElementById("root");
if (el) createRoot(el).render(window.location.hash === "#toast" ? <ToastApp /> : <App />);
