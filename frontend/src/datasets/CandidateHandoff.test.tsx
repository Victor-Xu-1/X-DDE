import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { CandidateHandoff } from "./CandidateHandoff";
import type { Job } from "../types";
import type { DatasetCandidate } from "./types";
import type { MoleculeRef } from "../research/types";
const mocks = vi.hoisted(() => ({ read: vi.fn(), authorized: vi.fn() }));
vi.mock("../api", () => ({
  request: mocks.read,
  api: { authorized: mocks.authorized },
}));
vi.mock("../admet/AdmetForm", () => ({
  AdmetForm: ({ initialMolecule }: { initialMolecule: MoleculeRef }) => (
    <div data-testid="handoff">{JSON.stringify(initialMolecule)}</div>
  ),
}));
vi.mock("../quality/QualityForm", () => ({ QualityForm: () => null }));
vi.mock("../docking/DockingForm", () => ({ DockingForm: () => null }));
vi.mock("../chemistry/LibraryScreenForm", () => ({
  LibraryScreenForm: () => null,
}));
vi.mock("../integrations/ScientificForm", () => ({
  ScientificForm: () => null,
}));
vi.mock("../editors/Editors", () => ({ Editors: () => null }));
vi.mock("../deployment/DeploymentPanel", () => ({
  DeploymentPanel: () => null,
}));
const candidate: DatasetCandidate = {
  id: "candidate",
  artifact: "candidates.sdf",
  record: 499,
  geometry: "unbound_conformer",
  source_job: "older-original",
  source_record: 2,
  supplier: "",
  smiles: "",
  score: null,
  raw_score: null,
  docking_score: null,
  cnn_score: null,
  cnn_affinity: null,
};
function response(path: string) {
  const url = new URL(path, "https://local.invalid");
  if (path.includes("artifact-metadata"))
    return {
      job_id: "study",
      name: url.searchParams.get("name"),
      sha256: "a".repeat(64),
      size: 123,
    };
  const record = Number(url.searchParams.get("record"));
  return [
    {
      id: "version-" + record,
      kind: url.searchParams.get("kind"),
      source_job: "study",
      label: "A human renamed material",
      reference: {
        asset_id: "exact-file",
        sha256: "a".repeat(64),
        version_id: "version-" + record,
        record,
        conformer: 0,
      },
    },
  ];
}
afterEach(() => {
  cleanup();
  mocks.read.mockReset();
  mocks.authorized.mockReset();
});
it("uses the exact saved candidate record even if its label changed", async () => {
  mocks.read.mockImplementation(response);
  const user = userEvent.setup();
  render(
    <CandidateHandoff
      job={{ id: "study" } as Job}
      candidate={candidate}
      language="en"
    >
      <p>Candidate preview</p>
    </CandidateHandoff>,
  );
  await user.click(
    await screen.findByRole("button", { name: "ADMET predictions" }),
  );
  expect(screen.getByTestId("handoff")).toHaveTextContent('"record":499');
  expect(screen.getByTestId("handoff")).toHaveTextContent(
    '"version_id":"version-499"',
  );
  expect(screen.queryByText("Candidate preview")).toBeNull();
  await user.click(screen.getByRole("button", { name: "← Back to results" }));
  expect(screen.getByText("Candidate preview")).toBeVisible();
  expect(mocks.authorized).not.toHaveBeenCalled();
});
it("does not make a changed hash reusable or expose an internal error", async () => {
  mocks.read.mockImplementation((path: string) => {
    const value = response(path);
    if (Array.isArray(value)) value[0].reference.sha256 = "b".repeat(64);
    return value;
  });
  render(
    <CandidateHandoff
      job={{ id: "study" } as Job}
      candidate={candidate}
      language="zh"
    >
      <p>当前预览</p>
    </CandidateHandoff>,
  );
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("不一致"),
  );
  expect(screen.queryByRole("button", { name: "性质与早期安全性" })).toBeNull();
  expect(
    screen.getByRole("button", { name: "重新读取保存的材料" }),
  ).toBeEnabled();
  expect(mocks.authorized).not.toHaveBeenCalled();
});
