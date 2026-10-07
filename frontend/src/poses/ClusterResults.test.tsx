import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ClusterResults } from "./ClusterResults";
import type { Job } from "../types";
import type { PoseClusterResult } from "./cluster-types";
import { clusterDefaults } from "./cluster-generated";
vi.mock("../presentation/MolecularPreview", () => ({
  MolecularPreview: (p: { urls: string[] }) => (
    <output aria-label="paired-source">{p.urls.join("|")}</output>
  ),
}));
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: (p: {
    urls: string[];
    comparison: boolean;
    focusModels?: number[];
  }) => (
    <output
      aria-label="comparison-source"
      data-focus-models={p.focusModels?.join(",")}
    >
      {String(p.comparison)}:{p.urls.join("|")}
    </output>
  ),
}));
afterEach(cleanup);
const ref = {
  asset_id: "controlled",
  version_id: "controlled-version",
  sha256: "a".repeat(64),
  record: 0,
  conformer: 0,
};
const result: PoseClusterResult = {
  operation: "pose_cluster",
  complete: true,
  frame: ref,
  options: clusterDefaults,
  rows: [0, 1].map((index) => ({
    index,
    selection: { step_id: "pose_000", record: index },
    reference: { ...ref, asset_id: "pose-source-" + index },
    member_index: index,
    receptor: { ...ref, asset_id: "receptor-source-" + index },
    identity_smiles: "controlled",
    heavy_atom_count: 30,
    contact_count: 0,
    mapped_contact_count: 0,
    contact_mapping_coverage: null,
    contacts: [],
    contacts_truncated: false,
    pose_artifact: "pose-00" + index + ".sdf",
    receptor_artifact: "receptor-0" + index + ".pdb",
  })),
  pairs: [
    {
      left: 0,
      right: 1,
      same_chemical_graph: true,
      rmsd_angstrom: null,
      atom_mapping_status: "symmetry_map_budget_exhausted",
      symmetry_maps: 1001,
      contact_jaccard: null,
      contact_status: "no_mapped_contacts",
    },
  ],
  clusters: [0, 1].map((i) => ({
    id: i + 1,
    members: [i],
    representative: i,
    sample_count: 1,
  })),
  artifacts: {},
};
it("keeps unknown pair metrics explicit and previews exact source poses rather than fabricated representatives", async () => {
  const user = userEvent.setup();
  render(
    <ClusterResults
      job={{ id: "native-job" } as Job}
      result={result}
      language="zh"
    />,
  );
  expect(
    screen.getByRole("heading", { name: "2 组结合模式" }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText("paired-source").textContent).toBe(
    "/api/assets/receptor-source-0|/api/assets/pose-source-0",
  );
  expect(
    screen.getByRole("link", { name: "下载原始姿势" }).getAttribute("href"),
  ).toContain("pose-000.sdf");
  await user.click(
    screen.getAllByRole("button", { name: "姿势 1 / 2 · 未知" })[0],
  );
  expect(screen.getByLabelText("comparison-source").textContent).toContain(
    "true:",
  );
  expect(screen.getByLabelText("comparison-source").textContent).toContain(
    "frame.pdb",
  );
  expect(screen.getByLabelText("comparison-source")).toHaveAttribute(
    "data-focus-models",
    "1,2",
  );
  expect(screen.getByText(/三维差异 —/)).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "下载全部接触" }).getAttribute("href"),
  ).toContain("contacts.csv");
});
