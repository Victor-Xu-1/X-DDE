import { expect, it } from "vitest";
import native from "./optimization-native.fixture.json";
import { optimizationReview } from "./optimization-model";

it("retains the real STAT6 baseline, individual rounds and native record identities", () => {
  const original = structuredClone(native);
  const review = optimizationReview(native, "qed");
  expect(review.state).toBe("ready");
  if (review.state !== "ready") throw new Error("Native case was not admitted");
  expect(review.data.initial).toBe(0.6993186718877541);
  expect(review.data.bestGenerated).toMatchObject({
    record: 1,
    attempt: 2,
    round: 1,
    score: 0.73258,
  });
  expect(review.data.candidates.filter((row) => row.improved)).toHaveLength(1);
  expect(review.data.history[1].best).toBeLessThan(
    review.data.history[0].best!,
  );
  expect(review.data.retainedBest).toBe(0.7325849246144713);
  expect(native).toEqual(original);
});

it("uses the actual SDF record order when sampling attempts contain rejections", () => {
  const value = structuredClone(native);
  value.molecules.shift();
  value.valid--;
  value.optimization.history[0].valid--;
  const review = optimizationReview(value, "qed");
  expect(review.state).toBe("ready");
  if (review.state === "ready")
    expect(review.data.bestGenerated).toMatchObject({ record: 0, attempt: 2 });
});

it("keeps generated and retained best distinct when all candidates are worse than the input", () => {
  const value = structuredClone(native);
  value.optimization.initial_score = value.optimization.best_score = 0.9;
  value.molecules.forEach((row) => {
    row.improved_over_input = false;
  });
  const review = optimizationReview(value, "qed");
  expect(review.state).toBe("ready");
  if (review.state === "ready") {
    expect(review.data.bestGenerated!.score).toBeLessThan(review.data.initial);
    expect(review.data.retainedBest).toBe(0.9);
    expect(review.data.candidates.some((row) => row.improved)).toBe(false);
  }
});

it("applies the native lower-is-better SA direction without interpreting it as QED or affinity", () => {
  // Controlled direction/rounding test, not a claim of a native SA optimization run.
  const value = structuredClone(native);
  value.optimization.objective = "sa";
  value.optimization.initial_score = 3.136358738620544;
  value.molecules.forEach((row) => {
    row.objective_score = row.sa;
    row.improved_over_input = row.sa < value.optimization.initial_score;
  });
  value.optimization.best_score = Math.min(
    value.optimization.initial_score,
    ...value.molecules.map((row) => row.sa),
  );
  value.optimization.history.forEach((round) => {
    round.best_score = Math.min(
      ...value.molecules
        .filter((row) => row.round === round.round)
        .map((row) => row.sa),
    );
  });
  const review = optimizationReview(value, "sa");
  expect(review.state).toBe("ready");
  if (review.state === "ready")
    expect(review.data.bestGenerated).toMatchObject({
      record: 3,
      score: 2.8331,
    });
});

it("does not fabricate missing or contradictory optimization metadata", () => {
  expect(optimizationReview({}, "qed")).toEqual({ state: "unavailable" });
  expect(optimizationReview(native, "sa")).toEqual({ state: "invalid" });
  const invalid = [
    {
      ...native,
      optimization: { ...native.optimization, initial_score: "0.7" },
    },
    { ...native, optimization: { ...native.optimization, best_score: 0.99 } },
    { ...native, molecules: [null, ...native.molecules.slice(1)] },
    {
      ...native,
      molecules: native.molecules.map((row, i) =>
        i ? row : { ...row, objective_score: NaN },
      ),
    },
    {
      ...native,
      molecules: native.molecules.map((row, i) =>
        i ? row : { ...row, attempt: 2 },
      ),
    },
    {
      ...native,
      optimization: {
        ...native.optimization,
        history: [{ round: 1, valid: 0, best_score: 0 }],
      },
    },
  ];
  invalid.forEach((value) =>
    expect(optimizationReview(value, "qed")).toEqual({ state: "invalid" }),
  );
});
