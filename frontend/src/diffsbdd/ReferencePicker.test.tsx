import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ReferencePicker } from "./ReferencePicker";
import { useState } from "react";
import type { MoleculeRef } from "../research/types";
import * as client from "../api";
afterEach(() => vi.restoreAllMocks());
it("clears the hidden route selection and restores the exact saved version on returning", async () => {
  const ref = {
    asset_id: "file",
    sha256: "a".repeat(64),
    record: 2,
    conformer: 0,
    version_id: "version",
  };
  vi.spyOn(client, "request").mockResolvedValue([
    { id: "version", kind: "molecule", label: "Lead", reference: ref },
  ]);
  vi.spyOn(client.api, "assets").mockResolvedValue([]);
  const onChange = vi.fn(),
    user = userEvent.setup();
  render(
    <ReferencePicker
      kind="ligand"
      value={ref}
      onChange={onChange}
      language="en"
      label="Input molecule"
    />,
  );
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", {
        name: "Input molecule · Historical files",
      }),
    ).toBeEnabled(),
  );
  expect(
    screen.queryByRole("combobox", { name: "Input molecule" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("radio", { name: "Upload a new file" }));
  expect(
    screen.getByRole("radio", { name: "Upload a new file" }),
  ).toBeChecked();
  expect(
    screen.queryByRole("combobox", {
      name: "Input molecule · Historical files",
    }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("radio", { name: "Historical files" }));
  expect(
    screen.getByRole("combobox", {
      name: "Input molecule · Historical files",
    }),
  ).toHaveValue("version:version");
  expect(onChange).toHaveBeenNthCalledWith(1, null);
  expect(onChange).toHaveBeenLastCalledWith(ref);
});

it("a controlled task cannot submit a saved source while the empty file route is active", async () => {
  const ref: MoleculeRef = {
    asset_id: "file",
    sha256: "a".repeat(64),
    record: 2,
    conformer: 0,
    version_id: "version",
  };
  vi.spyOn(client, "request").mockResolvedValue([
    { id: "version", kind: "molecule", label: "Lead", reference: ref },
  ]);
  vi.spyOn(client.api, "assets").mockResolvedValue([]);
  function Task() {
    const [value, setValue] = useState<MoleculeRef | null>(ref);
    return (
      <>
        <ReferencePicker
          kind="ligand"
          value={value}
          onChange={setValue}
          language="en"
          label="Input molecule"
        />
        <button disabled={!value}>Continue with source</button>
        <output>{value?.version_id ?? "No selected source"}</output>
      </>
    );
  }
  render(<Task />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("radio", { name: "Upload a new file" }));
  expect(
    screen.getByRole("button", { name: "Continue with source" }),
  ).toBeDisabled();
  expect(screen.getByText("No selected source")).toBeVisible();
  await user.click(screen.getByRole("radio", { name: "Historical files" }));
  expect(
    screen.getByRole("button", { name: "Continue with source" }),
  ).toBeEnabled();
  expect(
    screen.getByRole("combobox", {
      name: "Input molecule · Historical files",
    }),
  ).toHaveValue("version:version");
});

it("prefers fresh upload even when historical versions exist", async () => {
  vi.spyOn(client, "request").mockResolvedValue([
    {
      id: "past",
      kind: "molecule",
      label: "Previous compound",
      reference: { version_id: "past", asset_id: "past-file" },
    },
  ]);
  const assets = vi.spyOn(client.api, "assets").mockResolvedValue([]),
    onChange = vi.fn();
  render(
    <ReferencePicker
      kind="ligand"
      value={null}
      onChange={onChange}
      language="en"
      label="New input"
    />,
  );
  expect(
    screen.getByRole("radio", { name: "Upload a new file" }),
  ).toBeChecked();
  expect(
    screen.queryByRole("combobox", { name: "New input · Historical files" }),
  ).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
  expect(assets).not.toHaveBeenCalled();
  await userEvent
    .setup()
    .click(screen.getByRole("radio", { name: "Historical files" }));
  expect(
    await screen.findByRole("combobox", {
      name: "New input · Historical files",
    }),
  ).toHaveValue("");
});

it("selects an unregistered historical upload with its exact record and clears it on the fresh route", async () => {
  const asset = {
    id: "history-file",
    kind: "ligand",
    name: "BRD4-leads.sdf",
    suffix: ".sdf",
    sha256: "b".repeat(64),
    size: 5000,
    created_at: "2026-10-01",
  };
  vi.spyOn(client.api, "assets").mockResolvedValue([asset] as never);
  vi.spyOn(client, "request").mockImplementation(
    async (path) => (path.endsWith("/metadata") ? asset : []) as never,
  );
  function Task() {
    const [value, setValue] = useState<MoleculeRef | null>(null);
    return (
      <>
        <ReferencePicker
          kind="ligand"
          value={value}
          onChange={setValue}
          language="en"
          label="Ligand"
        />
        <output>
          {value ? `${value.asset_id}:${value.record}` : "No file"}
        </output>
      </>
    );
  }
  render(<Task />);
  const user = userEvent.setup();
  expect(
    screen.getByRole("radio", { name: "Upload a new file" }),
  ).toBeChecked();
  expect(
    screen.queryByText("Historical files", { selector: "summary" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("radio", { name: "Historical files" }));
  await screen.findByRole("option", { name: "BRD4-leads.sdf" });
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Ligand · Historical files" }),
    "file:history-file",
  );
  await screen.findByText("history-file:0");
  await user.clear(screen.getByRole("spinbutton", { name: /Molecule record/ }));
  await user.type(
    screen.getByRole("spinbutton", { name: /Molecule record/ }),
    "3",
  );
  expect(screen.getByText("history-file:2")).toBeVisible();
  await user.click(screen.getByRole("radio", { name: "Upload a new file" }));
  expect(screen.getByText("No file")).toBeVisible();
  await user.click(screen.getByRole("radio", { name: "Historical files" }));
  expect(screen.getByText("history-file:2")).toBeVisible();
});
