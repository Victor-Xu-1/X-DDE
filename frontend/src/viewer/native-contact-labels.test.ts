import { afterAll, expect, it, vi } from "vitest";
const worker = vi.hoisted(() =>
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:native-label-worker"),
);
afterAll(() => worker.mockRestore());
import type { GLViewer } from "3dmol";
import type { NativeInteraction } from "../integrations/types";
import { paintNativeContacts } from "./scientific-overlay";

it("keeps every classified contact line but labels each actual residue once with its nearest native distance", () => {
  const viewer = {
    selectedAtoms: () => [
      { x: 0, y: 0, z: 0, chain: "A", resi: 140, resn: "ASN", index: 0 },
    ],
    addStyle: vi.fn(),
    addLine: vi.fn(),
    addLabel: vi.fn(),
  } as unknown as GLViewer;
  const base = {
    chain: "A",
    number: 140,
    residue: "ASN",
    protein_position: [0, 0, 0],
    ligand_position: [3, 0, 0],
  } as const;
  const rows = [
    { ...base, kind: "hydrophobic", distance: 3.8 },
    { ...base, kind: "hydrogen_bond", distance: 3.2 },
  ] as unknown as NativeInteraction[];
  const before = structuredClone(rows);
  paintNativeContacts(viewer, rows, 5, true);
  expect(viewer.addLine).toHaveBeenCalledTimes(2);
  expect(viewer.addLabel).toHaveBeenCalledTimes(1);
  expect(vi.mocked(viewer.addLabel).mock.calls[0][0]).toBe("A:ASN140 · 3.20 Å");
  expect(rows).toEqual(before);
});
