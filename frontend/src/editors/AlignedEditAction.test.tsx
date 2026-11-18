import { render, screen, waitFor, within } from "@testing-library/react";
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
  expect(submit).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(
    screen.getByRole("button", { name: "Read current edited structure" }),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(submit).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Submit 3D edit task" }));
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

it("opens in the adjacent pane and closes without a molecular read or task submission", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) =>
    Response.json(
      String(input).startsWith("/api/runtime-controls")
        ? {
            capabilities: { "diffsbdd.edit": "diffsbdd" },
            engines: [
              {
                id: "diffsbdd",
                name: "DiffSBDD",
                ready: true,
                enabled: false,
                active: false,
              },
            ],
          }
        : { availability: { configuration_present: true } },
    ),
  );
  const target = document.createElement("div");
  document.body.append(target);
  const changed = vi.fn(),
    execute = vi.fn(),
    submit = vi.spyOn(api, "submit");
  const view = render(
    <AlignedEditAction
      origin={origin}
      language="en"
      busy={false}
      execute={execute}
      onCreated={vi.fn()}
      panelTarget={target}
      onOpenChange={changed}
    />,
  );
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Create an aligned 3D edit" }),
  );
  expect(changed).toHaveBeenLastCalledWith(true);
  expect(
    within(target).getByRole("region", { name: "3D edit task" }),
  ).toBeVisible();
  expect(
    await within(target).findByRole("switch", { name: "DiffSBDD" }),
  ).not.toBeChecked();
  expect(view.container.querySelector(".aligned-edit-task")).toBeNull();
  await user.click(
    within(target).getByRole("button", { name: "Return to editor" }),
  );
  expect(changed).toHaveBeenLastCalledWith(false);
  expect(target).toBeEmptyDOMElement();
  expect(execute).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
  view.unmount();
  target.remove();
});
