import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { DockingResults } from "./DockingResults";
import type { DockingResult } from "./types";
import type { Job } from "../types";
const mocks = vi.hoisted(() => ({ request: vi.fn(), post: vi.fn() }));
vi.mock("../api", () => ({
  request: mocks.request,
  api: { post: mocks.post },
  artifactUrl: (job: string, file: string) => `/artifact/${job}/${file}`,
}));
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: ({
    urls,
    nativeScore,
  }: {
    urls: string[];
    nativeScore?: unknown;
  }) => (
    <div data-testid="viewer">
      {urls.join(";")}
      <span data-testid="native-score">{JSON.stringify(nativeScore)}</span>
    </div>
  ),
}));
vi.mock("../operations/PropertyForm", () => ({
  PropertyForm: ({ initialFile }: { initialFile: string }) => (
    <div>property:{initialFile}</div>
  ),
}));
vi.mock("./DockingForm", () => ({ DockingForm: () => null }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const receptor = {
  asset_id: "r",
  sha256: "a".repeat(64),
  record: 0,
  conformer: 0,
};
const data: DockingResult = {
  operation: "docking",
  complete: true,
  mode: "dock",
  receptor,
  ligand: receptor,
  software_version: "1.3.3",
  pose_artifact: "poses.sdf",
  receptor_artifact: "receptor.pdb",
  scientific_outcome: "candidates",
  poses: [
    {
      record: 0,
      valid: false,
      reason: "invalid chemistry",
      mapping_status: "unavailable",
      scores: [],
    },
    {
      record: 1,
      valid: true,
      artifact: "pose-002.sdf",
      mapping_status: "ambiguous_reconfirm_selections",
      scores: [
        {
          name: "minimizedAffinity",
          value: -7,
          unit: "kcal/mol",
          direction: "lower",
        },
      ],
    },
  ],
};
it("previews only the chosen valid pose and reuses its exact saved record", async () => {
  mocks.request.mockResolvedValue([
    {
      id: "v",
      kind: "molecule",
      label: "pose-002.sdf",
      source_job: "j",
      reference: { ...receptor, asset_id: "selected", version_id: "v" },
    },
  ]);
  render(
    <DockingResults language="zh" job={{ id: "j" } as Job} result={data} />,
  );
  expect(screen.getByRole("button", { name: "姿势 1" })).toBeDisabled();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "姿势 2" }));
  expect(screen.getByTestId("viewer")).toHaveTextContent(
    "/artifact/j/pose-002.sdf",
  );
  expect(screen.getByTestId("viewer")).not.toHaveTextContent(
    "/artifact/j/poses.sdf",
  );
  expect(screen.getByText("重选原子区域")).toBeVisible();
  expect(screen.getByTestId("native-score")).toHaveTextContent('"value":-7');
  expect(screen.getByTestId("native-score")).toHaveTextContent(
    '"scope":"whole_pose"',
  );
  await user.click(await screen.findByRole("button", { name: "计算性质" }));
  expect(screen.getByText("property:selected")).toBeVisible();
  expect(mocks.request).toHaveBeenCalledWith(
    expect.stringContaining("source_job=j"),
    expect.anything(),
  );
});
it("offers explicit reindexing rather than pretending a missing asset is reusable", async () => {
  mocks.request.mockResolvedValue([]);
  mocks.post.mockRejectedValue(new Error("indexing unavailable"));
  render(
    <DockingResults language="en" job={{ id: "j" } as Job} result={data} />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Pose 2" }));
  await user.click(
    screen.getByRole("button", { name: "Register and load this pose" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "indexing unavailable",
  );
  expect(
    screen.queryByRole("button", { name: "Calculate properties" }),
  ).toBeNull();
  await waitFor(() =>
    expect(mocks.post).toHaveBeenCalledWith("/jobs/j/index-assets", {}),
  );
});
