import { expect, it } from "vitest";
import { validSource } from "../viewer/protocol";
import { poseSource } from "../viewer/pose-source";

it("binds only a local native indexed member for preservation before computation", () => {
  const origin = "http://127.0.0.1:4322";
  const path =
    "/api/datasets/12345678-1234-1234-1234-123456789abc/members/structure?member_id=compound&report_sha256=" +
    "a".repeat(64);
  expect(validSource(path, origin).pathname).toContain("/members/structure");
  expect(poseSource(path, 0, origin)).toEqual({
    kind: "indexed",
    job_id: "12345678-1234-1234-1234-123456789abc",
    member_id: "compound",
    report_sha256: "a".repeat(64),
  });
  expect(poseSource(path, 1, origin)).toBeNull();
  expect(
    poseSource(path.replace("a".repeat(64), "invalid"), 0, origin),
  ).toBeNull();
  expect(() => validSource("https://outside.example" + path, origin)).toThrow();
  expect(() =>
    validSource(
      "/api/datasets/12345678-1234-1234-1234-123456789abc/private",
      origin,
    ),
  ).toThrow();
});
