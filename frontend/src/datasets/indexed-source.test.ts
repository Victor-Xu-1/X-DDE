import { expect, it } from "vitest";
import { validSource } from "../viewer/protocol";
import { poseSource } from "../viewer/pose-source";

it("allows only the local native member route and keeps readonly extraction out of compute sources", () => {
  const origin = "http://127.0.0.1:4322";
  const path =
    "/api/datasets/12345678-1234-1234-1234-123456789abc/members/structure?member_id=compound&report_sha256=" +
    "a".repeat(64);
  expect(validSource(path, origin).pathname).toContain("/members/structure");
  expect(poseSource(path, 0, origin)).toBeNull();
  expect(() => validSource("https://outside.example" + path, origin)).toThrow();
  expect(() =>
    validSource(
      "/api/datasets/12345678-1234-1234-1234-123456789abc/private",
      origin,
    ),
  ).toThrow();
});
