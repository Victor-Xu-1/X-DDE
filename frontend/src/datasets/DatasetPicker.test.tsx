import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { DatasetPicker } from "./DatasetPicker";
import { uploadDataset } from "./upload";
import type { Asset } from "../operations/types";
vi.mock("./upload", () => ({ uploadDataset: vi.fn(), cancelUpload: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.mocked(uploadDataset).mockReset();
});
it("never applies a late asset after its actual upload signal is cancelled", async () => {
  let finish!: (asset: Asset) => void;
  vi.mocked(uploadDataset).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const onChange = vi.fn(),
    user = userEvent.setup();
  const view = render(
    <DatasetPicker
      kind="counts"
      value={null}
      language="en"
      label="DEL count table"
      onChange={onChange}
      sourceMode="new"
    />,
  );
  await user.upload(
    screen.getByLabelText("DEL count table"),
    new File(["DEL_ID,T1\nA,20"], "DEL-counts.csv", { type: "text/csv" }),
  );
  await screen.findByRole("button", { name: "Pause" });
  expect(onChange).toHaveBeenCalledExactlyOnceWith(null);
  view.unmount();
  expect(vi.mocked(uploadDataset).mock.calls[0][2].signal.aborted).toBe(true);
  await act(async () =>
    finish({
      id: "late",
      name: "DEL-counts.csv",
      kind: "counts",
      suffix: ".csv",
      size: 20,
      sha256: "a".repeat(64),
      created_at: "2026-10-09",
    }),
  );
  expect(onChange).toHaveBeenCalledExactlyOnceWith(null);
});
