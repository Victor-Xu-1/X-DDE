import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PocketResults } from "./PocketResults";
import type { PocketResult, Site } from "./types";
import type { MoleculeRef } from "../research/types";

vi.mock("./ReferenceComparison", () => ({
  ReferenceComparison: ({
    onGenerate,
    onDock,
    onOverlay,
  }: {
    onGenerate: (value: MoleculeRef, jobId: string) => void;
    onDock: (value: MoleculeRef, jobId: string) => void;
    onOverlay: (value: string | null) => void;
  }) => (
    <div>
      <button onClick={() => onGenerate(reference, "reference-task")}>
        Reference generate
      </button>
      <button onClick={() => onDock(reference, "reference-task")}>
        Reference dock
      </button>
      <button onClick={() => onOverlay("reference.sdf")}>Show reference</button>
    </div>
  ),
}));
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: ({
    residueRegion,
    urls,
    focusModel,
    initialMode,
    searchBox,
  }: {
    residueRegion?: Site["residues"];
    urls: string[];
    focusModel?: number;
    initialMode?: string;
    searchBox?: unknown;
  }) => (
    <>
      <output aria-label="Viewer region">
        {JSON.stringify(residueRegion ?? [])}
      </output>
      <output aria-label="Viewer sources">
        {JSON.stringify({ urls, focusModel, initialMode, searchBox })}
      </output>
    </>
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
    initialReference,
  }: {
    initialReceptor: MoleculeRef;
    initialBox: unknown;
    initialReference?: MoleculeRef;
  }) => (
    <output aria-label="Docking input">
      {JSON.stringify({ initialReceptor, initialBox, initialReference })}
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
const reference: MoleculeRef = {
  ...protein,
  asset_id: "ref-ligand",
  sha256: "b".repeat(64),
};
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
  const strip = screen.getByRole("region", {
    name: "Pocket preview selection",
  });
  await user.click(
    within(strip).getByRole("button", { name: "Next candidate" }),
  );
  expect(screen.getByLabelText("Viewer region")).toHaveTextContent(
    JSON.stringify(sites[1].residues),
  );
  expect(
    within(strip).getByRole("button", { name: "Preview pocket 2" }),
  ).toHaveAttribute("aria-pressed", "true");
  await user.click(
    within(strip).getByRole("button", { name: "Preview pocket 1" }),
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
    initialReference: null,
    initialBox: { center: [2, 4, 5], size: [20, 20, 20], unit: "angstrom" },
  });
  const origin = screen.getByRole("region", {
    name: "Starting research inputs",
  });
  expect(
    within(origin).getByRole("heading", { name: "Predicted pocket 2" }),
  ).toBeVisible();
  expect(within(origin).getByText(/Center \(2, 4, 5\) Å/)).toBeVisible();
  expect(
    within(origin).getByRole("link", { name: "Original receptor" }),
  ).toHaveAttribute(
    "href",
    expect.stringContaining("/api/jobs/retained-pockets/download"),
  );
  const preview = within(origin).getByRole("button", {
    name: "Preview starting structure",
  });
  await user.click(preview);
  expect(preview).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByLabelText("Viewer sources")).toHaveTextContent(
    '"searchBox":{"center":[2,4,5],"size":[20,20,20],"unit":"angstrom"}',
  );
  expect(screen.getByLabelText("Viewer region")).toHaveTextContent(
    JSON.stringify(sites[1].residues),
  );
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

const nativeResidue = sites[0].residues[0];
it.each([
  [
    "other asset",
    [{ ...nativeResidue, structure: { ...protein, asset_id: "another-file" } }],
  ],
  [
    "other version",
    [
      {
        ...nativeResidue,
        structure: { ...protein, version_id: "another-version" },
      },
    ],
  ],
  ["duplicate residue", [nativeResidue, nativeResidue]],
  [
    "oversized region",
    Array.from({ length: 251 }, (_, number) => ({ ...nativeResidue, number })),
  ],
  ["punctuation chain", [{ ...nativeResidue, chain: "." }]],
])(
  "blocks generation for %s while keeping the same-frame docking box",
  (_case, residues) => {
    render(
      <PocketResults
        job={{ id: "native-contract" }}
        result={{ ...result, pockets: [{ ...sites[0], residues }] }}
        language="en"
      />,
    );
    expect(
      screen.getByRole("button", { name: "Generate molecules in this pocket" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Explore poses in this pocket" }),
    ).toBeEnabled();
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
  expect(
    screen.getByText(/^No candidate pockets were returned\./),
  ).toHaveAttribute("role", "status");
  expect(screen.queryByRole("region", { name: "Selected pocket" })).toBeNull();
  expect(screen.getByLabelText("Viewer region")).toHaveTextContent("[]");
});

it("hands the selected reference ligand to generation and docking without changing the receptor", async () => {
  const user = userEvent.setup();
  render(
    <PocketResults
      job={{ id: "retained-pockets" }}
      result={result}
      language="en"
    />,
  );
  await user.click(screen.getByRole("button", { name: "Reference generate" }));
  expect(screen.getByLabelText("Generation input")).toHaveTextContent(
    JSON.stringify({
      initialProtein: protein,
      initialPocket: { kind: "ligand", ligand: reference },
    }),
  );
  await user.click(screen.getByRole("button", { name: "← Back to results" }));
  await user.click(screen.getByRole("button", { name: "Reference dock" }));
  expect(screen.getByLabelText("Docking input")).toHaveTextContent(
    JSON.stringify({
      initialReceptor: protein,
      initialBox: null,
      initialReference: reference,
    }),
  );
});

it("treats the confirmed reference as a ligand in the same complex", async () => {
  const user = userEvent.setup();
  render(
    <PocketResults
      job={{ id: "retained-pockets" }}
      result={result}
      language="en"
    />,
  );
  expect(screen.getByLabelText("Viewer sources")).not.toHaveTextContent(
    "focusModel",
  );
  await user.click(screen.getByRole("button", { name: "Show reference" }));
  expect(screen.getByLabelText("Viewer sources")).toHaveTextContent(
    '"focusModel":1',
  );
  expect(screen.getByLabelText("Viewer sources")).toHaveTextContent(
    '"initialMode":"pocket"',
  );
  expect(screen.getByLabelText("Viewer sources")).toHaveTextContent(
    "reference.sdf",
  );
});

it("clears a previous task's selection and blocks a mismatched receptor from either handoff", async () => {
  const user = userEvent.setup();
  const { rerender } = render(
    <PocketResults
      job={{ id: "first" }}
      result={result}
      language="en"
      initialRank={2}
    />,
  );
  await user.click(
    screen.getByRole("button", { name: "Explore poses in this pocket" }),
  );
  expect(
    screen.getByRole("heading", { name: "Predicted pocket 2" }),
  ).toBeVisible();
  const replacement = {
    ...result,
    protein: { ...protein, sha256: "b".repeat(64) },
  };
  rerender(
    <PocketResults job={{ id: "second" }} result={replacement} language="en" />,
  );
  expect(screen.queryByLabelText("Docking input")).toBeNull();
  expect(screen.getByRole("button", { name: "Pocket 1" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(
    screen.getByRole("button", { name: "Explore poses in this pocket" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Generate molecules in this pocket" }),
  ).toBeDisabled();
});
