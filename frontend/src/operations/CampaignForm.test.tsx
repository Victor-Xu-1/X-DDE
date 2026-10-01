import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { CampaignForm } from "./CampaignForm";
import { campaignConfig } from "./campaign-model";
import * as client from "../api";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("requires actual plan validation and explicit review before native campaign dispatch", async () => {
  vi.spyOn(client, "request").mockResolvedValue([]);
  vi.spyOn(client.api, "assets").mockResolvedValue([]);
  const validated = {
    id: "validated-plan",
    digest: "digest",
    state: "validated",
    task_id: null,
    summary: { target: "target", budget: "small" },
  };
  const post = vi
      .spyOn(client.api, "post")
      .mockImplementation(
        async (path) =>
          (path.endsWith("/start")
            ? { ...validated, state: "running", task_id: "native-task" }
            : validated) as never,
      ),
    user = userEvent.setup();
  render(<CampaignForm language="en" />);
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Expert parameters" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  const config = campaignConfig({
    targetName: "target",
    targets: { A: "ACDE" },
    format: "VHH",
    binders: { B: "ACDE" },
    cdr: { B: [1] },
    fixed: {},
    budget: "small",
  });
  fireEvent.change(
    screen.getByRole("textbox", { name: "Full design configuration" }),
    { target: { value: JSON.stringify(config) } },
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await user.click(
    screen.getByRole("checkbox", { name: /Allow this campaign/ }),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(post).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Start design" })).toBeDisabled();
  await user.click(
    screen.getByRole("button", { name: "Validate and review campaign" }),
  );
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith(
      "/harness/plans",
      { config },
      expect.any(String),
    ),
  );
  expect(screen.getByRole("button", { name: "Start design" })).toBeDisabled();
  await user.click(
    await screen.findByRole("checkbox", { name: /I have reviewed the target/ }),
  );
  await user.click(screen.getByRole("button", { name: "Start design" }));
  expect(post).toHaveBeenCalledWith("/harness/plans/validated-plan/start", {
    digest: "digest",
  });
  expect(
    await screen.findByRole("heading", { name: "5. Track design" }),
  ).toBeVisible();
  expect(screen.getByRole("status")).toHaveTextContent("native-task");
});
