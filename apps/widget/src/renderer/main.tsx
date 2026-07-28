import React from "react";
import { createRoot } from "react-dom/client";
import { AppRoot } from "./AppRoot.js";
import { ToastApp } from "./components/Toast.js";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "./index.css";

export function App() { return <AppRoot />; }

// "#toast" lädt dieselbe Bundle-Datei im kleinen Toast-Fenster — dort rendert
// nur die Toast-Karte, nicht die App.
const el = document.getElementById("root");
if (el) createRoot(el).render(window.location.hash === "#toast" ? <ToastApp /> : <App />);
