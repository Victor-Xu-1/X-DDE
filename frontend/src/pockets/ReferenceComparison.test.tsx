import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ReferenceComparison } from "./ReferenceComparison";
import type { Site } from "./types";
import type { MoleculeRef } from "../research/types";

const calls = vi.hoisted(() => ({ request: vi.fn(), result: vi.fn() }));
vi.mock("../api", () => ({
  request: calls.request,
  api: { result: calls.result },
  artifactUrl: (id: string, name: string) =>
    `/api/jobs/${id}/download?name=${name}`,
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
const result = {
  operation: "diffsbdd",
  mode: "pocket",
  complete: true,
  reference_artifact: "reference.sdf",
  ligand_status: { state: "verified" },
  provenance: { inputs: { protein, pocket } },
  residues: ["A:542", "A:544"],
};
const site = {
  rank: 3,
  name: "pocket3",
  score: 1,
  probability: 0.1,
  center_x: 0,
  center_y: 0,
  center_z: 0,
  residues: [542, 202].map((number) => ({
    structure: protein,
    model: 0,
    chain: "A",
    number,
    insertion_code: "",
    alternate_location: "",
  })),
} as Site;
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("requires coordinate confirmation, compares source residues and hands off the actual ligand", async () => {
  calls.request.mockImplementation(async (path: string) =>
    path.startsWith("/jobs?") ? [job] : null,
  );
  calls.result.mockResolvedValue(result);
  const onOverlay = vi.fn(),
    onGenerate = vi.fn(),
    onDock = vi.fn(),
    user = userEvent.setup();
  const { rerender } = render(
    <ReferenceComparison
      protein={protein}
      site={site}
      language="en"
      onOverlay={onOverlay}
      onGenerate={onGenerate}
      onDock={onDock}
    />,
  );
  await user.click(
    screen.getByRole("button", { name: "Compare reference region" }),
  );
  const button = await screen.findByRole("button", { name: "View overlap" });
  expect(button).toBeDisabled();
  await user.click(
    screen.getByRole("checkbox", {
      name: /verified that the reference ligand and receptor share/i,
    }),
  );
  await user.click(button);
  expect(
    await screen.findByText(
      /Reference-region residues: 2.*Overlap with selected predicted pocket: 1/,
    ),
  ).toBeVisible();
  expect(screen.getByText("A:542")).toBeVisible();
  expect(onOverlay).toHaveBeenLastCalledWith(
    "/api/jobs/reference-job/download?name=reference.sdf",
  );
  await user.click(
    screen.getByRole("button", { name: "Generate around reference" }),
  );
  await user.click(
    screen.getByRole("button", { name: "Dock around reference" }),
  );
  expect(onGenerate).toHaveBeenCalledWith(ligand);
  expect(onDock).toHaveBeenCalledWith(ligand);
  rerender(
    <ReferenceComparison
      protein={protein}
      site={{ ...site, residues: [site.residues[1]] }}
      language="en"
      onOverlay={onOverlay}
      onGenerate={onGenerate}
      onDock={onDock}
    />,
  );
  expect(
    screen.getByText(/Overlap with selected predicted pocket: 0/),
  ).toBeVisible();
});

it("rejects a changed reference result and does not display or hand off its ligand", async () => {
  calls.request.mockImplementation(async (path: string) =>
    path.startsWith("/jobs?") ? [job] : null,
  );
  calls.result.mockResolvedValue({
    ...result,
    ligand_status: { state: "unverified" },
  });
  const onOverlay = vi.fn(),
    user = userEvent.setup();
  render(
    <ReferenceComparison
      protein={protein}
      site={site}
      language="en"
      onOverlay={onOverlay}
      onGenerate={vi.fn()}
      onDock={vi.fn()}
    />,
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
  expect(await screen.findByRole("alert")).toHaveTextContent(
    /missing|mismatched|ambiguous/i,
  );
  expect(
    screen.queryByRole("button", { name: "Dock around reference" }),
  ).not.toBeInTheDocument();
  expect(onOverlay).toHaveBeenLastCalledWith(null);
});
