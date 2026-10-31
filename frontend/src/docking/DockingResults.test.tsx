import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
    ...display
  }: {
    urls: string[];
    nativeScore?: unknown;
    comparison?: boolean;
    sourceSnapshot?: boolean;
    focusModels?: number[];
    records?: number[];
  }) => (
    <div data-testid="viewer">
      {urls.join(";")}
      <span data-testid="native-score">{JSON.stringify(nativeScore)}</span>
      <span data-testid="display-spec">{JSON.stringify(display)}</span>
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
it.each(["en", "zh"] as const)(
  "shows the engine-reported box for new results in %s",
  (language) => {
    render(
      <DockingResults
        language={language}
        job={{ id: "j" } as Job}
        result={{
          ...data,
          search_report: {
            center: [1, -2, 3],
            size: [20, 22, 24],
            unit: "angstrom",
            precision: "engine_log_rounded",
            automatic_ligand_extension: false,
          },
        }}
      />,
    );
    expect(screen.getByText(/1 \/ -2 \/ 3 Å/)).toHaveTextContent(
      "20 × 22 × 24 Å",
    );
    expect(screen.queryByText(/resulting bounds are not recorded/)).toBeNull();
  },
);
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

it.each(["en", "zh"] as const)(
  "%s overlays two exact native poses and returns to single-pose inspection without writes",
  async (language) => {
    mocks.request.mockResolvedValue([]);
    const result: DockingResult = {
      ...data,
      poses: [
        { ...data.poses[1], record: 0, artifact: "pose-001.sdf" },
        data.poses[1],
      ],
    };
    const original = JSON.stringify(result),
      zh = language === "zh";
    const user = userEvent.setup();
    const view = render(
      <DockingResults
        language={language}
        job={{ id: "j" } as Job}
        result={result}
      />,
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: zh ? "对比 姿势 1" : "Compare Pose 1",
      }),
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: zh ? "对比 姿势 2" : "Compare Pose 2",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: zh ? "对比 (2)" : "Compare (2)" }),
    );
    await user.click(
      screen.getByRole("button", {
        name: zh ? "三维比较两个姿势" : "Compare two poses in 3D",
      }),
    );
    const comparison = screen.getByRole("region", {
      name: zh ? "结合姿势三维比较" : "Binding pose structural comparison",
    });
    expect(within(comparison).getByTestId("viewer")).toHaveTextContent(
      "/artifact/j/receptor.pdb;/artifact/j/pose-001.sdf;/artifact/j/pose-002.sdf",
    );
    const spec = JSON.parse(
      within(comparison).getByTestId("display-spec").textContent!,
    );
    expect(spec).toEqual(
      expect.objectContaining({
        comparison: true,
        sourceSnapshot: true,
        focusModels: [1, 2],
        records: [0, 0, 0],
      }),
    );
    expect(
      within(comparison).getByTestId("native-score"),
    ).toBeEmptyDOMElement();
    expect(
      within(comparison)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual(["/artifact/j/pose-001.sdf", "/artifact/j/pose-002.sdf"]);
    expect(
      screen.queryByRole("button", {
        name: zh ? "检查姿势质量" : "Check pose quality",
      }),
    ).toBeNull();
    await user.click(
      within(comparison).getByRole("button", {
        name: zh ? "姿势 2 · 紫色碳" : "Pose 2 · Purple carbon",
      }),
    );
    expect(
      screen.queryByRole("region", {
        name: zh ? "结合姿势三维比较" : "Binding pose structural comparison",
      }),
    ).toBeNull();
    expect(
      screen.getByRole("link", {
        name: zh ? "下载所选姿势 SDF" : "Download selected pose SDF",
      }),
    ).toHaveAttribute("href", "/artifact/j/pose-002.sdf");
    expect(screen.getByTestId("native-score")).toHaveTextContent('"value":-7');
    await user.click(
      screen.getByRole("button", {
        name: zh ? "三维比较两个姿势" : "Compare two poses in 3D",
      }),
    );
    view.rerender(
      <DockingResults
        language={language}
        job={{ id: "another-job" } as Job}
        result={result}
      />,
    );
    expect(
      screen.queryByRole("region", {
        name: zh ? "结合姿势三维比较" : "Binding pose structural comparison",
      }),
    ).toBeNull();
    expect(screen.getByTestId("viewer")).not.toHaveTextContent("/artifact/j/");
    expect(JSON.stringify(result)).toBe(original);
    expect(mocks.authorized).not.toHaveBeenCalled();
  },
);

