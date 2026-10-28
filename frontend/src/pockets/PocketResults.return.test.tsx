import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PocketResults } from "./PocketResults";
import type { MoleculeRef } from "../research/types";
import type { PocketResult } from "./types";

const calls = vi.hoisted(() => ({ request: vi.fn(), result: vi.fn() }));
vi.mock("../api", () => ({
  request: calls.request,
  api: { result: calls.result },
  artifactUrl: (id: string, name: string) =>
    `/api/jobs/${id}/download?name=${name}`,
}));
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: ({ urls }: { urls: string[] }) => (
    <output aria-label="Viewer sources">{urls.join(" ")}</output>
  ),
}));
vi.mock("../diffsbdd/DiffForm", () => ({
  DiffForm: () => <p>Generation form</p>,
}));
vi.mock("../docking/DockingForm", () => ({
  DockingForm: () => <p>Docking form</p>,
}));

const protein: MoleculeRef = {
  asset_id: "protein",
  sha256: "a".repeat(64),
  record: 0,
  conformer: 0,
};
const ligand: MoleculeRef = {
  asset_id: "reference",
  sha256: "b".repeat(64),
  record: 0,
  conformer: 0,
};
const pocket = { kind: "ligand", ligand };
const job = {
  id: "reference-job",
  status: "succeeded",
  request: {
    name: "Experimental region",
    operation: "diffsbdd",
    payload: { mode: "pocket", protein, pocket },
  },
};
const reference = {
  operation: "diffsbdd",
  mode: "pocket",
  complete: true,
  reference_artifact: "reference.sdf",
  ligand_status: { state: "verified" },
  provenance: { inputs: { protein, pocket } },
  residues: ["A:542", "A:544"],
};
const result: PocketResult = {
  operation: "pocket_search",
  complete: true,
  protein,
  native_pocket_count: 1,
  truncated: false,
  profile: "experimental",
  software_version: "2.5.1",
  protein_artifact: "protein.pdb",
  pockets: [
    {
      rank: 1,
      name: "pocket1",
      score: 1,
      probability: 0.1,
      center_x: 0,
      center_y: 0,
      center_z: 0,
      residues: [
        {
          structure: protein,
          model: 0,
          chain: "A",
          number: 542,
          insertion_code: "",
          alternate_location: "",
        },
      ],
    },
  ],
};
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("retains the verified comparison after returning from a downstream form, without leaking it to another task", async () => {
  calls.request.mockImplementation(async (path: string) =>
    path.startsWith("/jobs?") ? [job] : null,
  );
  calls.result.mockResolvedValue(reference);
  const user = userEvent.setup();
  const { rerender } = render(
    <PocketResults job={{ id: "pocket-job" }} result={result} language="en" />,
  );
  await user.click(
    screen.getByRole("button", { name: "Compare reference region" }),
  );
  await user.click(
    await screen.findByRole("checkbox", {
      name: /verified that the reference ligand/i,
    }),
  );
  await user.click(screen.getByRole("button", { name: "View overlap" }));
  expect(
    await screen.findByText(/Overlap with selected predicted pocket: 1/),
  ).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: "Generate around reference" }),
  );
  expect(screen.getByText("Generation form")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "← Back to results" }));
  expect(
    await screen.findByText(/Overlap with selected predicted pocket: 1/),
  ).toBeVisible();
  expect(
    screen.getByRole("checkbox", {
      name: /verified that the reference ligand/i,
    }),
  ).toBeChecked();
  expect(screen.getByLabelText("Viewer sources")).toHaveTextContent(
    "reference.sdf",
  );
  rerender(
    <PocketResults
      job={{ id: "another-pocket-job" }}
      result={result}
      language="en"
    />,
  );
  expect(
    screen.queryByText(/Overlap with selected predicted pocket/),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("Viewer sources")).not.toHaveTextContent(
    "reference.sdf",
  );
});
