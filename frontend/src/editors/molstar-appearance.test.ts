import { expect, it, vi } from "vitest";
import { applyThinLigands, type AppearancePlugin } from "./molstar-appearance";
import { ligandBondRadius } from "../viewer/appearance";
it("restyles native ball-and-stick cells, including focused ligands, without touching cartoons or source data", async () => {
  const molecule = {
    type: {
      name: "ball-and-stick",
      params: {
        sizeFactor: 0.15,
        visuals: ["element-sphere", "intra-bond", "inter-bond"],
      },
    },
    marker: "source-identity",
  };
  const cartoon = { type: { name: "cartoon", params: {} } };
  const ligand = { transform: { params: molecule } },
    protein = { transform: { params: cartoon } };
  const updates = vi.fn((params) => {
      ligand.transform.params = params;
    }),
    commit = vi.fn().mockResolvedValue(undefined);
  const plugin = {
    state: {
      data: {
        cells: new Map([
          ["ligand", ligand],
          ["protein", protein],
        ]),
        build: () => ({ to: () => ({ update: updates }), commit }),
        behaviors: { isUpdating: {} },
      },
    },
  } as AppearancePlugin;
  await applyThinLigands(plugin);
  const value = updates.mock.calls[0][0];
  expect(value.type.params.visuals).toEqual(["intra-bond", "inter-bond"]);
  expect(value.type.params.sizeFactor).toBe(ligandBondRadius);
  expect(value.type.params.adjustCylinderLength).toBe(false);
  expect(value.marker).toBe("source-identity");
  expect(protein.transform.params).toEqual(cartoon);
  expect(commit).toHaveBeenCalledOnce();
  await applyThinLigands(plugin);
  expect(commit).toHaveBeenCalledOnce();
});
it("reports a native style-commit failure instead of pretending the editor applied the style", async () => {
  const plugin = {
    state: {
      data: {
        cells: new Map([
          [
            "ligand",
            {
              transform: {
                params: { type: { name: "ball-and-stick", params: {} } },
              },
            },
          ],
        ]),
        build: () => ({
          to: () => ({ update: vi.fn() }),
          commit: vi
            .fn()
            .mockRejectedValue(new Error("native display update failed")),
        }),
        behaviors: { isUpdating: {} },
      },
    },
  } as AppearancePlugin;
  await expect(applyThinLigands(plugin)).rejects.toThrow(
    "native display update failed",
  );
});
