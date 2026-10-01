import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ReferencePicker } from "./ReferencePicker";
import * as client from "../api";
afterEach(() => vi.restoreAllMocks());
it("shows one material source at a time while retaining an immutable selected version", async () => {
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
        name: "Input molecule · Reuse research asset",
      }),
    ).toBeEnabled(),
  );
  expect(
    screen.queryByRole("combobox", { name: "Input molecule" }),
  ).not.toBeInTheDocument();
  await user.click(
    screen.getByRole("radio", { name: "Upload or choose a file" }),
  );
  expect(
    screen.getByRole("combobox", { name: "Input molecule" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("combobox", {
      name: "Input molecule · Reuse research asset",
    }),
  ).not.toBeInTheDocument();
  await user.click(
    screen.getByRole("radio", { name: "Reuse a research version" }),
  );
  expect(
    screen.getByRole("combobox", {
      name: "Input molecule · Reuse research asset",
    }),
  ).toHaveValue("version");
  expect(onChange).not.toHaveBeenCalled();
});
