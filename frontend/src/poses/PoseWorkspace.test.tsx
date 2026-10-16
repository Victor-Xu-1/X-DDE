import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import * as client from "../api";
import { PoseWorkspace } from "./PoseWorkspace";
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
