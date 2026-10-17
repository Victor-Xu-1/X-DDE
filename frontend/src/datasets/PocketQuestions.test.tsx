import { useEffect } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api, request } from "../api";
import { catalogFixture } from "../diffsbdd/input-catalog.test-fixtures";
import type { MoleculeRef, ScientificObject } from "../research/types";
import type { Language } from "../types";
import { PocketQuestion, usePocketQuestions } from "./PocketQuestions";

vi.mock("../api", async () => {
  const real = await vi.importActual<typeof import("../api")>("../api");
  return { ...real, request: vi.fn(), api: { ...real.api, assets: vi.fn() } };
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const frame: MoleculeRef = {
  asset_id: "R",
  sha256: "c".repeat(64),
  record: 0,
  conformer: 0,
  version_id: "receptor",
};
const alpha: MoleculeRef = {
  ...frame,
  asset_id: "A",
  sha256: "a".repeat(64),
  version_id: "alpha",
};
const beta: MoleculeRef = {
  ...alpha,
  asset_id: "B",
  sha256: "b".repeat(64),
  version_id: "beta",
};
function Task({ language }: { language: Language }) {
  const value = usePocketQuestions(language);
  useEffect(() => value.setReceptor(frame), [value.setReceptor]);
  return (
    <>
      <PocketQuestion value={value} language={language} />
      <button disabled={!value.pocket}>Next</button>
      <output aria-label="Confirmed pocket">
        {JSON.stringify(value.pocket)}
      </output>
    </>
  );
}

it.each(["en", "zh"] as const)(
  "requires a verified reference and a fresh coordinate confirmation in %s",
  async (language) => {
    const zh = language === "zh";
    let finish!: (value: unknown) => void;
    vi.mocked(api.assets).mockResolvedValue([]);
    const versions = [alpha, beta].map((reference) => ({
      id: reference.version_id,
      label: reference.version_id,
      kind: "molecule",
      reference,
    })) as ScientificObject[];
    vi.mocked(request).mockImplementation((path) =>
      path.startsWith("/research")
        ? Promise.resolve(catalogFixture(versions))
        : new Promise((resolve) => {
            finish = resolve;
          }),
    );
    const user = userEvent.setup();
    render(<Task language={language} />);
    const confirm = screen.getByRole("checkbox", {
      name: zh
        ? "参考配体来自这个靶点结构，位置已经确认"
        : "The reference ligand is confirmed in this target's coordinates",
    });
    expect(confirm).toBeDisabled();
    await user.click(
      screen.getByText(zh ? "历史文件" : "Historical files", { exact: true }),
    );
    const picker = screen.getByRole("combobox", {
      name: zh
        ? "参考口袋配体 · 历史文件"
        : "Reference pocket ligand · Historical files",
    });
    await waitFor(() => expect(picker).toBeEnabled());
    for (const reference of [alpha, beta]) {
      await user.selectOptions(picker, "version:" + reference.version_id);
      expect(confirm).toBeDisabled();
      expect(confirm).not.toBeChecked();
      await user.click(confirm);
      expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
      await act(async () =>
        finish({
          id: reference.asset_id,
          sha256: reference.sha256,
          kind: "ligand",
          suffix: ".sdf",
          size: 100,
        }),
      );
      expect(confirm).toBeEnabled();
      expect(confirm).not.toBeChecked();
      await user.click(confirm);
      expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
      expect(
        JSON.parse(screen.getByLabelText("Confirmed pocket").textContent!),
      ).toMatchObject({
        frame,
        reference,
        coordinate_basis: "user_confirmed",
      });
    }
  },
);
