import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PoseForm } from "./PoseForm";
import type { SiteSet } from "../sites/types";
import * as client from "../api";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("offers guided combinations and expert parameters while refusing unsaved ligand inputs", async () => {
  vi.spyOn(client, "request").mockResolvedValue([]);
  vi.spyOn(client.api, "assets").mockResolvedValue([]);
  const submit = vi.spyOn(client.api, "post");
  const sites = {
    id: "site-set",
    sites: [
      {
        id: "m00-p1",
        member_index: 0,
        mapping_status: "sufficient",
        native: { rank: 1 },
      },
    ],
  } as SiteSet;
  const user = userEvent.setup();
  render(
    <PoseForm sites={sites} states={[]} language="en" onSaved={vi.fn()} />,
  );
  expect(
    screen.getByRole("button", { name: "Save and review exploration plan" }),
  ).toBeDisabled();
  await user.click(
    screen.getByRole("checkbox", { name: "Receptor 1 · Pocket 1" }),
  );
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Exploration depth" }),
    "multi",
  );
  await user.click(screen.getByRole("button", { name: "Expert parameters" }));
  const raw = screen.getByRole("textbox", {
    name: "Complete exploration parameters (server validated)",
  }) as HTMLTextAreaElement;
  expect(JSON.parse(raw.value).seed_count).toBe(3);
  expect(JSON.parse(raw.value).max_jobs).toBe(30);
  expect(
    screen.getByRole("button", { name: "Save and review exploration plan" }),
  ).toBeDisabled();
  expect(submit).not.toHaveBeenCalled();
});
