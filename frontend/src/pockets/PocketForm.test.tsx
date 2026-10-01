import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PocketForm } from "./PocketForm";
import { api } from "../api";
import type { MoleculeRef } from "../research/types";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("offers staged preparation and refuses a real start when the native runtime is absent", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async (raw) =>
      new Response(
        JSON.stringify(
          String(raw).includes("capabilities")
            ? { availability: { configuration_present: false } }
            : [],
        ),
        { headers: { "Content-Type": "application/json" } },
      ),
  );
  vi.spyOn(api, "assets").mockResolvedValue([]);
  const post = vi.spyOn(api, "submit"),
    user = userEvent.setup();
  const ref = {
    asset_id: "saved-structure",
    sha256: "a".repeat(64),
    version_id: "version",
    record: 0,
    conformer: 0,
  } as MoleculeRef;
  render(
    <PocketForm
      language="en"
      initialProtein={ref}
      onCreated={vi.fn()}
      onPredict={vi.fn()}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.getByRole("combobox", {
      name: "Where did this structure come from?",
    }),
  ).toHaveValue("");
  await user.selectOptions(
    screen.getByRole("combobox", {
      name: "Where did this structure come from?",
    }),
    "predicted",
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(
    screen.getByRole("button", { name: "Pocket detection help" }),
  );
  expect(screen.getByText(/not experimental affinity/)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.getByRole("button", { name: "Discover candidate pockets" }),
  ).toBeDisabled();
  expect(post).not.toHaveBeenCalled();
});
