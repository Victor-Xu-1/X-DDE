import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { AlignedEditAction } from "./AlignedEditAction";
import type { ScientificObject } from "../research/types";
const origin = {
  label: "candidate",
  reference: {
    asset_id: "a",
    sha256: "b".repeat(64),
    record: 1,
    conformer: 0,
    version_id: "v",
  },
  notes: "retained",
  rating: 4,
} as ScientificObject;
afterEach(() => vi.restoreAllMocks());
it("submits a real edit envelope with the original version rather than overwriting it", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({ availability: { configuration_present: true } }),
      { headers: { "Content-Type": "application/json" } },
    ),
  );
  const submit = vi
      .spyOn(api, "submit")
      .mockResolvedValue({ id: "job" } as never),
    created = vi.fn(),
    user = userEvent.setup();
  const editor = {
    getMolfile: async () => "edited molfile contents",
    getSmiles: async () => "CCO",
    setMolecule: async () => {},
  };
  render(
    <AlignedEditAction
      origin={origin}
      language="en"
      busy={false}
      execute={(fn) => fn(editor)}
      onCreated={created}
    />,
  );
  const button = screen.getByRole("button", {
    name: "Create an aligned 3D edit",
  });
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
  await waitFor(() => expect(created).toHaveBeenCalled());
  expect(submit.mock.calls[0][0]).toMatchObject({
    operation: "diffsbdd",
    payload: {
      mode: "edit",
      original: origin.reference,
      molblock: "edited molfile contents",
      rating: 4,
    },
  });
});
