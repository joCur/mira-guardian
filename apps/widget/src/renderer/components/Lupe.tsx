import React, { useEffect } from "react";

/** Bild bildschirmfüllend. Schließt per Klick oder Esc. */
export function Lupe({ url, onZu }: { url: string; onZu: () => void }) {
  useEffect(() => {
    const taste = (e: KeyboardEvent) => { if (e.key === "Escape") onZu(); };
    window.addEventListener("keydown", taste);
    return () => window.removeEventListener("keydown", taste);
  }, [onZu]);

  return (
    <div role="dialog" aria-label="Bild groß" onClick={onZu}
      className="fixed inset-0 z-50 bg-ctp-crust/95 flex items-center justify-center p-8 cursor-zoom-out">
      <img src={url} alt="" className="max-h-full max-w-full object-contain bg-white rounded-lg" />
      <span className="absolute bottom-4 text-[12px] text-ctp-subtext0">Klick oder Esc schließt</span>
    </div>
  );
}
