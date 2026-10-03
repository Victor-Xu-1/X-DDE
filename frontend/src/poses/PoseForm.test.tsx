import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PoseForm } from "./PoseForm";
import type { SiteSet } from "../sites/types";
import type { Exploration } from "./types";
import { defaults } from "./generated";
import * as client from "../api";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
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
const ref = {
  asset_id: "molecule",
  sha256: "a".repeat(64),
  record: 2,
  conformer: 0,
  version_id: "version-1",
};
it("requires sites and a saved exact ligand before exposing exploration settings", async () => {
  vi.spyOn(client, "request").mockResolvedValue([]);
  vi.spyOn(client.api, "assets").mockResolvedValue([]);
  const post = vi.spyOn(client.api, "post"),
    user = userEvent.setup();
  render(
    <PoseForm sites={sites} states={[]} language="en" onSaved={vi.fn()} />,
  );
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await user.click(
    screen.getByRole("checkbox", { name: "Receptor 1 · Pocket 1" }),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  expect(
    screen.queryByRole("combobox", { name: "Exploration depth" }),
  ).not.toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();
});
it("preserves exact saved ligand and native exploration budgets through review and actual plan saving", async () => {
  vi.spyOn(client, "request").mockImplementation(
    async (path) =>
      (path.startsWith("/research/objects")
        ? [
            {
              id: "version-1",
              kind: "molecule",
              label: "Saved ligand",
              reference: ref,
            },
          ]
        : path.includes("metadata")
          ? { id: "molecule", sha256: ref.sha256, suffix: ".sdf" }
          : []) as never,
  );
  vi.spyOn(client.api, "assets").mockResolvedValue([]);
  const post = vi.spyOn(client.api, "post").mockResolvedValue({
      id: "exploration",
      plan_id: "plan",
      plan_sha256: "c".repeat(64),
      created_at: "2026-10-01T00:00:00Z",
      request: {
        name: "exploration",
        site_set_id: "site-set",
        site_ids: ["m00-p1"],
        ligands: [],
        options: defaults,
      },
      combinations: [],
    } as Exploration),
    saved = vi.fn(),
    user = userEvent.setup();
  render(<PoseForm sites={sites} states={[]} language="en" onSaved={saved} />);
  await user.click(
    screen.getByRole("checkbox", { name: "Receptor 1 · Pocket 1" }),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("radio", { name: "Historical files" }));
  const input = await screen.findByRole("combobox", {
    name: /Historical files/,
  });
  await waitFor(() => expect(input).toBeEnabled());
  await user.selectOptions(input, "version:version-1");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Exploration depth" }),
    "multi",
  );
  await user.click(screen.getByRole("button", { name: "Expert parameters" }));
  const raw = screen.getByRole("textbox", {
    name: "Complete exploration parameters (server validated)",
  }) as HTMLTextAreaElement;
  expect(JSON.parse(raw.value)).toMatchObject({ seed_count: 3, max_jobs: 30 });
  await user.click(screen.getByRole("button", { name: "Back" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.getByRole("combobox", { name: "Exploration depth" }),
  ).toHaveValue("multi");
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(post).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("button", { name: "Save and review exploration plan" }),
  );
  expect(post).toHaveBeenCalledWith(
    "/research/pose-explorations",
    expect.objectContaining({
      site_ids: ["m00-p1"],
      ligands: [
        {
          reference: ref,
          state_set_id: null,
          state_index: null,
          conformer_index: null,
        },
      ],
      options: expect.objectContaining({ seed_count: 3, max_jobs: 30 }),
    }),
    expect.any(String),
  );
  expect(
    await screen.findByRole("button", { name: "Open saved plan" }),
  ).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent(
    "computation has not started",
  );
});
