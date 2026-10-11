import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { useResearchRegistration } from "./useResearchRegistration";
import type { ScientificObject } from "./types";

const parent: ScientificObject = {
  id: "source",
  family_id: "family",
  kind: "molecule",
  label: "Controlled STAT6 annotation metadata",
  reference: {
    asset_id: "file",
    sha256: "a".repeat(64),
    record: 1,
    conformer: 0,
    version_id: "source",
  },
  parent_id: null,
  source_job: null,
  relation: "derived_from",
  notes: "",
  rating: 0,
  created_at: "2026-10-11",
  validation: "file_integrity_only",
};
const saved: ScientificObject = {
  ...parent,
  id: "saved",
  parent_id: parent.id,
  relation: "edited_from",
  reference: { ...parent.reference, version_id: "saved" },
};
afterEach(() => vi.restoreAllMocks());

it("keeps the same immutable registration request after an uncertain response", async () => {
  const post = vi
    .spyOn(api, "post")
    .mockRejectedValueOnce(new Error("Controlled lost reply"))
    .mockResolvedValueOnce(saved);
  const load = vi.fn().mockResolvedValue(undefined),
    select = vi.fn();
  const { result } = renderHook(() =>
    useResearchRegistration({
      notes: "",
      rating: 0,
      selectionIntent: () => 3,
      load,
      selectSaved: select,
    }),
  );
  await act(async () => {
    await expect(
      result.current("file", "molecule", parent.label, parent),
    ).rejects.toThrow("lost reply");
  });
  await act(() => result.current("file", "molecule", parent.label, parent));
  expect(post.mock.calls[0][1]).toEqual(post.mock.calls[1][1]);
  expect(post.mock.calls[0][2]).toBe(post.mock.calls[1][2]);
  expect(select).toHaveBeenCalledExactlyOnceWith("object:saved", 3);
});
it("does not select or refresh a reply for a different file or version", async () => {
  vi.spyOn(api, "post").mockResolvedValue({
    ...saved,
    reference: { ...saved.reference, asset_id: "other" },
  });
  const load = vi.fn(),
    select = vi.fn();
  const { result } = renderHook(() =>
    useResearchRegistration({
      notes: "",
      rating: 0,
      selectionIntent: () => 3,
      load,
      selectSaved: select,
    }),
  );
  await act(async () => {
    await expect(
      result.current("file", "molecule", parent.label, parent),
    ).rejects.toThrow("does not match");
  });
  expect(load).not.toHaveBeenCalled();
  expect(select).not.toHaveBeenCalled();
});
