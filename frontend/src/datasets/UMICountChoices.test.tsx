import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { UMICountChoices } from "./UMICountChoices";
import { umiCountingIssue } from "./umi-count-readiness";
import { nativeQuality } from "./sequencing-quality.test-data";
import type { AvailableDataset } from "./types";
afterEach(cleanup);

it("requires an explicit raw-count choice for unassessed legacy evidence", async () => {
  const choose = vi.fn();
  render(
    <UMICountChoices
      value="directional"
      onChange={choose}
      language="en"
      issue="unassessed"
    />,
  );
  expect(
    screen.getByRole("radio", { name: "UMI correction · Recommended" }),
  ).toBeDisabled();
  expect(screen.getByRole("radio", { name: "Unique UMIs" })).toBeDisabled();
  expect(screen.getByRole("status")).toHaveTextContent(
    "Decode again before UMI deduplication",
  );
  expect(choose).not.toHaveBeenCalled();
  await userEvent
    .setup()
    .click(screen.getByRole("radio", { name: "Raw reads only" }));
  expect(choose).toHaveBeenCalledWith("raw");
});

it("enables UMI methods only for a reconciled original library assessment", () => {
  const source = {
    counts: {
      decoded_reads: 710,
      distinct_umi_records: 703,
      complete_umi_reads: 709,
      complete_umi_records: 702,
    },
    metadata: { umi_integrity: nativeQuality.umi_integrity },
  } as unknown as AvailableDataset;
  expect(umiCountingIssue()).toBe("unassessed");
  expect(umiCountingIssue(source)).toBeNull();
  expect(
    umiCountingIssue({
      ...source,
      counts: { ...source.counts, complete_umi_records: 703 },
    }),
  ).toBe("unassessed");
  render(
    <UMICountChoices
      value="directional"
      onChange={vi.fn()}
      language="zh"
      issue={umiCountingIssue(source)}
    />,
  );
  expect(screen.getByRole("radio", { name: "UMI 纠错 · 推荐" })).toBeEnabled();
  expect(screen.queryByRole("status")).toBeNull();
});
