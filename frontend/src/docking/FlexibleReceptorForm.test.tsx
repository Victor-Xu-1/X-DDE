import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { DockingForm } from "./DockingForm";
import type { Language } from "../types";
import type { MoleculeRef } from "../research/types";
import type { SceneInfo } from "../viewer/protocol";
const mocks = vi.hoisted(() => ({ request: vi.fn(), submit: vi.fn() }));
vi.mock("../api", async () => ({
  ...(await vi.importActual<typeof import("../api")>("../api")),
  request: mocks.request,
}));
vi.mock("../operations/useTaskSubmit", () => ({
  useTaskSubmit: () => ({ submit: mocks.submit, busy: false, error: "" }),
}));
vi.mock("../diffsbdd/ReferencePicker", () => ({
  ReferencePicker: ({
    label,
    onChange,
  }: {
    label: string;
    onChange(value: MoleculeRef | null): void;
  }) => (
    <div>
      {label}
      {/Receptor structure|受体结构/.test(label) && (
        <button
          type="button"
          onClick={() =>
            onChange({
              ...receptor,
              asset_id: "changed",
              sha256: "c".repeat(64),
            })
          }
        >
          Change receptor
        </button>
      )}
    </div>
  ),
}));
vi.mock("../viewer/StructureViewer", async () => {
  const { useEffect } = await import("react");
  const scene: SceneInfo = {
    chains: ["A", "B"],
    ligands: [],
    atoms: 100,
    hasPolymer: true,
    residues: [
      { key: "ile152", chain: "A", resi: 152, resn: "ILE", icode: "" },
      { key: "lys595", chain: "B", resi: 595, resn: "LYS", icode: "" },
      { key: "ala153", chain: "A", resi: 153, resn: "ALA", icode: "" },
    ],
  };
  return {
    StructureViewer: ({
      onSceneLoaded,
    }: {
      onSceneLoaded?(scene: SceneInfo): void;
    }) => {
      useEffect(() => onSceneLoaded?.(scene), [onSceneLoaded]);
      return <div>Real viewer protocol boundary fixture</div>;
    },
  };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const receptor: MoleculeRef = {
  asset_id: "r",
  sha256: "a".repeat(64),
  record: 0,
  conformer: 0,
};
const ligand: MoleculeRef = { ...receptor, asset_id: "l" };
function setup(language: Language) {
  mocks.request.mockImplementation(async (path: string) =>
    path.startsWith("/research/constraints")
      ? []
      : { availability: { configuration_present: true } },
  );
  render(
    <DockingForm
      mode="minimize"
      initialReceptor={receptor}
      initialLigand={ligand}
      language={language}
      onCreated={() => {}}
    />,
  );
  return userEvent.setup();
}
const next = (language: Language) =>
  screen.getByRole("button", {
    name: language === "zh" ? "下一步" : "Next",
  });
const label = (language: Language) =>
  language === "zh"
    ? "允许所选侧链局部调整"
    : "Allow selected sidechains to adjust";
async function plan(
  user: ReturnType<typeof userEvent.setup>,
  language: Language,
) {
  await user.click(next(language));
  await user.click(
    screen.getByRole("checkbox", {
      name: language === "zh" ? /我确认/ : /I confirm/,
    }),
  );
  await user.click(next(language));
}
it.each(["en", "zh"] as const)(
  "submits the exact selected sidechains and frame in %s",
  async (language) => {
    const user = setup(language);
    await plan(user, language);
    expect(
      screen.getByRole("checkbox", { name: label(language) }),
    ).not.toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: label(language) }));
    expect(next(language)).toBeDisabled();
    expect(screen.queryByRole("option", { name: "A:ALA153" })).toBeNull();
    const choices = screen.getByRole("combobox", {
      name: language === "zh" ? "选择需要调整的侧链" : "Sidechains to adjust",
    });
    await user.selectOptions(choices, "ile152");
    await user.selectOptions(choices, "lys595");
    await user.click(next(language));
    expect(
      screen.getByText("A:152, B:595", { exact: true }),
    ).toBeInTheDocument();
    const submit = screen.getByRole("button", {
      name: language === "zh" ? "局部最小化" : "Local minimization",
    });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);
    expect(mocks.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "minimize",
        receptor,
        ligand,
        pose_frame: receptor,
        pose_coordinate_basis: "user_confirmed",
        flexible_receptor: {
          residues: [
            { chain: "A", number: 152, insertion_code: "" },
            { chain: "B", number: 595, insertion_code: "" },
          ],
        },
      }),
    );
  },
);
it("retains the exact legacy rigid-receptor request by default", async () => {
  const user = setup("en");
  await plan(user, "en");
  await user.click(next("en"));
  const submit = screen.getByRole("button", {
    name: "Local minimization",
  });
  await waitFor(() => expect(submit).toBeEnabled());
  await user.click(submit);
  expect(mocks.submit).toHaveBeenCalledOnce();
  expect(mocks.submit.mock.calls[0][0]).not.toHaveProperty("flexible_receptor");
});
it("clears the selection on a changed receptor instead of applying stale residue numbers", async () => {
  const user = setup("en");
  await plan(user, "en");
  await user.click(screen.getByRole("checkbox", { name: label("en") }));
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Sidechains to adjust" }),
    "ile152",
  );
  await user.click(
    screen.getByRole("button", { name: "Step 1: Choose inputs" }),
  );
  await user.click(screen.getByRole("button", { name: "Change receptor" }));
  await user.click(next("en"));
  expect(screen.getByRole("checkbox", { name: /I confirm/ })).not.toBeChecked();
  await user.click(screen.getByRole("checkbox", { name: /I confirm/ }));
  await user.click(next("en"));
  expect(screen.getByRole("checkbox", { name: label("en") })).not.toBeChecked();
});
