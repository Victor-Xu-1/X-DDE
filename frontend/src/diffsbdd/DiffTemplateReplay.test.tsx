import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import * as constraintModel from "../constraints/model";
import { ExampleContext } from "../examples/context";
import type { PreparedExample } from "../examples/types";
import { DiffForm } from "./DiffForm";
import { optionsFor } from "./model";

vi.mock("../viewer/StructureViewer", () => ({ StructureViewer: () => null }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each(["generate", "inpaint"] as const)(
  "submits the explicitly loaded %s recipe including exact references and saved conditions",
  async (mode) => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (raw) =>
        new Response(
          JSON.stringify(
            String(raw).includes("capabilities")
              ? { availability: { configuration_present: true, missing: [] } }
              : String(raw).includes("session")
                ? { csrf_token: "fixture" }
                : [],
          ),
          { headers: { "Content-Type": "application/json" } },
        ),
    );
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
    const create = screen.getByRole("button", {
      name: "Create task",
    });
    await waitFor(() => expect(create).toBeEnabled());
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
