import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { AssetPicker } from "./AssetPicker";
import type { Asset } from "./types";

const previous: Asset = {
  id: "previous",
  name: "BRD4_previous.pdb",
  kind: "structure",
  suffix: ".pdb",
  size: 12,
  sha256: "a".repeat(64),
  created_at: "2026-10-08T00:00:00Z",
};
const next: Asset = {
  ...previous,
  id: "next",
  name: "BRD4_next.pdb",
  sha256: "b".repeat(64),
};
beforeEach(() => {
  vi.spyOn(api, "assets").mockResolvedValue([previous]);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const file = () =>
  new File(["ATOM      1"], next.name, { type: "chemical/x-pdb" });
it("clears stale input eligibility and permits retry of the same file after an upload error", async () => {
  const upload = vi
    .spyOn(api, "upload")
    .mockRejectedValueOnce(new Error("Upload interrupted"))
    .mockResolvedValueOnce(next);
  const changed = vi.fn(),
    user = userEvent.setup();
  render(
    <AssetPicker
      kind="structure"
      language="en"
      label="Receptor"
      value="previous"
      onChange={changed}
      showHistory={false}
    />,
  );
  const control = screen.getByLabelText("Upload Receptor");
  const selected = file();
  await user.upload(control, selected);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Upload interrupted",
  );
  expect(changed.mock.calls).toEqual([[""]]);
  await user.upload(control, selected);
  await waitFor(() => expect(changed).toHaveBeenLastCalledWith("next"));
  expect(upload).toHaveBeenCalledTimes(2);
  expect(upload.mock.calls.every(([actual]) => actual === selected)).toBe(true);
  expect(screen.queryByRole("alert")).toBeNull();
});
it("does not restore a file after the user leaves that input choice", async () => {
  let finish!: (asset: Asset) => void;
  vi.spyOn(api, "upload").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const changed = vi.fn();
  const { unmount } = render(
    <AssetPicker
      kind="structure"
      language="en"
      label="Receptor"
      value=""
      onChange={changed}
      showHistory={false}
    />,
  );
  await userEvent
    .setup()
    .upload(screen.getByLabelText("Upload Receptor"), file());
  expect(changed.mock.calls).toEqual([[""]]);
  unmount();
  await act(async () => finish(next));
  expect(changed).toHaveBeenCalledOnce();
  expect(changed).not.toHaveBeenCalledWith("next");
});
it("discards a pending response when the accepted input kind changes", async () => {
  let finish!: (asset: Asset) => void;
  vi.spyOn(api, "upload").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const changed = vi.fn();
  const { rerender } = render(
    <AssetPicker
      kind="structure"
      language="en"
      label="Receptor"
      value=""
      onChange={changed}
      showHistory={false}
    />,
  );
  await userEvent
    .setup()
    .upload(screen.getByLabelText("Upload Receptor"), file());
  rerender(
    <AssetPicker
      kind="ligand"
      language="en"
      label="Ligand"
      value=""
      onChange={changed}
      showHistory={false}
    />,
  );
  expect(screen.getByLabelText("Upload Ligand")).toBeEnabled();
  await act(async () => finish(next));
  expect(changed.mock.calls).toEqual([[""]]);
});
it("rejects an oversized replacement without retaining the previous task input", async () => {
  const upload = vi.spyOn(api, "upload"),
    changed = vi.fn();
  render(
    <AssetPicker
      kind="structure"
      language="zh"
      label="受体"
      value="previous"
      onChange={changed}
      maxBytes={3}
      showHistory={false}
    />,
  );
  await userEvent.setup().upload(screen.getByLabelText("上传 受体"), file());
  expect(screen.getByRole("alert")).toHaveTextContent("文件不能超过");
  expect(changed).toHaveBeenCalledExactlyOnceWith("");
  expect(upload).not.toHaveBeenCalled();
});
