import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import * as client from "../api";
import type { Job } from "../types";
import { useTaskLabel } from "./useTaskLabel";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function Title({ job }: { job: Job }) {
  return <output>{useTaskLabel(job, "zh")}</output>;
}
it("uses the registered public case label without changing the immutable task name", async () => {
  vi.spyOn(client, "request").mockResolvedValue({
    examples: [
      {
        pin: { job_id: "public" },
        case: { label: ["BRD4–JQ1 结合口袋与先导探索", "BRD4–JQ1"] },
      },
    ],
  });
  const job = {
    id: "public",
    request: { name: "compatibility verification" },
  } as Job;
  render(<Title job={job} />);
  expect(await screen.findByText("BRD4–JQ1 结合口袋与先导探索")).toBeVisible();
  expect(job.request.name).toBe("compatibility verification");
});
it("retains a researcher-authored task name if it is not a registered example", async () => {
  const lookup = vi
    .spyOn(client, "request")
    .mockResolvedValue({ examples: [] });
  render(
    <Title job={{ id: "own", request: { name: "ABL 先导系列" } } as Job} />,
  );
  await waitFor(() => expect(lookup).toHaveBeenCalled());
  expect(screen.getByText("ABL 先导系列")).toBeVisible();
});
