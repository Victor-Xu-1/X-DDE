import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import native from "./optimization-native.fixture.json";
import { optimizationReview } from "./optimization-model";
import { OptimizationSummary } from "./OptimizationSummary";

afterEach(cleanup);
it.each(["en", "zh"] as const)(
  "shows actual starting/generated scores and selects the exact leading record in %s",
  (language) => {
    const onSelect = vi.fn();
    render(
      <OptimizationSummary
        review={optimizationReview(native, "qed")}
        language={language}
        canSelect
        onSelect={onSelect}
      />,
    );
    const panel = screen.getByRole("region", {
      name: language === "en" ? "Optimization overview" : "优化结果概览",
    });
    expect(within(panel).getByText("0.6993")).toBeVisible();
    expect(within(panel).getByText("0.7326")).toBeVisible();
    expect(within(panel).getByText("1 / 12")).toBeVisible();
    expect(panel).toHaveTextContent(
      language === "en"
        ? "do not establish activity or affinity gains"
        : "不代表活性或亲和力改善",
    );
    fireEvent.click(within(panel).getByRole("button"));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(1);
  },
);
it("does not make missing metadata into a zero improvement or let an unavailable record be selected", () => {
  const onSelect = vi.fn();
  const { rerender } = render(
    <OptimizationSummary
      review={{ state: "unavailable" }}
      language="en"
      canSelect={false}
      onSelect={onSelect}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    "no recorded optimization comparison",
  );
  expect(screen.queryByText("0.0000")).toBeNull();
  rerender(
    <OptimizationSummary
      review={optimizationReview(native, "qed")}
      language="en"
      canSelect={false}
      onSelect={onSelect}
    />,
  );
  expect(screen.getByRole("button")).toBeDisabled();
  expect(onSelect).not.toHaveBeenCalled();
});
