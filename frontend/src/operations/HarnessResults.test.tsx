import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { Job } from "../types";
import { HarnessResults } from "./HarnessResults";
import userEvent from "@testing-library/user-event";
afterEach(cleanup);
const job = (tool: string, payload: Record<string, unknown> = {}) =>
  ({ id: "public", request: { operation: "harness", tool, payload } }) as Job;
it("pairs each native sequence score with the same input sequence and preserves exact precision", async () => {
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
  expect(screen.getByRole("button", { name: "序列 1" })).toBeVisible();
  expect(screen.getByTitle("-0.6953319795069216")).toHaveTextContent("-0.6953");
  await userEvent.setup().click(screen.getByRole("button", { name: "序列 2" }));
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
  expect(
    within(screen.getByRole("table", { name: "序列候选" })).getByText("2.5929"),
  ).toBeVisible();
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

it("shows native comparison fractions, counts and missing scores without substituting zero", () => {
  render(
    <HarnessResults
      job={job("compare")}
      language="zh"
      data={{
        operation: "harness",
        complete: true,
        result: {
          legacy: {
            candidate_count: 2,
            format_compliance: 1,
            fold_success_rate: 0,
            scored_rate: 1,
            unique_sequence_rate: 0.5,
            best_objective: 0.7730637490749359,
          },
          opendde_harness: {
            candidate_count: 4,
            format_compliance: 1,
            fold_success_rate: 0,
            scored_rate: 1,
            unique_sequence_rate: 0.25,
            best_objective: null,
          },
          top_k_overlap: 0.5,
          objective_delta: null,
        },
      }}
    />,
  );
  const table = screen.getByRole("table", { name: "候选集对照" });
  expect(within(table).getByText("0.25")).toBeVisible();
  expect(within(table).getByTitle("0.7730637490749359")).toBeVisible();
  expect(
    screen.getByRole("img", { name: "候选集指标对比 · 候选数量" }),
  ).toBeVisible();
  expect(within(table).getByText("—")).toBeVisible();
});
it("keeps unavailable genealogy truthful while displaying native recurring mutation counts", () => {
  render(
    <HarnessResults
      job={job("evolution")}
      language="zh"
      data={{
        operation: "harness",
        complete: true,
        result: {
          available: true,
          result: {
            candidate_count: 5,
            lineage_analysis: {
              lineage_count: 0,
              root_ids: ["trastuzumab-1N8Z"],
              unresolved_parent_count: 0,
            },
            trees: {},
            recurrent_mutations: [
              {
                mutation: "A:29:N>G",
                candidate_count: 4,
                independent_parent_count: 1,
                improved_count: 0,
                mean_improvement: null,
              },
            ],
          },
        },
      }}
    />,
  );
  expect(screen.getByText(/没有形成可展示的父子谱系/)).toBeVisible();
  expect(
    screen.getByRole("img", { name: "变异出现情况 · 出现候选数" }),
  ).toBeVisible();
  expect(
    within(screen.getByRole("table", { name: "重复出现的变异" })).getByText(
      "A:29:N>G",
    ),
  ).toBeVisible();
});
