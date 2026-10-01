import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import * as client from "../api";
import { AdmetForm } from "./AdmetForm";

const ref = {
  asset_id: "single",
  sha256: "a".repeat(64),
  record: 3,
  conformer: 0,
  version_id: "immutable-version",
};
vi.mock("../diffsbdd/ReferencePicker", () => ({
  ReferencePicker: ({ onChange }: { onChange(value: unknown): void }) => (
    <button type="button" onClick={() => onChange(ref)}>
      Choose saved molecule
    </button>
  ),
}));
vi.mock("../operations/AssetPicker", () => ({
  AssetPicker: ({ onChange }: { onChange(id: string): void }) => (
    <button type="button" onClick={() => onChange("library")}>
      Choose candidate file
    </button>
  ),
}));
function boundary(ready = true, failure = false) {
  vi.spyOn(client, "request").mockImplementation(async (path) => {
    if (path.startsWith("/capabilities"))
      return { availability: { configuration_present: ready } };
    if (failure) throw new Error("Source metadata unavailable");
    const id = path.includes("/single/") ? "single" : "library";
    return {
      id,
      name: id + ".sdf",
      kind: "ligand",
      suffix: ".sdf",
      sha256: (id === "single" ? "a" : "b").repeat(64),
      size: 100,
    };
  });
  return vi
    .spyOn(api, "submit")
    .mockRejectedValue(new Error("Native service offline"));
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("retains exact source and settings through Back and only dispatches after review", async () => {
  const submit = boundary(),
    user = userEvent.setup();
  render(<AdmetForm language="en" onCreated={vi.fn()} />);
  expect(
    screen.getByRole("heading", { name: "1. Choose molecular scope" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Choose saved molecule" }),
  ).toBeNull();
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await user.click(
    screen.getByRole("button", { name: "Choose saved molecule" }),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("radio", { name: "Early safety" }));
  await user.click(
    screen.getByText("Expert settings", { selector: "summary" }),
  );
  await user.selectOptions(screen.getByRole("combobox", { name: "CPU" }), "2");
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("single.sdf · #4")).toBeVisible();
  expect(submit).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByRole("radio", { name: "Early safety" })).toBeChecked();
  expect(screen.getByRole("combobox", { name: "CPU" })).toHaveValue("2");
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Predict properties" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Native service offline",
  );
  expect(submit).toHaveBeenCalledWith(
    expect.objectContaining({
      operation: "admet_predict",
      molecule: ref,
      library: null,
      scientific_inputs: [ref],
      options: expect.objectContaining({ view: "safety", cpu: 2 }),
    }),
    expect.any(String),
  );
  await user.click(screen.getByRole("button", { name: "Predict properties" }));
  expect(submit.mock.calls[1][1]).toBe(submit.mock.calls[0][1]);
});
it("omits the unused single source when switching to a whole candidate file", async () => {
  const submit = boundary(),
    user = userEvent.setup();
  render(<AdmetForm language="en" onCreated={vi.fn()} initialMolecule={ref} />);
  await user.click(screen.getByRole("radio", { name: "A candidate set" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await user.click(
    screen.getByRole("button", { name: "Choose candidate file" }),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Predict properties" }));
  expect(submit).toHaveBeenCalledWith(
    expect.objectContaining({
      molecule: null,
      scientific_inputs: [],
      library: { asset_id: "library", sha256: "b".repeat(64) },
    }),
    expect.any(String),
  );
});
it("keeps unavailable model readiness distinct from valid input and prevents submission", async () => {
  const submit = boundary(false),
    user = userEvent.setup();
  render(<AdmetForm language="en" onCreated={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(
    screen.getByRole("button", { name: "Choose saved molecule" }),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.getByRole("button", { name: "Predict properties" }),
  ).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent(
    "Install the independent ADMET-AI model",
  );
  expect(submit).not.toHaveBeenCalled();
});
it("reports input metadata failure and prevents advancing to settings", async () => {
  boundary(true, true);
  const user = userEvent.setup();
  render(<AdmetForm language="en" onCreated={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(
    screen.getByRole("button", { name: "Choose saved molecule" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Source metadata unavailable",
  );
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
});

it("keeps the user's replacement record when switching language after an initial handoff", async () => {
  boundary();
  const user = userEvent.setup(),
    onCreated = vi.fn();
  const initial = { ...ref, record: 0 };
  const view = render(
    <AdmetForm language="en" onCreated={onCreated} initialMolecule={initial} />,
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(
    screen.getByRole("button", { name: "Choose saved molecule" }),
  );
  view.rerender(
    <AdmetForm language="zh" onCreated={onCreated} initialMolecule={initial} />,
  );
  await user.click(screen.getByRole("button", { name: "下一步" }));
  await user.click(screen.getByRole("button", { name: "下一步" }));
  expect(screen.getByText("single.sdf · #4")).toBeVisible();
});
