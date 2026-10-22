import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import * as client from "../api";
import { ScientificForm } from "./ScientificForm";
import { catalogFixture } from "../diffsbdd/input-catalog.test-fixtures";
vi.mock("../guided/useTaskReadiness", () => ({
  useTaskReadiness: () => ({ ready: true, error: "", recheck: vi.fn() }),
}));
afterEach(() => vi.restoreAllMocks());
it("keeps a consciously chosen single-sequence baseline when navigating back to inputs", async () => {
  vi.spyOn(client, "request").mockResolvedValue({
    availability: { configuration_present: true },
  } as never);
  const user = userEvent.setup();
  render(
    <ScientificForm form="boltz.predict" language="en" onCreated={vi.fn()} />,
  );
  await user.type(screen.getByRole("textbox", { name: "Sequence" }), "ACDE");
  await user.click(
    screen.getAllByRole("button", { name: "Remove component" })[1],
  );
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Evolutionary information" }),
    "single",
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(
    screen.getByRole("combobox", { name: "Evolutionary information" }),
  ).toHaveValue("single");
  expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
});
it.each(["chemprop.train", "chemprop.predict"] as const)(
  "%s blocks its first step until the selected whole file is verified",
  async (form) => {
    let reply!: (value: unknown) => void;
    const asset = {
      id: "STAT6",
      name: "STAT6-series.sdf",
      kind: "ligand" as const,
      suffix: ".sdf",
      size: 100,
      sha256: "a".repeat(64),
      created_at: "",
    };
    vi.spyOn(client, "request").mockImplementation(
      async (path) =>
        (path === "/scientific/property-models"
          ? { models: [] }
          : path.startsWith("/research/input-catalog")
            ? catalogFixture([], [asset])
            : path.endsWith("/metadata")
              ? new Promise((resolve) => (reply = resolve))
              : { availability: { configuration_present: true } }) as never,
    );
    render(<ScientificForm form={form} language="en" onCreated={vi.fn()} />);
    const next = screen.getByRole("button", { name: "Next" });
    expect(next).toBeDisabled();
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "Historical files" }));
    const picker = screen.getByRole("combobox", {
      name: "Whole SDF molecular library · Historical files",
    });
    await waitFor(() => expect(picker).toBeEnabled());
    await user.selectOptions(picker, "file:STAT6");
    expect(next).toBeDisabled();
    await act(async () => reply(asset));
    await waitFor(() => expect(next).toBeEnabled());
    expect(screen.getByText(/STAT6-series.sdf ·/)).toBeVisible();
  },
);
