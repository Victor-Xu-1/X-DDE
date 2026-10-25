import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api";
import type { Job, Language } from "../types";
import { ProximityResults } from "./Results";
import type { TernaryResult } from "./types";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const job = {
  id: "7b9bd02b-0b93-45f4-a8b9-80e1cff203c9",
  request: { operation: "ternary_model", payload: {} },
} as Job;
const result: TernaryResult = {
  mechanism: "protac",
  source_ligand: {
    asset_id: "original",
    sha256: "a".repeat(64),
    record: 0,
    conformer: 0,
  },
  ligand_atom_indices: [0, 1],
  partner_mapping: [],
  arm_maps: [[0], [1]],
  search: { requested: 3, attempted: 3, returned: 2, status: "budget_reached" },
  assemblies: [1, 2].map((number) => ({
    id: `assembly-00${number}`,
    seed: number,
    complex_artifact: `assembly-00${number}.pdb`,
    ligand_artifact: `assembly-00${number}-ligand.sdf`,
    partner_artifacts: [],
    ranking_surrogate: null,
    quality: {
      accepted: false,
      bond_violations: [],
      intramolecular_severe_pairs: number,
      ligand_partner_a_severe_pairs: 2,
      ligand_partner_b_severe_pairs: 3,
      partner_partner_severe_pairs: 4,
      stereochemistry_preserved: true,
      arms: [0, 1].map(() => ({
        contacting_heavy_atoms: 4,
        rmsd_from_binary_angstrom: 1,
      })),
      relaxation: { status: "not_converged", difference_kcal_mol: null },
    },
  })),
};

function announce(frame: HTMLIFrameElement, type: string, detail?: unknown) {
  act(() =>
    window.dispatchEvent(
      new MessageEvent("message", {
        origin: location.origin,
        source: frame.contentWindow,
        data: { channel: "opendde-viewer", type, detail },
      }),
    ),
  );
}

it.each<Language>(["en", "zh"])(
  "views exact computed diagnostic poses without preparing or promoting them (%s)",
  (language) => {
    const submit = vi.spyOn(api, "post");
    const zh = language === "zh";
    render(<ProximityResults job={job} result={result} language={language} />);
    fireEvent.click(
      screen.getByRole("tab", {
        name: zh ? "分子三维" : "Molecule 3D",
      }),
    );
    const panel = () =>
      screen.getByRole("tabpanel", {
        name: zh ? "分子三维" : "Molecule 3D",
      });
    for (const number of [1, 2]) {
      if (number === 2)
        fireEvent.click(
          screen.getByText(zh ? "装配 2" : "Assembly 2", { exact: true }),
        );
      const frame = within(panel()).getByTitle(
        "Interactive molecular structure",
      ) as HTMLIFrameElement;
      const post = vi.spyOn(frame.contentWindow!, "postMessage");
      announce(frame, "ready", { instanceId: `diagnostic-${number}` });
      const load = post.mock.calls.find(
        ([message]) => message.type === "load",
      )?.[0].value;
      expect(load).toMatchObject({
        urls: [
          `/api/jobs/${job.id}/download?name=assembly-00${number}-ligand.sdf`,
        ],
        initialPosePrepared: true,
      });
      expect(
        within(panel()).queryByLabelText(
          zh ? "pose 优化与历史" : "Pose optimization and history",
        ),
      ).toBeNull();
      expect(
        screen.getByRole("link", {
          name: zh ? "下载分子 SDF" : "Download molecule SDF",
        }),
      ).toHaveAttribute("href", load.urls[0]);
      expect(
        screen.getByText(
          zh
            ? "诊断结构 · 几何检查未全部通过"
            : "Diagnostic structure · geometry checks incomplete",
        ),
      ).toBeVisible();
      post.mockRestore();
    }
    expect(submit).not.toHaveBeenCalled();
    expect(result.assemblies.every((row) => !row.quality.accepted)).toBe(true);
  },
);
