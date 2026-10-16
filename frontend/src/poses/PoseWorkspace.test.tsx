import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import * as client from "../api";
import { PoseWorkspace } from "./PoseWorkspace";
vi.mock("./PosePlanRun", () => ({
  PosePlanRun: () => <output>Existing study result</output>,
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("shows a real empty source state without creating synthetic plans or poses", async () => {
  vi.spyOn(client, "request").mockResolvedValue([]);
  const post = vi.spyOn(client.api, "post");
  render(<PoseWorkspace language="en" />);
  expect(
    await screen.findByText(/Align receptors in Structure prediction/),
  ).toBeVisible();
  expect(
    screen.getByRole("radio", { name: "New search regions" }),
  ).toBeChecked();
  expect(
    screen.queryByRole("combobox", { name: "Which site set?" }),
  ).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("radio", { name: "Historical pockets and regions" }),
  );
  expect(screen.getByRole("combobox", { name: "Which site set?" })).toHaveValue(
    "",
  );
  expect(
    screen.queryByRole("button", { name: "Save and review exploration plan" }),
  ).not.toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();
});
it("reports source loading errors with a recovery action", async () => {
  vi.spyOn(client, "request").mockRejectedValue(
    new Error("source API unavailable"),
  );
  render(<PoseWorkspace language="en" />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "source API unavailable",
  );
  expect(
    screen.queryByText(/Align receptors in Structure prediction/),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Refresh" })).toBeEnabled();
});

it("makes historical source choices explicit and lets a researcher return to a genuinely new study", async () => {
  const user = userEvent.setup();
  const post = vi.spyOn(client.api, "post");
  vi.spyOn(client, "request").mockImplementation(async (path) => {
    if (path.startsWith("/research/site-sets")) {
      return [
        { id: "saved-sites", request: { name: "Saved search region" } },
      ] as never;
    }
    if (path.startsWith("/research/pose-explorations")) {
      return [
        {
          id: "retained-plan",
          request: {
            name: "Historical receptor study",
            site_set_id: "saved-sites",
          },
        },
      ] as never;
    }
    return [] as never;
  });
  render(<PoseWorkspace language="en" />);
  await user.click(await screen.findByText("Historical exploration plans"));
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Choose a historical plan" }),
    "retained-plan",
  );
  expect(screen.getByText("Existing study result")).toBeVisible();
  await user.click(screen.getByText("Study inputs and historical plans"));
  expect(
    screen.getByRole("radio", { name: "Historical pockets and regions" }),
  ).toBeChecked();
  expect(screen.getByRole("combobox", { name: "Which site set?" })).toHaveValue(
    "saved-sites",
  );
  await user.click(screen.getByRole("radio", { name: "New search regions" }));
  expect(screen.queryByText("Existing study result")).not.toBeInTheDocument();
  expect(
    screen.getByRole("radio", { name: "New search regions" }),
  ).toBeChecked();
  expect(post).not.toHaveBeenCalled();
});
