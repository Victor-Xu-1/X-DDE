import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { GeneratedCandidates } from "./GeneratedCandidates";
import nativeOptimization from "./optimization-native.fixture.json";
import { optimizationReview } from "./optimization-model";

vi.mock("./OptimizationFigures", () => ({ OptimizationFigures: () => null }));

vi.mock("../presentation/MoleculeImage", () => ({
  MoleculeImage: ({ label }: { label: string }) => <span>{label} drawing</span>,
}));
vi.mock("../presentation/MolecularPreview", () => ({
  MolecularPreview: ({
    urls,
    records,
    source,
    focusModel,
  }: {
    urls: string[];
    records: number[];
    source: unknown;
    focusModel?: number;
  }) => (
    <output data-testid="candidate-frame">
      {JSON.stringify({ urls, records, source, focusModel })}
    </output>
  ),
}));

const rows = [{ record: 0 }, { record: 1 }];
const metrics = [
  {
    molecular_weight: 410.45,
    qed: 0.7,
    sa: 3.1,
    logp: 2.3,
    hbd: 1,
    hba: 5,
    tpsa: 87.12,
    rotatable_bonds: 5,
    minimum_pocket_distance_angstrom: 0.88,
    pocket_atom_pairs_under_1_2_angstrom: 4,
    fragments: 1,
  },
  {
    molecular_weight: 308.5,
    qed: 0.2,
    sa: 5.4,
    logp: 2.4,
    hbd: 4,
    hba: 4,
    tpsa: 49.69,
    rotatable_bonds: 10,
    minimum_pocket_distance_angstrom: 1.64,
    pocket_atom_pairs_under_1_2_angstrom: 0,
    fragments: 3,
  },
];

it.each(["en", "zh"] as const)(
  "shows truthful batch warnings and missingness in %s",
  (language) => {
    render(
      <GeneratedCandidates
        records={rows}
        selected={rows[0]}
        url="/poses.sdf"
        metrics={metrics}
        language={language}
        onSelect={vi.fn()}
      />,
    );
    const batch = screen.getByRole("region", {
      name: language === "zh" ? "批次结构检查" : "Batch structure checks",
    });
    expect(batch).toHaveTextContent(
      language === "zh"
        ? "输出包含多个片段"
        : "Outputs with disconnected fragments",
    );
    expect(batch).toHaveTextContent("1 / 2");
    expect(batch).toHaveTextContent(
      language === "zh" ? "未报告（2 条）" : "Not reported (2 records)",
    );
    expect(batch).toHaveTextContent(
      language === "zh"
        ? "不证明结合活性"
        : "does not establish full-receptor pose quality or binding activity",
    );
  },
);

it.each(["en", "zh"] as const)(
  "does not turn missing batch measurements into zero failures in %s",
  (language) => {
    const partial = [
      { ...metrics[0], fragments: null, relaxation_converged: false },
      { ...metrics[1], fragments: 2, relaxation_converged: null },
    ];
    const props = {
      records: rows,
      selected: rows[0],
      url: "/poses.sdf",
      metrics: partial,
      language,
      onSelect: vi.fn(),
    };
    const { rerender } = render(<GeneratedCandidates {...props} />);
    const batch = screen.getByRole("region", {
      name: language === "zh" ? "批次结构检查" : "Batch structure checks",
    });
    expect(batch).toHaveTextContent(
      language === "zh" ? "1 / 1（1 条未报告）" : "1 / 1 (1 not reported)",
    );
    rerender(
      <GeneratedCandidates
        {...props}
        metrics={partial.map((row) => ({
          ...row,
          fragments: null,
          relaxation_converged: null,
        }))}
      />,
    );
    expect(batch).toHaveTextContent(
      language === "zh" ? "未报告（2 条）" : "Not reported (2 records)",
    );
    expect(batch).not.toHaveTextContent(
      language === "zh" ? "0 / 2（2 条未报告）" : "0 / 2 (2 not reported)",
    );
  },
);

