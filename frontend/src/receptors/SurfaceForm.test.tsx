import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "../api";
import * as client from "../api";
import { SurfaceForm } from "./SurfaceForm";
import { ExampleContext } from "../examples/context";
import type { PreparedExample } from "../examples/types";
const ref = {
  asset_id: "source",
  sha256: "a".repeat(64),
  version_id: "immutable-version",
  record: 0,
  conformer: 0,
};
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: () => <div>Viewer boundary</div>,
}));
vi.mock("./SurfaceRegionPicker", () => ({
  SurfaceRegionPicker: ({ onChange }: { onChange(v: unknown): void }) => (
    <button
      type="button"
      onClick={() =>
        onChange([
          { chain: "A", number: 1, insertion_code: "", resname: "JQ1" },
        ])
      }
    >
      Select observed JQ1
    </button>
  ),
}));
vi.mock("../diffsbdd/ReferencePicker", () => ({
  ReferencePicker: ({
    value,
    onChange,
  }: {
    value: unknown;
    onChange(v: unknown): void;
  }) => (
    <div>
      {value ? "Selected structure" : "New structure required"}
      <button type="button" onClick={() => onChange(ref)}>
        Choose source
      </button>
      <button
        type="button"
        onClick={() =>
          onChange({ ...ref, asset_id: "replacement", sha256: "b".repeat(64) })
        }
      >
        Replace source
      </button>
    </div>
  ),
}));
beforeEach(() => {
  vi.spyOn(client, "request").mockImplementation(async (path) =>
    path.startsWith("/capabilities")
      ? { availability: { configuration_present: true } }
      : [],
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("uses the explicitly loaded public structure even when no computed exposure result is pinned", () => {
  const example = {
    request: null,
    objects: { brd4_alt_a: { reference: ref } },
  } as unknown as PreparedExample;
  render(
    <ExampleContext.Provider value={example}>
      <SurfaceForm language="en" onCreated={vi.fn()} />
    </ExampleContext.Provider>,
  );
  expect(screen.getByText("Selected structure")).toBeVisible();
  expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
});
it("starts empty and submits exact region only from the reviewed final step", async () => {
  const user = userEvent.setup(),
    submit = vi
      .spyOn(api, "submit")
      .mockRejectedValue(new Error("Native boundary"));
  render(<SurfaceForm language="en" onCreated={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Choose source" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Select observed JQ1" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.getByRole("radio", { name: "Standard (recommended)" }),
  ).toBeChecked();
  await user.click(screen.getByRole("radio", { name: "Fine sampling" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(submit).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByRole("radio", { name: "Fine sampling" })).toBeChecked();
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(
    screen.getByRole("button", { name: "Calculate exposure and burial" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Native boundary");
  expect(submit).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      operation: "surface_exposure",
      structure: ref,
      scientific_inputs: [ref],
      regions: [{ chain: "A", number: 1, insertion_code: "", resname: "JQ1" }],
      options: expect.objectContaining({
        sphere_points: 1920,
        probe_radius_angstrom: 1.4,
        context_chains: [],
      }),
    }),
    expect.any(String),
  );
});
it("clears previous region and custom conditions when the source changes", async () => {
  const user = userEvent.setup();
  render(
    <SurfaceForm language="en" onCreated={vi.fn()} initialStructure={ref} />,
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Select observed JQ1" }));
  await user.click(screen.getByRole("button", { name: "Back" }));
  await user.click(screen.getByRole("button", { name: "Replace source" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
});
