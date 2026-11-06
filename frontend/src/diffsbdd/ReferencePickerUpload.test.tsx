import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { api, request } from "../api";
import type { Asset } from "../operations/types";
import type { MoleculeRef } from "../research/types";
import { ReferencePicker } from "./ReferencePicker";
import { catalogFixture } from "./input-catalog.test-fixtures";

vi.mock("../api", async () => {
  const real = await vi.importActual<typeof import("../api")>("../api");
  return { ...real, request: vi.fn(), api: { ...real.api, assets: vi.fn() } };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each(["en", "zh"] as const)(
  "discards an upload completed after leaving its source (%s)",
  async (language) => {
    const asset: Asset = {
      id: "uploaded",
      kind: "structure",
      name: "STAT6.pdb",
      suffix: ".pdb",
      size: 100,
      sha256: "a".repeat(64),
      created_at: "2026-11-06",
    };
    let finish!: (asset: Asset) => void;
    vi.spyOn(api, "upload").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    vi.mocked(api.assets).mockResolvedValue([]);
    vi.mocked(request).mockImplementation(
      async (path) =>
        (path.startsWith("/research") ? catalogFixture([]) : asset) as never,
    );
    function Task() {
      const [value, change] = useState<MoleculeRef | null>(null);
      return (
        <>
          <ReferencePicker
            kind="structure"
            label="STAT6"
            value={value}
            onChange={change}
            language={language}
          />
          <output aria-label="Current material">
            {value?.asset_id ?? "No input"}
          </output>
          <button disabled={!value}>Next with material</button>
        </>
      );
    }
    render(<Task />);
    const user = userEvent.setup();
    await user.upload(
      screen.getByLabelText(language === "zh" ? "上传 STAT6" : "Upload STAT6"),
      new File(["ATOM      1"], "STAT6.pdb"),
    );
    await user.click(
      screen.getByRole("radio", {
        name: language === "zh" ? "历史文件" : "Historical files",
      }),
    );
    await act(async () => {
      finish(asset);
    });
    expect(screen.getByLabelText("Current material")).toHaveTextContent(
      "No input",
    );
    expect(
      screen.getByRole("button", { name: "Next with material" }),
    ).toBeDisabled();
    await user.click(
      screen.getByRole("radio", {
        name: language === "zh" ? "上传新文件" : "Upload a new file",
      }),
    );
    expect(screen.getByLabelText("Current material")).toHaveTextContent(
      "No input",
    );
  },
);
