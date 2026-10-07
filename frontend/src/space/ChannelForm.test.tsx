import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import * as client from "../api";
import { ChannelForm } from "./ChannelForm";
const ref = {
  asset_id: "source",
  sha256: "a".repeat(64),
  record: 0,
  conformer: 0,
  version_id: "source-version",
};
vi.mock("../diffsbdd/ReferencePicker", () => ({
  ReferencePicker: ({
    value,
    onChange,
  }: {
    value: unknown;
    onChange(v: unknown): void;
  }) => (
    <div>
      {value ? "Source selected" : "New source required"}
      <button type="button" onClick={() => onChange(ref)}>
        Choose source
      </button>
    </div>
  ),
}));
vi.mock("../receptors/SurfaceRegionPicker", () => ({
  SurfaceRegionPicker: ({ onChange }: { onChange(v: unknown): void }) => (
    <button
      type="button"
      onClick={() =>
        onChange([
          { chain: "A", number: 604, resname: "E20", insertion_code: "" },
        ])
      }
    >
      Choose observed donepezil
    </button>
  ),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("starts fresh and submits exact source and geometric choices only at the final step", async () => {
  vi.spyOn(client, "request").mockImplementation(async (path) =>
    path.startsWith("/capabilities")
      ? { availability: { configuration_present: true } }
      : [],
  );
  const submit = vi
    .spyOn(client.api, "submit")
    .mockRejectedValue(new Error("Native boundary"));
  const user = userEvent.setup();
  render(<ChannelForm language="en" onCreated={vi.fn()} />);
  expect(screen.getByText("New source required")).toBeVisible();
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Choose source" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await user.click(
    screen.getByRole("button", { name: "Choose observed donepezil" }),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.getByRole("radio", { name: "Standard · recommended" }),
  ).toBeChecked();
  await user.click(screen.getByRole("radio", { name: "Wider channels" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(submit).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("button", { name: "Analyze channels and bottlenecks" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("Native boundary");
  expect(submit).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      operation: "channel_analysis",
      structure: ref,
      scientific_inputs: [ref],
      starting_regions: [
        { chain: "A", number: 604, resname: "E20", insertion_code: "" },
      ],
      options: expect.objectContaining({
        probe_radius_angstrom: 1.4,
        alternate: "A",
        remove_starting_ligands: true,
      }),
    }),
    expect.any(String),
  );
});
