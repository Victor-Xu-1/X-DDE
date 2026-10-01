import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { StateForm } from "./StateForm";
import { api } from "../api";
import * as client from "../api";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const ref = {
  asset_id: "f",
  sha256: "a".repeat(64),
  record: 2,
  conformer: 0,
  version_id: "v",
};
function boundary(ready: boolean) {
  vi.spyOn(client, "request").mockImplementation(async (path) =>
    path.includes("capabilities")
      ? { availability: { configuration_present: ready } }
      : ([] as never),
  );
  vi.spyOn(api, "assets").mockResolvedValue([]);
}
it("supports guided choices and expert settings without losing drafts on language changes", async () => {
  boundary(true);
  const user = userEvent.setup(),
    created = vi.fn();
  const submit = vi
    .spyOn(api, "submit")
    .mockResolvedValue({ id: "task" } as never);
  const { rerender } = render(
    <StateForm language="en" initialMolecule={ref} onCreated={created} />,
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "What should be prepared?" }),
    "physiological",
  );
  await user.type(
    screen.getByRole("textbox", { name: "Task name (optional)" }),
    "kept",
  );
  await user.click(screen.getByRole("button", { name: "Expert settings" }));
  expect(
    JSON.parse(
      (
        screen.getByRole("textbox", {
          name: "All preparation parameters (server validated)",
        }) as HTMLTextAreaElement
      ).value,
    ),
  ).toMatchObject({ ph_min: 6.8, ph_max: 7.8, protonation: true });
  rerender(
    <StateForm language="zh" initialMolecule={ref} onCreated={created} />,
  );
  expect(screen.getByRole("textbox", { name: "任务名称（可选）" })).toHaveValue(
    "kept",
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "准备状态与构象" }),
    ).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "准备状态与构象" }));
  expect(submit.mock.calls[0][0]).toMatchObject({
    operation: "molecular_states",
    molecule: ref,
    options: { protonation: true, ph_min: 6.8 },
  });
});
it("keeps task dispatch disabled when the independent environment is missing", async () => {
  boundary(false);
  render(<StateForm language="en" initialMolecule={ref} onCreated={vi.fn()} />);
  await screen.findByText(/Install the independent Chemistry/);
  expect(
    screen.getByRole("button", { name: "Prepare states and conformers" }),
  ).toBeDisabled();
});
