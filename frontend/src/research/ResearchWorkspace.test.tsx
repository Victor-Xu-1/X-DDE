import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import * as client from "../api";
import type { ResearchGraph, ScientificObject } from "./types";
import { ResearchWorkspace } from "./ResearchWorkspace";

const original: ScientificObject = {
  id: "11111111-1111-4111-8111-111111111111",
  family_id: "family",
  kind: "molecule",
  label: "ethanol",
  reference: {
    asset_id: "file",
    sha256: "a".repeat(64),
    record: 1,
    conformer: 0,
    version_id: "11111111-1111-4111-8111-111111111111",
  },
  parent_id: null,
  source_job: null,
  relation: "derived_from",
  notes: "original",
  rating: 0,
  created_at: "2026-09-30",
  validation: "file_integrity_only",
};
const graph = (objects = [original]): ResearchGraph => ({
  schema: 1,
  limit: 200,
  truncated: false,
  edges: [],
  nodes: objects.map((object) => ({
    id: "object:" + object.id,
    kind: object.kind,
    label: object.label,
    object,
  })),
});
afterEach(() => vi.restoreAllMocks());

it("recovers from a loading failure and saves annotations as a separate version", async () => {
  let fail = true,
    current = graph();
  vi.spyOn(client, "request").mockImplementation(async (path) => {
    if (path === "/research/indexing") return [] as never;
    if (fail) throw new Error("relationship service unavailable");
    return current as never;
  });
  const updated = {
    ...original,
    id: "22222222-2222-4222-8222-222222222222",
    label: "reviewed",
    parent_id: original.id,
    notes: "promising",
    rating: 4,
  };
  const post = vi.spyOn(client.api, "post").mockImplementation(async () => {
    current = graph([updated, original]);
    return updated as never;
  });
  render(
    <ResearchWorkspace
      language="zh"
      onEdit={vi.fn()}
      onJob={vi.fn()}
      onCreated={vi.fn()}
    />,
  );
  expect(await screen.findByRole("alert")).toHaveTextContent("unavailable");
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  fireEvent.click(await screen.findByRole("button", { name: "分子: ethanol" }));
  fireEvent.click(
    screen.getByText("名称、备注与人工评价", { selector: "summary" }),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "名称" }), {
    target: { value: "reviewed" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "研究备注" }), {
    target: { value: "promising" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: /人工评价/ }), {
    target: { value: "4" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存备注为新版本" }));
  await waitFor(() => expect(post).toHaveBeenCalled());
  expect(post.mock.calls[0][1]).toMatchObject({
    parent_id: original.id,
    record: 1,
    label: "reviewed",
    notes: "promising",
    rating: 4,
  });
  expect(
    await screen.findByRole("heading", { name: "reviewed" }),
  ).toBeVisible();
  expect(
    within(screen.getByRole("list")).getByRole("button", { name: /ethanol/ }),
  ).toBeVisible();
});

it("passes the selected record and version to a property task", async () => {
  vi.spyOn(client, "request").mockImplementation(async (path) =>
    path.startsWith("/capabilities/")
      ? ({ availability: { configuration_present: true } } as never)
      : path === "/research/indexing"
        ? ([] as never)
        : (graph() as never),
  );
  vi.spyOn(client.api, "assets").mockResolvedValue([
    { id: "file", kind: "ligand", name: "library.sdf" },
  ] as never);
  const submit = vi
    .spyOn(client.api, "submit")
    .mockRejectedValue(new Error("backend is not installed"));
  render(
    <ResearchWorkspace
      language="zh"
      onEdit={vi.fn()}
      onJob={vi.fn()}
      onCreated={vi.fn()}
    />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "分子: ethanol" }));
  fireEvent.click(screen.getByRole("button", { name: "用作性质计算输入" }));
  fireEvent.click(screen.getByRole("button", { name: "下一步" }));
  expect(
    await screen.findByRole("option", { name: "library.sdf" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "下一步" }));
  fireEvent.click(screen.getByRole("button", { name: "下一步" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "计算性质" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "计算性质" }));
  await waitFor(() => expect(submit).toHaveBeenCalled());
  expect(submit.mock.calls[0][0]).toMatchObject({
    ligand_files: ["file"],
    scientific_inputs: [original.reference],
  });
  expect(await screen.findByRole("alert")).toHaveTextContent("not installed");
});
