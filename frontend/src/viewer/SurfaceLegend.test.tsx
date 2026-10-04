import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { SurfaceLegend } from "./SurfaceLegend";
it("shows a compact approximate charge legend with coverage and the scientific limitation in its help", () => {
  render(
    <SurfaceLegend
      language="zh"
      summary={{ total: 100, input: 10, estimated: 80, missing: 10 }}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("近似电性");
  expect(screen.getByText("灰色：无数据")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "表面电性说明" }));
  expect(screen.getByRole("tooltip")).toHaveTextContent("90/100");
  expect(screen.getByRole("tooltip")).toHaveTextContent("不是 APBS/PB 电势");
  expect(screen.getByRole("tooltip")).toHaveTextContent("灰色不表示中性");
});
it("does not present an uncharged ligand as neutral or a completed electrostatics calculation", () => {
  const { rerender } = render(<SurfaceLegend language="en" summary={null} />);
  expect(screen.getByRole("status")).toHaveTextContent(
    "Generating charge surface",
  );
  rerender(
    <SurfaceLegend
      language="en"
      summary={{ total: 3, input: 0, estimated: 0, missing: 3 }}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("No charge data");
  fireEvent.click(screen.getByRole("button", { name: "Surface charge help" }));
  expect(screen.getByRole("tooltip")).toHaveTextContent("0/3");
  expect(screen.getByRole("tooltip")).toHaveTextContent(
    "not APBS/PB potential",
  );
});
