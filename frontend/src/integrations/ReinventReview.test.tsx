import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ReinventReview } from "./ReinventReview";
import { nativeDefaults } from "./generated";

vi.mock("../presentation/MoleculeImage", () => ({
  MoleculeImage: ({ source, label }: { source: unknown; label: string }) => (
    <div role="img" aria-label={label} data-source={JSON.stringify(source)} />
  ),
}));
vi.mock("../diffsbdd/ReviewReference", () => ({
  ReviewReference: ({
    reference,
  }: {
    reference: { asset_id: string; record: number };
  }) => (
    <span>
      {reference.asset_id} · Record {reference.record + 1}
    </span>
  ),
}));
afterEach(cleanup);
const scaffold = "CN(C)C(=O)c1cc2ccc([*:1])c(F)c2[nH]1";
const options = {
  device: "cpu" as const,
  cpu: 2,
  memory_mib: 2048,
  seed: 2026,
};

it.each(["en", "zh"] as const)(
  "reviews the exact R-group scaffold and effective settings in %s",
  (language) => {
    const zh = language === "zh";
    render(
      <ReinventReview
        language={language}
        ligand={null}
        options={options}
        payload={{
          ...nativeDefaults.reinvent,
          kind: "reinvent",
          mode: "r_groups",
          candidates: 20,
          fragments: [scaffold],
        }}
      />,
    );
    const review = screen.getByRole("table", {
      name: zh ? "设计方案核对" : "Design plan review",
    });
    expect(
      within(review).getByRole("row", {
        name: new RegExp(zh ? "候选预算 20" : "Candidate budget 20"),
      }),
    ).toBeVisible();
    expect(
      within(review).getByText(zh ? "替换 R 基" : "Replace R-groups"),
    ).toBeVisible();
    expect(
      within(review).getByText(
        "CPU · 2 " + (zh ? "核" : "cores") + " · 2048 MiB",
      ),
    ).toBeVisible();
    expect(within(review).getByText("2026")).toBeVisible();
    expect(screen.getByRole("img")).toHaveAttribute(
      "data-source",
      JSON.stringify({ smiles: scaffold }),
    );
    expect(within(review).queryByText(/LogP|QED|25/)).not.toBeInTheDocument();
  },
);

it("keeps both linker fragments in their submitted order, without a candidate budget on the scope step", () => {
  const fragments = [scaffold, "O=C1CCC(N2C(=O)c3cccc([*:1])c3C2=O)N1"];
  render(
    <ReinventReview
      language="en"
      ligand={null}
      payload={{
        ...nativeDefaults.reinvent,
        kind: "reinvent",
        mode: "linker",
        fragments,
      }}
    />,
  );
  expect(
    screen
      .getAllByRole("img")
      .map((node) => JSON.parse(node.getAttribute("data-source")!).smiles),
  ).toEqual(fragments);
  expect(screen.queryByText("Candidate budget")).not.toBeInTheDocument();
  expect(screen.getByText(/does not fix 3D coordinates/)).toBeVisible();
});

it("reviews the exact explicitly selected scaffold origin alongside the chemical core", () => {
  render(
    <ReinventReview
      language="en"
      ligand={{
        asset_id: "chosen-source",
        sha256: "a".repeat(64),
        record: 2,
        conformer: 0,
      }}
      options={options}
      payload={{
        ...nativeDefaults.reinvent,
        kind: "reinvent",
        mode: "r_groups",
        fragments: [scaffold],
        validate_scaffold_origin: true,
      }}
    />,
  );
  expect(
    screen.getByRole("row", {
      name: "Scaffold source molecule chosen-source · Record 3",
    }),
  ).toBeVisible();
  expect(screen.getByRole("img")).toHaveAttribute(
    "data-source",
    JSON.stringify({ smiles: scaffold }),
  );
});

it("shows optimization objectives only for the optimization mode and excludes stale fragment inputs", () => {
  render(
    <ReinventReview
      language="en"
      ligand={null}
      options={options}
      payload={{
        ...nativeDefaults.reinvent,
        kind: "reinvent",
        mode: "optimize",
        fragments: [scaffold],
        optimization_steps: 35,
        molecular_weight: [250, 475],
        logp: [1, 4],
      }}
    />,
  );
  expect(
    screen.getByRole("row", { name: "Optimization steps 35" }),
  ).toBeVisible();
  expect(screen.getByText("QED · MW 250–475 g/mol · LogP 1–4")).toBeVisible();
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.queryByText("Attachment sites")).not.toBeInTheDocument();
});
