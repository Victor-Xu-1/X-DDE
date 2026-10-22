import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import * as client from "../api";
import * as examples from "../examples/context";
import { ScientificForm } from "./ScientificForm";
import { catalogFixture } from "../diffsbdd/input-catalog.test-fixtures";
vi.mock("../guided/useTaskReadiness", () => ({
  useTaskReadiness: () => ({ ready: true, error: "", recheck: vi.fn() }),
}));
vi.mock("../presentation/MoleculeImage", () => ({ MoleculeImage: () => null }));
afterEach(() => vi.restoreAllMocks());
it("submits a template ligand once from its component and ignores unsupported structure handoff state", async () => {
  const asset = {
    id: "11111111-1111-4111-8111-111111111111",
    sha256: "a".repeat(64),
    name: "defined-molecule.sdf",
    kind: "ligand" as const,
    suffix: ".sdf",
    size: 100,
    created_at: "",
  };
  const source = {
    asset_id: asset.id,
    sha256: asset.sha256,
    record: 0,
    conformer: 0,
  };
  vi.spyOn(examples, "useExampleTask").mockReturnValue({
    operation: "boltz_predict",
    name: "Defined ligand complex",
    inputs: [{ role: "ligand", source }],
    payload: {
      kind: "boltz",
      components: [
        { id: "A", kind: "protein", value: "ACDE", msa_mode: "single" },
        { id: "B", kind: "ligand", value: "", source },
      ],
      samples: 1,
      recycling_steps: 3,
      sampling_steps: 200,
      affinity: false,
    },
  } as never);
  vi.spyOn(client, "request").mockImplementation(
    async (path) =>
      (path.startsWith("/research/input-catalog")
        ? catalogFixture([], [asset])
        : path.endsWith("/metadata")
          ? asset
          : { availability: { configuration_present: true } }) as never,
  );
  const submit = vi
    .spyOn(client.api, "submit")
    .mockResolvedValue({ id: "created-from-reviewed-inputs" } as never);
  const user = userEvent.setup();
  render(
    <ScientificForm
      form="boltz.predict"
      language="en"
      onCreated={vi.fn()}
      initialStructure={{
        ...source,
        asset_id: "22222222-2222-4222-8222-222222222222",
      }}
    />,
  );
  for (let step = 0; step < 3; step++)
    await user.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("1 confirmed files")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Submit calculation" }));
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
  expect(submit.mock.calls[0][0]).toMatchObject({
    inputs: [{ role: "ligand", source }],
    scientific_inputs: [source],
  });
});
it("keeps a consciously chosen single-sequence baseline when navigating back to inputs", async () => {
  vi.spyOn(client, "request").mockResolvedValue({
    availability: { configuration_present: true },
  } as never);
  const user = userEvent.setup();
  render(
    <ScientificForm form="boltz.predict" language="en" onCreated={vi.fn()} />,
  );
  await user.type(screen.getByRole("textbox", { name: "Sequence" }), "ACDE");
  await user.click(
    screen.getAllByRole("button", { name: "Remove component" })[1],
  );
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Evolutionary information" }),
    "single",
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  await user.click(screen.getByRole("button", { name: "Back" }));
  expect(
    screen.getByRole("combobox", { name: "Evolutionary information" }),
  ).toHaveValue("single");
  expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
});
it.each(["chemprop.train", "chemprop.predict"] as const)(
  "%s blocks its first step until the selected whole file is verified",
  async (form) => {
    let reply!: (value: unknown) => void;
    const asset = {
      id: "STAT6",
      name: "STAT6-series.sdf",
      kind: "ligand" as const,
      suffix: ".sdf",
      size: 100,
      sha256: "a".repeat(64),
      created_at: "",
    };
    vi.spyOn(client, "request").mockImplementation(
      async (path) =>
        (path === "/scientific/property-models"
          ? { models: [] }
          : path.startsWith("/research/input-catalog")
            ? catalogFixture([], [asset])
            : path.endsWith("/metadata")
              ? new Promise((resolve) => (reply = resolve))
              : { availability: { configuration_present: true } }) as never,
    );
    render(<ScientificForm form={form} language="en" onCreated={vi.fn()} />);
    const next = screen.getByRole("button", { name: "Next" });
    expect(next).toBeDisabled();
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: "Historical files" }));
    const picker = screen.getByRole("combobox", {
      name: "Whole SDF molecular library · Historical files",
    });
    await waitFor(() => expect(picker).toBeEnabled());
    await user.selectOptions(picker, "file:STAT6");
    expect(next).toBeDisabled();
    await act(async () => reply(asset));
    await waitFor(() => expect(next).toBeEnabled());
    expect(screen.getByText(/STAT6-series.sdf ·/)).toBeVisible();
  },
);
