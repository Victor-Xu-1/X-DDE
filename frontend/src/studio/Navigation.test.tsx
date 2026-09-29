import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Navigation } from "./Navigation";
it("offers only implemented modules", () => {
  render(
    <Navigation
      view="home"
      onView={() => {}}
      language="zh"
      jobs={[]}
      gpu={undefined}
      free={100}
      total={200}
    />,
  );
  expect(screen.getByRole("button", { name: /预测工作台/ })).toBeVisible();
  expect(
    screen.queryByRole("button", { name: /设计生成|亲和力|基准/ }),
  ).toBeNull();
  expect(screen.getByRole("button", { name: /运行状态/ })).toBeVisible();
});
