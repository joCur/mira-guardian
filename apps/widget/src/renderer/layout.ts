// Breite der Lesespalte — Kopfzeile, Text und Fußleiste eines Detailbereichs
// teilen sie sich, damit sie untereinander bündig stehen. Ohne das säße die
// Überschrift am linken Fensterrand, während der Text darunter in der Mitte
// beginnt; auf einem 21:9-Schirm liegen dazwischen mehrere hundert Pixel.
//
// Zur Obergrenze: Die Oberfläche läuft komplett auf JetBrains Mono, ein Zeichen
// ist bei der 12-px-Grundschrift rund 7,2 px breit. 1400 px sind damit knapp
// 190 Zeichen pro Zeile — mehr, als Typografie für Fließtext empfiehlt. Der
// Ausgleich ist der Zoom (Strg/Cmd und Plus): Er verkleinert die nutzbare
// Breite in CSS-Pixeln, sodass die Spalte den Bereich zunehmend ausfüllt,
// während die Schrift größer wird. Bei 1080 px Fensterbreite, dem Maß aus dem
// Design-Dokument, greift die Grenze ohnehin nie — sie ist nur für breite
// Schirme da.
export const LESESPALTE = "max-w-[1400px] mx-auto";

// Innenabstand links und rechts. Muss in Kopf, Text und Fußleiste identisch
// sein, sonst hebt sich die Bündigkeit der Lesespalte wieder auf.
export const SPALTEN_PADDING = "px-6";
