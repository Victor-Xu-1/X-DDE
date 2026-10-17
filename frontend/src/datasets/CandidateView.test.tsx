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

it("offers full 2D and 3D views while retaining the selected exact native record and personal handoff", () => {
  render(
    <CandidateView
      job={job}
      language="en"
      result={result(
        candidate("CHEMBL487451", "unbound_conformer", 0),
        candidate("CHEMBL520539", "unbound_conformer", 2),
      )}
    />,
  );
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
    expect.objectContaining({ records: [2] }),
  );
  expect(probes.handoff).toHaveBeenLastCalledWith(
    expect.objectContaining({
      candidate: expect.objectContaining({ id: "CHEMBL520539", record: 2 }),
    }),
  );
});
