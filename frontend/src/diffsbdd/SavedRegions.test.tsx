import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import { SavedRegions } from "./SavedRegions";
const ref = {
  asset_id: "a",
  sha256: "b".repeat(64),
  record: 1,
  conformer: 0,
  version_id: "v",
};
const saved = {
  id: "selection",
  body: {
    name: "Retained core",
    subject: ref,
    identity_job: "job",
    regions: [{ name: "core", role: "fixed_core", atom_indices: [0, 2] }],
  },
};
afterEach(() => vi.restoreAllMocks());
it("reuses the exact saved region without changing the full molecule", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify([saved]), {
      headers: { "Content-Type": "application/json" },
    }),
  );
  const onFixed = vi.fn(),
    onSaved = vi.fn(),
    user = userEvent.setup();
  render(
    <SavedRegions
      subject={ref}
      identityJob="job"
      fixed={[0, 2]}
      onFixed={onFixed}
      onSaved={onSaved}
      language="en"
    />,
  );
  await screen.findByRole("option", { name: "Retained core · selectio" });
  await user.selectOptions(screen.getByRole("combobox"), "selection");
  expect(onFixed).toHaveBeenCalledWith([0, 2]);
  expect(onSaved).toHaveBeenCalledWith("selection");
});
it("preserves a stable save intent and binds parser evidence", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("[]", { headers: { "Content-Type": "application/json" } }),
  );
  const post = vi.spyOn(api, "post").mockResolvedValue(saved),
    onSaved = vi.fn(),
    user = userEvent.setup();
  render(
    <SavedRegions
      subject={ref}
      identityJob="job"
      fixed={[0, 2]}
      onFixed={vi.fn()}
      onSaved={onSaved}
      language="en"
    />,
  );
  await user.click(screen.getByRole("button", { name: "Save fixed region" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith("selection"));
  expect(post.mock.calls[0][1]).toMatchObject({
    subject: ref,
    identity_job: "job",
    regions: [{ role: "fixed_core", atom_indices: [0, 2] }],
  });
});

it("keeps a late save in history without binding it to subsequently edited atoms", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("[]", { headers: { "Content-Type": "application/json" } }),
  );
  let finish!: (region: typeof saved) => void;
  vi.spyOn(api, "post").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const onSaved = vi.fn();
  const props = {
    subject: ref,
    identityJob: "job",
    onFixed: vi.fn(),
    onSaved,
    language: "en" as const,
  };
  const user = userEvent.setup();
  const view = render(<SavedRegions {...props} fixed={[0, 2]} />);
  await user.click(screen.getByRole("button", { name: "Save fixed region" }));
  view.rerender(<SavedRegions {...props} fixed={[0, 2, 3]} />);
  finish(saved);
  await screen.findByRole("option", { name: "Retained core · selectio" });
  expect(screen.getByRole("combobox")).toHaveValue("");
  expect(onSaved).not.toHaveBeenCalled();
});
