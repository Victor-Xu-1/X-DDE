import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PocketResults } from "./PocketResults";
import type { PocketResult, Site } from "./types";
import type { MoleculeRef } from "../research/types";

vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: ({
    residueRegion,
  }: {
    residueRegion?: Site["residues"];
  }) => (
    <output aria-label="Viewer region">
      {JSON.stringify(residueRegion ?? [])}
    </output>
  ),
}));
vi.mock("../diffsbdd/DiffForm", () => ({
  DiffForm: ({
    initialProtein,
    initialPocket,
  }: {
    initialProtein: MoleculeRef;
    initialPocket: unknown;
  }) => (
    <output aria-label="Generation input">
      {JSON.stringify({ initialProtein, initialPocket })}
    </output>
  ),
}));
vi.mock("../docking/DockingForm", () => ({
  DockingForm: ({
    initialReceptor,
    initialBox,
  }: {
    initialReceptor: MoleculeRef;
    initialBox: unknown;
  }) => (
    <output aria-label="Docking input">
      {JSON.stringify({ initialReceptor, initialBox })}
    </output>
  ),
}));
afterEach(cleanup);

// Controlled identity fixtures; real BRD4/P2Rank outputs are checked by the browser gate.
const protein = {
  asset_id: "original-protein",
  sha256: "a".repeat(64),
  version_id: "immutable-version",
  record: 0,
  conformer: 0,
} as MoleculeRef;
const sites: Site[] = [1, 2].map((rank) => ({
  rank,
  name: `pocket${rank}`,
  probability: 0.4 / rank,
  score: 7 / rank,
  center_x: rank,
  center_y: rank + 2,
  center_z: rank + 3,
  residues: [
    {
      structure: protein,
      model: 0,
      chain: "A",
      number: 100 + rank,
      insertion_code: "",
      alternate_location: "",
    },
  ],
}));
const result: PocketResult = {
  operation: "pocket_search",
  complete: true,
  protein,
  pockets: sites,
  native_pocket_count: 2,
  truncated: false,
  profile: "experimental",
  software_version: "2.5.1",
  protein_artifact: "native/protein.pdb",
};

it("keeps keyboard selection, native viewer region and both research handoffs on the same exact pocket", async () => {
  const before = JSON.stringify(result),
    user = userEvent.setup();
  render(
    <PocketResults
      job={{ id: "retained-pockets" }}
      result={result}
      language="en"
    />,
  );
  const select = screen.getByRole("button", { name: "Pocket 2" });
  select.focus();
  await user.keyboard("{Enter}");
  expect(select).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByLabelText("Viewer region")).toHaveTextContent(
    JSON.stringify(sites[1].residues),
  );
  const panel = screen.getByRole("region", { name: "Selected pocket" });
  expect(
    within(panel).getByRole("heading", { name: "Pocket 2" }),
  ).toBeVisible();
  await user.click(screen.getByText("Inspect pocket residues"));
  expect(within(panel).getByText("A:102")).toBeVisible();
  await user.click(
    within(panel).getByRole("button", {
      name: "Generate molecules in this pocket",
    }),
  );
  expect(
    JSON.parse(screen.getByLabelText("Generation input").textContent!),
  ).toEqual({
    initialProtein: protein,
    initialPocket: { kind: "residues", residues: sites[1].residues },
  });
  await user.click(screen.getByRole("button", { name: "← Back to results" }));
  expect(screen.getByRole("button", { name: "Pocket 2" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await user.click(
    screen.getByRole("button", { name: "Explore poses in this pocket" }),
  );
  expect(
    JSON.parse(screen.getByLabelText("Docking input").textContent!),
  ).toEqual({
    initialReceptor: protein,
    initialBox: { center: [2, 4, 5], size: [20, 20, 20], unit: "angstrom" },
  });
  expect(JSON.stringify(result)).toBe(before);
});

it.each(["insertion_code", "alternate_location", "chain"] as const)(
  "does not remove the native %s identity to enable molecule generation",
  async (field) => {
    const residue = {
      ...sites[0].residues[0],
      [field]: field === "chain" ? "AA" : "B",
    };
    render(
      <PocketResults
        job={{ id: "ambiguous" }}
        result={{ ...result, pockets: [{ ...sites[0], residues: [residue] }] }}
        language="en"
      />,
    );
    expect(
      screen.getByRole("button", { name: "Generate molecules in this pocket" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Explore poses in this pocket" }),
    ).toBeEnabled();
    expect(screen.getByLabelText("Viewer region")).toHaveTextContent(
      JSON.stringify([residue]),
    );
  },
);

it("preserves format restrictions and the empty result without inventing a selectable site", () => {
  const { rerender } = render(
    <PocketResults
      job={{ id: "cif" }}
      result={{ ...result, protein_artifact: "native/protein.cif" }}
      language="zh"
      initialRank={2}
    />,
  );
  expect(screen.getByRole("heading", { name: "口袋 2" })).toBeVisible();
  expect(
    screen.getByRole("button", { name: "用这个口袋生成分子" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "探索这个口袋的结合模式" }),
  ).toBeDisabled();
  // A newly selected task owns a fresh component state.
  rerender(
    <PocketResults
      key="empty"
      job={{ id: "empty" }}
      result={{ ...result, pockets: [], native_pocket_count: 0 }}
      language="en"
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "No candidate pockets were returned",
  );
  expect(screen.queryByRole("region", { name: "Selected pocket" })).toBeNull();
  expect(screen.getByLabelText("Viewer region")).toHaveTextContent("[]");
});
