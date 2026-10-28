import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { Job } from "../types";
import { MinimizedPoseResults } from "./MinimizedPoseResults";

vi.mock("../presentation/MolecularPreview", () => ({
  MolecularPreview: () => <div>3D structure</div>,
}));

it.each(["en", "zh"] as const)(
  "distinguishes ligand-only energy from receptor pose quality in %s",
  (language) => {
    render(
      <MinimizedPoseResults
        job={{ id: "source" } as Job}
        language={language}
        data={{
          energy_before: 186.64,
          energy_after: 24.25,
          method: "MMFF94s",
          converged: true,
          artifact: "minimized.sdf",
        }}
      />,
    );
    expect(screen.getByText(/186\.64/)).toBeVisible();
    expect(screen.getByText(/24\.25/)).toBeVisible();
    expect(
      screen.getByText(
        language === "zh" ? /不考虑蛋白/ : /does not include the protein/,
      ),
    ).toHaveTextContent(language === "zh" ? "可能产生受体碰撞" : "receptor clashes");
    expect(screen.getByRole("link", {
      name: language === "zh" ? "下载 pose SDF" : "Download pose SDF",
    })).toHaveAttribute("href", expect.stringContaining("minimized.sdf"));
  },
);
