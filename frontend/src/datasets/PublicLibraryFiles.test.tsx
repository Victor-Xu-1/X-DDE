import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { PublicLibraryFiles } from "./PublicLibraryFiles";
import * as client from "../api";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("requires an explicit source choice and retains the verified supplier identifier field", async () => {
  const resource = {
    id: "bionet-test",
    supplier: "bionet",
    label: ["BIONET 文件", "BIONET file"],
    raw_records: 353398,
    id_column: "Cmpdid",
    source_page: "https://www.keyorganics.net/",
    scope: "complete_collection",
    asset: {
      id: "input",
      name: "source.sdf",
      sha256: "a".repeat(64),
      kind: "library",
      suffix: ".sdf",
      size: 1000,
      created_at: "today",
    },
  };
  vi.spyOn(client, "request").mockResolvedValue([
    resource,
    { ...resource, id: "not-downloaded", label: ["待下载文件", "Pending file"], asset: null },
  ]);
  const change = vi.fn();
  render(<PublicLibraryFiles language="zh" onChange={change} />);
  await screen.findByRole("option", { name: /BIONET 文件/ });
  expect(change).not.toHaveBeenCalled();
  await userEvent.selectOptions(screen.getByRole("combobox"), "bionet-test");
  await waitFor(() => expect(change).toHaveBeenCalledWith(resource));
  expect(screen.getByText("文件已选用")).toBeVisible();
  expect(screen.queryByText(/可筛选/)).not.toBeInTheDocument();
  await userEvent.selectOptions(screen.getByRole("combobox"), "not-downloaded");
  expect(change).toHaveBeenLastCalledWith(null);
  expect(screen.queryByText("文件已选用")).not.toBeInTheDocument();
  await userEvent.selectOptions(screen.getByRole("combobox"), "bionet-test");
  await waitFor(() => expect(change).toHaveBeenLastCalledWith(resource));
  await userEvent.selectOptions(screen.getByRole("combobox"), "");
  expect(change).toHaveBeenLastCalledWith(null);
});
