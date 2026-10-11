import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import type { ScientificObject } from "../research/types";
import { MoleculeSaveIntent } from "./molecule-save-intent";

afterEach(() => vi.restoreAllMocks());
const parent = {
  id: "original",
  label: "Study molecule",
  notes: "Retain source",
  rating: 4,
} as ScientificObject;
const saved = { ...parent, id: "edited", parent_id: parent.id };
// Transport fixture only: native browser acceptance uses the actual STAT6 molecule.
const mol = (stamp: string, atom = "C") =>
  `\n  -INDIGO-${stamp}2D\n\n  1  0  0  0  0  0  0  0  0  0999 V2000\n    0.0000    0.0000    0.0000 ${atom}   0  0  0  0  0  0  0  0  0  0  0  0\nM  END\n`;

it("retries a lost version response with identical body/key and no repeat upload", async () => {
  const upload = vi
    .spyOn(api, "upload")
    .mockResolvedValueOnce({ id: "confirmed-file" } as never)
    .mockRejectedValue(new Error("Upload unavailable on retry"));
  const post = vi
    .spyOn(api, "post")
    .mockRejectedValueOnce(new Error("Response lost after server write"))
    .mockResolvedValue(saved);
  const intent = new MoleculeSaveIntent();
  const original = mol("1011261200");
  await expect(intent.save(original, parent)).rejects.toThrow("Response lost");
  expect(await intent.save(mol("1011261201"), parent)).toEqual(saved);
  expect(upload).toHaveBeenCalledTimes(1);
  expect(post.mock.calls[1]).toEqual(post.mock.calls[0]);
  expect(post.mock.calls[1][1]).toMatchObject({
    asset_id: "confirmed-file",
    parent_id: "original",
    notes: "Retain source",
    rating: 4,
  });
  const bytes = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(upload.mock.calls[0][0]);
  });
  expect(bytes).toBe(original + "\n$$$$\n");
});

it("coalesces concurrent saves and reuses the saved version for subsequent handoff", async () => {
  const upload = vi
    .spyOn(api, "upload")
    .mockResolvedValue({ id: "file" } as never);
  const post = vi.spyOn(api, "post").mockResolvedValue(saved);
  const intent = new MoleculeSaveIntent();
  const first = intent.save(mol("1011261200"), parent);
  expect(intent.save(mol("1011261200"), parent)).toBe(first);
  expect(await first).toEqual(saved);
  expect(await intent.save(mol("1011261205"), saved)).toEqual(saved);
  expect(upload).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledTimes(1);
  await intent.save(mol("1011261205", "N"), saved);
  expect(upload).toHaveBeenCalledTimes(2);
  expect(post.mock.calls[1][2]).not.toBe(post.mock.calls[0][2]);
  expect(post.mock.calls[1][1]).toMatchObject({ parent_id: "edited" });
});

it("allows retry after an upload failure and binds changed annotations to a new intent", async () => {
  const upload = vi
    .spyOn(api, "upload")
    .mockRejectedValueOnce(new Error("Upload interrupted"))
    .mockResolvedValue({ id: "file" } as never);
  const post = vi.spyOn(api, "post").mockResolvedValue(saved);
  const intent = new MoleculeSaveIntent();
  await expect(intent.save("molecule", parent)).rejects.toThrow(
    "Upload interrupted",
  );
  await intent.save("molecule", parent);
  expect(upload).toHaveBeenCalledTimes(2);
  await intent.save("molecule", { ...parent, notes: "Reviewed source" });
  expect(post.mock.calls[1][2]).not.toBe(post.mock.calls[0][2]);
  expect(post.mock.calls[1][1]).toMatchObject({ notes: "Reviewed source" });
});
