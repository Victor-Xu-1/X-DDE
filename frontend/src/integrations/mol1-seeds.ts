/** UI projection of the existing primary seed and lossless additional seed text. */
export const MAX_MOL1_SEEDS = 8;
const MAX_SEED = 2147483647;
export const seedTokens = (text: string) =>
  text === "" ? [] : text.split(",");
export const validSeedNumber = (value: number) =>
  Number.isSafeInteger(value) && value >= 0 && value <= MAX_SEED;

export function validSeedEntries(primary: number, text: string) {
  const tokens = seedTokens(text);
  const values = [primary, ...tokens.map(Number)];
  return (
    tokens.length < MAX_MOL1_SEEDS &&
    tokens.every((token) => token.trim()) &&
    values.every(validSeedNumber) &&
    new Set(values).size === values.length
  );
}

function seedText(tokens: string[]) {
  // The unchanged draft format uses "" for no extra seeds. Preserve one
  // deliberately empty row as whitespace, rather than silently deleting it.
  return tokens.length === 1 && tokens[0] === "" ? " " : tokens.join(",");
}

export function editSeedToken(text: string, index: number, value: string) {
  const tokens = seedTokens(text);
  if (index < 0 || index >= tokens.length) return text;
  tokens[index] = value;
  return seedText(tokens);
}

export function removeSeedToken(text: string, index: number) {
  return seedText(seedTokens(text).filter((_, position) => position !== index));
}

export function addSeedToken(primary: number, text: string) {
  const tokens = seedTokens(text);
  if (tokens.length >= MAX_MOL1_SEEDS - 1) return text;
  const used = [primary, ...tokens.map(Number)].filter(validSeedNumber);
  let suggested =
    ((used.length ? Math.max(...used) : 100) + 1) % (MAX_SEED + 1);
  while (used.includes(suggested)) suggested = (suggested + 1) % (MAX_SEED + 1);
  return [...tokens, String(suggested)].join(",");
}
