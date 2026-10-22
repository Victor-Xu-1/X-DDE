import { useEffect } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
const { scroll } = vi.hoisted(() => ({ scroll: vi.fn() }));
vi.mock("react-msaview", () => ({
  MSAViewer: ({
    onModel,
    colorScheme,
    drawTree,
    highlightColumns,
  }: {
    onModel: (model: unknown) => void;
    colorScheme: string;
    drawTree: boolean;
    highlightColumns: number[];
  }) => {
    useEffect(
      () =>
        onModel({
          viewInitialized: true,
          colWidth: 12,
          msaCanvasWidth: 720,
          setScrollX: scroll,
        }),
      [],
    );
    return (
      <div>
        scheme:{colorScheme} tree:{String(drawTree)} column:
        {highlightColumns.join(",")}
      </div>
    );
  },
  renderToSvg: vi.fn(),
  resolveTheme: vi.fn(),
}));
import AlignmentCanvas from "./AlignmentCanvas";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("navigates the same one-based query position repeatedly without changing the sequence or fabricating a tree", async () => {
  const user = userEvent.setup();
  render(
    <AlignmentCanvas
      language="en"
      data={{
        fasta: ">query\n" + "A".repeat(847),
        labels: { query: "source query" },
        rows: 1,
        columns: 847,
      }}
    />,
  );
  await user.clear(screen.getByRole("spinbutton", { name: "Query position" }));
  await user.type(
    screen.getByRole("spinbutton", { name: "Query position" }),
    "614",
  );
  await user.click(screen.getByRole("button", { name: /^Go$/ }));
  await user.click(screen.getByRole("button", { name: /^Go$/ }));
  expect(scroll.mock.calls).toEqual([[-6996], [-6996]]);
  await user.selectOptions(
    screen.getByRole("combobox", { name: "Color" }),
    "jalview_zappo",
  );
  expect(
    screen.getByText("scheme:jalview_zappo tree:false column:614"),
  ).toBeVisible();
});
