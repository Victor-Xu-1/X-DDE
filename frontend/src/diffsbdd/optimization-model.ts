/** Native descriptors and record indices; no inferred affinity or missing scores. */
export interface OptimizationCandidate {
  record: number;
  attempt: number;
  round: number;
  score: number;
  qed: number;
  sa: number;
  improved: boolean;
}
export interface OptimizationRound {
  round: number;
  valid: number;
  best: number | null;
}
export interface OptimizationData {
  objective: "qed" | "sa";
  initial: number;
  retainedBest: number;
  population: number;
  rounds: number;
  candidates: OptimizationCandidate[];
  history: OptimizationRound[];
  bestGenerated: OptimizationCandidate | null;
}
export type OptimizationReview =
  | { state: "ready"; data: OptimizationData }
  | { state: "unavailable" | "invalid" };
type OptimizationHeader = Omit<
  OptimizationData,
  "candidates" | "history" | "bestGenerated"
>;

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= min &&
  value <= max;
const descriptor = (value: unknown, objective: "qed" | "sa"): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= (objective === "qed" ? 0 : 1) &&
  value <= (objective === "qed" ? 1 : 10);
export const betterScore = (
  objective: "qed" | "sa",
  left: number,
  right: number,
) => (objective === "qed" ? left > right : left < right);

function candidate(
  value: unknown,
  record: number,
  data: OptimizationHeader,
): OptimizationCandidate | null {
  const row = object(value);
  if (
    !row ||
    !integer(row.attempt, 1, data.population * data.rounds) ||
    !integer(row.round, 1, data.rounds) ||
    row.round !== Math.ceil(row.attempt / data.population) ||
    !descriptor(row.qed, "qed") ||
    !descriptor(row.sa, "sa") ||
    !descriptor(row.objective_score, data.objective) ||
    typeof row.improved_over_input !== "boolean"
  )
    return null;
  const score = row.objective_score;
  // Native descriptors have four decimal places; objective scores have five.
  if (
    Math.abs(score - (data.objective === "qed" ? row.qed : row.sa)) > 0.00006 ||
    (Math.abs(score - data.initial) > 0.00001 &&
      row.improved_over_input !==
        betterScore(data.objective, score, data.initial))
  )
    return null;
  return {
    record,
    attempt: row.attempt,
    round: row.round,
    score,
    qed: row.qed,
    sa: row.sa,
    improved: row.improved_over_input,
  };
}

function header(
  raw: Record<string, unknown>,
  expectedObjective: unknown,
): OptimizationHeader | null {
  if (
    (raw.objective !== "qed" && raw.objective !== "sa") ||
    raw.objective !== expectedObjective ||
    !descriptor(raw.initial_score, raw.objective) ||
    !descriptor(raw.best_score, raw.objective) ||
    !integer(raw.population, 1, 100) ||
    !integer(raw.rounds, 1, 20) ||
    raw.population * raw.rounds > 100
  )
    return null;
  return {
    objective: raw.objective,
    initial: raw.initial_score,
    retainedBest: raw.best_score,
    population: raw.population,
    rounds: raw.rounds,
  };
}

function readCandidates(
  native: Record<string, unknown>,
  data: OptimizationHeader,
): OptimizationCandidate[] | null {
  if (!Array.isArray(native.molecules) || native.molecules.length > 100)
    return null;
  const candidates: OptimizationCandidate[] = [];
  for (const [record, value] of native.molecules.entries()) {
    const row = candidate(value, record, data);
    if (!row || candidates.some((previous) => previous.attempt === row.attempt))
      return null;
    candidates.push(row);
  }
  if (
    !integer(native.valid, 0, 100) ||
    native.valid !== candidates.length ||
    !integer(native.attempted, 0, data.population * data.rounds) ||
    candidates.some((row) => row.attempt > (native.attempted as number))
  )
    return null;
  return candidates;
}

function readHistory(
  value: unknown,
  data: OptimizationHeader,
  candidates: OptimizationCandidate[],
): OptimizationRound[] | null {
  if (!Array.isArray(value) || value.length > data.rounds) return null;
  const history: OptimizationRound[] = [];
  for (const [index, item] of value.entries()) {
    const row = object(item);
    if (
      !row ||
      row.round !== index + 1 ||
      !integer(row.valid, 0, data.population)
    )
      return null;
    const group = candidates.filter(
      (candidate) => candidate.round === row.round,
    );
    if (
      group.length !== row.valid ||
      (group.length
        ? !descriptor(row.best_score, data.objective)
        : row.best_score !== null)
    )
      return null;
    const best = group.reduce<number | null>(
      (current, item) =>
        current === null || betterScore(data.objective, item.score, current)
          ? item.score
          : current,
      null,
    );
    if (best !== null && Math.abs(best - (row.best_score as number)) > 0.00001)
      return null;
    history.push({
      round: row.round as number,
      valid: row.valid,
      best: row.best_score as number | null,
    });
  }
  return history;
}

export function optimizationReview(
  report: unknown,
  expectedObjective: unknown,
): OptimizationReview {
  const native = object(report);
  if (!native || native.optimization === undefined)
    return { state: "unavailable" };
  const raw = object(native.optimization);
  const invalid: OptimizationReview = { state: "invalid" };
  const data = raw && header(raw, expectedObjective);
  if (!raw || !data) return invalid;
  const candidates = readCandidates(native, data);
  if (!candidates) return invalid;
  const history = readHistory(raw.history, data, candidates);
  if (!history) return invalid;
  const bestGenerated = candidates.reduce<OptimizationCandidate | null>(
    (current, row) =>
      !current || betterScore(data.objective, row.score, current.score)
        ? row
        : current,
    null,
  );
  const retained =
    bestGenerated &&
    betterScore(data.objective, bestGenerated.score, data.initial)
      ? bestGenerated.score
      : data.initial;
  if (Math.abs(retained - data.retainedBest) > 0.00001) return invalid;
  return {
    state: "ready",
    data: { ...data, candidates, history, bestGenerated },
  };
}
