import {
  fireEvent,
  act,
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

it("does not replace the researcher’s newer material selection with a late saved version", async () => {
  const other: ScientificObject = {
    ...original,
    id: "33333333-3333-4333-8333-333333333333",
    label: "STAT6 follow-up material · controlled metadata",
    reference: {
      ...original.reference,
      version_id: "33333333-3333-4333-8333-333333333333",
    },
  };
  const saved: ScientificObject = {
    ...original,
    id: "44444444-4444-4444-8444-444444444444",
    label: "STAT6 annotation · controlled metadata",
    parent_id: original.id,
    relation: "edited_from",
    reference: {
      ...original.reference,
      version_id: "44444444-4444-4444-8444-444444444444",
    },
  };
  let current = graph([original, other]);
  vi.spyOn(client, "request").mockImplementation(async (path) =>
    path === "/research/indexing" ? ([] as never) : (current as never),
  );
  let finish!: (value: ScientificObject) => void;
  const post = vi.spyOn(client.api, "post").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }) as never,
  );
  render(
    <ResearchWorkspace
      language="en"
      onEdit={vi.fn()}
      onJob={vi.fn()}
      onCreated={vi.fn()}
    />,
  );
  const list = await screen.findByRole("list", { name: "Assets and tasks" });
  fireEvent.click(
    within(list).getByRole("button", {
      name: "Molecule: ethanol",
    }),
  );
  fireEvent.click(
    screen.getByText("Name, notes & human rating", { selector: "summary" }),
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Name" }), {
    target: { value: saved.label },
  });
  fireEvent.click(
    screen.getByRole("button", {
      name: "Save notes as new version",
    }),
  );
  await waitFor(() => expect(post).toHaveBeenCalledOnce());
  fireEvent.click(
    within(list).getByRole("button", {
      name: "Molecule: " + other.label,
    }),
  );
  current = graph([saved, original, other]);
  await act(async () => finish(saved));
  await waitFor(() =>
    expect(screen.getByRole("heading", { name: other.label })).toBeVisible(),
  );
  expect(screen.queryByRole("heading", { name: saved.label })).toBeNull();
  expect(post.mock.calls[0][1]).toMatchObject({
    parent_id: original.id,
    asset_id: original.reference.asset_id,
  });
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
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "暂时无法刷新研究文件",
  );
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  fireEvent.click(
    within(await screen.findByRole("list", { name: "资产与任务" })).getByRole(
      "button",
      { name: "分子: ethanol" },
    ),
  );
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
    reference: {
      ...original.reference,
      version_id: "22222222-2222-4222-8222-222222222222",
    },
  });
  expect(
    await screen.findByRole("heading", { name: "reviewed" }),
  ).toBeVisible();
  expect(
    within(screen.getByRole("list", { name: "资产与任务" })).getByRole(
      "button",
      { name: /ethanol/ },
    ),
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
  fireEvent.click(
    within(await screen.findByRole("list", { name: "资产与任务" })).getByRole(
      "button",
      { name: "分子: ethanol" },
    ),
  );
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
