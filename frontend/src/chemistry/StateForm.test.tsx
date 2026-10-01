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
it("retains exact molecule, recommendation and expert draft across steps and languages; only review dispatches", async () => {
  boundary(true);
  const user = userEvent.setup(),
    created = vi.fn();
  const submit = vi
    .spyOn(api, "submit")
    .mockResolvedValue({ id: "task" } as never);
  const { rerender } = render(
    <StateForm language="en" initialMolecule={ref} onCreated={created} />,
  );
  expect(
    screen.queryByRole("combobox", { name: "What should be prepared?" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.selectOptions(
    screen.getByRole("combobox", { name: "What should be prepared?" }),
    "physiological",
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
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
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(
    screen.getByRole("combobox", { name: "What should be prepared?" }),
  ).toHaveValue("physiological");
  await user.click(screen.getByRole("button", { name: "Next" }));
  rerender(
    <StateForm language="zh" initialMolecule={ref} onCreated={created} />,
  );
  expect(screen.getByRole("textbox", { name: "任务名称（可选）" })).toHaveValue(
    "kept",
  );
  expect(submit).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "下一步" }));
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
    name: "kept",
  });
  expect(await screen.findByRole("link", { name: /查看任务/ })).toHaveAttribute(
    "href",
    "/#task=task",
  );
});
it("preserves preparation when environment is unavailable and blocks the actual reviewed start", async () => {
  boundary(false);
  const user = userEvent.setup(),
    submit = vi.spyOn(api, "submit");
  render(<StateForm language="en" initialMolecule={ref} onCreated={vi.fn()} />);
  for (let i = 0; i < 3; i++)
    await user.click(screen.getByRole("button", { name: "Next" }));
  expect(
    await screen.findByText(/Install the Chemistry preparation environment/),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Prepare states and conformers" }),
  ).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(
    screen.getByRole("textbox", { name: "Task name (optional)" }),
  ).toBeInTheDocument();
  expect(submit).not.toHaveBeenCalled();
});
it("does not send malformed expert settings to the backend", async () => {
  boundary(true);
  const user = userEvent.setup(),
    submit = vi.spyOn(api, "submit");
  render(<StateForm language="en" initialMolecule={ref} onCreated={vi.fn()} />);
  for (let i = 0; i < 2; i++)
    await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Expert settings" }));
  await user.clear(
    screen.getByRole("textbox", {
      name: "All preparation parameters (server validated)",
    }),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Prepare states and conformers" }),
    ).toBeEnabled(),
  );
  await user.click(
    screen.getByRole("button", { name: "Prepare states and conformers" }),
  );
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(submit).not.toHaveBeenCalled();
});
