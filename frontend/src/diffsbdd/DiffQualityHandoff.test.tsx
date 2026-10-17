import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { DiffResults } from "./DiffResults";
import { api } from "../api";
import * as client from "../api";
import type { Job } from "../types";

vi.mock("../presentation/artifact-digest", () => ({
  artifactInfo: vi.fn(async () => ({ sha256: "a".repeat(64), records: 2 })),
}));
vi.mock("../presentation/MolecularPreview", () => ({
  MolecularPreview: () => <span>Retained molecular preview</span>,
}));
vi.mock("../presentation/MoleculeImage", () => ({
  MoleculeImage: () => <span>Retained molecular drawing</span>,
}));
vi.mock("../quality/QualityForm", () => ({
  QualityForm: (props: unknown) => (
    <output data-testid="quality-input">{JSON.stringify(props)}</output>
  ),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it.each(["en", "zh"] as const)(
  "opens quality review for exactly the selected candidate and source receptor without submitting in %s",
  async (language) => {
    const user = userEvent.setup();
    const protein = {
      asset_id: "protein",
      sha256: "b".repeat(64),
      record: 0,
      conformer: 0,
      version_id: "exact-receptor",
    };
    const refs = [0, 1].map((record) => ({
      asset_id: "same-native-file",
      sha256: "a".repeat(64),
      record,
      conformer: 0,
      version_id: `original-${record}`,
    }));
    vi.spyOn(client, "request").mockResolvedValue(
      refs.map((reference) => ({
        id: reference.version_id,
        kind: "molecule",
        source_job: "generation",
        reference,
      })) as never,
    );
    const submit = vi.spyOn(api, "submit");
    render(
      <DiffResults
        job={
          {
            id: "generation",
            request: {
              operation: "diffsbdd",
              payload: { mode: "generate", protein },
            },
          } as unknown as Job
        }
        data={{
          operation: "diffsbdd",
          complete: true,
          valid: 2,
          molecule_artifact: "molecules.sdf",
          protein_artifact: "protein.pdb",
        }}
        language={language}
      />,
    );
    await user.click(
      await screen.findByRole("button", {
        name: language === "en" ? "Candidate 2" : "候选 2",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name:
          language === "en"
            ? "Check this candidate's pose quality"
            : "检查这个候选的姿势质量",
      }),
    );
    expect(
      JSON.parse(screen.getByTestId("quality-input").textContent!),
    ).toMatchObject({ initialMolecule: refs[1], initialProtein: protein });
    await user.click(
      screen.getByRole("button", { name: /Back to results|返回结果/ }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: language === "en" ? "Candidate 2" : "候选 2",
        }),
      ).toHaveAttribute("aria-pressed", "true"),
    );
    expect(submit).not.toHaveBeenCalled();
  },
);
