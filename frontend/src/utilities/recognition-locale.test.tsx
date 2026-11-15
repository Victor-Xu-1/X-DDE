import { useRef } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  act,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  attachRecognitionLocaleHost,
  recognitionFrameUrl,
} from "./recognition-locale";
import { useRecognitionLocale } from "./useRecognitionLocale";
import { useRecognitionHostLanguage } from "./recognition-host-ui-locale";

const parentDescriptor = Object.getOwnPropertyDescriptor(window, "parent")!;
const originalURL = location.href;
const originalTitle = document.title;
const originalLanguage = document.documentElement.lang;
const origin = "http://127.0.0.1:8940";
const parentOrigin = "http://127.0.0.1:4322";
afterEach(() => {
  cleanup();
  Object.defineProperty(window, "parent", parentDescriptor);
  history.replaceState(null, "", originalURL);
  document.title = originalTitle;
  document.documentElement.lang = originalLanguage;
  frameCleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function optIn() {
  const frame = document.createElement("iframe");
  document.body.appendChild(frame);
  const parent = frame.contentWindow!;
  Object.defineProperty(window, "parent", {
    configurable: true,
    value: parent,
  });
  history.replaceState(
    null,
    "",
    `/?xdde-locale=1&parent=${encodeURIComponent(parentOrigin)}&lang=en`,
  );
  return parent;
}
it("native host accepts only opted-in parent/source/version/session/EN-ZH messages", () => {
  const parent = optIn(),
    changed = vi.fn();
  const send = vi.spyOn(parent, "postMessage");
  const stop = attachRecognitionLocaleHost(changed);
  const data = {
    type: "xdde-locale:set",
    version: 1,
    id: crypto.randomUUID(),
    language: "en",
  };
  const deliver = (
    value: object,
    from = parentOrigin,
    source: Window = parent,
  ) =>
    fireEvent(
      window,
      new MessageEvent("message", { origin: from, source, data: value }),
    );
  deliver(data, "https://untrusted.example");
  deliver(data, parentOrigin, window);
  deliver({ ...data, id: "old" });
  deliver({ ...data, version: 2 });
  deliver({ ...data, language: "fr" });
  expect(changed).not.toHaveBeenCalled();
  deliver(data);
  expect(changed).toHaveBeenCalledExactlyOnceWith("en");
  expect(send).toHaveBeenLastCalledWith(
    { ...data, type: "xdde-locale:applied" },
    parentOrigin,
  );
  stop();
  deliver({ ...data, language: "zh" });
  expect(changed).toHaveBeenCalledTimes(1);
  frameCleanup();
});
function frameCleanup() {
  document.body.querySelectorAll("iframe").forEach((frame) => frame.remove());
}
it("does nothing in standalone or non-opt-in contexts", () => {
  const changed = vi.fn();
  const stop = attachRecognitionLocaleHost(changed);
  expect(changed).not.toHaveBeenCalled();
  stop();
  optIn();
  history.replaceState(null, "", "/");
  attachRecognitionLocaleHost(changed)();
  expect(changed).not.toHaveBeenCalled();
});
it("keeps unsupported hosts usable and releases the acknowledgement timeout on unmount", () => {
  vi.useFakeTimers();
  const view = render(<Parent language="en" />);
  act(() => vi.advanceTimersByTime(5000));
  expect(screen.getByRole("status")).toHaveTextContent("false");
  expect(screen.getByTitle("Native editor")).toBeVisible();
  view.rerender(<Parent language="zh" />);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
function Parent({ language }: { language: "en" | "zh" }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const locale = useRecognitionLocale(frame, origin, language);
  return (
    <>
      <iframe ref={frame} title="Native editor" />
      <output>{String(locale.supported)}</output>
    </>
  );
}
it("acknowledges the current frame/session and keeps its DOM on language changes", () => {
  vi.useFakeTimers();
  const view = render(<Parent language="en" />);
  const frame = screen.getByTitle("Native editor") as HTMLIFrameElement;
  const post = vi.spyOn(frame.contentWindow!, "postMessage");
  fireEvent(
    window,
    new MessageEvent("message", {
      origin,
      source: frame.contentWindow,
      data: { type: "xdde-locale:ready", version: 1 },
    }),
  );
  const first = post.mock.calls.at(-1)![0];
  view.rerender(<Parent language="zh" />);
  expect(screen.getByTitle("Native editor")).toBe(frame);
  const current = post.mock.calls.at(-1)![0];
  const ack = (data: object, from = origin, sender = frame.contentWindow) =>
    fireEvent(
      window,
      new MessageEvent("message", { origin: from, source: sender, data }),
    );
  ack({ ...first, type: "xdde-locale:applied" });
  ack({ ...current, type: "xdde-locale:applied" }, "https://untrusted.example");
  ack({ ...current, type: "xdde-locale:applied" }, origin, window);
  expect(screen.getByRole("status")).toHaveTextContent("null");
  ack({ ...current, type: "xdde-locale:applied" });
  expect(screen.getByRole("status")).toHaveTextContent("true");
  act(() => vi.advanceTimersByTime(6000));
  expect(screen.getByRole("status")).toHaveTextContent("true");
});
function Host() {
  const { text } = useRecognitionHostLanguage();
  return (
    <>
      <label>
        {text("分子结构")}
        <input defaultValue="C1=CC=CC=C1" />
      </label>
      <button>{text("开始识别")}</button>
      <p>{text("图片超过 10 MB。")}</p>
    </>
  );
}
it("preserves the original standalone language/title without an explicit locale request", () => {
  history.replaceState(null, "", "/");
  const title = document.title,
    language = document.documentElement.lang;
  const view = render(<Host />);
  expect(screen.getByRole("button", { name: "开始识别" })).toBeVisible();
  expect(document.title).toBe(title);
  expect(document.documentElement.lang).toBe(language);
  view.unmount();
  history.replaceState(null, "", "/?lang=en");
  render(<Host />);
  expect(screen.getByRole("button", { name: "Recognize image" })).toBeVisible();
});
it("native React language updates preserve edits without any service requests", () => {
  const parent = optIn();
  const fetcher = vi.spyOn(window, "fetch");
  render(<Host />);
  const editor = screen.getByRole("textbox", { name: "Molecular structure" });
  fireEvent.change(editor, { target: { value: "edited molecular graph" } });
  fireEvent(
    window,
    new MessageEvent("message", {
      origin: parentOrigin,
      source: parent,
      data: {
        type: "xdde-locale:set",
        version: 1,
        id: crypto.randomUUID(),
        language: "zh",
      },
    }),
  );
  expect(screen.getByRole("textbox", { name: "分子结构" })).toBe(editor);
  expect(editor).toHaveValue("edited molecular graph");
  expect(screen.getByRole("button", { name: "开始识别" })).toBeVisible();
  expect(screen.getByText("图片超过 10 MB。")).toBeVisible();
  expect(fetcher).not.toHaveBeenCalled();
  expect(
    new URL(recognitionFrameUrl(origin, "en", true)).searchParams.get(
      "xdde-input",
    ),
  ).toBe("1");
  frameCleanup();
});
