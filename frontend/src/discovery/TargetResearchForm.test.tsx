import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import * as client from "../api";
import { TargetResearchForm } from "./TargetResearchForm";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("requires consent, explicit selection and review; Back preserves source without early submit", async () => {
  vi.spyOn(client, "request").mockResolvedValue({
    availability: { configuration_present: true },
  });
  const lookup = vi.spyOn(api, "post").mockResolvedValue({
    hits: [{ id: "ENSG00000133703", name: "KRAS", entity: "target" }],
    total: 1,
  });
  const submit = vi
    .spyOn(api, "submit")
    .mockRejectedValue(new Error("verified request only"));
  const user = userEvent.setup();
  render(
    <TargetResearchForm language="en" entity="target" onCreated={vi.fn()} />,
  );
  await user.type(
    screen.getByRole("textbox", { name: "Target name or gene symbol" }),
    "KRAS",
  );
  expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Search" }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Found 1 results",
  );
  expect(lookup).toHaveBeenCalledWith(
    "/discovery/lookup",
    expect.objectContaining({ query: "KRAS", allow_external: true }),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("radio", { name: "KRAS" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByRole("radio", { name: "KRAS" })).toBeChecked();
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(submit).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Retrieve evidence" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "verified request only",
  );
  expect(submit).toHaveBeenCalledWith(
    expect.objectContaining({
      operation: "target_research",
      identifier: "ENSG00000133703",
      limit: 20,
    }),
    expect.any(String),
  );
});
it("retains an empty search state and prevents progressing or substituting another target", async () => {
  vi.spyOn(client, "request").mockResolvedValue({
    availability: { configuration_present: true },
  });
  vi.spyOn(api, "post").mockResolvedValue({ hits: [], total: 0 });
  const submit = vi.spyOn(api, "submit");
  const user = userEvent.setup();
  render(
    <TargetResearchForm language="en" entity="disease" onCreated={vi.fn()} />,
  );
  await user.type(
    screen.getByRole("textbox", { name: "Disease name" }),
    "unknown term",
  );
  await user.click(screen.getByRole("checkbox"));
  await user.click(screen.getByRole("button", { name: "Search" }));
  expect(await screen.findByRole("status")).toHaveTextContent("No matches");
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  expect(submit).not.toHaveBeenCalled();
});
