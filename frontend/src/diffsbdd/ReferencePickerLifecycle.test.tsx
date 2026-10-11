import { useState } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { api, request } from "../api";
import type { MoleculeRef } from "../research/types";
import { ReferencePicker } from "./ReferencePicker";

vi.mock("../api", async () => {
  const real = await vi.importActual<typeof import("../api")>("../api");
  return { ...real, request: vi.fn(), api: { ...real.api, assets: vi.fn() } };
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const alpha: MoleculeRef = {
  asset_id: "A",
  sha256: "a".repeat(64),
  record: 0,
  conformer: 0,
  version_id: "alpha",
};
const beta: MoleculeRef = {
  ...alpha,
  asset_id: "B",
  sha256: "b".repeat(64),
  version_id: "beta",
};
const version = (ref: MoleculeRef) => ({
  id: ref.version_id,
  kind: "structure",
  label: ref.version_id,
  reference: ref,
});
function Task() {
  const [value, setValue] = useState<MoleculeRef | null>(alpha);
  return (
    <>
      <ReferencePicker
        kind="structure"
        value={value}
        onChange={setValue}
        language="en"
        label="Protein"
      />
      <button disabled={!value}>Next with material</button>
      <output aria-label="Submitted input">
        {value ? JSON.stringify(value) : "No input"}
      </output>
    </>
  );
}
it("an existing input cannot remain eligible while a newly selected file is pending", async () => {
  let reply: (value: unknown) => void = () => {};
  vi.mocked(api.assets).mockResolvedValue([]);
  vi.mocked(request).mockImplementation((path) =>
    path.startsWith("/research")
      ? Promise.resolve([version(alpha), version(beta)])
      : new Promise((resolve) => {
          reply = resolve;
        }),
  );
  const user = userEvent.setup();
  render(<Task />);
  const picker = screen.getByRole("combobox", {
    name: "Protein · Historical files",
  });
  await waitFor(() => expect(picker).toBeEnabled());
  expect(
    screen.getByRole("button", { name: "Next with material" }),
  ).toBeEnabled();
  await user.selectOptions(picker, "version:beta");
  expect(
    screen.getByRole("button", { name: "Next with material" }),
  ).toBeDisabled();
  expect(screen.getByLabelText("Submitted input")).toHaveTextContent(
    "No input",
  );
  await act(async () =>
    reply({
      id: "B",
      sha256: beta.sha256,
      kind: "structure",
      suffix: ".pdb",
      size: 100,
    }),
  );
  expect(
    screen.getByRole("button", { name: "Next with material" }),
  ).toBeEnabled();
  expect(screen.getByLabelText("Submitted input")).toHaveTextContent(
    JSON.stringify(beta),
  );
});
it("a late read cannot restore either the previous input or pending input after route changes", async () => {
  let reply: (value: unknown) => void = () => {};
  vi.mocked(api.assets).mockResolvedValue([]);
  vi.mocked(request).mockImplementation((path) =>
    path.startsWith("/research")
      ? Promise.resolve([version(alpha), version(beta)])
      : new Promise((resolve) => {
          reply = resolve;
        }),
  );
  const user = userEvent.setup();
  render(<Task />);
  const picker = screen.getByRole("combobox", {
    name: "Protein · Historical files",
  });
  await waitFor(() => expect(picker).toBeEnabled());
  await user.selectOptions(picker, "version:beta");
  await user.click(screen.getByRole("radio", { name: "Upload a new file" }));
  await act(async () =>
    reply({
      id: "B",
      sha256: beta.sha256,
      kind: "structure",
      suffix: ".pdb",
      size: 100,
    }),
  );
  await user.click(screen.getByRole("radio", { name: "Historical files" }));
  expect(
    screen.getByRole("button", { name: "Next with material" }),
  ).toBeDisabled();
  expect(screen.getByLabelText("Submitted input")).toHaveTextContent(
    "No input",
  );
});
it("rejects a saved-version hash mismatch and does not reveal internal service details", async () => {
  vi.mocked(api.assets).mockResolvedValue([]);
  vi.mocked(request).mockImplementation(async (path) =>
    path.startsWith("/research")
      ? [version(alpha), version(beta)]
      : {
          id: "B",
          sha256: "c".repeat(64),
          kind: "structure",
          suffix: ".pdb",
          size: 100,
        },
  );
  render(<Task />);
  const picker = screen.getByRole("combobox", {
    name: "Protein · Historical files",
  });
  await waitFor(() => expect(picker).toBeEnabled());
  await userEvent.selectOptions(picker, "version:beta");
  expect(await screen.findByRole("alert")).toHaveTextContent("do not match");
  expect(
    screen.getByRole("button", { name: "Next with material" }),
  ).toBeDisabled();
});
