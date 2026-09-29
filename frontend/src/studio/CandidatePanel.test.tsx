import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { CandidatePanel } from "./CandidatePanel";
import type { Analysis } from "../types";
const analysis: Analysis = {
  schema_version: 1,
  ligands: [],
  metric_notes: {},
  candidates: [0, 1, 2, 3].map((i) => ({
    id: "sample-" + i,
    artifact: i + ".cif",
    aligned_artifact: i ? i + "-aligned.cif" : undefined,
    atom_count: 14,
    chains: ["A"],
    ranking_score: 1 - i * 0.1,
    plddt: 85,
    ptm: null,
    iptm: null,
    has_clash: i === 0,
    rmsd_to_first: i * 0.5,
    contacts: [],
  })),
};
it("selects a conformer and overlays no more than three, without an empty affinity column", async () => {
  const user = userEvent.setup(),
    select = vi.fn(),
    compare = vi.fn();
  const props = {
    job: null,
    analysis,
    loading: false,
    error: "",
    language: "zh" as const,
    selected: "sample-0",
    onSelect: select,
    onCompare: compare,
  };
  const { rerender } = render(<CandidatePanel {...props} />);
  expect(screen.queryByText("亲和力")).toBeNull();
  await user.click(screen.getByRole("button", { name: "构象 2" }));
  expect(select).toHaveBeenCalledWith("sample-1");
  await user.click(screen.getByRole("checkbox", { name: "叠加 构象 1" }));
  expect(compare).toHaveBeenCalledWith(["sample-0"]);
  rerender(
    <CandidatePanel
      {...props}
      compared={["sample-0", "sample-1", "sample-2"]}
    />,
  );
  expect(screen.getByRole("checkbox", { name: "叠加 构象 4" })).toBeDisabled();
  await user.selectOptions(screen.getByLabelText("构象筛选"), "unclashed");
  expect(screen.queryByRole("button", { name: "构象 1" })).toBeNull();
  expect(screen.getByRole("button", { name: "构象 2" })).toBeVisible();
});
