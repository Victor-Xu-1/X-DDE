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
vi.mock("../simulations/MolecularViewport", () => ({
  MolecularViewport: ({
    sources,
    fixedLigand,
  }: {
    sources: unknown;
    fixedLigand?: "a" | "b";
  }) => (
    <div data-testid="paired-viewport" data-ligand={fixedLigand}>
      {JSON.stringify(sources)}
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
  "reveals the engine-reported box in the interpretation disclosure in %s",
  async (language) => {
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
    const box = screen.getByText(/1 \/ -2 \/ 3 Å/);
    expect(box).not.toBeVisible();
    await userEvent.click(
      screen.getByText(
        language === "zh" ? "评分与搜索范围" : "Scores and search scope",
      ),
    );
    expect(box).toBeVisible();
    expect(box).toHaveTextContent("20 × 22 × 24 Å");
    expect(screen.queryByText(/resulting bounds are not recorded/)).toBeNull();
    const download = screen.getByRole("link", {
      name:
        language === "zh" ? "下载所选姿势 SDF" : "Download selected pose SDF",
    });
    const visibleLabel = download.textContent?.trim().toLowerCase();
    expect(visibleLabel).toBeTruthy();
    expect(download.getAttribute("aria-label")?.toLowerCase()).toContain(
      visibleLabel,
    );
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
    path.startsWith("/runtime-controls")
      ? {
          capabilities: { properties: "chemistry" },
          engines: [
            {
              id: "chemistry",
              name: "RDKit",
              enabled: false,
              ready: true,
              active: false,
              operations: ["properties"],
            },
          ],
        }
      : path.includes("artifact-metadata")
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
  const user = userEvent.setup();
  await user.click(screen.getByText("评分与搜索范围"));
  expect(screen.getByText(/实际范围/)).toBeVisible();
  expect(screen.getByRole("button", { name: "姿势 1" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "预览姿势 1" })).toBeNull();
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
  const backend = within(screen.getByRole("group", { name: "此任务的后端" }));
  expect(
    await backend.findByRole("switch", { name: "RDKit" }),
  ).not.toBeChecked();
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
  "%s compares the same native poses in both layouts and returns to inspection without writes",
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
    const strip = screen.getByRole("region", {
      name: zh ? "姿势预览选择" : "Pose preview selection",
    });
    const download = () =>
      screen.queryByRole("link", {
        name: zh ? "下载所选姿势 SDF" : "Download selected pose SDF",
      });
    expect(download()).toHaveAttribute("href", "/artifact/j/pose-001.sdf");
    await user.click(
      within(strip).getByRole("button", {
        name: zh ? "下一个候选" : "Next candidate",
      }),
    );
    expect(download()).toHaveAttribute("href", "/artifact/j/pose-002.sdf");
    expect(screen.getByTestId("viewer")).toHaveTextContent(
      "/artifact/j/pose-002.sdf",
    );
    expect(
      within(strip).getByRole("button", {
        name: zh ? "预览姿势 2" : "Preview pose 2",
      }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      within(
        screen.getByRole("region", {
          name: zh ? "所选姿势分数" : "Selected pose scores",
        }),
      ).getByText("-7.000"),
    ).toBeVisible();
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
    const open = screen.getByRole("button", {
      name: zh ? "三维比较两个姿势" : "Compare two poses in 3D",
    });
    expect(
      screen.queryByRole("region", {
        name: zh ? "结果对比" : "Result comparison",
      }),
    ).toBeNull();
    await user.click(open);
    const comparisonRegion = () =>
      screen.getByRole("region", {
        name: zh ? "结合姿势三维比较" : "Binding pose structural comparison",
      });
    let comparison = comparisonRegion();
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
    expect(download()).toBeNull();
    expect(
      within(comparison).getByTestId("native-score"),
    ).toBeEmptyDOMElement();
    expect(
      within(comparison)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual(["/artifact/j/pose-001.sdf", "/artifact/j/pose-002.sdf"]);
    expect(
      within(comparison).getByRole("heading", {
        name: zh ? "结合姿势比较" : "Compare binding poses",
      }),
    ).toHaveFocus();
    await user.click(
      within(comparison).getByRole("button", {
        name: zh ? "返回单个姿势" : "Return to single pose",
      }),
    );
    expect(open).toHaveFocus();
    expect(download()).toHaveAttribute("href", "/artifact/j/pose-002.sdf");
    await user.click(open);
    comparison = comparisonRegion();
    expect(
      screen.queryByRole("button", {
        name: zh ? "检查姿势质量" : "Check pose quality",
      }),
    ).toBeNull();
    await user.click(
      within(comparison).getByRole("button", {
        name: zh ? "A / B 并列" : "A / B side by side",
      }),
    );
    expect(within(comparison).queryByTestId("viewer")).toBeNull();
    for (const [index, slot] of ["a", "b"].entries()) {
      const label = (zh ? "姿势 " : "Pose ") + (index + 1);
      const panel = within(comparison).getByRole("region", {
        name: slot.toUpperCase() + " · " + label,
      });
      const viewport = within(panel).getByTestId("paired-viewport");
      expect(viewport).toHaveAttribute("data-ligand", slot);
      expect(JSON.parse(viewport.textContent!)).toEqual([
        { url: "/artifact/j/receptor.pdb", format: "pdb", role: "protein" },
        {
          url: "/artifact/j/pose-001.sdf",
          format: "sdf",
          role: "ligand",
          label: zh ? "姿势 1" : "Pose 1",
        },
        {
          url: "/artifact/j/pose-002.sdf",
          format: "sdf",
          role: "ligand",
          label: zh ? "姿势 2" : "Pose 2",
        },
      ]);
      expect(
        within(panel).getByRole("link", {
          name: zh ? `下载${label} SDF` : `Download ${label} SDF`,
        }),
      ).toHaveAttribute("href", `/artifact/j/pose-00${index + 1}.sdf`);
    }
    await user.click(
      within(comparison).getByRole("button", {
        name: zh ? "叠加查看" : "Overlay",
      }),
    );
    expect(within(comparison).getByTestId("viewer")).toHaveTextContent(
      "/artifact/j/receptor.pdb;/artifact/j/pose-001.sdf;/artifact/j/pose-002.sdf",
    );
    await user.click(
      within(comparison).getByRole("button", {
        name: zh ? "A / B 并列" : "A / B side by side",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: zh ? "检查姿势 2" : "Inspect Pose 2",
      }),
    );
    expect(
      screen.getByRole("group", {
        name: zh ? "结合姿势预览" : "Binding pose preview",
      }),
    ).toHaveFocus();
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
      expect(screen.getByRole("button", { name: "Rescore" })).toBeDisabled();
      expect(
        screen.getByRole("button", {
          name: "Load paired receptor",
        }),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("quality-inputs")).toBeNull();
    }
  },
);
