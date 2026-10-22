import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { TaskDetail } from "./TaskDetail";
import { defaults } from "./form-model";
import type { Job } from "./types";

const job: Job = {
  id: "abc",
  request: {
    name: "test",
    components: [{ kind: "ligand", value: "CCO", count: 1 }],
    parameters: defaults,
  },
  status: "succeeded",
  created_at: "2026-01-01T00:00:00Z",
  started_at: null,
  finished_at: null,
  error: null,
  parent_id: null,
};
it("shows an honest empty state", () => {
  render(
    <TaskDetail
      job={null}
      detail={null}
      failed={false}
      language="en"
      onChange={vi.fn()}
    />,
  );
  expect(screen.getByText("Select a task to inspect")).toBeVisible();
});
it("shows scientific downloads without internal engineering files", () => {
  render(
    <TaskDetail
      job={job}
      detail={{
        id: "abc",
        artifacts: [
          { name: "result/a b.cif", size: 100 },
          { name: "manifest.json", size: 100 },
          { name: "stdout.log", size: 100 },
          { name: "runtime-lock.csv", size: 100 },
        ],
      }}
      failed={false}
      language="en"
      onChange={vi.fn()}
    />,
  );
  expect(
    screen.queryByText(/manifest.json|stdout.log|runtime-lock.csv/),
  ).toBeNull();
  expect(screen.queryByRole("heading", { name: /Logs|输入摘要/ })).toBeNull();
  expect(screen.queryByRole("link", { name: /Input JSON/ })).toBeNull();
  expect(document.querySelector("script")).toBeNull();
  expect(
    screen.getByRole("link", { name: /3D structure · CIF/ }),
  ).toHaveAttribute("href", "/api/jobs/abc/download?name=result%2Fa+b.cif");
});
it("never shows artifacts belonging to the previous selection", () => {
  render(
    <TaskDetail
      job={job}
      detail={{
        id: "other",
        artifacts: [{ name: "wrong.cif", size: 100 }],
      }}
      failed={true}
      language="en"
      onChange={vi.fn()}
    />,
  );
  expect(screen.queryByText("stale text")).toBeNull();
  expect(screen.queryByText("wrong.cif")).toBeNull();
  expect(screen.getByRole("alert")).toHaveTextContent("Connection failed");
});
it.each(["en", "zh"] as const)(
  "keeps native alignment and template downloads usable without exposing engineering snapshots (%s)",
  async (language) => {
    render(
      <TaskDetail
        job={{
          ...job,
          request: {
            name: "STAT6 alignment and template preparation",
            operation: "mt",
            components: [{ kind: "protein", value: "ACDE", count: 1 }],
            parameters: {
              ...defaults,
              feature_mode: "search",
              allow_network: true,
              use_template: true,
            },
          },
        }}
        detail={{
          id: job.id,
          artifacts: [
            { name: "native/msa/0/non_pairing.a3m", size: 3147334 },
            { name: "native/msa/0/pairing.a3m", size: 855 },
            { name: "native/msa/0/hmmsearch.a3m", size: 590335 },
            { name: "templates/hits.hhr", size: 100 },
            { name: "native-inputs/query.a3m", size: 100 },
            { name: "native/msas/msa-private-input-snapshot.a3m", size: 100 },
            { name: "source-manifest.csv", size: 100 },
            { name: "run.log", size: 100 },
          ],
        }}
        failed={false}
        language={language}
        onChange={vi.fn()}
      />,
    );
    await userEvent.setup().click(screen.getByText(/· 4$/));
    const labels =
      language === "en"
        ? [
            "Unpaired sequence alignment · A3M",
            "Paired sequence alignment · A3M",
            "Structural template alignment · A3M",
            "Structural template matches · HHR",
          ]
        : [
            "非配对序列比对 · A3M",
            "配对序列比对 · A3M",
            "结构模板比对 · A3M",
            "结构模板匹配 · HHR",
          ];
    const paths = [
      "native/msa/0/non_pairing.a3m",
      "native/msa/0/pairing.a3m",
      "native/msa/0/hmmsearch.a3m",
      "templates/hits.hhr",
    ];
    labels.forEach((label, index) =>
      expect(
        screen.getByRole("link", { name: new RegExp("^" + label) }),
      ).toHaveAttribute(
        "href",
        `/api/jobs/${job.id}/download?name=${encodeURIComponent(paths[index])}`,
      ),
    );
    expect(
      screen.queryByText(/source-manifest|run.log|native-inputs/),
    ).toBeNull();
    expect(
      document.querySelectorAll('a[href^="/api/jobs/abc/download?name="]'),
    ).toHaveLength(4);
  },
);
