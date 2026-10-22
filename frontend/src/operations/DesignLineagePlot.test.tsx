import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { DesignLineagePlot } from "./DesignLineagePlot";
import { designLineage } from "./design-lineage";

afterEach(cleanup);
vi.mock("../presentation/plots/InteractivePlot", () => ({
  InteractivePlot: ({
    title,
    data,
    onPoint,
  }: {
    title: string;
    data: { text?: string[] }[];
    onPoint?(point: unknown): void;
  }) => (
    <div role="application" aria-label={title}>
      {(data[1]?.text ?? []).map((id, index) => (
        <button
          key={id}
          onClick={() => onPoint?.({ curveNumber: 1, pointNumber: index })}
        >
          {id}
        </button>
      ))}
    </div>
  ),
}));
const declining = {
  lineage_count: 2,
  improving_lineages: [],
  declining_lineages: [
    { candidate_ids: ["WT", "N614A"], scores: [1.1, 1.12] },
    { candidate_ids: ["WT", "N614Q"], scores: [1.1, 1.13] },
  ],
};

it("draws actual declining paths even without a structural phylogeny and permits candidate inspection", async () => {
  render(<DesignLineagePlot value={declining} language="en" />);
  const plot = screen.getByRole("application", {
    name: "Candidate design lineage",
  });
  expect(plot).toBeVisible();
  expect(screen.getByText(/2 \/ 2/)).toBeVisible();
  expect(
    screen.getByText(/not biological evolutionary distance/),
  ).toBeVisible();
  await userEvent.setup().click(screen.getByRole("button", { name: "N614Q" }));
  expect(
    screen.getByRole("combobox", { name: "Inspect candidate" }),
  ).toHaveValue("N614Q");
  expect(screen.getByText("1.13")).toBeVisible();
  expect(screen.getByText("WT", { selector: "dd" })).toBeVisible();
});
it("keeps missing native scores unknown and never invents an edge or a zero score", () => {
  const model = designLineage({
    lineage_count: 1,
    declining_lineages: [
      { candidate_ids: ["WT", "child"], scores: [null, 1.12] },
    ],
  });
  expect(model.nodes.find((node) => node.id === "WT")?.score).toBeNull();
  expect(model.edges).toEqual([{ parent: "WT", child: "child" }]);
  render(
    <DesignLineagePlot
      value={{ lineage_count: 0, root_ids: ["WT"] }}
      language="zh"
    />,
  );
  expect(screen.getByText(/没有提供明确的父子路径/)).toBeVisible();
  expect(screen.queryByRole("application")).toBeNull();
});
it("refuses contradictory scores or cycles instead of fabricating a convincing tree", () => {
  expect(() =>
    designLineage({
      ...declining,
      improving_lineages: [
        { candidate_ids: ["WT", "other"], scores: [2.1, 1.0] },
      ],
    }),
  ).toThrow();
  expect(() =>
    designLineage({
      lineage_count: 1,
      declining_lineages: [
        { candidate_ids: ["WT", "child", "WT"], scores: [1, 2, 1] },
      ],
    }),
  ).toThrow();
  render(
    <DesignLineagePlot
      value={{
        lineage_count: 1,
        declining_lineages: [{ candidate_ids: ["WT", "child"], scores: [1] }],
      }}
      language="en"
    />,
  );
  expect(screen.getByRole("alert")).toBeVisible();
  expect(screen.queryByRole("application")).toBeNull();
});
