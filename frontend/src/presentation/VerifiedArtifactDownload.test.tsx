import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { readAssetFileWithMetadata } from "../research/asset-file";
import { downloadBlob } from "./visual-export";
import { VerifiedArtifactDownload } from "./VerifiedArtifactDownload";

vi.mock("../research/asset-file", () => ({
  readAssetFileWithMetadata: vi.fn(),
}));
vi.mock("./visual-export", () => ({ downloadBlob: vi.fn() }));

it("cancels a replaced file and offers only the current saved name and bytes", async () => {
  const read = vi.mocked(readAssetFileWithMetadata);
  const old = { asset_id: "old", sha256: "a".repeat(64) };
  const next = { asset_id: "next", sha256: "b".repeat(64) };
  const result = {
    bytes: new Uint8Array([1, 2, 3]),
    suffix: ".cif",
    name: "已保存结构.cif",
  };
  let resolveOld: (value: typeof result) => void = () => {};
  read
    .mockImplementationOnce(
      () => new Promise<typeof result>((resolve) => (resolveOld = resolve)),
    )
    .mockResolvedValueOnce(result);
  const button = (reference: typeof old) => (
    <VerifiedArtifactDownload
      reference={reference}
      language="en"
      label="Download version"
      downloadLabel="Download version"
    />
  );
  const user = userEvent.setup();
  const { rerender } = render(button(old));
  const action = () => screen.getByRole("button", { name: "Download version" });
  await user.click(action());
  expect(action()).toBeDisabled();
  const signal = read.mock.calls[0][1];
  rerender(button(next));
  expect(signal.aborted).toBe(true);
  await act(async () => resolveOld({ ...result, name: "old.cif" }));
  expect(downloadBlob).not.toHaveBeenCalled();
  await user.click(action());
  await waitFor(() =>
    expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), result.name),
  );
  expect(read.mock.calls[1][0]).toEqual(next);
  expect(vi.mocked(downloadBlob).mock.calls[0][0].size).toBe(
    result.bytes.length,
  );
});
