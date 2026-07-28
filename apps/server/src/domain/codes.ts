const ALPHABET = "ACDEFHJKMNPRTWXY37";

export function generateCode(prefix: string, rng: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 4; i++) s += ALPHABET[Math.floor(rng() * ALPHABET.length)];
  return `${prefix}-${s}`;
}

export function initialsOf(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0] ?? "").join("").slice(0, 2).toUpperCase();
}

const AVATARS = ["#7aa2f7", "#e0af68", "#bb9af7", "#7dcfff", "#9ece6a", "#ff9e64"];
export function avatarFor(index: number): string {
  return AVATARS[index % AVATARS.length];
}
