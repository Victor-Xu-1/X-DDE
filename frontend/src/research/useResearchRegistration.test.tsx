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

it("retains a confirmed saved version before a slow relationship refresh completes", async () => {
  vi.spyOn(api, "post").mockResolvedValue(saved);
  let finish!: () => void;
  const load = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const retain = vi.fn(),
    select = vi.fn();
  const { result } = renderHook(() =>
    useResearchRegistration({
      notes: "",
      rating: 0,
      selectionIntent: () => 3,
      load,
      retainSaved: retain,
      selectSaved: select,
    }),
  );
  let work!: Promise<ScientificObject>;
  await act(async () => {
    work = result.current("file", "molecule", parent.label, parent);
  });
  expect(retain).toHaveBeenCalledExactlyOnceWith(saved);
  expect(select).toHaveBeenCalledExactlyOnceWith("object:saved", 3);
  await act(async () => {
    finish();
    await work;
  });
});

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
      retainSaved: vi.fn(),
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
      retainSaved: vi.fn(),
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

it.each([
  ["Checked sequence\n", "Checked sequence"],
  [" Checked sequence ", "Checked sequence"],
  ["\n\t ", ""],
  ["line one\nline two", "line one\nline two"],
  ["\u0085\u00a0notes\u2028\u3000", "notes"],
  ["\ufeffnotes\ufeff", "\ufeffnotes\ufeff"],
  ["\u001cnotes\u001c", "\u001cnotes\u001c"],
])(
  "confirms server-normalized notes %j without changing internal text",
  async (notes, normalized) => {
    const value = { ...saved, notes: normalized };
    const post = vi.spyOn(api, "post").mockResolvedValue(value);
    const retain = vi.fn(),
      select = vi.fn(),
      load = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useResearchRegistration({
        notes,
        rating: 0,
        selectionIntent: () => 3,
        load,
        selectSaved: select,
        retainSaved: retain,
      }),
    );
    await act(() => result.current("file", "molecule", parent.label, parent));
    expect(post.mock.calls[0][1]).toMatchObject({ notes: normalized });
    expect(retain).toHaveBeenCalledExactlyOnceWith(value);
    expect(select).toHaveBeenCalledExactlyOnceWith("object:saved", 3);
    expect(load).toHaveBeenCalledOnce();
  },
);

it("normalizes the outgoing label using the same version contract", async () => {
  const post = vi.spyOn(api, "post").mockResolvedValue(saved);
  const { result } = renderHook(() =>
    useResearchRegistration({
      notes: "",
      rating: 0,
      selectionIntent: () => 3,
      load: vi.fn().mockResolvedValue(undefined),
      selectSaved: vi.fn(),
      retainSaved: vi.fn(),
    }),
  );
  await act(() =>
    result.current("file", "molecule", "\u0085" + parent.label + " ", parent),
  );
  expect(post.mock.calls[0][1]).toMatchObject({ label: parent.label });
});

it("reuses the normalized intent after a lost reply and whitespace-only edits", async () => {
  const value = { ...saved, notes: "first\nsecond" };
  const post = vi
    .spyOn(api, "post")
    .mockRejectedValueOnce(new Error("Lost reply"))
    .mockResolvedValueOnce(value);
  const retain = vi.fn();
  const { result, rerender } = renderHook(
    ({ notes }) =>
      useResearchRegistration({
        notes,
        rating: 0,
        selectionIntent: () => 3,
        load: vi.fn().mockResolvedValue(undefined),
        selectSaved: vi.fn(),
        retainSaved: retain,
      }),
    { initialProps: { notes: " first\nsecond\n" } },
  );
  await act(async () => {
    await expect(
      result.current("file", "molecule", parent.label, parent),
    ).rejects.toThrow("Lost reply");
  });
  rerender({ notes: "\u0085first\nsecond\u00a0" });
  await act(() => result.current("file", "molecule", parent.label, parent));
  expect(post.mock.calls[0][1]).toEqual(post.mock.calls[1][1]);
  expect(post.mock.calls[0][2]).toBe(post.mock.calls[1][2]);
  expect(retain).toHaveBeenCalledExactlyOnceWith(value);
});

it("keeps an in-flight save tied to its captured notes and gives later content a new intent", async () => {
  let finish!: (value: ScientificObject) => void;
  const first = { ...saved, notes: "first" };
  const second = {
    ...saved,
    id: "second",
    reference: { ...saved.reference, version_id: "second" },
    notes: "second",
    rating: 3,
  };
  const post = vi
    .spyOn(api, "post")
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce(second);
  const retain = vi.fn(),
    select = vi.fn();
  const { result, rerender } = renderHook(
    ({ notes, rating }) =>
      useResearchRegistration({
        notes,
        rating,
        selectionIntent: () => 3,
        load: vi.fn().mockResolvedValue(undefined),
        selectSaved: select,
        retainSaved: retain,
      }),
    { initialProps: { notes: " first\n", rating: 0 } },
  );
  let pending!: Promise<ScientificObject>;
  await act(async () => {
    pending = result.current("file", "molecule", parent.label, parent);
  });
  rerender({ notes: " second\n", rating: 3 });
  await act(async () => {
    finish(first);
    await pending;
  });
  await act(() => result.current("file", "molecule", parent.label, parent));
  expect(post.mock.calls[0][1]).toMatchObject({ notes: "first", rating: 0 });
  expect(post.mock.calls[1][1]).toMatchObject({ notes: "second", rating: 3 });
  expect(post.mock.calls[0][2]).not.toBe(post.mock.calls[1][2]);
  expect(retain.mock.calls.map(([value]) => value)).toEqual([first, second]);
  expect(select.mock.calls).toEqual([
    ["object:saved", 3],
    ["object:second", 3],
  ]);
});

it.each([
  { notes: "different" },
  { notes: "checked " },
  { label: parent.label + " " },
  { parent_id: "other-parent" },
  { family_id: "other-family" },
  { reference: { ...saved.reference, sha256: "b".repeat(64) } },
  { reference: { ...saved.reference, record: 2 } },
])(
  "still rejects a genuinely mismatched saved response %j",
  async (mismatch) => {
    vi.spyOn(api, "post").mockResolvedValue({
      ...saved,
      notes: "checked",
      ...mismatch,
    });
    const retain = vi.fn(),
      select = vi.fn(),
      load = vi.fn();
    const { result } = renderHook(() =>
      useResearchRegistration({
        notes: " checked\n",
        rating: 0,
        selectionIntent: () => 3,
        load,
        selectSaved: select,
        retainSaved: retain,
      }),
    );
    await act(async () => {
      await expect(
        result.current("file", "molecule", parent.label, parent),
      ).rejects.toThrow("does not match");
    });
    expect(retain).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  },
);
