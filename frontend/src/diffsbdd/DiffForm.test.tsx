import { render, screen, waitFor } from "@testing-library/react";
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
afterEach(() => vi.restoreAllMocks());
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
  render(<DiffForm mode="generate" language="en" onCreated={vi.fn()} />);
  await screen.findByText(/The environment is not ready/);
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
    <DiffForm mode="generate" language="en" onCreated={created} />,
  );
  await user.click(screen.getByRole("button", { name: "Expert mode" }));
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
