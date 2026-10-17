import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PocketForm } from "../pockets/PocketForm";
import { StateForm } from "../chemistry/StateForm";
import { ExampleContext } from "./context";
import type { PreparedExample } from "./types";

vi.mock("../diffsbdd/ReferencePicker", () => ({
  ReferencePicker: ({ value }: { value: unknown }) => (
    <output data-testid="selected-recipe-material">
      {JSON.stringify(value)}
    </output>
  ),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it.each(["pocket", "states"] as const)(
  "prefers the authored %s material over a generic study alias",
  (mode) => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            availability: { configuration_present: true, missing: [] },
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
    );
    const native = {
      asset_id: "native-input",
      sha256: "a".repeat(64),
      record: mode === "pocket" ? 0 : 1,
      conformer: 0,
      version_id: null,
    };
    const generic = {
      ...native,
      asset_id: "generic-study-input",
      sha256: "d".repeat(64),
    };
    const example = {
      objects: {
        receptor: { reference: generic },
        ligand: { reference: generic },
      },
      request:
        mode === "pocket"
          ? {
              operation: "pocket_search",
              protein: native,
              profile: "experimental",
            }
          : { operation: "molecular_states", molecule: native },
    } as unknown as PreparedExample;
    render(
      <ExampleContext.Provider value={example}>
        {mode === "pocket" ? (
          <PocketForm language="en" onCreated={vi.fn()} onPredict={vi.fn()} />
        ) : (
          <StateForm language="en" onCreated={vi.fn()} />
        )}
      </ExampleContext.Provider>,
    );
    expect(
      JSON.parse(screen.getByTestId("selected-recipe-material").textContent!),
    ).toEqual(native);
  },
);
