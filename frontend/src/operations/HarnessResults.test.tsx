import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { Job } from "../types";
import { HarnessResults } from "./HarnessResults";
afterEach(cleanup);
const job = (tool: string, payload: Record<string, unknown> = {}) =>
  ({ id: "public", request: { operation: "harness", tool, payload } }) as Job;
it("pairs each native sequence score with the same input sequence and preserves exact precision", () => {
  render(
    <HarnessResults
      job={job("esm", {
        sequences: ["EVQLVESGGGLVQPGGSLRLSCAAS", "DIQMTQSPSSLSASVGDRVTITC"],
      })}
      language="zh"
      data={{
        operation: "harness",
        complete: true,
        result: { scores: [-0.6953319795069216, -1.1674997974604653] },
      }}
    />,
  );
  expect(screen.getByText("序列 1")).toBeVisible();
  expect(screen.getByTitle("-0.6953319795069216")).toHaveTextContent("-0.6953");
  expect(screen.getByText("DIQMTQSPSSLSASVGDRVTITC")).toBeInTheDocument();
});
it("retains scientific model scores in candidate metadata without displaying engineering receipts", () => {
  render(
    <HarnessResults
      job={job("esm2")}
      language="zh"
      data={{
        operation: "harness",
        complete: true,
        result: {
          available: true,
          result: {
            candidates: [
              {
                sequence: "EVQLV",
                mutations: ["A 29 S"],
                metadata: {
                  esm2_llr: 2.5929,
                  checkpoint_sha256: "private-digest",
                },
              },
            ],
          },
        },
      }}
    />,
  );
  expect(screen.getByText("2.5929")).toBeVisible();
  expect(screen.getByText(/A:30 → S/)).toBeVisible();
  expect(screen.queryByText("private-digest")).not.toBeInTheDocument();
});
it("does not unwrap or invent a result when the native tool is unavailable", () => {
  render(
    <HarnessResults
      job={job("fold")}
      language="en"
      data={{
        operation: "harness",
        complete: true,
        result: {
          available: false,
          reason: "No eligible structures",
          result: null,
        },
      }}
    />,
  );
  expect(screen.getByText("No eligible structures")).toBeVisible();
});
