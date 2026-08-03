const ALPHABET = "ACDEFHJKMNPRTWXY37";

// Vier Zeichen aus 18 sind ~105.000 Möglichkeiten — abtippbar und in Verbindung
// mit dem Versuchslimit auf /auth/redeem ausreichend für eine Einladung, die
// erst ein Profil anlegt. Ein Code, der ein *bestehendes* Profil überträgt,
// nimmt acht Zeichen (~1,1e10) und wird in Vierergruppen dargestellt.
export function generateCode(prefix: string, chars = 4, rng: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < chars; i++) {
    if (i > 0 && i % 4 === 0) s += "-";
    s += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  }
  return `${prefix}-${s}`;
}

export function initialsOf(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0] ?? "").join("").slice(0, 2).toUpperCase();
}

const AVATARS = ["#7aa2f7", "#e0af68", "#bb9af7", "#7dcfff", "#9ece6a", "#ff9e64"];
export function avatarFor(index: number): string {
  return AVATARS[index % AVATARS.length];
}
