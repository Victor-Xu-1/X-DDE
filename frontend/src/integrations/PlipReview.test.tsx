import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import * as client from "../api";
import { ScientificReview } from "./ScientificReview";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("reviews the actual original CIF, author ligand address and resource limits", async () => {
  const source = {
    asset_id: "original-cif",
    sha256: "a".repeat(64),
    version_id: "saved-cif",
    record: 0,
    conformer: 0,
  };
  vi.spyOn(client, "request").mockResolvedValue({
    id: source.asset_id,
    sha256: source.sha256,
    size: 100,
    suffix: ".cif",
    kind: "structure",
    name: "9BIG.cif",
  });
  render(
    <ScientificReview
      program="plip"
      language="en"
      inputs={[{ role: "structure", source }]}
      payload={{ kind: "plip", ligand_chain: "A", ligand_number: 701 }}
      options={{ device: "cpu", cpu: 1, memory_mib: 2048, seed: 101 }}
    />,
  );
  expect(await screen.findByRole("link", { name: "9BIG.cif" })).toHaveAttribute(
    "href",
    "/api/assets/original-cif",
  );
  expect(
    screen.getByRole("table", { name: "Interaction materials and plan" }),
  ).toHaveTextContent("A:701");
  expect(screen.getByText("CPU · 1 cores · 2048 MiB")).toBeVisible();
});
