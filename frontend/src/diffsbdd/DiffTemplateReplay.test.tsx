import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import * as constraintModel from "../constraints/model";
import { ExampleContext } from "../examples/context";
import type { PreparedExample } from "../examples/types";
import { DiffForm } from "./DiffForm";
import { optionsFor } from "./model";

vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: ({ highlightedAtoms }: { highlightedAtoms?: number[] }) =>
    highlightedAtoms ? (
      <p>Verified atoms: {highlightedAtoms.join(",")}</p>
    ) : null,
}));
vi.mock("../research/asset-file", () => ({
  readAssetFile: async () => new Uint8Array(),
}));
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("shows the saved export molecule as already selected rather than offering an unrelated study input", () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("[]", { headers: { "Content-Type": "application/json" } }),
  );
  vi.spyOn(api, "assets").mockResolvedValue([]);
  const native = {
    asset_id: "native-pose",
    sha256: "b".repeat(64),
    record: 2,
    conformer: 0,
    version_id: "native-version",
  };
  const study = {
    ...native,
    asset_id: "generic-study-input",
    sha256: "d".repeat(64),
    version_id: "study-version",
  };
  const example = {
    objects: { ligand: { reference: study } },
    request: {
      operation: "diffsbdd",
      payload: { mode: "export", molecules: [native] },
    },
  } as unknown as PreparedExample;
  render(
    <ExampleContext.Provider value={example}>
      <DiffForm mode="export" language="en" onCreated={vi.fn()} />
    </ExampleContext.Provider>,
  );
  expect(
    screen.getByRole("button", { name: "Add to collection" }),
  ).toBeDisabled();
});

it.each([
  ["generate", true],
  ["inpaint", true],
  ["inpaint", false],
] as const)(
  "checks the loaded %s recipe when the saved region matches: %s",
  async (mode, matchingRegion) => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (raw) => {
      const path = String(raw);
      if (path.endsWith("/research/regions/saved-core"))
        return Response.json({
          id: "saved-core",
          body: {
            subject: molecule,
            identity_job: "identity-task",
            regions: [
              {
                name: "core",
                role: "fixed_core",
                atom_indices: matchingRegion ? [0, 1] : [0],
              },
            ],
          },
        });
      if (path.endsWith("/jobs/identity-task/result"))
        return Response.json({
          mode: "identity",
          complete: true,
          reference: molecule,
          identity_basis: "rdkit_removeHs_record_order",
          molecule_artifact: "native.sdf",
          atoms: [
            { index: 0, element: "C", selectable: true },
            { index: 1, element: "N", selectable: true },
          ],
        });
      if (path.endsWith("/assets/molecule?record=2"))
        return new Response("mock record", {
          headers: { "X-Structure-Format": "sdf", "X-Structure-Record": "2" },
        });
      if (path.endsWith("/assets/molecule/metadata"))
        return Response.json({
          id: "molecule",
          name: "pose.sdf",
          sha256: "a".repeat(64),
          size: 100,
          suffix: ".sdf",
          kind: "ligand",
        });
      return new Response(
        JSON.stringify(
          String(raw).includes("capabilities")
            ? { availability: { configuration_present: true, missing: [] } }
            : String(raw).includes("session")
              ? { csrf_token: "fixture" }
              : [],
        ),
        { headers: { "Content-Type": "application/json" } },
      );
    });
    vi.spyOn(api, "assets").mockResolvedValue([]);
    const submit = vi
      .spyOn(api, "submit")
      .mockResolvedValue({ id: "transport-only" } as never);
    const conditions = vi
      .spyOn(constraintModel, "withConstraints")
      .mockImplementation(async (task, constraints) => ({
        ...task,
        constraints,
      }));
    const molecule = {
      asset_id: "molecule",
      sha256: "a".repeat(64),
      record: 2,
      conformer: 0,
      version_id: "molecular-version",
    };
    const protein = {
      ...molecule,
      asset_id: "receptor",
      record: 0,
      version_id: "receptor-version",
    };
    const constraints =
      mode === "inpaint"
        ? { id: "saved-conditions", sha256: "b".repeat(64) }
        : null;
    const fixed = mode === "inpaint" ? [0, 1] : [];
    const payload = {
      mode,
      protein,
      initial: mode === "inpaint" ? molecule : null,
      pocket: {
        kind: "residues",
        residues: [
          {
            structure: protein,
            model: 0,
            chain: "A",
            number: 562,
            insertion_code: "",
            alternate_location: "",
          },
        ],
      },
      options: {
        ...optionsFor(mode),
        fixed_atoms: fixed,
        count: 3,
        seed: 19,
        size_mode: "sample",
        fragment_policy: "all",
        relaxation: 0,
      },
      fixed_atoms: fixed.map((index) => ({ molecule, index })),
      saved_regions: mode === "inpaint" ? "saved-core" : null,
    };
    const example = {
      module: { capability_id: `diffsbdd.${mode}` },
      objects: {},
      request: { operation: "diffsbdd", payload, constraints },
    } as unknown as PreparedExample;
    render(
      <ExampleContext.Provider value={example}>
        <DiffForm mode={mode} language="en" onCreated={vi.fn()} />
      </ExampleContext.Provider>,
    );
    const user = userEvent.setup();
    for (let step = 0; step < 3; step++)
      await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Preview job" }));
    const create = await screen.findByRole("button", { name: "Submit job" });
    if (!matchingRegion) {
      expect(
        await screen.findByText(
          /The saved region differs from the selected fixed atoms/,
        ),
      ).toBeVisible();
      expect(create).toBeDisabled();
      expect(submit).not.toHaveBeenCalled();
      return;
    }
    await waitFor(() => expect(create).toBeEnabled());
    if (mode === "inpaint") {
      await user.click(screen.getByRole("tab", { name: "Starting pose" }));
      expect(screen.getByText("Verified atoms: 0,1")).toBeVisible();
    }
    expect(submit).not.toHaveBeenCalled();
    await user.click(create);
    expect(conditions).toHaveBeenCalledWith(
      expect.objectContaining({ payload }),
      constraints,
      "en",
    );
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ payload, constraints }),
      expect.any(String),
    );
  },
);
