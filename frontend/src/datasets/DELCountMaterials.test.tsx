import { useState } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import * as client from "../api";
import type { Asset } from "../operations/types";
import { DELCountMaterials } from "./DELCountMaterials";
import { uploadDataset } from "./upload";

vi.mock("./upload", () => ({ uploadDataset: vi.fn(), cancelUpload: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.mocked(uploadDataset).mockReset();
});
const original: Asset = {
  id: "del-count-table",
  name: "DEL target and reference counts.csv",
  kind: "counts",
  suffix: ".csv",
  size: 100,
  sha256: "a".repeat(64),
  created_at: "2026-10-09T00:00:00Z",
};
const clearSources = vi.fn(),
  clearSamples = vi.fn(),
  clearComparisons = vi.fn();
function Materials({ language = "en" as "en" | "zh" }) {
  const [inputKind, setInputKind] = useState<"new" | "counts">("new"),
    [asset, setAsset] = useState<Asset | null>(null);
  return (
    <DELCountMaterials
      model={{
        language,
        zh: language === "zh",
        inputKind,
        setInputKind,
        asset,
        setAsset,
        setSource: clearSources,
        setSamples: clearSamples,
        setComparisons: clearComparisons,
      }}
    />
  );
}
it.each(["en", "zh"] as const)(
  "offers one source question and keeps historical bytes as the selected material in %s",
  async (language) => {
    vi.spyOn(client.api, "assets").mockResolvedValue([original]);
    render(<Materials language={language} />);
    const user = userEvent.setup(),
      zh = language === "zh";
    expect(screen.getAllByRole("radiogroup")).toHaveLength(1);
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(
      screen.getByRole("radio", {
        name: zh ? "上传新计数表" : "New count table",
      }),
    ).toBeChecked();
    expect(screen.queryByRole("button", { name: "History" })).toBeNull();
    await user.click(
      screen.getByRole("radio", { name: zh ? "历史文件" : "Historical file" }),
    );
    const select = await screen.findByRole("combobox", {
      name: zh ? "DEL 计数表" : "DEL count table",
    });
    await screen.findByRole("option", {
      name: /DEL target and reference counts.csv/,
    });
    await user.selectOptions(select, original.id);
    expect(screen.getByText(original.name)).toBeVisible();
    await user.click(
      screen.getByRole("radio", {
        name: zh ? "历史计数结果" : "Completed count result",
      }),
    );
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByText(original.name)).toBeNull();
    expect(clearSources).toHaveBeenCalledWith([]);
    expect(clearSamples).toHaveBeenCalledWith([]);
    expect(clearComparisons).toHaveBeenCalledWith([]);
    expect(client.api.assets).toHaveBeenCalledTimes(1);
  },
);
it("blocks source changes during upload and ignores a cancelled late asset response", async () => {
  let finish!: (asset: Asset) => void;
  vi.mocked(uploadDataset).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(<Materials />),
    user = userEvent.setup();
  await user.upload(
    screen.getByLabelText("DEL count table"),
    new File(["DEL_ID,T1\nA,20"], "DEL-counts.csv", { type: "text/csv" }),
  );
  expect(await screen.findByRole("button", { name: "Pause" })).toBeVisible();
  expect(screen.getByRole("radio", { name: "Historical file" })).toBeDisabled();
  await user.click(screen.getByRole("radio", { name: "Historical file" }));
  expect(screen.getByRole("radio", { name: "New count table" })).toBeChecked();
  const signal = vi.mocked(uploadDataset).mock.calls[0][2].signal;
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => finish(original));
});
