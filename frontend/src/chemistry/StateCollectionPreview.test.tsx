import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { StateCollectionPreview } from "./StateCollectionPreview";
import type { Job } from "../types";
import type { StateResult } from "./types";
import { stateReferences, stateSelection } from "./state-inspection";

vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: ({
    urls,
    nativeArtifactSha256,
  }: {
    urls: string[];
    nativeArtifactSha256?: string;
  }) => (
    <output
      data-testid="native-3d-source"
      data-source-hash={nativeArtifactSha256}
    >
      {urls[0]}
    </output>
  ),
}));
vi.mock("../presentation/MoleculeImage", () => ({
  MoleculeImage: ({ source }: { source: unknown }) => (
    <output data-testid="native-2d-source">{JSON.stringify(source)}</output>
  ),
}));
vi.mock("../presentation/SdfArtifactDownload", () => ({
  SdfArtifactDownload: ({
    label,
    url,
    sha256,
  }: {
    label: string;
    url: string;
    sha256: string;
  }) => (
    <button type="button" data-source={url} data-source-hash={sha256}>
      {label}
    </button>
  ),
}));
afterEach(cleanup);

// Two real chemical states of an ionizable medicinal-chemistry scaffold.
// Native drawing/geometry is covered by the dedicated native browser checks;
// this consumer verifies ownership and interaction, without computing a pose.
const neutral = "CN1CCN(c2ccc3cc(C(=O)N(C)C)[nH]c3c2F)CC1";
const cation = "CN(C)C(=O)c1cc2ccc(N3CC[NH+](C)CC3)c(F)c2[nH]1";
const data: StateResult = {
  operation: "molecular_states",
  complete: true,
  state_artifact: "states.sdf",
  conformer_artifact: "conformers.sdf",
  artifact_sha256: { "states.sdf": "d".repeat(64) },
  versions: {},
  coverage: { budget_limited: false, rejected: 0, protonation_rejected: 0 },
  states: [neutral, cation].map((smiles, index) => ({
    index,
    smiles,
    charge: index,
    formula: "",
    source_to_state_atoms: [],
    conformer_status: "converged",
  })),
  conformers: [
    {
      state_index: 0,
      record: 0,
      native_conformer: 0,
      artifact: "neutral-001.sdf",
      energy: 102.1,
      converged: true,
      artifact_sha256: "a".repeat(64),
      source_to_conformer_atoms: [],
    },
    {
      state_index: 0,
      record: 2,
      native_conformer: 2,
      artifact: "neutral-003.sdf",
      energy: 95.7,
      converged: true,
      artifact_sha256: "b".repeat(64),
      source_to_conformer_atoms: [],
    },
    {
      state_index: 1,
      record: 9,
      native_conformer: 0,
      artifact: "cation-010.sdf",
      energy: 114.8,
      converged: true,
      artifact_sha256: "c".repeat(64),
      source_to_conformer_atoms: [],
    },
  ],
};
const job = { id: "11111111-1111-4111-8111-111111111111" } as Job;

function Collection() {
  const [state, setState] = useState<number | undefined>(0);
  const [record, setRecord] = useState<number | null>(null);
  return (
    <StateCollectionPreview
      job={job}
      data={data}
      sets={[]}
      language="en"
      onUse={() => {}}
      stateIndex={state}
      record={record}
      onSelection={(nextState, nextRecord) => {
        setState(nextState);
        setRecord(nextRecord);
      }}
    />
  );
}

it("keeps 2D across conformers and protomers while every download and 3D source follows selection", async () => {
  const user = userEvent.setup();
  render(<Collection />);
  expect(screen.getByRole("tab", { name: "3D structure" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await user.click(screen.getByRole("tab", { name: "2D structure" }));
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Free conformer" }),
    "2",
  );
  expect(screen.getByRole("tab", { name: "2D structure" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.queryByTestId("native-3d-source")).toBeNull();
  expect(
    screen.getByRole("button", {
      name: "Download selected original conformer SDF",
    }),
  ).toHaveAttribute("data-source", expect.stringContaining("neutral-003.sdf"));
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Chemical state" }),
    "1",
  );
  expect(screen.getByRole("tab", { name: "2D structure" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.queryByTestId("native-3d-source")).toBeNull();
  expect(
    screen.getByRole("tabpanel", { name: "2D structure" }),
  ).toHaveTextContent("cation-010.sdf");
  expect(
    screen.getByRole("tabpanel", { name: "2D structure" }),
  ).toHaveTextContent("c".repeat(64));
  expect(
    screen.getByRole("button", {
      name: "Download selected original conformer SDF",
    }),
  ).toHaveAttribute("data-source-hash", "c".repeat(64));
  await user.click(screen.getByRole("tab", { name: "3D structure" }));
  expect(screen.getByTestId("native-3d-source")).toHaveTextContent(
    "cation-010.sdf",
  );
  expect(screen.getByTestId("native-3d-source")).toHaveAttribute(
    "data-source-hash",
    "c".repeat(64),
  );
  await user.click(screen.getByRole("tab", { name: /Chemical states/ }));
  expect(
    screen.getAllByTestId("native-2d-source").map((node) => node.textContent),
  ).toContain(
    JSON.stringify({
      url: `/api/jobs/${job.id}/download?name=states.sdf`,
      record: 1,
      sha256: "d".repeat(64),
    }),
  );
});

it("matches the selected native file with the registered collection record", () => {
  const native = data.conformers[1];
  const registered = {
    asset_id: "33333333-3333-4333-8333-333333333333",
    version_id: "44444444-4444-4444-8444-444444444444",
    sha256: "d".repeat(64),
    record: native.record,
    conformer: 0,
  };
  const stateRef = { ...registered, sha256: "e".repeat(64), record: 0 };
  const result = {
    ...data,
    artifact_sha256: {
      [data.state_artifact]: stateRef.sha256,
      [data.conformer_artifact]: registered.sha256,
    },
  };
  const set = {
    id: "set",
    source_job: job.id,
    source: stateRef,
    members: [
      {
        reference: stateRef,
        evidence: data.states[0],
        conformers: [{ reference: registered, evidence: native }],
      },
    ],
  };
  const selected = stateSelection(result, 0, native.record);
  expect(stateReferences(result, [set], job.id, selected)).toEqual({
    stateRef,
    conformerRef: registered,
  });
  expect(
    stateReferences(
      result,
      [{ ...set, source_job: "other-job" }],
      job.id,
      selected,
    ).conformerRef,
  ).toBeUndefined();
  expect(
    stateReferences(result, [set], job.id, stateSelection(result, 0, 0))
      .conformerRef,
  ).toBeUndefined();
});
