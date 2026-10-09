import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { SimulationFiles } from "./SimulationFiles";
import type { Job } from "../types";

afterEach(cleanup);
it.each(["en", "zh"] as const)(
  "provides exact GROMACS research downloads in %s",
  (language) => {
    const files = Object.fromEntries(
      [
        "repeat-1.trr",
        "repeat-1.cpt",
        "repeat-1.tpr",
        "repeat-1.edr",
        "system.top",
        "system.gro",
        "repeat-1-stability.csv",
        "repeat-1-frame-0001.pdb",
        "gromacs-mdrun.log",
        "repeat-1.mdp",
        "repeat-1-nvt.cpt",
      ].map((name) => [name, "a".repeat(64)]),
    );
    render(
      <SimulationFiles
        job={{ id: "native-gromacs-job" } as Job}
        files={files}
        language={language}
      />,
    );
    const links = screen.getAllByRole("link", { hidden: true });
    expect(links).toHaveLength(7);
    for (const name of [
      "repeat-1.trr",
      "repeat-1.cpt",
      "repeat-1.tpr",
      "repeat-1.edr",
      "system.top",
      "system.gro",
      "repeat-1-stability.csv",
    ])
      expect(
        links.some((link) => link.getAttribute("href")?.endsWith(name)),
      ).toBe(true);
    expect(screen.queryByText("gromacs-mdrun.log")).toBeNull();
  },
);
