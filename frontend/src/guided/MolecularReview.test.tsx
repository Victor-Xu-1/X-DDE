import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MolecularReview } from "./MolecularReview";

vi.mock("../presentation/MoleculeImage", () => ({
  MoleculeImage: ({
    source,
    compact,
  }: {
    source: unknown;
    compact?: boolean;
  }) => (
    <div data-testid="review-drawing" data-compact={String(Boolean(compact))}>
      {JSON.stringify(source)}
    </div>
  ),
}));
afterEach(cleanup);

it("puts the full interactive depiction before its summary and tracks the exact source", () => {
  const source = { url: "/api/assets/selected-source", record: 2 };
  const { rerender } = render(
    <MolecularReview
      language="en"
      source={source}
      caption="Original record 3"
      summary={<p>Exact submitted molecule</p>}
    />,
  );
  const review = screen.getByRole("region", { name: "Molecular input review" });
  expect(review.firstElementChild?.tagName).toBe("FIGURE");
  expect(screen.getByTestId("review-drawing")).toHaveAttribute(
    "data-compact",
    "false",
  );
  expect(screen.getByTestId("review-drawing")).toHaveTextContent(
    JSON.stringify(source),
  );
  expect(review.lastElementChild).toHaveTextContent("Exact submitted molecule");
  rerender(
    <MolecularReview
      language="zh"
      source={{ smiles: "N#Cc1ccc(O)cc1" }}
      caption="当前输入"
      summary={<p>新选择的分子</p>}
    />,
  );
  expect(screen.getByRole("region", { name: "分子输入核对" })).toBeVisible();
  expect(screen.getByTestId("review-drawing")).toHaveTextContent(
    "N#Cc1ccc(O)cc1",
  );
  expect(screen.getByTestId("review-drawing")).not.toHaveTextContent(
    "selected-source",
  );
});

it("keeps a readable summary when the input has no supported depiction source", () => {
  render(
    <MolecularReview
      language="en"
      source={null}
      caption="Unavailable input"
      summary={
        <dl>
          <dt>File scope</dt>
          <dd>All selected records</dd>
        </dl>
      }
    />,
  );
  expect(screen.queryByTestId("review-drawing")).toBeNull();
  expect(screen.getByText("All selected records")).toBeVisible();
});
