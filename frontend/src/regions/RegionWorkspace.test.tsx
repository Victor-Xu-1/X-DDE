import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import * as transport from "../api";
import * as native from "./useNativeIdentity";
import { RegionEditor } from "./RegionWorkspace";
vi.mock("../viewer/StructureViewer", () => ({
  StructureViewer: () => <div>Native structure preview</div>,
}));
const subject = {
  asset_id: "file",
  sha256: "a".repeat(64),
  record: 1,
  conformer: 0,
  version_id: "version",
};
const result = {
  mode: "identity",
  complete: true,
  reference: subject,
  molecule_artifact: "selection.sdf",
  identity_basis: "rdkit_removeHs_record_order",
  atoms: [
    { index: 0, element: "C", selectable: true },
    { index: 1, element: "N", selectable: true },
  ],
} as const;
afterEach(() => vi.restoreAllMocks());
function ready() {
  vi.spyOn(native, "useNativeIdentity").mockReturnValue({
    job: { id: "identity", status: "succeeded" } as never,
    result: result as never,
    error: "",
    running: false,
    inspect: vi.fn(),
    refresh: vi.fn(),
  });
  vi.spyOn(transport, "request").mockImplementation(
    async (path) =>
      (path.includes("capabilities")
        ? { availability: { configuration_present: true } }
        : []) as never,
  );
}
it("saves overlapping binder regions and native evidence without altering the molecular reference", async () => {
  ready();
  const user = userEvent.setup(),
    post = vi.spyOn(api, "post").mockImplementation(
      async (_, body) =>
        ({
          id: "regions",
          sha256: "b".repeat(64),
          body,
        }) as never,
    );
  render(<RegionEditor subject={subject} language="en" />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled(),
  );
  expect(
    screen.queryByRole("combobox", {
      name: "Historical regions (this molecule)",
    }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Region role" }),
    "binder_a",
  );
  await user.click(
    screen.getByText("Select atoms by number", { selector: "summary" }),
  );
  await user.click(screen.getByRole("button", { name: "1 C" }));
  await user.click(screen.getByRole("button", { name: "Add region" }));
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Region role" }),
    "binder_b",
  );
  await user.click(screen.getByRole("button", { name: "1 C" }));
  await user.click(screen.getByRole("button", { name: "2 N" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(post).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Save region version" }));
  await waitFor(() => expect(post).toHaveBeenCalledOnce());
  expect(post.mock.calls[0][1]).toMatchObject({
    subject,
    identity_job: "identity",
    regions: [
      { role: "binder_a", atom_indices: [0] },
      { role: "binder_b", atom_indices: [0, 1] },
    ],
  });
  expect(await screen.findByRole("status")).toHaveTextContent("Saved");
});
it("rejects an empty logical region before API mutation", async () => {
  ready();
  const user = userEvent.setup(),
    post = vi.spyOn(api, "post");
  render(<RegionEditor subject={subject} language="en" />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "Save region version" }),
  ).not.toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();
});
