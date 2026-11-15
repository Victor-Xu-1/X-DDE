import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { useAssetUpload } from "./useAssetUpload";
import type { Asset } from "./types";
const replacement: Asset = {
  id: "new-image",
  name: "image.sdf",
  suffix: ".sdf",
  kind: "ligand",
  size: 14,
  sha256: "a".repeat(64),
  created_at: "2026-11-15",
};
const file = new File(["protocol fixture"], "image.sdf");
function Upload({
  controller,
  changed,
}: {
  controller: AbortController;
  changed(id: string): void;
}) {
  const upload = useAssetUpload(
    "ligand",
    [".sdf"],
    1000,
    "original",
    changed,
    vi.fn(),
  );
  return (
    <>
      <button
        disabled={upload.busy}
        onClick={() =>
          void upload.upload(file, {
            preserveSelection: true,
            signal: controller.signal,
          })
        }
      >
        Transfer
      </button>
      {upload.error && <p role="alert">{upload.error}</p>}
    </>
  );
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("cancelled image transfer cannot replace the original selection even if transport resolves late", async () => {
  let resolve!: (asset: Asset) => void;
  vi.spyOn(api, "upload").mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const changed = vi.fn(),
    controller = new AbortController();
  render(<Upload controller={controller} changed={changed} />);
  await userEvent.click(screen.getByText("Transfer"));
  expect(changed).not.toHaveBeenCalled();
  act(() => controller.abort());
  expect(screen.getByText("Transfer")).toBeEnabled();
  await act(async () => resolve(replacement));
  expect(changed).not.toHaveBeenCalled();
});
it("preserves the original on failure and commits only a validated successful retry", async () => {
  vi.spyOn(api, "upload")
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(replacement);
  const changed = vi.fn();
  render(<Upload controller={new AbortController()} changed={changed} />);
  await userEvent.click(screen.getByText("Transfer"));
  expect(await screen.findByRole("alert")).toHaveTextContent("offline");
  expect(changed).not.toHaveBeenCalled();
  await userEvent.click(screen.getByText("Transfer"));
  await waitFor(() =>
    expect(changed).toHaveBeenCalledExactlyOnceWith("new-image"),
  );
});
