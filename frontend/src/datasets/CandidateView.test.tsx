import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { Job } from "../types";
import type { DatasetCandidate, DatasetResult } from "./types";
import { CandidateView } from "./CandidateView";
import { TemplatePreviewContext } from "../examples/context";

const probes = vi.hoisted(() => ({ handoff: vi.fn(), structure: vi.fn() }));
vi.mock("../viewer/PoseSession", () => ({
  PoseSession: ({ children }: { children: ReactNode }) => <>{children}</>,
  usePoseSession: () => null,
}));
vi.mock("./CandidateHandoff", () => ({
  CandidateHandoff: ({ children, ...props }: { children: ReactNode }) => {
    probes.handoff(props);
    return <>{children}</>;
  },
}));
vi.mock("./DELCandidateEvidence", () => ({
  DELCandidateEvidence: ({ candidate }: { candidate: DatasetCandidate }) => (
    <p role="note">Evidence: {candidate.id}</p>
  ),
}));
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: (props: unknown) => {
    probes.structure(props);
    return <div>Calculated native 3D</div>;
  },
}));
vi.mock("../presentation/MoleculeImage", () => ({
  MoleculeImage: ({ label }: { label: string }) => <img alt={label} />,
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const job = { id: "native-panel" } as Job;
const candidate = (
  id: string,
  geometry: DatasetCandidate["geometry"],
  record = 0,
) =>
  ({
    id,
    display_name: id,
    artifact: "candidates.sdf",
    record,
    geometry,
    smiles: "CC(=O)Nc1ccc(O)cc1",
    supplier: "chembl",
    docking_score: null,
  }) as DatasetCandidate;
const result = (...candidates: DatasetCandidate[]) =>
  ({
    program: "chemistry",
    candidates,
    artifacts: [],
    metadata: {},
  }) as unknown as DatasetResult;

it.each([
  ["en", "Download original result structure"],
  ["zh", "下载原始结果结构"],
] as const)(
  "distinguishes the native download from the displayed pose in %s",
  (language, label) => {
    render(
      <CandidateView
        job={job}
        language={language}
        result={result(
          candidate("DEL-reference", "unbound_conformer", 0),
          candidate("DEL / comparison", "unbound_conformer", 1),
        )}
      />,
    );
    expect(screen.getByRole("link", { name: label })).toHaveAttribute(
      "href",
      "/api/datasets/native-panel/candidate-structure?compound=DEL-reference",
    );
    fireEvent.click(screen.getByRole("button", { name: "DEL / comparison" }));
    expect(screen.getByRole("link", { name: label })).toHaveAttribute(
      "href",
      "/api/datasets/native-panel/candidate-structure?compound=DEL%20%2F%20comparison",
    );
    expect(
      screen.queryByRole("link", {
        name: /Download selected structure|下载当前结构/,
      }),
    ).toBeNull();
  },
);

it("opens encoded count evidence on demand and binds it to the selected DEL member", async () => {
  const data = {
    ...result(
      candidate("DEL-reference", "unbound_conformer", 0),
      candidate("DEL-hypothesis", "unbound_conformer", 1),
    ),
    operation: "del_candidates" as const,
  };
  render(<CandidateView job={job} result={data} language="en" />);
  expect(screen.queryByRole("note")).toBeNull();
  fireEvent.click(screen.getByText("Counts and sample support"));
  expect(await screen.findByRole("note")).toHaveTextContent(
    "Evidence: DEL-reference",
  );
  fireEvent.click(screen.getByRole("button", { name: "DEL-hypothesis" }));
  expect(screen.getByRole("note")).toHaveTextContent(
    "Evidence: DEL-hypothesis",
  );
});

it("opens a fixed native case without mounting an interactive research handoff", () => {
  render(
    <TemplatePreviewContext.Provider value={true}>
      <CandidateView
        {...{
          job,
          result: result(candidate("CHEMBL487451", "unbound_conformer")),
          language: "en" as const,
        }}
      />
    </TemplatePreviewContext.Provider>,
  );
  expect(screen.getByText("Calculated native 3D")).toBeVisible();
  expect(probes.handoff).not.toHaveBeenCalled();
  expect(probes.structure).toHaveBeenLastCalledWith(
    expect.objectContaining({
      records: [0],
    }),
  );
});

it("keeps an actual 2D SDF record in 2D instead of preparing a new 3D calculation", () => {
  render(
    <CandidateView
      job={job}
      language="en"
      result={result(candidate("CHEMBL374380", "none"))}
    />,
  );
  expect(screen.queryByRole("tab", { name: "3D structure" })).toBeNull();
  expect(screen.getByRole("tab", { name: "2D structure" })).toBeVisible();
  expect(probes.structure).not.toHaveBeenCalled();
});

it("retains the selected unbound screening record through 2D, 3D and handoff", () => {
  render(
    <CandidateView
      job={job}
      language="en"
      result={{
        ...result(
          candidate("CHEMBL487451", "unbound_conformer", 0),
          candidate("CHEMBL520539", "unbound_conformer", 2),
        ),
        operation: "drugclip_retrieve",
        artifacts: [
          {
            name: "candidates.sdf",
            format: "sdf",
            sha256: "a".repeat(64),
            size: 400,
            role: "candidates",
          },
        ],
      }}
    />,
  );
  expect(
    screen.getByText("Unbound conformer").closest(".dataset-preview-pane"),
  ).toHaveClass("candidate-inspection-preview");
  expect(probes.handoff).toHaveBeenLastCalledWith(
    expect.objectContaining({
      candidate: expect.objectContaining({ id: "CHEMBL487451" }),
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "CHEMBL520539" }));
  fireEvent.click(screen.getByRole("tab", { name: "2D structure" }));
  expect(screen.getByRole("tabpanel")).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: "3D structure" }));
  expect(probes.structure).toHaveBeenLastCalledWith(
    expect.objectContaining({
      records: [2],
      nativeScore: null,
      focusModel: 0,
      nativeArtifactSha256: "a".repeat(64),
      nativeArtifactRecord: 2,
    }),
  );
  expect(probes.handoff).toHaveBeenLastCalledWith(
    expect.objectContaining({
      candidate: expect.objectContaining({ id: "CHEMBL520539", record: 2 }),
    }),
  );
});

it("keeps the screening filter and exact record when changing the selected candidate", () => {
  const data = {
    ...result(
      candidate("CHEMBL487451", "unbound_conformer", 0),
      candidate("CHEMBL520539", "unbound_conformer", 2),
      candidate("Other candidate", "unbound_conformer", 3),
    ),
    operation: "library_subset" as const,
    artifacts: [
      {
        name: "candidates.sdf",
        format: "sdf" as const,
        sha256: "a".repeat(64),
        size: 400,
        role: "unbound_candidates",
      },
    ],
  };
  render(
    <CandidateView job={job} language="en" result={data} screeningReview />,
  );
  const filter = screen.getByRole("searchbox");
  fireEvent.change(filter, { target: { value: "CHEMBL" } });
  expect(screen.queryByRole("button", { name: "Other candidate" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "CHEMBL520539" }));
  expect(screen.getByRole("searchbox")).toBe(filter);
  expect(filter).toHaveValue("CHEMBL");
  expect(
    screen.getByRole("link", { name: "Download original result structure" }),
  ).toHaveAttribute(
    "href",
    "/api/datasets/native-panel/candidate-structure?compound=CHEMBL520539",
  );
  expect(probes.structure).toHaveBeenLastCalledWith(
    expect.objectContaining({
      records: [2],
      nativeArtifactSha256: "a".repeat(64),
      nativeArtifactRecord: 2,
    }),
  );
});
