import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import * as client from "../api";
import { LibraryScreenForm } from "./LibraryScreenForm";
vi.mock("../operations/AssetPicker", () => ({
  AssetPicker: ({ onChange }: { onChange(id: string): void }) => (
    <button type="button" onClick={() => onChange("library")}>
      Select actual library boundary
    </button>
  ),
}));
vi.mock("../diffsbdd/ReferencePicker", () => ({
  ReferencePicker: ({ onChange }: { onChange(value: unknown): void }) => (
    <button
      type="button"
      onClick={() =>
        onChange({
          asset_id: "query",
          sha256: "b".repeat(64),
          record: 2,
          conformer: 0,
          version_id: "version",
        })
      }
    >
      Select query boundary
    </button>
  ),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("requires a query only for query-based methods and removes unused query before reviewed submit", async () => {
  vi.spyOn(client, "request").mockImplementation(async (path) =>
    path.startsWith("/capabilities")
      ? { availability: { configuration_present: true } }
      : {
          id: "library",
          name: "library.sdf",
          kind: "ligand",
          suffix: ".sdf",
          size: 100,
          sha256: "a".repeat(64),
        },
  );
  const submit = vi
    .spyOn(api, "submit")
    .mockRejectedValue(new Error("native adapter boundary"));
  const user = userEvent.setup();
  render(<LibraryScreenForm language="en" onCreated={vi.fn()} />);
  await user.click(
    screen.getByRole("button", { name: "Select actual library boundary" }),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(
    screen.getByRole("radio", { name: "Find similar molecules" }),
  );
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await user.click(
    screen.getByRole("button", { name: "Select query boundary" }),
  );
  await user.click(
    screen.getByRole("radio", { name: "Select diverse representatives" }),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(submit).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("button", { name: "Run library selection" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "native adapter boundary",
  );
  expect(submit).toHaveBeenCalledWith(
    expect.objectContaining({
      operation: "library_screen",
      library: { asset_id: "library", sha256: "a".repeat(64) },
      query: null,
      scientific_inputs: [],
      options: expect.objectContaining({ mode: "diversity", max_selected: 20 }),
    }),
    expect.any(String),
  );
});

it("starts structural review with warnings, preserves the explicit policy on Back and submits only after review", async () => {
  vi.spyOn(client, "request").mockImplementation(async (path) =>
    path.startsWith("/capabilities")
      ? { availability: { configuration_present: true } }
      : {
          id: "library",
          name: "abl-inhibitors.sdf",
          kind: "ligand",
          suffix: ".sdf",
          size: 200,
          sha256: "a".repeat(64),
        },
  );
  const submit = vi
    .spyOn(api, "submit")
    .mockRejectedValue(new Error("native review boundary"));
  const user = userEvent.setup();
  render(<LibraryScreenForm language="zh" onCreated={vi.fn()} />);
  await user.click(
    screen.getByRole("button", { name: "Select actual library boundary" }),
  );
  await user.click(screen.getByRole("button", { name: "下一步" }));
  await user.click(screen.getByRole("radio", { name: "检查结构风险" }));
  await user.click(screen.getByRole("button", { name: "下一步" }));
  expect(
    screen.getByRole("combobox", { name: "结构风险如何处理？" }),
  ).toHaveValue("warn");
  expect(screen.queryByRole("option", { name: "这次不检查" })).toBeNull();
  await user.selectOptions(
    screen.getByRole("combobox", { name: "结构风险如何处理？" }),
    "exclude",
  );
  await user.click(screen.getByRole("button", { name: "上一步" }));
  await user.click(screen.getByRole("button", { name: "下一步" }));
  expect(
    screen.getByRole("combobox", { name: "结构风险如何处理？" }),
  ).toHaveValue("exclude");
  await user.click(screen.getByRole("button", { name: "下一步" }));
  expect(screen.getByText("暂时排除规则命中")).toBeVisible();
  expect(submit).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "开始分子库筛选" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "native review boundary",
  );
  expect(submit).toHaveBeenCalledWith(
    expect.objectContaining({
      query: null,
      options: expect.objectContaining({
        mode: "alerts",
        alert_policy: "exclude",
        alert_catalogue: "pains_brenk",
      }),
    }),
    expect.any(String),
  );
});

it("bounds scaffold representatives and retains the selected budget through review", async () => {
  vi.spyOn(client, "request").mockImplementation(async (path) =>
    path.startsWith("/capabilities")
      ? { availability: { configuration_present: true } }
      : {
          id: "library",
          name: "abl-inhibitors.sdf",
          kind: "ligand",
          suffix: ".sdf",
          size: 200,
          sha256: "a".repeat(64),
        },
  );
  const submit = vi
    .spyOn(api, "submit")
    .mockRejectedValue(new Error("native scaffold boundary"));
  const user = userEvent.setup();
  render(<LibraryScreenForm language="en" onCreated={vi.fn()} />);
  await user.click(
    screen.getByRole("button", { name: "Select actual library boundary" }),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(
    screen.getByRole("radio", { name: "Select scaffold representatives" }),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByText("Expert settings"));
  const budget = screen.getByRole("spinbutton", {
    name: "Exact representatives per family",
  });
  await user.clear(budget);
  await user.type(budget, "11");
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await user.clear(budget);
  await user.type(budget, "2");
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(
    screen.getByRole("button", { name: "Run library selection" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "native scaffold boundary",
  );
  expect(submit).toHaveBeenCalledWith(
    expect.objectContaining({
      query: null,
      options: expect.objectContaining({
        mode: "scaffold",
        per_scaffold: 2,
        alert_policy: "off",
      }),
    }),
    expect.any(String),
  );
});
