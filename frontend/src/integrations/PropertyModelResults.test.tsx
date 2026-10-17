import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PropertyModelResults } from "./PropertyModelResults";
import type { NativeResult } from "./types";

vi.mock("../presentation/MolecularPreview", () => ({
  MolecularPreview: (props: unknown) => (
    <pre aria-label="Molecular identity">{JSON.stringify(props)}</pre>
  ),
}));
vi.mock("../presentation/plots/InteractivePlot", () => ({
  InteractivePlot: ({
    onPoint,
  }: {
    onPoint?(point: { pointIndex: number; curveNumber: number }): void;
  }) => (
    <button onClick={() => onPoint?.({ pointIndex: 1, curveNumber: 0 })}>
      Select second native point
    </button>
  ),
}));
afterEach(cleanup);

// Controlled display wiring with real drug-like graphs; no training or acceptance claim.
const points = [
  {
    smiles: "CNc1ccc(-c2ccnc3c2cc(CN2CCN(c4ccc(C(=O)N(C)C)cc4)CC2)n3C)nn1",
    observed: 6.482804102050025,
    predicted: 6.8,
  },
  {
    smiles: "CNc1ccc(-c2ccnc3c2cc(CN2CCN(c4ccc(C(=O)N(C)C)cc4C)CC2)n3C)nn1",
    observed: 7.71669877129645,
    predicted: 6.9,
  },
];
function result(r2: number | null): NativeResult {
  return {
    operation: "chemprop_train",
    program: "chemprop",
    version: "display fixture",
    candidates: [],
    interactions: [],
    validation_points: points,
    artifact_sha256: {},
    metrics: [
      {
        name: "Test RMSE",
        value: 0.95,
        unit: "pKd",
        method: "Held-out split fixture",
        meaning: "validation",
      },
      ...(r2 === null
        ? []
        : [
            {
              name: "Test R²",
              value: r2,
              unit: "dimensionless",
              method: "Held-out split fixture",
              meaning: "validation",
            },
          ]),
    ],
  };
}

it.each(["en", "zh"] as const)(
  "links plot and table records to their exact 2D identity in %s",
  (language) => {
    const zh = language === "zh",
      original = JSON.stringify(points);
    render(<PropertyModelResults result={result(-0.19)} language={language} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      zh ? "测试表现不足" : "Insufficient held-out performance",
    );
    const molecular = () =>
      JSON.parse(screen.getByLabelText("Molecular identity").textContent!);
    expect(molecular().source).toEqual({ smiles: points[0].smiles });
    expect(molecular().urls).toBeUndefined();
    fireEvent.click(
      screen.getByRole("button", { name: "Select second native point" }),
    );
    expect(molecular().source).toEqual({ smiles: points[1].smiles });
    expect(
      screen.getByRole("heading", {
        name: zh ? "测试记录 2" : "Test record 2",
      }),
    ).toBeVisible();
    const table = screen.getByRole("table", {
      name: zh ? "测试集逐分子误差" : "Held-out errors by molecule",
    });
    fireEvent.click(within(table).getAllByRole("row")[1]);
    expect(molecular().source).toEqual({ smiles: points[0].smiles });
    expect(
      screen.getAllByText(zh ? "实验值 (pKd)" : "Observed (pKd)").length,
    ).toBeGreaterThan(0);
    expect(JSON.stringify(points)).toBe(original);
  },
);

it.each([0, -1])(
  "keeps the insufficient-performance notice for R2=%s",
  (r2) => {
    render(<PropertyModelResults result={result(r2)} language="en" />);
    expect(screen.getByRole("status")).toHaveTextContent("R² ≤ 0");
  },
);

it.each([0.3, null])(
  "does not turn positive or missing R2 into an experimental-validation claim",
  (r2) => {
    render(<PropertyModelResults result={result(r2)} language="en" />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(
      screen.getByText(
        /no 3D binding pose or experimental model validation is implied/,
      ),
    ).toBeVisible();
  },
);
