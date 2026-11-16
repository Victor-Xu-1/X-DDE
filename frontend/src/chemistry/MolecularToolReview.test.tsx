import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import * as client from "../api";
import { api } from "../api";
import { StateForm } from "./StateForm";
import { LibraryScreenForm } from "./LibraryScreenForm";

const ref = {
  asset_id: "query",
  sha256: "b".repeat(64),
  record: 2,
  conformer: 0,
  version_id: "exact-version",
};
vi.mock("../presentation/MoleculeImage", () => ({
  MoleculeImage: ({ source }: { source: unknown }) => (
    <div data-testid="review-drawing">{JSON.stringify(source)}</div>
  ),
}));
vi.mock("../diffsbdd/ReferencePicker", () => ({
  ReferencePicker: ({ onChange }: { onChange(value: unknown): void }) => (
    <button type="button" onClick={() => onChange(ref)}>
      Choose query record 3
    </button>
  ),
}));
vi.mock("../operations/AssetPicker", () => ({
  AssetPicker: ({ onChange }: { onChange(value: string): void }) => (
    <button type="button" onClick={() => onChange("library")}>
      Choose candidate library
    </button>
  ),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function boundaries() {
  vi.spyOn(client, "request").mockImplementation(async (path) =>
    path.startsWith("/capabilities")
      ? { availability: { configuration_present: true } }
      : {
          id: "library",
          name: "STAT6-candidates.sdf",
          kind: "ligand",
          suffix: ".sdf",
          size: 100,
          sha256: "a".repeat(64),
        },
  );
  return vi
    .spyOn(api, "submit")
    .mockRejectedValue(new Error("Calculation remains paused"));
}

it.each(["en", "zh"] as const)(
  "previews the exact state-preparation input (%s)",
  async (language) => {
    const submit = boundaries(),
      user = userEvent.setup(),
      zh = language === "zh";
    render(
      <StateForm
        language={language}
        initialMolecule={ref}
        onCreated={vi.fn()}
      />,
    );
    for (let step = 0; step < 3; step++)
      await user.click(
        screen.getByRole("button", { name: zh ? "下一步" : "Next" }),
      );
    expect(screen.getByTestId("review-drawing")).toHaveTextContent(
      JSON.stringify({ url: "/api/assets/query", record: 2 }),
    );
    expect(
      screen.getByText(
        zh
          ? "待准备的原始分子 · 第 3 条记录"
          : "Original molecule to prepare · Record 3",
      ),
    ).toBeVisible();
    expect(submit).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", {
        name: zh ? "准备状态与构象" : "Prepare states and conformers",
      }),
    );
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "molecular_states",
        molecule: ref,
      }),
      expect.any(String),
    );
  },
);

it.each([true, false])(
  "distinguishes the exact screening query from a library preview (%s)",
  async (query) => {
    const submit = boundaries(),
      user = userEvent.setup();
    render(<LibraryScreenForm language="en" onCreated={vi.fn()} />);
    await user.click(
      screen.getByRole("button", { name: "Choose candidate library" }),
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(
      screen.getByRole("radio", { name: "Find similar molecules" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Choose query record 3" }),
    );
    if (!query)
      await user.click(
        screen.getByRole("radio", { name: "Select diverse representatives" }),
      );
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByTestId("review-drawing")).toHaveTextContent(
      JSON.stringify({
        url: query ? "/api/assets/query" : "/api/assets/library",
        record: query ? 2 : 0,
      }),
    );
    expect(
      screen.getByText(
        query
          ? "Query molecule · Record 3"
          : "First library record preview; selection covers the whole file",
      ),
    ).toBeVisible();
    expect(submit).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Run library selection" }),
    );
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "library_screen",
        query: query ? ref : null,
        scientific_inputs: query ? [ref] : [],
        library: { asset_id: "library", sha256: "a".repeat(64) },
      }),
      expect.any(String),
    );
  },
);
