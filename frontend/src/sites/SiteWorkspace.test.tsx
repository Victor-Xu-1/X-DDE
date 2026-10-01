import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { SiteWorkspace } from "./SiteWorkspace";
import type { ReceptorSet } from "../receptors/types";
import * as client from "../api";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const ref = {
  asset_id: "asset",
  sha256: "a".repeat(64),
  record: 0,
  conformer: 0,
  version_id: "v1",
};
const ensemble = {
  id: "ensemble",
  members: [
    {
      reference: ref,
      evidence: { index: 0, quality: { backbone_complete: true } },
    },
    {
      reference: { ...ref, asset_id: "second", version_id: "v2" },
      evidence: { index: 1, quality: { backbone_complete: true } },
    },
  ],
} as ReceptorSet;
it("explains missing native tasks and supports guided/expert choices without submitting", async () => {
  vi.spyOn(client, "request").mockResolvedValue([]);
  const submit = vi.spyOn(client.api, "post");
  const user = userEvent.setup();
  render(<SiteWorkspace ensemble={ensemble} language="en" />);
  expect(await screen.findByText("No saved site sets yet.")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Compare and save site set" }),
  ).toBeDisabled();
  expect(screen.getAllByText(/No successful pocket task/)).toHaveLength(2);
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Association sensitivity" }),
    "strict",
  );
  await user.click(screen.getByRole("button", { name: "Expert thresholds" }));
  expect(
    screen.getByRole("spinbutton", { name: "Maximum center distance (Å)" }),
  ).toHaveValue(5);
  expect(submit).not.toHaveBeenCalled();
});
it("shows a recoverable loading failure rather than a fake empty success", async () => {
  vi.spyOn(client, "request").mockRejectedValue(new Error("API unavailable"));
  render(<SiteWorkspace ensemble={ensemble} language="en" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("API unavailable");
  expect(screen.queryByText("No saved site sets yet.")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Refresh pocket tasks and sets" }),
  ).toBeEnabled();
});
