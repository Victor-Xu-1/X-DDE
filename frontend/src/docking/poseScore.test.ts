import { expect, it } from "vitest";
import { poseScore } from "./poseScore";
import type { DockingResult, PoseResult } from "./types";
const result = {
  software_version: "1.3.3",
  options: { scoring: "vina" },
} as DockingResult;
const pose = {
  valid: true,
  artifact: "pose-001.sdf",
  scores: [
    {
      name: "minimizedAffinity",
      value: -9.31584,
      unit: "kcal/mol",
      direction: "lower",
    },
  ],
} as PoseResult;
it("binds magnitude to the chosen pose's native empirical score, never to unrelated CNN outputs", () => {
  expect(poseScore(result, pose)).toEqual({
    value: -9.31584,
    unit: "kcal/mol",
    method: "GNINA 1.3.3",
    scoring: "vina",
    scope: "whole_pose",
  });
  expect(
    poseScore(result, {
      ...pose,
      scores: [
        {
          name: "CNNaffinity",
          value: 8,
          unit: "model_output",
          direction: "higher",
        },
      ],
    }),
  ).toBeNull();
  expect(
    poseScore(result, { ...pose, scores: [{ ...pose.scores[0], value: 0 }] })
      ?.value,
  ).toBe(0);
});
it("preserves unavailable, invalid and unqualified cases rather than inventing an energy", () => {
  for (const invalid of [
    { ...pose, valid: false },
    { ...pose, artifact: undefined },
    { ...pose, scores: [] },
    { ...pose, scores: [{ ...pose.scores[0], value: NaN }] },
    { ...pose, scores: [{ ...pose.scores[0], unit: "unknown" }] },
  ])
    expect(poseScore(result, invalid)).toBeNull();
});
