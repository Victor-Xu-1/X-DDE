import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MoleculeDrawingProvider, MoleculeImage } from "./MoleculeImage";

const { drawing } = vi.hoisted(() => ({ drawing: vi.fn() }));
vi.mock("./depiction-renderer", async (original) => ({
  ...(await original<typeof import("./depiction-renderer")>()),
  DepictionRenderer: class {
    render = drawing;
    close() {}
    retryInitialization() {}
  },
}));
const svg = (label: string) =>
  new Blob(
    [`<svg xmlns="http://www.w3.org/2000/svg"><text>${label}</text></svg>`],
    { type: "image/svg+xml" },
  );
const sourceA = {
  smiles: "O=C(CCN1C=CN=N1)N(C2)CCC=C2C3=C(F)C4=C(C=C(N4)C(N(C)C)=O)C=C3",
};
const sourceB = { smiles: sourceA.smiles.replace("C(F)", "C(Cl)") };
const pageFor = (source: typeof sourceA) => (
  <MoleculeDrawingProvider>
    <MoleculeImage source={source} label="Selected molecule" language="en" />
  </MoleculeDrawingProvider>
);

beforeEach(() => vi.stubGlobal("IntersectionObserver", undefined));
afterEach(() => {
  cleanup();
  drawing.mockReset();
  vi.unstubAllGlobals();
});

it("hides the old molecule and its export immediately while a new structure is being drawn", async () => {
  drawing.mockResolvedValueOnce(svg("source-A"));
  const page = render(pageFor(sourceA));
  await screen.findByRole("img");
  let finish!: (value: Blob) => void;
  drawing.mockImplementationOnce(
    () => new Promise<Blob>((resolve) => (finish = resolve)),
  );
  page.rerender(pageFor(sourceB));
  expect(screen.queryByRole("img")).toBeNull();
  expect(screen.queryByRole("button", { name: /Export figure/ })).toBeNull();
  await waitFor(() => expect(drawing).toHaveBeenCalledTimes(2));
  await act(async () => finish(svg("source-B")));
  expect(await screen.findByRole("img")).toBeVisible();
  expect(drawing.mock.lastCall![0]).toEqual(sourceB);
});

it("does not apply a late drawing from a previously selected molecule", async () => {
  let finish!: (value: Blob) => void;
  drawing.mockImplementationOnce(
    () => new Promise<Blob>((resolve) => (finish = resolve)),
  );
  const page = render(pageFor(sourceA));
  await waitFor(() => expect(drawing).toHaveBeenCalledOnce());
  drawing.mockResolvedValueOnce(svg("source-B"));
  page.rerender(pageFor(sourceB));
  const current = await screen.findByRole("img"),
    url = current.getAttribute("src");
  await act(async () => finish(svg("source-A")));
  expect(screen.getByRole("img")).toHaveAttribute("src", url!);
});
