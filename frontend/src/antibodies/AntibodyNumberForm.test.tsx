import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import * as client from "../api";
import { AntibodyNumberForm } from "./AntibodyNumberForm";
vi.mock("../research/SequencePicker", () => ({
  SequencePicker: () => <div>Exact sequence picker boundary</div>,
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("preserves exact sequence source, scFv choice, defaults and review-before-submit", async () => {
  vi.spyOn(client, "request").mockResolvedValue({
    availability: { configuration_present: true },
  });
  const submit = vi
      .spyOn(api, "submit")
      .mockRejectedValue(new Error("native numbering boundary")),
    user = userEvent.setup();
  const source = {
    asset_id: "source",
    sha256: "a".repeat(64),
    record: 0,
    conformer: 0,
    version_id: "original-sequence",
  };
  render(
    <AntibodyNumberForm
      language="en"
      onCreated={vi.fn()}
      initialSequence={source}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("radio", { name: "Linked scFv" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByRole("radio", { name: "Linked scFv" })).toBeChecked();
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(submit).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Annotate antibodies" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "native numbering boundary",
  );
  expect(submit).toHaveBeenCalledWith(
    expect.objectContaining({
      operation: "antibody_number",
      sequences: source,
      scientific_inputs: [source],
      options: { mode: "accuracy", scfv: true, cpu: 1, memory_mib: 4096 },
    }),
    expect.any(String),
  );
});
