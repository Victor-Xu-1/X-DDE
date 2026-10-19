import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import * as client from "../api";
import { HarnessForm } from "./HarnessForm";
import type { Job } from "../types";
import type { Asset } from "./types";

afterEach(() => vi.restoreAllMocks());
it("submits a fresh structure with exact scientific references only after a concrete input review", async () => {
  const asset: Asset = {
    id: "11111111-1111-4111-8111-111111111111",
    name: "experimental-dimer.pdb",
    kind: "structure",
    suffix: ".pdb",
    sha256: "a".repeat(64),
    size: 900,
    created_at: "2026-10-20",
  };
  vi.spyOn(client, "request").mockImplementation(
    async (path) =>
      (path.startsWith("/capabilities/")
        ? { availability: { configuration_present: true } }
        : path.endsWith("/metadata")
          ? asset
          : []) as never,
  );
  const submit = vi
    .spyOn(client.api, "submit")
    .mockResolvedValue({ id: "actual-job" } as Job);
  render(<HarnessForm tool="structure" language="en" onCreated={vi.fn()} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Expert mode" }));
  fireEvent.change(
    screen.getByRole("textbox", { name: "Full native scientific parameters" }),
    {
      target: {
        value: JSON.stringify({
          structure_paths: [`asset:${asset.id}`],
          candidate_names: ["Experimental interface"],
          binder_chain_ids: ["B"],
          target_chain_ids: ["A"],
        }),
      },
    },
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled(),
  );
  for (let step = 0; step < 3; step++)
    await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("link", { name: asset.name })).toHaveAttribute(
    "href",
    `/api/assets/${asset.id}`,
  );
  expect(screen.getByText("B", { selector: "dd" })).toBeVisible();
  expect(screen.getByText("A", { selector: "dd" })).toBeVisible();
  expect(submit).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Submit compute task" }),
    ).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "Submit compute task" }));
  expect(submit.mock.calls[0][0]).toMatchObject({
    operation: "harness",
    tool: "structure",
    scientific_inputs: [
      {
        asset_id: asset.id,
        sha256: asset.sha256,
        record: 0,
        conformer: 0,
        version_id: null,
      },
    ],
    payload: {
      candidate_names: ["Experimental interface"],
      binder_chain_ids: ["B"],
      target_chain_ids: ["A"],
    },
  });
});
