import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ReceptorForm } from "./ReceptorForm";
import * as client from "../api";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function boundary() {
  vi.spyOn(client, "request").mockImplementation(
    async (path) =>
      (path.includes("capabilities")
        ? { availability: { configuration_present: false } }
        : []) as never,
  );
  vi.spyOn(client.api, "assets").mockResolvedValue([]);
}
it("offers choices and expert settings without dispatching into a missing environment", async () => {
  boundary();
  const user = userEvent.setup(),
    submit = vi.spyOn(client.api, "submit");
  const { rerender } = render(
    <ReceptorForm language="en" onCreated={vi.fn()} />,
  );
  expect(
    screen.getByRole("button", {
      name: "Align and register receptor ensemble",
    }),
  ).toBeDisabled();
  const comparison = screen.getByRole("combobox", {
    name: "How should these structures be compared?",
  });
  await user.selectOptions(comparison, "similar");
  await user.click(screen.getByRole("button", { name: "Expert settings" }));
  const options = screen.getByRole("textbox", {
    name: "Alignment and resource parameters (server validated)",
  }) as HTMLTextAreaElement;
  expect(JSON.parse(options.value)).toMatchObject({
    minimum_identity: 0.95,
    maximum_rmsd_angstrom: 5,
  });
  await user.type(
    screen.getByRole("textbox", { name: "Task name (optional)" }),
    "retained name",
  );
  rerender(<ReceptorForm language="zh" onCreated={vi.fn()} />);
  expect(screen.getByRole("textbox", { name: "任务名称（可选）" })).toHaveValue(
    "retained name",
  );
  expect(
    screen.getByRole("button", { name: "对齐并建立受体集合" }),
  ).toBeDisabled();
  expect(submit).not.toHaveBeenCalled();
});
it("adds and removes structural members and resets the reference to an existing member", async () => {
  boundary();
  const user = userEvent.setup();
  render(<ReceptorForm language="en" onCreated={vi.fn()} />);
  await user.click(
    screen.getByRole("button", { name: "Add receptor structure" }),
  );
  expect(
    screen.getAllByRole("region", { name: /^Receptor [0-9]+$/ }),
  ).toHaveLength(3);
  const reference = screen.getByRole("combobox", {
    name: "Which structure is the alignment reference?",
  });
  await user.selectOptions(reference, "2");
  await user.click(
    within(screen.getByRole("region", { name: "Receptor 3" })).getByRole(
      "button",
      { name: "Remove structure" },
    ),
  );
  expect(reference).toHaveValue("0");
  expect(
    screen.getAllByRole("region", { name: /^Receptor [0-9]+$/ }),
  ).toHaveLength(2);
});
