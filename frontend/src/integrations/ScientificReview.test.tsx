import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ScientificReview } from "./ScientificReview";

afterEach(cleanup);

it.each(["en", "zh"] as const)(
  "states the native binder sampling limitation before submission in %s",
  (language) => {
    const props = {
      language,
      inputs: [],
      payload: { kind: "boltzgen", candidates: 2, retain: 2 },
      options: { device: "cuda" as const, cpu: 1, memory_mib: 6144, seed: 101 },
    };
    const { rerender } = render(
      <ScientificReview {...props} program="boltzgen" />,
    );
    const limitation =
      language === "en"
        ? /does not support seed-controlled replay/
        : /不支持用随机种子重现采样/;
    expect(screen.getByText(limitation)).toBeVisible();
    expect(screen.getByRole("table")).toHaveTextContent("GPU");
    // The restriction belongs to this engine, not all scientific programs.
    rerender(<ScientificReview {...props} program="ligandmpnn" />);
    expect(screen.queryByText(limitation)).not.toBeInTheDocument();
  },
);
