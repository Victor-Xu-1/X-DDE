import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { DockingResults } from "./DockingResults";
import type { DockingResult } from "./types";
import type { Job } from "../types";
const mocks = vi.hoisted(() => ({ request: vi.fn(), authorized: vi.fn() }));
vi.mock("../api", () => ({
  request: mocks.request,
  api: { authorized: mocks.authorized },
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
vi.mock("../quality/QualityForm", () => ({
  QualityForm: ({
    initialMolecule,
    initialProtein,
  }: {
    initialMolecule: unknown;
    initialProtein: unknown;
  }) => (
    <pre data-testid="quality-inputs">
      {JSON.stringify({ molecule: initialMolecule, protein: initialProtein })}
    </pre>
  ),
}));
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
  const versions = [
    {
      id: "v",
      kind: "molecule",
      label: "pose-002.sdf",
      source_job: "j",
      reference: { ...receptor, asset_id: "selected", version_id: "v" },
    },
  ];
  mocks.request.mockImplementation((path: string) =>
    path.includes("artifact-metadata")
      ? {
          job_id: "j",
          name: "pose-002.sdf",
          size: 123,
          sha256: receptor.sha256,
        }
      : versions,
  );
  render(
    <DockingResults language="zh" job={{ id: "j" } as Job} result={data} />,
  );
  expect(screen.getByText(/实际范围/)).toBeVisible();
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
  expect(screen.getAllByRole("note")).toHaveLength(1);
  expect(screen.getByRole("note")).toHaveTextContent("当前姿势");
  expect(screen.getByRole("table")).not.toHaveTextContent("重选原子区域");
  expect(screen.getByTestId("native-score")).toHaveTextContent('"value":-7');
  expect(screen.getByTestId("native-score")).toHaveTextContent(
    '"scope":"whole_pose"',
  );
  await user.click(await screen.findByRole("button", { name: "计算性质" }));
  expect(screen.getByText("property:selected")).toBeVisible();
  expect(screen.queryByTestId("viewer")).toBeNull();
  await user.click(screen.getByRole("button", { name: "← 返回结果" }));
  expect(screen.getByTestId("viewer")).toHaveTextContent(
    "/artifact/j/pose-002.sdf",
  );
  expect(mocks.request).toHaveBeenCalledWith(
    expect.stringContaining("source_job=j"),
    expect.anything(),
  );
});
it("offers explicit reindexing rather than pretending a missing asset is reusable", async () => {
  mocks.request.mockImplementation((path: string) =>
    path.includes("artifact-metadata")
      ? {
          job_id: "j",
          name: "pose-002.sdf",
          size: 123,
          sha256: receptor.sha256,
        }
      : [],
  );
  mocks.authorized.mockRejectedValue(
    new Error("indexing unavailable /srv/private/trace"),
  );
  render(
    <DockingResults language="en" job={{ id: "j" } as Job} result={data} />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Pose 2" }));
  await user.click(
    screen.getByRole("button", { name: "Register and load this pose" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Please retry");
  expect(screen.getByRole("alert")).not.toHaveTextContent("/srv/private");
  expect(
    screen.queryByRole("button", { name: "Calculate properties" }),
  ).toBeNull();
  await waitFor(() =>
    expect(mocks.authorized).toHaveBeenCalledWith(
      "/jobs/j/index-assets",
      expect.objectContaining({ method: "POST", body: "{}" }),
    ),
  );
});

it("ties the single atom-selection notice to the currently chosen pose", async () => {
  mocks.request.mockImplementation((path: string) =>
    path.includes("artifact-metadata")
      ? {
          job_id: "j",
          name: new URL(path, "http://localhost").searchParams.get("name"),
          size: 123,
          sha256: receptor.sha256,
        }
      : [],
  );
  const result: DockingResult = {
    ...data,
    poses: [
      {
        ...data.poses[1],
        record: 0,
        artifact: "pose-001.sdf",
        mapping_status: "native_atom_maps",
      },
      data.poses[1],
    ],
  };
  render(
    <DockingResults language="en" job={{ id: "j" } as Job} result={result} />,
  );
  expect(screen.queryByRole("note")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: /^Pose 2$/ }));
  expect(screen.getAllByRole("note")).toHaveLength(1);
  expect(screen.getByRole("note")).toHaveTextContent("this pose");
  await userEvent.click(screen.getByRole("button", { name: /^Pose 1$/ }));
  expect(screen.queryByRole("note")).toBeNull();
  expect(mocks.authorized).not.toHaveBeenCalled();
});

it("hands the actually selected saved pose and its receptor to the existing quality questionnaire", async () => {
  const reference = {
    ...receptor,
    asset_id: "selected-pose",
    version_id: "saved-pose",
  };
  mocks.request.mockImplementation((path: string) =>
    path.includes("artifact-metadata")
      ? {
          job_id: "j",
          name: "pose-002.sdf",
          size: 123,
          sha256: receptor.sha256,
        }
      : [
          {
            id: "saved-pose",
            kind: "molecule",
            label: "pose-002.sdf",
            source_job: "j",
            reference,
          },
        ],
  );
  render(
    <DockingResults language="zh" job={{ id: "j" } as Job} result={data} />,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "检查姿势质量" }));
  expect(JSON.parse(screen.getByTestId("quality-inputs").textContent!)).toEqual(
    { molecule: reference, protein: receptor },
  );
  await user.click(screen.getByRole("button", { name: "← 返回结果" }));
  expect(screen.getByTestId("viewer")).toHaveTextContent(
    "/artifact/j/pose-002.sdf",
  );
  expect(mocks.authorized).not.toHaveBeenCalled();
});
