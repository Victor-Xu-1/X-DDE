import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import * as client from "../api";
import { HumanizationForm } from "./HumanizationForm";

vi.mock("../research/SequencePicker", () => ({
  SequencePicker: () => <div>Sequence boundary</div>,
}));
const source = {
  asset_id: "original",
  sha256: "a".repeat(64),
  record: 0,
  conformer: 0,
  version_id: "exact-version",
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function mount(withSource = true) {
  vi.spyOn(client, "request").mockResolvedValue({
    availability: { configuration_present: true },
  });
  const submit = vi
    .spyOn(api, "submit")
    .mockRejectedValue(new Error("Native boundary unavailable"));
  render(
    <HumanizationForm
      language="en"
      onCreated={vi.fn()}
      initialSequence={withSource ? source : undefined}
    />,
  );
  return { submit, user: userEvent.setup() };
}
it("requires a source and shows only the active question", () => {
  mount(false);
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  expect(
    screen.queryByRole("radio", { name: "Conventional VH / VL" }),
  ).toBeNull();
});
it("preserves choices on Back, reviews before submission and keeps exact source identity", async () => {
  const { submit, user } = mount();
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(
    screen.getByRole("radio", { name: "Propose framework changes" }),
  );
  await user.click(screen.getByRole("radio", { name: "Moderate exploration" }));
  await user.click(screen.getByRole("button", { name: "Back" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.getByRole("radio", { name: "Moderate exploration" }),
  ).toBeChecked();
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(submit).not.toHaveBeenCalled();
  expect(screen.getByText("exact-version")).toBeVisible();
  await user.click(
    screen.getByRole("button", { name: "Generate framework proposals" }),
  );
  expect(submit).toHaveBeenCalledWith(
    expect.objectContaining({
      operation: "antibody_humanize",
      sequences: source,
      scientific_inputs: [source],
      options: expect.objectContaining({
        mode: "framework",
        iterations: 2,
        max_mutations: 5,
      }),
    }),
    expect.any(String),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Native boundary unavailable",
  );
});
it("changing to VHH resets framework proposals and exposes only supported evaluation", async () => {
  const { user } = mount();
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(
    screen.getByRole("radio", { name: "Propose framework changes" }),
  );
  await user.click(screen.getByRole("button", { name: "Back" }));
  await user.click(
    screen.getByRole("radio", { name: "VHH (exploratory evaluation)" }),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.getByRole("radio", { name: "Evaluate unchanged sequences" }),
  ).toBeChecked();
  expect(
    screen.queryByRole("radio", { name: "Propose framework changes" }),
  ).toBeNull();
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.getByRole("button", { name: "Evaluate sequences" }),
  ).toBeVisible();
});
it("blocks invalid expert mutation budgets without dispatching", async () => {
  const { submit, user } = mount();
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(
    screen.getByRole("radio", { name: "Propose framework changes" }),
  );
  await user.click(screen.getByText("Expert settings"));
  const budget = screen.getByRole("spinbutton", {
    name: "Maximum changed original positions",
  });
  await user.clear(budget);
  await user.type(budget, "21");
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  expect(submit).not.toHaveBeenCalled();
});
