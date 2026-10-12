import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import * as client from "../api";
import * as examples from "../examples/context";
import { preparationDefaults } from "./preparation-types";
import { StructurePrepareForm } from "./StructurePrepareForm";
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: () => <div>Actual viewer boundary</div>,
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("honors the reviewed template's mmCIF format and observed alternate in the final request", async () => {
  vi.spyOn(client, "request").mockImplementation(async (path) =>
    path.startsWith("/capabilities")
      ? { availability: { configuration_present: true } }
      : [],
  );
  vi.spyOn(examples, "useExampleTask").mockReturnValue({
    operation: "structure_prepare",
    options: { ...preparationDefaults, format: "cif", alternate: "A" },
  } as never);
  const submit = vi
    .spyOn(api, "submit")
    .mockRejectedValue(new Error("native boundary"));
  const user = userEvent.setup();
  render(
    <StructurePrepareForm
      language="en"
      onCreated={vi.fn()}
      initialStructure={{
        asset_id: "source",
        sha256: "a".repeat(64),
        record: 0,
        conformer: 0,
      }}
    />,
  );
  for (let step = 0; step < 3; step++)
    await user.click(screen.getByRole("button", { name: "Next" }));
  const alternate = screen.getByText("Alternate coordinates", { exact: true });
  expect(alternate.nextElementSibling).toHaveTextContent("A");
  await user.click(
    screen.getByRole("button", { name: "Save prepared structure" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("native boundary");
  expect(submit).toHaveBeenCalledWith(
    expect.objectContaining({
      options: expect.objectContaining({ format: "cif", alternate: "A" }),
    }),
    expect.any(String),
  );
});
it("preserves exact structural reference, requires review and keeps cofactors by default", async () => {
  vi.spyOn(client, "request").mockImplementation(async (path) =>
    path.startsWith("/capabilities")
      ? { availability: { configuration_present: true } }
      : [],
  );
  const submit = vi
    .spyOn(api, "submit")
    .mockRejectedValue(new Error("native boundary"));
  const ref = {
    asset_id: "asset",
    sha256: "a".repeat(64),
    version_id: "version",
    record: 0,
    conformer: 0,
  };
  const user = userEvent.setup();
  render(
    <StructurePrepareForm
      language="en"
      onCreated={vi.fn()}
      initialStructure={ref}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(
    screen.getByRole("radio", { name: "Keep all chains (recommended)" }),
  ).toBeChecked();
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(submit).not.toHaveBeenCalled();
  expect(
    screen.getByText("Alternate coordinates", { exact: true }),
  ).toBeVisible();
  expect(screen.getByText("Stop on ambiguity", { exact: true })).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: "Save prepared structure" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("native boundary");
  expect(submit).toHaveBeenCalledWith(
    expect.objectContaining({
      operation: "structure_prepare",
      structure: ref,
      scientific_inputs: [ref],
      options: expect.objectContaining({
        chains: [],
        waters: false,
        heterogens: "keep",
        model_index: 0,
        format: "pdb",
        alternate: "reject",
      }),
    }),
    expect.any(String),
  );
});
