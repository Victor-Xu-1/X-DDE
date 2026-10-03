import { expect, it } from "vitest";
import { unwrapResult, researchText, researchError } from "./research-content";
it("removes a successful transport envelope without deleting zero scores or failed scientific outcomes", () => {
  const science = { rmsd: 0, matched_target_atoms: 97 };
  expect(
    unwrapResult({
      job_id: "internal",
      status: "succeeded",
      progress: 1,
      result: { available: true, result: science },
    }),
  ).toBe(science);
  const failure = { available: false, result: [], reason: "No valid molecule" };
  expect(unwrapResult(failure)).toBe(failure);
  const mixed = { result: science, objective: 0 };
  expect(unwrapResult(mixed)).toBe(mixed);
});
it("retains contacts and units while removing server paths and stack traces", () => {
  expect(
    researchText(
      "Report: /srv/private/record.txt\nA:ASN140 hydrogen bond 3.49 Å",
      true,
    ),
  ).toBe("A:ASN140 hydrogen bond 3.49 Å");
  expect(researchError("ModuleNotFoundError: solver", true)).toContain(
    "安装与组件",
  );
  expect(researchError("Error: 分子缺少三维坐标", true)).toBe(
    "分子缺少三维坐标",
  );
});
