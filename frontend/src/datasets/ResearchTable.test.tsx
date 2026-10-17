import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ResearchTable } from "./ResearchTable";
import * as transport from "../api";
import userEvent from "@testing-library/user-event";

vi.mock("../presentation/MoleculeImage", () => ({
  MoleculeImage: ({ label }: { label: string }) => (
    <div role="img" aria-label={label} />
  ),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("labels selection with the public name while retaining the exact internal identity", async () => {
  vi.spyOn(transport, "request").mockResolvedValue({
    rows: [
      { id: "cmp-exact", display_name: "CHEMBL487451", smiles: "c1ccccc1" },
    ],
    total: 1,
    offset: 0,
    has_more: false,
  });
  const select = vi.fn();
  render(
    <ResearchTable
      jobId="study"
      view="library"
      language="en"
      onSelection={select}
    />,
  );
  await userEvent
    .setup()
    .click(
      await screen.findByRole("checkbox", { name: "Select CHEMBL487451" }),
    );
  expect(select).toHaveBeenCalledWith(["cmp-exact"]);
});
it("uses supplied medicinal-chemistry names and human sources without dead identifier buttons", async () => {
  vi.spyOn(transport, "request").mockResolvedValue({
    rows: [
      {
        id: "opaque-record",
        display_name: "DEL006-A035-B040-C030",
        smiles: "c1ccccc1",
        supplier: "custom",
      },
    ],
    total: 1,
    offset: 0,
    has_more: false,
  });
  render(<ResearchTable jobId="study" view="index" language="zh" />);
  expect(
    await screen.findByRole("img", { name: "DEL006-A035-B040-C030" }),
  ).toBeVisible();
  expect(screen.getByText("研究库")).toBeVisible();
  expect(screen.queryByText("custom")).toBeNull();
  expect(
    screen.queryByRole("button", { name: "DEL006-A035-B040-C030" }),
  ).toBeNull();
});
