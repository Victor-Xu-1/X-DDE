import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PocketForm } from "./PocketForm";
import { api } from "../api";
afterEach(() => vi.restoreAllMocks());
it("requires a real structure and source profile, and explains model-specific meaning", async () => {
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
  const onPredict = vi.fn();
  render(
    <PocketForm language="en" onCreated={vi.fn()} onPredict={onPredict} />,
  );
  await screen.findByText(/Install P2Rank/);
  expect(
    screen.getByRole("button", { name: "Discover candidate pockets" }),
  ).toBeDisabled();
  expect(
    screen.getByRole("combobox", {
      name: "Where did this structure come from?",
    }),
  ).toHaveValue("");
  expect(screen.getByText(/not ligand affinity/)).toBeVisible();
});
