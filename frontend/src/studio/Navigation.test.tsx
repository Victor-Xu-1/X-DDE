import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { Navigation, viewTitle } from "./Navigation";
import { AccountSettings } from "./AccountSettings";

afterEach(cleanup);
it("keeps all research modules directly accessible", async () => {
  const user = userEvent.setup();
  const onView = vi.fn();
  render(<Navigation view="home" onView={onView} language="zh" jobs={[]} />);
  const nav = screen.getByRole("navigation", { name: "主导航" });
  for (const name of [
    "资产与关系",
    "全部能力",
    "结构预测",
    "分子与结构",
    "项目空间",
    "任务中心",
    "结果解读",
    "导出结果",
  ])
    expect(within(nav).getByRole("button", { name })).toBeVisible();
  expect(within(nav).queryByRole("button", { name: "安装与组件" })).toBeNull();
  expect(screen.queryByText("当前工作空间")).toBeNull();
  await user.click(screen.getByRole("button", { name: "账户与设置" }));
  expect(
    within(screen.getByRole("menu")).getAllByRole("menuitem"),
  ).toHaveLength(5);
  await user.click(screen.getByRole("menuitem", { name: "运行状态" }));
  expect(onView).toHaveBeenCalledWith("models");
  expect(screen.queryByRole("menu")).toBeNull();
  expect(screen.getByRole("button", { name: "账户与设置" })).toHaveFocus();
});
it.each([
  ["zh", "资产与关系", "资产"],
  ["en", "Assets & relationships", "Assets"],
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
  const trigger = screen.getByRole("button", { name: "Account & settings" });
  await user.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(
    screen.getByRole("menuitem", { name: "Account & settings" }),
  ).toHaveFocus();
  await user.keyboard("{ArrowDown}");
  expect(
    screen.getByRole("menuitem", { name: "Workspace overview" }),
  ).toHaveFocus();
  await user.keyboard("{End}");
  expect(screen.getByRole("menuitem", { name: "Help" })).toHaveFocus();
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
    ["Account & settings", "settings"],
    ["Workspace overview", "overview"],
    ["Installation & components", "deployment"],
    ["Runtime status", "models"],
    ["Help", "help"],
  ]) {
    await user.click(
      screen.getByRole("button", { name: "Account & settings" }),
    );
    await user.click(screen.getByRole("menuitem", { name }));
    expect(onView).toHaveBeenLastCalledWith(view);
  }
});
it("exposes language preference and honest account limitations", async () => {
  const user = userEvent.setup();
  const onLanguage = vi.fn();
  render(
    <AccountSettings language="en" onLanguage={onLanguage} storageWarning />,
  );
  expect(screen.getByText(/team sign-in is not enabled/)).toBeVisible();
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
  ).toHaveAttribute("src", "/brand/x-dde-logo.png");
  await userEvent.click(screen.getByRole("button", { name: /^X-DDE$/ }));
  expect(onView).toHaveBeenCalledWith("tools");
});
