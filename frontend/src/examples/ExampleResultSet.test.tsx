import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { Job } from "../types";
import { ExampleResultSet } from "./ExampleResultSet";

const transport = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../api", () => ({ request: transport.request }));
vi.mock("./ExampleJobResult", () => ({
  ExampleJobResult: ({ job }: { job: Job }) => <p>Native output {job.id}</p>,
}));
const primary = {
  id: "generator",
  status: "succeeded",
  request: { operation: "diffsbdd", payload: { mode: "generate" } },
} as unknown as Job;
const refined = {
  id: "refined",
  status: "succeeded",
  request: { operation: "docking", mode: "minimize" },
} as unknown as Job;
const quality = {
  id: "quality",
  status: "succeeded",
  request: { operation: "pose_quality" },
} as unknown as Job;
const supporting = [{ job_id: refined.id }, { job_id: quality.id }];
beforeEach(() => {
  transport.request.mockReset();
});

it("names retained stages immediately from the case projection without extra requests", async () => {
  transport.request.mockResolvedValue(quality);
  render(
    <ExampleResultSet
      job={primary}
      supporting={supporting}
      stageNames={{
        refined: "STAT6 local refinement",
        quality: "STAT6 independent quality",
      }}
      language="en"
    />,
  );
  expect(
    screen.getByRole("option", { name: "STAT6 local refinement" }),
  ).toBeVisible();
  expect(
    screen.getByRole("option", { name: "STAT6 independent quality" }),
  ).toBeVisible();
  expect(transport.request).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: quality.id },
  });
  expect(await screen.findByText("Native output quality")).toBeVisible();
  expect(
    screen.getByRole("option", { name: "STAT6 independent quality" }),
  ).toBeVisible();
  expect(transport.request).toHaveBeenCalledTimes(1);
});

it("preserves the original and switches only to successful retained native stages without navigation", async () => {
  transport.request.mockImplementation((path: string) =>
    Promise.resolve(path.endsWith("refined") ? refined : quality),
  );
  const url = location.href;
  render(
    <ExampleResultSet job={primary} supporting={supporting} language="en" />,
  );
  expect(screen.getByText("Native output generator")).toBeVisible();
  const choose = screen.getByRole("combobox", { name: "Study result stage" });
  fireEvent.change(choose, { target: { value: "refined" } });
  expect(await screen.findByText("Native output refined")).toBeVisible();
  expect(screen.getByText("Native output generator")).not.toBeVisible();
  expect(
    screen.getByRole("option", { name: "Locally minimize a binding pose" }),
  ).toBeVisible();
  fireEvent.change(choose, { target: { value: "quality" } });
  expect(await screen.findByText("Native output quality")).toBeVisible();
  fireEvent.change(choose, { target: { value: "generator" } });
  expect(screen.getByText("Native output generator")).toBeVisible();
  expect(transport.request).toHaveBeenCalledTimes(2);
  expect(location.href).toBe(url);
});

it("does not let a late reply replace the newly selected stage", async () => {
  let resolve!: (job: Job) => void;
  transport.request
    .mockReturnValueOnce(
      new Promise<Job>((r) => {
        resolve = r;
      }),
    )
    .mockResolvedValueOnce(quality);
  render(
    <ExampleResultSet job={primary} supporting={supporting} language="zh" />,
  );
  const choose = screen.getByRole("combobox", { name: "研究阶段结果" });
  fireEvent.change(choose, { target: { value: "refined" } });
  await waitFor(() => expect(transport.request).toHaveBeenCalledTimes(1));
  const signal = transport.request.mock.calls[0][1].signal as AbortSignal;
  fireEvent.change(choose, { target: { value: "quality" } });
  expect(await screen.findByText("Native output quality")).toBeVisible();
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(refined));
  expect(screen.getByText("Native output quality")).toBeVisible();
  expect(screen.queryByText("Native output refined")).toBeNull();
});

it.each([
  { id: "other", status: "succeeded", request: {} },
  { ...refined, status: "failed" },
])(
  "rejects wrong-identity or unsuccessful responses without showing them",
  async (response) => {
    transport.request.mockResolvedValue(response);
    render(
      <ExampleResultSet job={primary} supporting={supporting} language="en" />,
    );
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "refined" },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("unavailable");
    expect(screen.queryByText(`Native output ${response.id}`)).toBeNull();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "generator" },
    });
    expect(screen.getByText("Native output generator")).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
  },
);

it("retains old single-result examples without extra requests or controls", () => {
  render(<ExampleResultSet job={primary} supporting={[]} language="en" />);
  expect(screen.getByText("Native output generator")).toBeVisible();
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(transport.request).not.toHaveBeenCalled();
});

it("a different root study cannot inherit the selected follow-up from the previous study", async () => {
  transport.request.mockResolvedValue(refined);
  const view = render(
    <ExampleResultSet job={primary} supporting={supporting} language="en" />,
  );
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: "refined" },
  });
  expect(await screen.findByText("Native output refined")).toBeVisible();
  view.rerender(
    <ExampleResultSet
      job={{ ...primary, id: "new-study" }}
      supporting={supporting}
      language="en"
    />,
  );
  expect(screen.getByText("Native output new-study")).toBeVisible();
  expect(screen.getByRole("combobox")).toHaveValue("new-study");
});

it("keeps a record's original pose choice while showing retained native quality stages", async () => {
  transport.request.mockResolvedValue(quality);
  render(
    <ExampleResultSet
      primaryId="record:reviewed-collection"
      primaryLabel="Study results"
      primary={
        <input aria-label="Selected native pose" defaultValue="Pose 1" />
      }
      supporting={[{ job_id: quality.id }]}
      language="en"
    />,
  );
  const original = screen.getByRole("textbox", {
    name: "Selected native pose",
  });
  fireEvent.change(original, { target: { value: "Pose 9" } });
  const choose = screen.getByRole("combobox", { name: "Study result stage" });
  fireEvent.change(choose, { target: { value: quality.id } });
  expect(await screen.findByText("Native output quality")).toBeVisible();
  expect(original).not.toBeVisible();
  fireEvent.change(choose, { target: { value: "record:reviewed-collection" } });
  expect(original).toBeVisible();
  expect(original).toHaveValue("Pose 9");
  expect(screen.queryByText("Native output quality")).toBeNull();
  expect(transport.request).toHaveBeenCalledTimes(1);
});
