import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { InteractivePlot } from "../presentation/plots/InteractivePlot";
import native from "./optimization-native.fixture.json";
import { optimizationReview } from "./optimization-model";
import { OptimizationFigures } from "./OptimizationFigures";

vi.mock("../presentation/plots/InteractivePlot", () => ({
  InteractivePlot: ({
    data,
    layout,
    onPoint,
  }: ComponentProps<typeof InteractivePlot>) => (
    <>
      <output data-testid="actual-traces">
        {JSON.stringify({ data, layout })}
      </output>
      {onPoint && (
        <button
          onClick={() => onPoint({ curveNumber: 0, customdata: 1 } as never)}
        >
          Inspect plot record 2
        </button>
      )}
    </>
  ),
}));
afterEach(cleanup);
it.each(["en", "zh"] as const)(
  "keeps real point identities, declining round winners and retained-best history in %s",
  (language) => {
    const result = optimizationReview(native, "qed");
    if (result.state !== "ready")
      throw new Error("Native case was not admitted");
    const onSelect = vi.fn();
    render(
      <OptimizationFigures
        data={result.data}
        language={language}
        selected={1}
        onSelect={onSelect}
      />,
    );
    let figure = JSON.parse(screen.getByTestId("actual-traces").textContent!);
    expect(figure.data[0].customdata).toEqual(
      Array.from({ length: 12 }, (_, i) => i),
    );
    expect(figure.data[0].x[1]).toBe(0.7326);
    expect(figure.data[0].y[1]).toBe(4.3187);
    expect(figure.layout.shapes[0].x0).toBe(native.optimization.initial_score);
    fireEvent.click(
      screen.getByRole("button", { name: "Inspect plot record 2" }),
    );
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(1);
    fireEvent.click(
      screen.getByRole("button", {
        name: language === "en" ? "Round history" : "逐轮变化",
      }),
    );
    figure = JSON.parse(screen.getByTestId("actual-traces").textContent!);
    expect(figure.data[0].x).toEqual([1, 2]);
    expect(figure.data[0].y[1]).toBeLessThan(figure.data[0].y[0]);
    expect(figure.data[1].x).toEqual([0, 1, 2]);
    expect(figure.data[1].y).toEqual([
      native.optimization.initial_score,
      native.optimization.history[0].best_score,
      native.optimization.history[0].best_score,
    ]);
    expect(onSelect).toHaveBeenCalledTimes(1);
  },
);
