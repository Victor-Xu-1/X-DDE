import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { Navigation, viewTitle } from "./Navigation";
import { InterfaceSettings } from "./InterfaceSettings";

afterEach(cleanup);
it("keeps all research modules directly accessible", async () => {
  const user = userEvent.setup();
  const onView = vi.fn();
  render(<Navigation view="home" onView={onView} language="zh" jobs={[]} />);
  const nav = screen.getByRole("navigation", { name: "主导航" });
  for (const name of [
    "靶点研究",
    "结构预测",
    "口袋与对接",
    "小分子设计",
    "生物药研究",
    "性质与安全性",
    "研究空间",
    "任务与结果",
    "全部能力",
  ])
    expect(within(nav).getByRole("button", { name })).toBeVisible();
  expect(within(nav).queryByRole("button", { name: "安装与组件" })).toBeNull();
  expect(screen.queryByText("当前工作空间")).toBeNull();
  await user.click(screen.getByRole("button", { name: "设置与帮助" }));
  expect(
    within(screen.getByRole("menu")).getAllByRole("menuitem"),
  ).toHaveLength(3);
  await user.click(screen.getByRole("menuitem", { name: "安装与运行" }));
  expect(onView).toHaveBeenCalledWith("deployment");
  expect(screen.queryByRole("menu")).toBeNull();
  expect(screen.getByRole("button", { name: "设置与帮助" })).toHaveFocus();
});
it.each([
  ["zh", "研究空间", "文件"],
  ["en", "Research workspace", "Files"],
] as const)(
  "keeps the shared asset destination reachable in %s",
  async (language, label, shortLabel) => {
    const user = userEvent.setup();
    const onView = vi.fn();
    render(
      <Navigation
        view="research"
        onView={onView}
        language={language}
        jobs={[]}
      />,
    );
    const button = screen.getByRole("button", { name: label });
    expect(button).toHaveAttribute("aria-current", "page");
    expect(
      within(button).getByText(shortLabel, { exact: true }),
    ).toBeInTheDocument();
    expect(viewTitle("research", language)).toBe(label);
    await user.click(button);
    expect(onView).toHaveBeenLastCalledWith("research");
  },
);
it("supports toggle, outside click, Escape, arrow keys and Tab", async () => {
  const user = userEvent.setup();
  render(
    <>
      <Navigation view="tools" onView={() => {}} language="en" jobs={[]} />
      <button>Outside</button>
    </>,
  );
  const trigger = screen.getByRole("button", { name: "Settings and help" });
  await user.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(
    screen.getByRole("menuitem", { name: "Installation and runtime" }),
  ).toHaveFocus();
  await user.keyboard("{ArrowDown}");
  expect(
    screen.getByRole("menuitem", { name: "Appearance and language" }),
  ).toHaveFocus();
  await user.keyboard("{End}");
  expect(
    screen.getByRole("menuitem", { name: "Getting started" }),
  ).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(trigger).toHaveFocus();
  expect(screen.queryByRole("menu")).toBeNull();
  await user.click(trigger);
  await user.click(trigger);
  expect(screen.queryByRole("menu")).toBeNull();
  await user.click(trigger);
  await user.click(screen.getByRole("button", { name: "Outside" }));
  expect(screen.queryByRole("menu")).toBeNull();
  trigger.focus();
  await user.keyboard("{ArrowDown}{End}{Tab}{Tab}");
  expect(screen.queryByRole("menu")).toBeNull();
});
it("routes every management entry to the correct panel", async () => {
  const user = userEvent.setup();
  const onView = vi.fn();
  render(<Navigation view="tools" onView={onView} language="en" jobs={[]} />);
  for (const [name, view] of [
    ["Installation and runtime", "deployment"],
    ["Appearance and language", "settings"],
    ["Getting started", "help"],
  ] as const) {
    await user.click(screen.getByRole("button", { name: "Settings and help" }));
    await user.click(screen.getByRole("menuitem", { name }));
    expect(onView).toHaveBeenLastCalledWith(view);
  }
});
it("keeps real language preferences without a placeholder account panel", async () => {
  const user = userEvent.setup();
  const onLanguage = vi.fn();
  render(
    <InterfaceSettings language="en" onLanguage={onLanguage} storageWarning />,
  );
  expect(screen.queryByText(/team sign-in is not enabled/)).toBeNull();
  await user.selectOptions(
    screen.getByRole("combobox", { name: /Interface language/ }),
    "zh",
  );
  expect(onLanguage).toHaveBeenCalledWith("zh");
  expect(screen.getByRole("status")).toHaveTextContent("could not be saved");
});

it("uses the supplied raster logo as the accessible brand navigation", async () => {
  const onView = vi.fn();
  render(<Navigation view="home" onView={onView} language="zh" jobs={[]} />);
  expect(
    screen.getByRole("img", { name: "X-DDE 药物研究工作台" }),
  ).toHaveAttribute("src", "/brand/x-dde-wordmark.png");
  await userEvent.click(screen.getByRole("button", { name: /^X-DDE$/ }));
  expect(onView).toHaveBeenCalledWith("tools");
});
