import { expect, it } from "vitest";
import { scoreLabel } from "./scoreLabels";
it("names native pose scores without presenting experimental affinity", () => {
  expect(scoreLabel("minimizedAffinity", "zh")).toBe("经验对接分数");
  expect(scoreLabel("CNNaffinity", "en")).toBe("CNN binding score");
  expect(scoreLabel("CNNscore", "zh")).toBe("模型姿势分数");
});
