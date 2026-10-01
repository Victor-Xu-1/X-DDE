import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { DiffForm } from "./DiffForm";
const ref = {
  asset_id: "f",
  sha256: "a".repeat(64),
  record: 3,
  conformer: 0,
  version_id: "v",
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function boundary(ready = true) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (raw) => {
    const path = String(raw);
    return new Response(
      JSON.stringify(
        path.includes("capabilities")
          ? {
              availability: {
                configuration_present: ready,
                missing: ready ? [] : ["runtime"],
              },
            }
          : path.includes("session")
            ? { csrf_token: "test" }
            : [],
      ),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });
  vi.spyOn(api, "assets").mockResolvedValue([]);
}
it("lets users prepare input but disables dispatch when server configuration is missing", async () => {
  boundary(false);
  const user = userEvent.setup();
  render(
    <DiffForm
      mode="export"
      language="en"
      initialMolecule={ref}
      onCreated={vi.fn()}
    />,
  );
  for (let i = 0; i < 3; i++)
    await user.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByText(/Configure the required DiffSBDD/);
  expect(screen.getByRole("button", { name: "Create task" })).toBeDisabled();
});
it("retains exact candidate records through export with a real task envelope", async () => {
  boundary();
  const user = userEvent.setup(),
    created = vi.fn();
  const submit = vi
    .spyOn(api, "submit")
    .mockResolvedValue({ id: "task" } as never);
  render(
    <DiffForm
      mode="export"
      language="en"
      initialMolecule={ref}
      onCreated={created}
    />,
  );
  for (let i = 0; i < 3; i++)
    await user.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Create task" })).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "Create task" }));
  expect(submit.mock.calls[0][0]).toMatchObject({
    operation: "diffsbdd",
    payload: { mode: "export", molecules: [ref] },
  });
  expect(created).toHaveBeenCalledWith({ id: "task" });
});
it("exposes every native option in expert mode while language changes preserve drafts", async () => {
  boundary();
  const user = userEvent.setup(),
    created = vi.fn();
  const { rerender } = render(
    <DiffForm
      mode="generate"
      language="en"
      initialProtein={{ ...ref, asset_id: "r" }}
      initialPocket={{ kind: "ligand", ligand: ref }}
      onCreated={created}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Expert settings" }));
  const parameters = screen.getByRole("textbox", {
    name: "All native parameters (validated by server)",
  });
  expect((parameters as HTMLTextAreaElement).value).toContain('"resamplings"');
  await user.type(
    screen.getByRole("textbox", { name: "Task name (optional)" }),
    "kept draft",
  );
  rerender(<DiffForm mode="generate" language="zh" onCreated={created} />);
  expect(screen.getByRole("textbox", { name: "任务名称（可选）" })).toHaveValue(
    "kept draft",
  );
});

it("retains one fixed-atom picker and exact inputs when returning and changing language", async () => {
  boundary(false);
  const user = userEvent.setup(),
    created = vi.fn();
  const props = {
    mode: "inpaint" as const,
    initialProtein: { ...ref, asset_id: "r" },
    initialMolecule: ref,
    initialPocket: { kind: "ligand" as const, ligand: ref },
    onCreated: created,
  };
  const { rerender } = render(<DiffForm {...props} language="en" />);
  await user.click(screen.getByRole("button", { name: "Next" }));
  for (let i = 0; i < 5; i++) {
    expect(
      screen.getAllByRole("button", { name: "Read selectable atoms" }),
    ).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Back" }));
    rerender(<DiffForm {...props} language="zh" />);
    await user.click(screen.getByRole("button", { name: "下一步" }));
    rerender(<DiffForm {...props} language="en" />);
  }
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  expect(created).not.toHaveBeenCalled();
});
