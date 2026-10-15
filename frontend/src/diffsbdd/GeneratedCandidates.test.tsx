import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { GeneratedCandidates } from "./GeneratedCandidates";

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
      "This proximity check does not replace full pose-quality or binding validation.",
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
        name: language === "en" ? "Components" : "结构片段数",
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
