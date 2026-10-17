import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import * as client from "../api";
import { ExampleContext } from "../examples/context";
import type { PreparedExample } from "../examples/types";
import { LibraryScreenForm } from "./LibraryScreenForm";
import { screenDefaults } from "./screen-types";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("restores the actual scaffold method, warning policy and complete saved budget", async () => {
  const library = { asset_id: "native-library", sha256: "a".repeat(64) };
  vi.spyOn(client, "request").mockImplementation(async (path) =>
    path.startsWith("/capabilities")
      ? { availability: { configuration_present: true, missing: [] } }
      : {
          id: library.asset_id,
          name: "native-stat6-series.sdf",
          kind: "ligand",
          suffix: ".sdf",
          size: 109884,
          sha256: library.sha256,
        },
  );
  const submit = vi
    .spyOn(api, "submit")
    .mockResolvedValue({ id: "transport-only" } as never);
  vi.spyOn(api, "assets").mockResolvedValue([]);
  const options = {
    ...screenDefaults,
    mode: "scaffold",
    alert_policy: "warn",
    max_selected: 12,
    per_scaffold: 2,
    seed: 19,
  };
  const example = {
    objects: {
      library: {
        reference: { ...library, record: 0, conformer: 0, version_id: null },
      },
    },
    request: { operation: "library_screen", library, query: null, options },
  } as unknown as PreparedExample;
  render(
    <ExampleContext.Provider value={example}>
      <LibraryScreenForm language="en" onCreated={vi.fn()} />
    </ExampleContext.Provider>,
  );
  const user = userEvent.setup();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.getByRole("radio", { name: "Select scaffold representatives" }),
  ).toBeChecked();
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.getByRole("combobox", { name: "Maximum selected molecules" }),
  ).toHaveValue("12");
  await user.click(screen.getByRole("button", { name: "Next" }));
  const start = screen.getByRole("button", { name: "Run library selection" });
  await waitFor(() => expect(start).toBeEnabled());
  await user.click(start);
  expect(submit).toHaveBeenCalledWith(
    expect.objectContaining({
      operation: "library_screen",
      library,
      query: null,
      options,
    }),
    expect.any(String),
  );
});
