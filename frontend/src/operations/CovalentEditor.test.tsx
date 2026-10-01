import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { CovalentEditor } from "./CovalentEditor";
import { defaults } from "../form-model";
import * as client from "../api";
import type { Job } from "../types";
afterEach(() => vi.restoreAllMocks());
it("prepares the preview only on explicit request and keeps network/template/folding controls out of the native atom task", async () => {
  vi.spyOn(client, "request").mockResolvedValue({
    availability: { configuration_present: true },
  });
  const submit = vi
    .spyOn(client.api, "submit")
    .mockResolvedValue({ id: "inspection", status: "succeeded" } as Job);
  vi.spyOn(client.api, "result").mockResolvedValue({ atoms: [] } as never);
  const user = userEvent.setup(),
    onChange = vi.fn();
  render(
    <CovalentEditor
      components={[{ kind: "ligand", value: "CCO", count: 1 }]}
      parameters={{
        ...defaults,
        allow_network: true,
        use_template: true,
        tfg: true,
      }}
      value={[]}
      onChange={onChange}
      language="en"
    />,
  );
  await user.click(screen.getByText("Covalent bonds · select actual atoms"));
  expect(submit).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Inspect inputs and open selector" }),
    ).toBeEnabled(),
  );
  await user.click(
    screen.getByRole("button", { name: "Inspect inputs and open selector" }),
  );
  expect(submit).toHaveBeenCalledWith(
    expect.objectContaining({
      operation: "inspect",
      components: [{ kind: "ligand", value: "CCO", count: 1 }],
      parameters: expect.objectContaining({
        feature_mode: "none",
        allow_network: false,
        use_template: false,
        use_rna_msa: false,
        tfg: false,
      }),
      covalent_bonds: [],
    }),
    expect.any(String),
  );
  expect(onChange).not.toHaveBeenCalled();
});
