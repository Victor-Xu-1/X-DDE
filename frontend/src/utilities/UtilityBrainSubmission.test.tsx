import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import * as client from "../api";
import { api } from "../api";
import { UtilityTask } from "./UtilityTask";

vi.mock("../examples/ExampleActions", () => ({ ExampleActions: () => null }));
const reference = {
  asset_id: "single",
  sha256: "a".repeat(64),
  record: 3,
  conformer: 0,
  version_id: "immutable-version",
};
vi.mock("../diffsbdd/ReferencePicker", () => ({
  ReferencePicker: ({ onChange }: { onChange(value: unknown): void }) => (
    <button onClick={() => onChange(reference)}>Choose molecule</button>
  ),
}));
vi.mock("../presentation/MoleculeImage", () => ({
  MoleculeImage: () => <span>Structure confirmation</span>,
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each(["en", "zh"] as const)(
  "submits a brain profile from the single input page (%s)",
  async (language) => {
    const user = userEvent.setup(),
      zh = language === "zh";
    const paths: string[] = [];
    vi.spyOn(client, "request").mockImplementation(async (path) => {
      paths.push(path);
      if (path.startsWith("/capabilities"))
        return { availability: { configuration_present: true } };
      return {
        id: "single",
        name: "STAT6-warhead.sdf",
        kind: "ligand",
        suffix: ".sdf",
        sha256: "a".repeat(64),
        size: 100,
      };
    });
    const submit = vi
      .spyOn(api, "submit")
      .mockRejectedValue(new Error("Engine remains off"));
    render(
      <UtilityTask tool="brain" language={language} onCreated={vi.fn()} />,
    );
    expect(
      screen.queryByRole("button", { name: zh ? "下一步" : "Next" }),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "Choose molecule" }));
    await user.click(
      screen.getByText(zh ? "更多设置（可选）" : "More settings (optional)"),
    );
    expect(screen.getByRole("radio", { name: /ADMET-AI/ })).toBeChecked();
    expect(
      screen.queryByText(
        zh ? "全部性质（推荐）" : "All properties (recommended)",
      ),
    ).toBeNull();
    expect(screen.getByText("Structure confirmation")).toBeVisible();
    await user.click(
      screen.getByRole("button", {
        name: zh ? "开始透脑评估" : "Assess brain penetration",
      }),
    );
    expect(
      paths.some((path) => path.startsWith("/capabilities/admet.brain")),
    ).toBe(true);
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "admet_predict",
        focus: "brain",
        molecule: reference,
        library: null,
        scientific_inputs: [reference],
        options: { view: "all", cpu: 1, memory_mib: 4096 },
      }),
      expect.any(String),
    );
  },
);
