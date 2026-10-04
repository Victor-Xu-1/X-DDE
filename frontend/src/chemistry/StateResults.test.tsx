import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StateResults } from "./StateResults";
import * as api from "../api";
import type { StateResult } from "./types";
import type { Job } from "../types";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
// Isolate the collection API boundary; native content is separately exercised by the real CI container/browser flow.
const data: StateResult = {
  operation: "molecular_states",
  complete: true,
  states: [
    {
      index: 0,
      smiles: "CCO",
      charge: 0,
      formula: "C2H6O",
      source_to_state_atoms: [0, 1, 2],
      conformer_status: "not_requested",
    },
  ],
  conformers: [],
  state_artifact: "states.sdf",
  conformer_artifact: "conformers.sdf",
  artifact_sha256: {},
  versions: {},
  coverage: { budget_limited: false, rejected: 0, protonation_rejected: 0 },
};
const job = { id: "11111111-1111-4111-8111-111111111111" } as Job;
it("distinguishes loading from an unindexed collection and preserves original downloads", async () => {
  let finish: (value: unknown) => void = () => {};
  vi.spyOn(api, "request").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }) as never,
  );
  render(<StateResults job={job} data={data} language="en" />);
  expect(screen.getByRole("status")).toHaveTextContent(
    "Loading the indexed collection",
  );
  finish([]);
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(
      "Original results can be previewed and downloaded",
    ),
  );
  expect(
    screen.getByRole("link", { name: "Download state SDF" }),
  ).toHaveAttribute("download");
  expect(
    screen.queryByRole("button", { name: "Use for binding-pose search" }),
  ).toBeNull();
});
it("shows a collection read error instead of spinning indefinitely or offering unbound reuse", async () => {
  vi.spyOn(api, "request").mockRejectedValue(
    new Error("Collection integrity check failed"),
  );
  render(<StateResults job={job} data={data} language="en" />);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Collection integrity check failed",
  );
  expect(
    screen.queryByText("Loading the indexed collection", { exact: false }),
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Use for binding-pose search" }),
  ).toBeNull();
});
