import { expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { defaults } from "../form-model";
import { draftFingerprint } from "../presentation/prediction-draft-model";
import { emptyOpenDdeEditor, useOpenDdeEditor } from "./useOpenDdeEditor";
import {
  openDdeDraftAdapter,
  readOpenDdeDraft,
  type OpenDdeDraft,
} from "./opendde-draft";
import { validIntegerTexts } from "./integer-list-model";

const sequence = ">STAT6 P42226\nMSLWGLVSKMPPEK";
const asset = "006f27f8-e9e2-4e4e-9589-dfa56aeeeddb";
const state = () => ({
  ...emptyOpenDdeEditor(),
  name: "STAT6 · unfinished",
  components: [
    { kind: "protein" as const, value: sequence, count: 0, paired_msa: asset },
  ],
  parameters: { ...defaults, steps: 0, additional_seeds: [4294967295] },
  integer_text: { additional_seeds: "4294967295, unfinished" },
});
const draft = (): OpenDdeDraft => ({
  id: crypto.randomUUID(),
  tool: "predict",
  schema_version: 1,
  revision: 1,
  name: "STAT6 · unfinished",
  entities: 1,
  created_at: "now",
  updated_at: "now",
  archived: false,
  state: state(),
});

it("round trips unfinished editor values and preserves optional native field presence", () => {
  const original = state();
  expect(readOpenDdeDraft(original)).toEqual(original);
  expect(readOpenDdeDraft(original).parameters).not.toHaveProperty("model");
  expect(validIntegerTexts(original.parameters, original.integer_text)).toBe(
    false,
  );
  expect(openDdeDraftAdapter.readDraft(draft()).tool).toBe("predict");
});
it("normalizes API null references in all cached workflows without discarding native parameter nulls", () => {
  const original = {
    ...state(),
    workflows: { protein: state().components },
    input_references: [
      { asset_id: asset, sha256: "a".repeat(64), record: 3, conformer: 2 },
    ],
    parameters: { ...defaults, checkpoint_id: null },
  };
  const response = {
    ...original,
    components: original.components.map((row) => ({
      ...row,
      source_sequence: null,
    })),
    workflows: {
      protein: original.workflows.protein.map((row) => ({
        ...row,
        ligand_file: null,
      })),
    },
    input_references: original.input_references.map((row) => ({
      ...row,
      version_id: null,
    })),
  };
  expect(readOpenDdeDraft(response)).toEqual(original);
  expect(draftFingerprint(response)).toBe(draftFingerprint(original));
  expect(draftFingerprint({ ...original, parameters: defaults })).not.toBe(
    draftFingerprint(original),
  );
});
it.each([
  { kind: "unknown" },
  { verified: true },
  { integer_text: { gpu_ids: "x".repeat(1001) } },
  { parameters: { ...defaults, seed: Infinity } },
  { parameters: { ...defaults, task_id: "invented" } },
  { workflows: { unknown: [] } },
  { components: [{ kind: "protein", count: 1, value: "A".repeat(50001) }] },
])(
  "rejects unsupported or unbounded snapshots before replacing inputs: %j",
  (patch) => {
    expect(() => readOpenDdeDraft({ ...state(), ...patch })).toThrow(
      "current inputs were retained",
    );
  },
);
it.each(["mol1.predict", "boltz.predict"])(
  "does not open another model's %s draft",
  (tool) => {
    expect(() => openDdeDraftAdapter.readDraft({ ...draft(), tool })).toThrow(
      "another model",
    );
  },
);
it("restores explicitly selected drafts ahead of a previous history request and retains workflow inputs", () => {
  const { result } = renderHook(() =>
    useOpenDdeEditor(draft(), {
      name: "stale history",
      components: [],
      parameters: defaults,
    }),
  );
  expect(result.current.state.name).toBe("STAT6 · unfinished");
  act(() => result.current.chooseKind("protein"));
  act(() =>
    result.current.patch({
      components: [{ kind: "protein", value: "ACD", count: 1 }],
    }),
  );
  act(() => result.current.chooseKind("complex"));
  expect(result.current.state.components).toEqual(state().components);
  expect(result.current.snapshot.workflows.protein?.[0].value).toBe("ACD");
  expect(result.current.snapshot.workflows.complex).toEqual(
    result.current.state.components,
  );
});
it("retains invalid raw text on ordinary edits, accepts corrected lists, and clears obsolete GPU text on device change", () => {
  const { result } = renderHook(() => useOpenDdeEditor(draft()));
  act(() =>
    result.current.changeParameters({
      ...result.current.state.parameters,
      cycles: 6,
    }),
  );
  expect(result.current.state.integer_text.additional_seeds).toContain(
    "unfinished",
  );
  act(() => {
    result.current.changeIntegerText("additional_seeds", "2， 3");
    result.current.changeParameters({
      ...result.current.state.parameters,
      additional_seeds: [2, 3],
    });
  });
  expect(result.current.state.integer_text.additional_seeds).toBe("2， 3");
  expect(
    validIntegerTexts(
      result.current.state.parameters,
      result.current.state.integer_text,
    ),
  ).toBe(true);
  act(() => result.current.changeIntegerText("gpu_ids", "0, unfinished"));
  act(() =>
    result.current.changeParameters({
      ...result.current.state.parameters,
      device: "cpu",
      gpu_ids: [],
    }),
  );
  expect(result.current.state.integer_text.gpu_ids).toBeUndefined();
  act(() => result.current.clear());
  expect(result.current.state).toEqual(emptyOpenDdeEditor());
});
