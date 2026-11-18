import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import * as client from "../api";
import { TargetResearchForm } from "./TargetResearchForm";
import { TaskBackendControl } from "../utilities/TaskBackendControl";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function mockReadiness(enabled: () => boolean) {
  vi.spyOn(client, "request").mockImplementation(async (path) =>
    path.startsWith("/runtime-controls")
      ? ({
          capabilities: { "discovery.target": "discovery" },
          engines: [
            {
              id: "discovery",
              name: "Public databases",
              ready: true,
              active: false,
              enabled: enabled(),
            },
          ],
        } as never)
      : ({ availability: { configuration_present: true } } as never),
  );
}

it("requires consent, explicit selection and review; Back preserves source without early submit", async () => {
  let enabled = false;
  mockReadiness(() => enabled);
  const lookup = vi.spyOn(api, "post").mockImplementation(async (path) => {
    if (path === "/runtime-controls/discovery/start") {
      enabled = true;
      return { enabled } as never;
    }
    return {
      hits: [{ id: "ENSG00000133703", name: "KRAS", entity: "target" }],
      total: 1,
    } as never;
  });
  const submit = vi
    .spyOn(api, "submit")
    .mockRejectedValue(new Error("verified request only"));
  const user = userEvent.setup();
  render(
    <>
      <TaskBackendControl
        language="en"
        scope={{ capability: "discovery.target" }}
      />
      <TargetResearchForm language="en" entity="target" onCreated={vi.fn()} />
    </>,
  );
  await user.type(
    screen.getByRole("textbox", { name: "Target name or gene symbol" }),
    "KRAS",
  );
  expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
  await user.click(screen.getByRole("checkbox"));
  const search = screen.getByRole("button", { name: "Search" });
  expect(search).toBeDisabled();
  expect(lookup).not.toHaveBeenCalled();
  await user.click(
    await screen.findByRole("switch", { name: "Public databases" }),
  );
  await waitFor(() => expect(search).toBeEnabled());
  await user.click(search);
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
  mockReadiness(() => true);
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
