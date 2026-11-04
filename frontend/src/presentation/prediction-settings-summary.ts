/** Presentation of unfinished controls; native form validation owns admission. */
export function predictionSettingsSummary(
  seeds: number[],
  samples: number,
  zh: boolean,
) {
  const seedsValid =
    seeds.length > 0 &&
    new Set(seeds).size === seeds.length &&
    seeds.every((seed) => Number.isSafeInteger(seed) && seed >= 0);
  const count = seeds.length * samples;
  return {
    seeds: seedsValid
      ? seeds.join(", ")
      : zh
        ? "检查种子数值"
        : "Check seed values",
    structures:
      seedsValid &&
      Number.isSafeInteger(samples) &&
      samples > 0 &&
      Number.isSafeInteger(count)
        ? count
        : "—",
  };
}