it("does not summarize unmatched metrics as a batch", () => {
  render(
    <GeneratedCandidates
      records={[rows[1]]}
      selected={rows[1]}
      url="/poses.sdf"
      metrics={metrics}
      language="en"
      onSelect={vi.fn()}
    />,
  );
  expect(screen.getByText(/Batch checks are incomplete/)).toBeVisible();
  expect(
    screen.queryByRole("region", { name: "Batch structure checks" }),
  ).toBeNull();
});

it.each(["en", "zh"] as const)(
  "keeps selected convergence and warnings before the candidate list in %s",
  (language) => {
    const named = [
      ...metrics.map((row, i) => ({ ...row, relaxation_converged: i !== 0 })),
    ];
    const props = {
      records: rows,
      selected: rows[0],
      url: "/poses.sdf",
      metrics: named,
      language,
      onSelect: vi.fn(),
    };
    const { rerender } = render(<GeneratedCandidates {...props} />);
    const region = screen.getByRole("region", {
      name: language === "zh" ? "所选构象检查" : "Selected structure checks",
    });
    const table = screen.getByRole("table", {
      name:
        language === "zh" ? "生成的候选分子" : "Generated candidate molecules",
    });
    expect(
      region.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(region).toHaveTextContent(
      language === "zh" ? "未收敛" : "Not converged",
    );
    rerender(<GeneratedCandidates {...props} selected={rows[1]} />);
    expect(region).toHaveTextContent(
      language === "zh" ? "已报告收敛" : "Reported converged",
    );
    expect(region).not.toHaveTextContent(
      language === "zh" ? "未收敛" : "Not converged",
    );
    expect(region).toHaveTextContent(
      language === "zh" ? "包含 3 个未连接" : "Contains 3 disconnected",
    );
    expect(region).toHaveTextContent(
      language === "zh"
        ? "不代表完整受体"
        : "does not establish independently checked full-receptor",
    );
  },
);

it("does not convert missing convergence into convergence or a passing pose", () => {
  render(
    <GeneratedCandidates
      records={rows}
      selected={rows[0]}
      url="/poses.sdf"
      metrics={metrics}
      language="en"
      onSelect={vi.fn()}
    />,
  );
  expect(
    screen.getByRole("region", { name: "Selected structure checks" }),
  ).toHaveTextContent("Convergence not reported");
  expect(screen.queryByText("Reported converged")).toBeNull();
});

it("puts optimization descriptors first without changing native record identity when sorting", () => {
  const review = optimizationReview(nativeOptimization, "qed");
  if (review.state !== "ready")
    throw new Error("Native result was not admitted");
  const records = nativeOptimization.molecules.map((_, record) => ({ record }));
  const onSelect = vi.fn();
  const { rerender } = render(
    <GeneratedCandidates
      records={records}
      selected={records[0]}
      language="en"
      url="/native/optimization/molecules.sdf"
      proteinUrl="/native/receptor.pdb"
      optimization={review.data}
      onSelect={onSelect}
    />,
  );
  const table = screen.getByRole("table", {
    name: "Generated candidate molecules",
  });
  const headers = within(table).getAllByRole("columnheader");
  expect(headers).toHaveLength(5);
  ["Select for comparison", "Candidate molecule", "QED", "SA", "ΔQED"].forEach(
    (name, index) => {
      expect(headers[index]).toHaveAccessibleName(name);
    },
  );
  expect(within(table).getAllByRole("row")[1]).toHaveTextContent("Candidate 2");
  fireEvent.click(within(table).getByRole("button", { name: "Candidate 2" }));
  expect(onSelect).toHaveBeenCalledExactlyOnceWith(records[1]);
  rerender(
    <GeneratedCandidates
      records={records}
      selected={records[1]}
      language="en"
      url="/native/optimization/molecules.sdf"
      proteinUrl="/native/receptor.pdb"
      optimization={review.data}
      onSelect={onSelect}
    />,
  );
  expect(
    JSON.parse(screen.getByTestId("candidate-frame").textContent!).records,
  ).toEqual([0, 1]);
});

it.each(["en", "zh"] as const)(
  "shows selected native record with its matching receptor and steric warning in %s",
  (language) => {
    render(
      <GeneratedCandidates
        records={rows}
        selected={rows[0]}
        url="/poses.sdf"
        proteinUrl="/receptor.pdb"
        metrics={metrics}
        language={language}
        onSelect={vi.fn()}
      />,
    );
    expect(
      JSON.parse(screen.getByTestId("candidate-frame").textContent!),
    ).toEqual({
      urls: ["/receptor.pdb", "/poses.sdf"],
      records: [0, 0],
      source: { url: "/poses.sdf", record: 0 },
      focusModel: 1,
    });
    expect(
      screen.getByText(
        language === "zh"
          ? "存在可能的空间碰撞：请先检查并优化姿势，再进行后续研究。"
          : "Potential steric clashes: inspect and refine the pose before downstream research.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "MW" })).toBeVisible();
    expect(screen.getByText("0.88 Å")).toBeVisible();
  },
);

it("keeps source record identities after a filtered/reordered table and does not label zero close pairs as binding success", () => {
  render(
    <GeneratedCandidates
      records={[rows[1]]}
      selected={rows[1]}
      url="/poses.sdf"
      proteinUrl="/receptor.pdb"
      metrics={metrics}
      language="en"
      onSelect={vi.fn()}
    />,
  );
  expect(
    JSON.parse(screen.getByTestId("candidate-frame").textContent!).records,
  ).toEqual([0, 1]);
  expect(screen.getByText("1.64 Å")).toBeVisible();
  expect(
    screen.getByText(
      "Proximity metrics cover conditioning-pocket atoms only, not the rest of the protein. Continue with full-receptor pose-quality checks.",
    ),
  ).toBeVisible();
});

it("keeps non-design exports standalone without inventing receptor or metrics", () => {
  render(
    <GeneratedCandidates
      generated={false}
      records={rows}
      selected={rows[1]}
      url="/selected.sdf"
      language="en"
      onSelect={vi.fn()}
    />,
  );
  expect(
    JSON.parse(screen.getByTestId("candidate-frame").textContent!).urls,
  ).toEqual(["/selected.sdf"]);
  expect(screen.queryByRole("columnheader", { name: "MW" })).toBeNull();
});

it.each(["en", "zh"] as const)(
  "warns about native disconnected components without dropping source atoms in %s",
  (language) => {
    render(
      <GeneratedCandidates
        records={rows}
        selected={rows[1]}
        url="/poses.sdf"
        metrics={metrics}
        language={language}
        onSelect={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("status", {
        name: language === "en" ? "Molecular connectivity" : "分子连接状态",
      }),
    ).toHaveTextContent(
      language === "en"
        ? "Contains 3 disconnected components"
        : "包含 3 个未连接的结构片段",
    );
    expect(
      screen.getByRole("columnheader", {
        name: language === "en" ? "Output components" : "输出片段数",
      }),
    ).toBeVisible();
    expect(
      JSON.parse(screen.getByTestId("candidate-frame").textContent!).source,
    ).toEqual({ url: "/poses.sdf", record: 1 });
    expect(metrics[1].fragments).toBe(3);
  },
);

it("does not infer a single connected molecule when native connectivity is unavailable", () => {
  render(
    <GeneratedCandidates
      records={rows}
      selected={rows[0]}
      url="/poses.sdf"
      metrics={[{ ...metrics[0], fragments: null }]}
      language="en"
      onSelect={vi.fn()}
    />,
  );
  expect(screen.queryByText(/disconnected components/)).toBeNull();
  expect(screen.queryByText(/connected molecule/)).toBeNull();
});
