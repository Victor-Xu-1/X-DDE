import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DELCountUnit } from "./DELCountUnit";
import {
  targetSampleCapacity,
  validCountAnalysis,
} from "./del-analysis-readiness";
import type { DELSample } from "./types";

afterEach(cleanup);

it("allows honest external counts only for imports and preserves a selected incompatible value", () => {
  const change = vi.fn();
  const { rerender } = render(
    <DELCountUnit
      value="reported_counts"
      onChange={change}
      imported
      zh={false}
    />,
  );
  expect(
    screen.getByRole("option", { name: "Externally reported counts" }),
  ).toBeEnabled();
  expect(screen.getByRole("status")).toHaveTextContent(
    "not independently verified",
  );
  rerender(
    <DELCountUnit
      value="reported_counts"
      onChange={change}
      imported={false}
      zh={false}
    />,
  );
  expect(screen.getByRole("combobox")).toHaveValue("reported_counts");
  expect(
    screen.getByRole("option", { name: "Externally reported counts" }),
  ).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent("actually computed");
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: "reads" },
  });
  expect(change).toHaveBeenCalledWith("reads");
});

it("requires support to fit every explicit target group and forbids native reported counts", () => {
  const samples = [1, 2, 3].map((replicate) => ({
    column: `t${replicate}`,
    group: "target",
    role: "target",
    replicate,
  })) as DELSample[];
  const comparisons = [
    { id: "matched", selection: "target", reference: "matrix" },
  ];
  expect(targetSampleCapacity(samples, comparisons)).toBe(3);
  expect(
    validCountAnalysis(true, "reported_counts", 2, samples, comparisons),
  ).toBe(true);
  expect(
    validCountAnalysis(false, "reported_counts", 2, samples, comparisons),
  ).toBe(false);
  expect(validCountAnalysis(true, "reads", 4, samples, comparisons)).toBe(
    false,
  );
  expect(validCountAnalysis(true, "reads", 2, samples, [])).toBe(false);
  expect(validCountAnalysis(true, "reads", 1, samples, [])).toBe(true);
});