it("leaves rejected and more-than-two metric selections out of the structural overlay", async () => {
  mocks.request.mockResolvedValue([]);
  const result = {
    ...data,
    poses: [
      ...data.poses,
      { ...data.poses[1], record: 2, artifact: "pose-003.sdf" },
    ],
  };
  render(
    <DockingResults language="en" job={{ id: "j" } as Job} result={result} />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("checkbox", { name: "Compare Pose 1" }));
  await user.click(screen.getByRole("checkbox", { name: "Compare Pose 2" }));
  await user.click(screen.getByRole("button", { name: "Compare (2)" }));
  expect(
    screen.getByRole("button", { name: "Compare two poses in 3D" }),
  ).toBeDisabled();
  await user.click(screen.getByRole("checkbox", { name: "Compare Pose 3" }));
  expect(
    screen.getByRole("button", { name: "Compare two poses in 3D" }),
  ).toBeDisabled();
  expect(
    screen.queryByRole("region", {
      name: "Binding pose structural comparison",
    }),
  ).toBeNull();
  expect(mocks.authorized).not.toHaveBeenCalled();
});

it.each([true, false])(
  "hands off only the exact adjusted receptor; indexed=%s",
  async (indexed) => {
    const adjusted = {
      ...receptor,
      asset_id: "adjusted-receptor",
      sha256: "c".repeat(64),
      version_id: "rv",
    };
    const selected = {
      ...receptor,
      asset_id: "paired-ligand",
      version_id: "lv",
    };
    const result: DockingResult = {
      ...data,
      mode: "minimize",
      poses: [{ ...data.poses[1], record: 0, artifact: "pose-001.sdf" }],
      receptor_refinement: {
        method: "gnina_local_sidechains_v1",
        residues: [{ chain: "A", number: 152, insertion_code: "" }],
        input_receptor_artifact: "input-receptor.pdb",
        moved_sidechain_atoms: 4,
        maximum_sidechain_displacement_angstrom: 0.8,
        convergence: "not_reported",
      },
    };
    mocks.request.mockImplementation((path: string) => {
      const query = new URL(path, "http://test").searchParams;
      if (path.includes("artifact-metadata")) {
        const name = query.get("name");
        return {
          job_id: "j",
          name,
          size: 123,
          sha256: name === "receptor.pdb" ? adjusted.sha256 : selected.sha256,
        };
      }
      if (query.get("asset_name") === "receptor.pdb")
        return indexed
          ? [
              {
                id: "rv",
                source_job: "j",
                kind: "structure",
                label: "receptor.pdb",
                reference: adjusted,
              },
            ]
          : [];
      return [
        {
          id: "lv",
          source_job: "j",
          kind: "molecule",
          label: "pose-001.sdf",
          reference: selected,
        },
      ];
    });
    render(
      <DockingResults language="en" job={{ id: "j" } as Job} result={result} />,
    );
    const quality = await screen.findByRole("button", {
      name: "Check pose quality",
      exact: true,
    });
    if (indexed) {
      await waitFor(() => expect(quality).toBeEnabled());
      await userEvent.setup().click(quality);
      expect(screen.getByTestId("quality-inputs")).toHaveTextContent(
        '"asset_id":"adjusted-receptor"',
      );
      expect(screen.getByTestId("quality-inputs")).toHaveTextContent(
        '"asset_id":"paired-ligand"',
      );
    } else {
      expect(quality).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "Rescore", exact: true }),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", {
          name: "Load paired receptor",
          exact: true,
        }),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("quality-inputs")).toBeNull();
    }
  },
);
