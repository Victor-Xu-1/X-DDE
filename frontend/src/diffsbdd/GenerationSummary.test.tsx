import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { GenerationSummary } from "./GenerationSummary";

afterEach(cleanup);

it.each(["en", "zh"] as const)(
  "explains actual largest-component processing without inventing a discarded count in %s",
  (language) => {
    const report = {
      target_atoms: 32,
      settings: { fragment_policy: "largest" },
    };
    render(<GenerationSummary report={report} language={language} />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("32");
    expect(status).toHaveTextContent(
      language === "en"
        ? "other components may be discarded"
        : "其余片段可能被去除",
    );
    expect(status).not.toHaveTextContent("16");
    expect(report).toEqual({
      target_atoms: 32,
      settings: { fragment_policy: "largest" },
    });
  },
);

it("does not infer processing or target size from absent or malformed historical metadata", () => {
  for (const report of [null, {}, { settings: { fragment_policy: "all" } }]) {
    const result = render(<GenerationSummary report={report} language="en" />);
    expect(screen.queryByRole("status")).toBeNull();
    result.unmount();
  }
  render(
    <GenerationSummary
      report={{ target_atoms: "32", settings: { fragment_policy: "largest" } }}
      language="en"
    />,
  );
  expect(screen.getByRole("status")).not.toHaveTextContent("Target size");
});
