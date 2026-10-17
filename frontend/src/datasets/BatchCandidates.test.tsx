import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BatchCandidates } from "./BatchCandidates";
import type { DatasetCandidate } from "./types";

// Only presentation/selection is mocked here; native depiction has its browser gate.
vi.mock("../presentation/MoleculeImage", () => ({
  MoleculeImage: ({ label }: { label: string }) => <img alt={label} />,
}));
afterEach(cleanup);

it.each(["en", "zh"] as const)(
  "keeps readable names separate from selected native IDs in %s",
  (language) => {
    const candidates = [
      { id: "internal-one", display_name: "CHEMBL517122", smiles: "protocol" },
      { id: "internal-two", display_name: "CHEMBL512894", smiles: "protocol" },
    ] as DatasetCandidate[];
    const toggle = vi.fn(),
      select = vi.fn();
    render(
      <BatchCandidates
        candidates={candidates}
        selected={["internal-one"]}
        onToggle={toggle}
        onSelection={select}
        language={language}
      />,
    );
    expect(screen.getByText("CHEMBL517122")).toBeVisible();
    expect(screen.queryByText("internal-one")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: `${language === "zh" ? "选择" : "Select"} CHEMBL512894`,
      }),
    );
    expect(toggle).toHaveBeenCalledWith("internal-two");
    fireEvent.click(
      screen.getByRole("button", {
        name: language === "zh" ? "清除选择" : "Clear selection",
      }),
    );
    expect(select).toHaveBeenLastCalledWith([]);
    fireEvent.click(
      screen.getByRole("button", {
        name: language === "zh" ? "选择全部" : "Select all",
      }),
    );
    expect(select).toHaveBeenLastCalledWith(["internal-one", "internal-two"]);
  },
);
