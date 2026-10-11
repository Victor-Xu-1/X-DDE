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
        (path.startsWith("/research/input-catalog")
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
