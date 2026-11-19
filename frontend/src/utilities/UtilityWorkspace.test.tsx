import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { UtilityWorkspace } from "./UtilityWorkspace";
import { navigationItems } from "../studio/navigation-model";
import type { Job } from "../types";

vi.mock("./ImageRecognition", () => ({
  ImageRecognition: () => <input aria-label="Image editing" />,
}));
vi.mock("../examples/ExampleActions", () => ({
  ExampleActions: ({ capability }: { capability: string }) => (
    <span>Template {capability}</span>
  ),
}));
vi.mock("../admet/AdmetForm", () => ({
  AdmetForm: ({
    onCreated,
    focus,
  }: {
    onCreated(job: Job): void;
    focus?: "brain";
  }) => (
    <>
      <input aria-label={focus === "brain" ? "Brain input" : "ADMET input"} />
      <button onClick={() => onCreated({ id: "accepted" } as Job)}>
        Accept task
      </button>
    </>
  ),
}));
vi.mock("../operations/PropertyForm", () => ({
  PropertyForm: () => <input aria-label="Properties input" />,
}));
vi.mock("../chemistry/LibraryScreenForm", () => ({
  LibraryScreenForm: () => <input aria-label="Screen input" />,
}));
vi.mock("../chemistry/StateForm", () => ({
  StateForm: () => <input aria-label="States input" />,
}));
afterEach(cleanup);

it("exposes each utility's own template controls without loading an old input", async () => {
  const user = userEvent.setup();
  render(<UtilityWorkspace language="en" onCreated={vi.fn()} />);
  for (const [label, capability, input] of [
    ["ADMET prediction", "admet.predict", "ADMET input"],
    ["Brain penetration", "admet.brain", "Brain input"],
    ["Molecular properties", "properties", "Properties input"],
    ["Similarity & structural alerts", "chemistry.screen", "Screen input"],
    ["Protonation & tautomers", "chemistry.states", "States input"],
  ]) {
    await user.click(screen.getByRole("button", { name: label }));
    expect(screen.getByText("Template " + capability)).toBeVisible();
    expect(screen.getByLabelText(input)).toHaveValue("");
  }
});

it("keeps brain input separate from an unfinished ADMET input", async () => {
  const user = userEvent.setup();
  render(<UtilityWorkspace language="en" onCreated={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "ADMET prediction" }));
  await user.type(screen.getByLabelText("ADMET input"), "retain general input");
  await user.click(screen.getByRole("button", { name: "Brain penetration" }));
  await user.type(screen.getByLabelText("Brain input"), "retain brain input");
  await user.click(screen.getByRole("button", { name: "ADMET prediction" }));
  expect(screen.getByLabelText("ADMET input")).toHaveValue(
    "retain general input",
  );
  await user.click(screen.getByRole("button", { name: "Brain penetration" }));
  expect(screen.getByLabelText("Brain input")).toHaveValue(
    "retain brain input",
  );
});

it("places utilities first and preserves inputs while switching tools", async () => {
  expect(navigationItems[0].id).toBe("utilities");
  const user = userEvent.setup();
  render(<UtilityWorkspace language="en" onCreated={vi.fn()} />);
  await user.type(screen.getByLabelText("Image editing"), "retained image");
  expect(screen.queryByLabelText("ADMET input")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "ADMET prediction" }));
  await user.type(screen.getByLabelText("ADMET input"), "retained molecule");
  await user.click(
    screen.getByRole("button", { name: "Image recognition & editor" }),
  );
  expect(screen.getByLabelText("Image editing")).toHaveValue("retained image");
  await user.click(screen.getByRole("button", { name: "ADMET prediction" }));
  expect(screen.getByLabelText("ADMET input")).toHaveValue("retained molecule");
});

it("restarts only the submitted tool while preserving other unfinished work", async () => {
  const accepted = vi.fn(),
    user = userEvent.setup();
  render(<UtilityWorkspace language="en" onCreated={accepted} />);
  await user.type(screen.getByLabelText("Image editing"), "keep drawing");
  await user.click(screen.getByRole("button", { name: "ADMET prediction" }));
  await user.type(screen.getByLabelText("ADMET input"), "first task");
  await user.click(screen.getByRole("button", { name: "Accept task" }));
  expect(accepted).toHaveBeenCalledWith({ id: "accepted" });
  await user.click(screen.getByRole("button", { name: "New task" }));
  expect(screen.getByLabelText("ADMET input")).toHaveValue("");
  await user.click(
    screen.getByRole("button", { name: "Image recognition & editor" }),
  );
  expect(screen.getByLabelText("Image editing")).toHaveValue("keep drawing");
});

it("honors every explicit image entry without resetting another tool's draft", async () => {
  const user = userEvent.setup();
  const onCreated = vi.fn();
  const workspace = (request: number) => (
    <UtilityWorkspace language="en" onCreated={onCreated} imageRequest={request} />
  );
  const { rerender } = render(workspace(0));
  const admet = screen.getByRole("button", { name: "ADMET prediction" });
  await user.click(admet);
  await user.type(screen.getByLabelText("ADMET input"), "unfinished");
  for (const request of [1, 2]) {
    rerender(workspace(request));
    expect(screen.getByLabelText("Image editing")).toBeVisible();
    await user.click(admet);
    expect(screen.getByLabelText("ADMET input")).toHaveValue("unfinished");
  }
});
