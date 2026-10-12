import { createHash, webcrypto } from "node:crypto";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Editors } from "./Editors";
import { api } from "../api";
import { deploymentFixture } from "../deployment/fixtures";
import type { ScientificObject } from "../research/types";

vi.mock("./ketcher-hydrogens", () => ({
  observeHydrogenDisplay: vi.fn(),
  foldDisplayHydrogens: async (_editor: unknown, text: string) => text,
}));
vi.mock("./AlignedEditAction", () => ({ AlignedEditAction: () => null }));
const source =
  "Original\n  fixture  2D\n\n  1  0  0  0  0  0            999 V2000\n    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0\nM  END\n$$$$\n";
const original: ScientificObject = {
  id: "version-1",
  family_id: "family",
  kind: "molecule",
  label: "fixture",
  reference: {
    asset_id: "asset",
    sha256: createHash("sha256").update(source).digest("hex"),
    record: 0,
    conformer: 0,
    version_id: "version-1",
  },
  parent_id: null,
  source_job: null,
  relation: "derived_from",
  notes: "",
  rating: 0,
  created_at: "2026-10-12",
  validation: "file_integrity_only",
};
const metadata = {
  id: "asset",
  name: "fixture.sdf",
  kind: "ligand",
  suffix: ".sdf",
  size: source.length,
  sha256: original.reference.sha256,
};
const deployment = deploymentFixture([], {
  installed: { ketcher: { version: "test" } },
});
function mount() {
  const editor = {
    editor: { setOptions: vi.fn() },
    setMolecule: vi.fn().mockResolvedValue(undefined),
    getSmiles: vi.fn().mockResolvedValue("C"),
    getMolfile: vi.fn().mockResolvedValue(source.replace("$$$$\n", "")),
  };
  const props = {
    language: "en" as const,
    deployment,
    onSetup: vi.fn(),
    onCreated: vi.fn(),
  };
  const view = render(<Editors {...props} initialObject={original} />);
  const frame = screen.getByTitle(
    "Ketcher molecular editor",
  ) as HTMLIFrameElement;
  Object.defineProperty(frame.contentWindow, "ketcher", { value: editor });
  fireEvent.load(frame);
  return { editor, view, props };
}
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("rejects corrupt retained bytes before native display or original-version save lineage", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.endsWith("/metadata")
        ? new Response(JSON.stringify(metadata))
        : new Response(source.replace(" C   ", " N   ")),
    ),
  );
  const upload = vi
    .spyOn(api, "upload")
    .mockResolvedValue({ id: "new-asset" } as never);
  const post = vi
    .spyOn(api, "post")
    .mockResolvedValue({ ...original, id: "new-version" });
  const { editor } = mount();
  expect(await screen.findByRole("alert")).toHaveTextContent("does not match");
  expect(editor.setMolecule).not.toHaveBeenCalled();
  expect(screen.queryByText(/Selected version opened/)).toBeNull();
  expect(upload).not.toHaveBeenCalled();
  expect(post).not.toHaveBeenCalled();
  // A subsequent normal drawing save must not inherit the rejected source.
  fireEvent.click(screen.getByRole("button", { name: "Save to Workbench" }));
  await waitFor(() => expect(post).toHaveBeenCalledOnce());
  expect(post.mock.calls[0][1]).toMatchObject({ parent_id: null });
});
it("opens a verified source and retains its exact version as normal save parent", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.endsWith("/metadata")
        ? new Response(JSON.stringify(metadata))
        : new Response(source),
    ),
  );
  const post = vi
    .spyOn(api, "post")
    .mockResolvedValue({ ...original, id: "new-version" });
  vi.spyOn(api, "upload").mockResolvedValue({ id: "new-asset" } as never);
  const { editor } = mount();
  await screen.findByText(/Selected version opened/);
  expect(editor.setMolecule).toHaveBeenCalledWith(source.replace("$$$$\n", ""));
  fireEvent.click(screen.getByRole("button", { name: "Save to Workbench" }));
  await waitFor(() => expect(post).toHaveBeenCalledOnce());
  expect(post.mock.calls[0][1]).toMatchObject({ parent_id: original.id });
});
it("exposes a finite recoverable error and releases both actions after a stalled read", async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          signal = init.signal as AbortSignal;
          signal.addEventListener("abort", () => reject(signal!.reason), {
            once: true,
          });
        }),
    ),
  );
  const { editor } = mount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(
    screen.getByRole("button", { name: "Save to Workbench" }),
  ).toBeDisabled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30_000);
  });
  expect(signal!.aborted).toBe(true);
  expect(editor.setMolecule).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("timed out");
  expect(
    screen.getByRole("button", { name: "Save to Workbench" }),
  ).toBeEnabled();
  expect(
    screen.getByRole("button", { name: "Calculate properties" }),
  ).toBeEnabled();
  expect(screen.queryByText(/Selected version opened/)).toBeNull();
});
it("cancels a stalled old source, loads a newer source, and cancels again on unmount", async () => {
  let stalled: AbortSignal | undefined;
  const replacement = {
    ...original,
    id: "version-2",
    reference: {
      ...original.reference,
      asset_id: "new-asset",
      version_id: "version-2",
    },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit) => {
      if (url.includes("new-asset"))
        return Promise.resolve(
          url.endsWith("/metadata")
            ? new Response(JSON.stringify({ ...metadata, id: "new-asset" }))
            : new Response(source),
        );
      stalled = init.signal as AbortSignal;
      const signal = stalled;
      return new Promise<Response>((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        }),
      );
    }),
  );
  const { editor, view, props } = mount();
  await waitFor(() => expect(stalled).toBeDefined());
  const old = stalled!;
  view.rerender(<Editors {...props} initialObject={replacement} />);
  await screen.findByText(/Selected version opened/);
  expect(old.aborted).toBe(true);
  expect(editor.setMolecule).toHaveBeenCalledOnce();
  expect(screen.queryByRole("alert")).toBeNull();
  view.rerender(<Editors {...props} initialObject={original} />);
  await waitFor(() => expect(stalled).not.toBe(old));
  view.unmount();
  expect(stalled!.aborted).toBe(true);
  await act(async () => {});
});
it("clears an old success notice and retries the same rejected version without saving", async () => {
  let intact = false;
  const selected = {
    ...original,
    id: "version-2",
    reference: {
      ...original.reference,
      asset_id: "new-asset",
      version_id: "version-2",
    },
  };
  const fetcher = vi.fn(async (url: string) => {
    const newer = url.includes("new-asset");
    if (url.endsWith("/metadata"))
      return new Response(
        JSON.stringify({ ...metadata, id: newer ? "new-asset" : "asset" }),
      );
    return new Response(
      newer && !intact ? source.replace(" C   ", " N   ") : source,
    );
  });
  vi.stubGlobal("fetch", fetcher);
  const upload = vi.spyOn(api, "upload");
  const post = vi.spyOn(api, "post");
  const { editor, view, props } = mount();
  await screen.findByText(/Selected version opened/);
  view.rerender(<Editors {...props} initialObject={selected} />);
  await screen.findByRole("alert");
  expect(screen.queryByText(/Selected version opened/)).toBeNull();
  expect(editor.setMolecule).toHaveBeenCalledOnce();
  intact = true;
  fireEvent.click(screen.getByRole("button", { name: "Retry opening" }));
  await screen.findByText(/Selected version opened/);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByRole("button", { name: "Retry opening" })).toBeNull();
  expect(editor.setMolecule).toHaveBeenCalledTimes(2);
  expect(
    fetcher.mock.calls.filter(
      ([url]) => url === "/api/assets/new-asset/metadata",
    ),
  ).toHaveLength(2);
  expect(upload).not.toHaveBeenCalled();
  expect(post).not.toHaveBeenCalled();
});
