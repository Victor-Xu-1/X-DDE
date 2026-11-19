import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ImageRecognition } from "./ImageRecognition";
import { recognitionOrigin } from "./image-molecule";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("routes only the explicitly requested current drawing and drops late replies on tab changes", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ available: true }),
    }),
  );
  const onHandoff = vi.fn();
  const view = render(<ImageRecognition language="en" onHandoff={onHandoff} />);
  const iframe = (await screen.findByTitle(
    "Image recognition and molecular editor",
  )) as HTMLIFrameElement;
  expect(iframe.src).toContain("xdde-drawing=1");
  expect(iframe.src).not.toContain("xdde-input=1");
  const sender = iframe.contentWindow!;
  const send = vi.spyOn(sender, "postMessage").mockImplementation(() => {});
  const origin = recognitionOrigin();
  function native(data: object, source: Window = sender) {
    act(() =>
      window.dispatchEvent(
        new MessageEvent("message", { source, origin, data }),
      ),
    );
  }
  native({ type: "xdde-drawing:ready" });
  const id = send.mock.calls.at(-1)![0].id;
  native({ type: "xdde-drawing:state", id, available: true }, window);
  expect(
    screen.queryByRole("combobox", { name: "Use structure in a task" }),
  ).toBeNull();
  native({ type: "xdde-drawing:state", id, available: true });
  const choice = screen.getByRole("combobox", {
    name: "Use structure in a task",
  });
  await userEvent.selectOptions(choice, "properties");
  const first = send.mock.calls.at(-1)![0];
  expect(first.type).toBe("xdde-drawing:export");
  expect(choice).toBeDisabled();
  const molecule = { smiles: "CCO", molfile: "M  END\n" };
  native({
    type: "xdde-drawing:result",
    id,
    requestId: crypto.randomUUID(),
    molecule,
  });
  expect(onHandoff).not.toHaveBeenCalled();
  native({
    type: "xdde-drawing:result",
    id,
    requestId: first.requestId,
    molecule,
  });
  expect(onHandoff).toHaveBeenCalledExactlyOnceWith("properties", {
    id: first.requestId,
    molecule,
  });
  await userEvent.selectOptions(choice, "brain");
  const late = send.mock.calls.at(-1)![0];
  view.rerender(
    <ImageRecognition language="en" visible={false} onHandoff={onHandoff} />,
  );
  native({
    type: "xdde-drawing:result",
    id,
    requestId: late.requestId,
    molecule,
  });
  expect(onHandoff).toHaveBeenCalledTimes(1);
});
it("connects to the existing local editor without starting recognition", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ available: true }) });
  vi.stubGlobal("fetch", fetcher);
  render(<ImageRecognition language="en" />);
  const frame = await screen.findByTitle(
    "Image recognition and molecular editor",
  );
  expect(frame).toHaveAttribute(
    "src",
    expect.stringMatching(
      /^http:\/\/(localhost|127\.0\.0\.1):8940\/\?xdde-locale=1&parent=.+&lang=en$/,
    ),
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe("/api/utilities/recognition");
  expect(fetcher.mock.calls[0][1].method).toBeUndefined();
});
it("offers retry on failure and replaces the offline state after recovery", async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue({ ok: true, json: async () => ({ available: true }) });
  vi.stubGlobal("fetch", fetcher);
  render(<ImageRecognition language="zh" />);
  expect(await screen.findByText("图片识别工作台尚未打开")).toBeVisible();
  const recognition = screen.getByRole("switch", { name: "DECIMER" });
  expect(recognition).toBeDisabled();
  expect(recognition).not.toBeChecked();
  expect(recognition).toHaveAccessibleDescription("工作台未连接");
  await userEvent.click(screen.getByRole("button", { name: "重新连接" }));
  await waitFor(() =>
    expect(screen.getByTitle("图片识别与分子编辑")).toBeVisible(),
  );
  expect(recognition).not.toBeInTheDocument();
});

it("moves actions into the compact tab bar without reloading the editor on language changes", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ available: true }) });
  vi.stubGlobal("fetch", fetcher);
  const target = document.createElement("div");
  document.body.appendChild(target);
  try {
    const view = render(
      <ImageRecognition language="en" actionsTarget={target} />,
    );
    const frame = await screen.findByTitle(
      "Image recognition and molecular editor",
    );
    expect(target).toContainElement(
      screen.getByRole("button", { name: "Reconnect" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Image input help" }),
    );
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Paste or drop a structure image",
    );
    view.rerender(<ImageRecognition language="zh" actionsTarget={target} />);
    expect(screen.getByTitle("图片识别与分子编辑")).toBe(frame);
    expect(frame).toHaveAttribute("src", expect.stringContaining("lang=en"));
    expect(target).toContainElement(
      screen.getByRole("button", { name: "重新连接" }),
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  } finally {
    target.remove();
  }
});
