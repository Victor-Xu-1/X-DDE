import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setTheme, THEME_STORAGE_KEY } from "../theme";
import { AccountSettings } from "./AccountSettings";

beforeEach(() => {
  localStorage.clear();
  setTheme("warm");
});

afterEach(() => vi.restoreAllMocks());

it("offers three accessible themes and supports keyboard switching", async () => {
  const user = userEvent.setup();
  render(
    <AccountSettings
      language="en"
      onLanguage={() => {}}
      storageWarning={false}
    />,
  );
  expect(screen.getByRole("group", { name: "Appearance" })).toBeVisible();
  expect(screen.getAllByRole("radio")).toHaveLength(3);
  expect(screen.getByRole("radio", { name: "Warm" })).toBeChecked();
  const night = screen.getByRole("radio", { name: "Night" });
  await user.click(night);
  expect(night).toBeChecked();
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  await user.keyboard("{ArrowLeft}");
  expect(screen.getByRole("radio", { name: "Pure white" })).toBeChecked();
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
});

it("provides the theme names and descriptions in Chinese", () => {
  render(
    <AccountSettings
      language="zh"
      onLanguage={() => {}}
      storageWarning={false}
    />,
  );
  expect(screen.getByRole("group", { name: "外观主题" })).toBeVisible();
  expect(screen.getByRole("radio", { name: "暖色" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "纯白" })).toBeVisible();
  expect(
    screen.getByRole("radio", { name: "夜间黑" }),
  ).toHaveAccessibleDescription("深色背景，适合暗光环境");
});

it("explains failed persistence while continuing to apply the selected theme", async () => {
  const user = userEvent.setup();
  render(
    <AccountSettings
      language="en"
      onLanguage={() => {}}
      storageWarning={false}
    />,
  );
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Storage is disabled", "SecurityError");
  });
  await user.click(screen.getByRole("radio", { name: "Night" }));
  expect(screen.getByRole("radio", { name: "Night" })).toBeChecked();
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(screen.getByRole("status")).toHaveTextContent(
    "This browser cannot save your theme preference",
  );
});
