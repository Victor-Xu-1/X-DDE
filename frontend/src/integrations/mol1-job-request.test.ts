import { expect, it, vi } from "vitest";
import { request } from "../api";
import { mol1Defaults } from "./mol1-settings";
import { prepareMol1Job, type Mol1JobInput } from "./mol1-job-request";

vi.mock("../api", () => ({ request: vi.fn() }));

const input = (): Mol1JobInput => ({
  name: " STAT6 research ",
  components: [
    {
      kind: "protein",
      value: "PREACHINGS",
      count: 1,
      paired_msa: "msa",
      unpaired_msa: "msa",
    },
    { kind: "ligand", value: "", count: 1, ligand_file: "selected-ligand" },
  ],
  settings: { ...mol1Defaults(), feature_mode: "uploaded" },
  device: "cuda",
  memory: 32768,
  seed: 101,
  bonds: [],
});

it("snapshots selected source identities, deduplicates one MSA, and ignores later form edits", async () => {
  const draft = input();
  const read = vi.mocked(request);
  read.mockClear();
  read.mockImplementation(async (url) => {
    const id = url.split("/")[2];
    return {
      id,
      name: id + ".dat",
      sha256: (id === "msa" ? "a" : "b").repeat(64),
    };
  });
  const preparing = prepareMol1Job(draft, new AbortController().signal);
  draft.components[1].ligand_file = "different";
  draft.settings.samples = 1;
  const result = await preparing;
  expect(read).toHaveBeenCalledTimes(2);
  expect(result.task.name).toBe("STAT6 research");
  expect(result.task.payload.samples).toBe(5);
  expect(result.task.payload.components).toEqual(result.components);
  expect(result.components[1].ligand_file).toBe("selected-ligand");
  expect(
    result.task.inputs.map(({ role, source }) => [
      role,
      source.asset_id,
      source.sha256,
    ]),
  ).toEqual([
    ["msa", "msa", "a".repeat(64)],
    ["ligand", "selected-ligand", "b".repeat(64)],
  ]);
  expect(result.task.scientific_inputs).toEqual(
    result.task.inputs.map((item) => item.source),
  );
});

it("rejects an unexpected asset and cannot resolve an aborted snapshot", async () => {
  const read = vi.mocked(request);
  read.mockResolvedValue({ id: "wrong", sha256: "b".repeat(64) });
  await expect(
    prepareMol1Job(input(), new AbortController().signal),
  ).rejects.toThrow("Could not verify");
  const controller = new AbortController();
  read.mockImplementation(async (url) => ({
    id: url.split("/")[2],
    sha256: "b".repeat(64),
  }));
  const result = prepareMol1Job(input(), controller.signal);
  controller.abort();
  await expect(result).rejects.toMatchObject({ name: "AbortError" });
});
