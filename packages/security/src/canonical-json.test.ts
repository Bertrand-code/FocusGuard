import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical-json.js";

describe("canonicalJson", () => {
  it("sorts object keys recursively without changing array order", () => {
    expect(canonicalJson({ z: 1, a: { y: 2, x: [3, 1] } })).toBe('{"a":{"x":[3,1],"y":2},"z":1}');
  });

  it("rejects values JSON cannot safely sign", () => {
    expect(() => canonicalJson({ value: Number.NaN })).toThrow(/non-finite/);
  });
});
