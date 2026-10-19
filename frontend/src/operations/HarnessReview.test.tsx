import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { HarnessReview } from "./HarnessReview";
afterEach(cleanup);
it.each(["en", "zh"] as const)(
  "shows actual files, chains and method in %s without internal identity text",
  (language) => {
    const id = "11111111-1111-4111-8111-111111111111";
    render(
      <HarnessReview
        tool="structure"
        payload={{ binder_chain_ids: ["B"], target_chain_ids: ["A"] }}
        assets={[
          {
            id,
            name: "experimental-dimer.pdb",
            kind: "structure",
            suffix: ".pdb",
            size: 900,
            sha256: "a".repeat(64),
            created_at: "2026-10-20",
          },
        ]}
        name="Experimental interface"
        expert={false}
        external={false}
        language={language}
      />,
    );
    expect(
      screen.getByRole("link", { name: "experimental-dimer.pdb" }),
    ).toHaveAttribute("href", `/api/assets/${id}`);
    expect(screen.getByText("B", { selector: "dd" })).toBeVisible();
    expect(screen.getByText("A", { selector: "dd" })).toBeVisible();
    expect(screen.getByText(/PLIP/, { selector: "dd" })).toBeVisible();
    expect(screen.queryByText(id)).toBeNull();
    expect(screen.getByText("Experimental interface")).toBeVisible();
  },
);
