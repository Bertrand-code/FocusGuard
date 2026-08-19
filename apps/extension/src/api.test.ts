import { describe, expect, it } from "vitest";
import { validateApiBase } from "./api.js";

describe("extension API origin validation", () => {
  it("accepts HTTPS and local HTTP development origins", () => {
    expect(validateApiBase("https://focusguard.example/api")).toBe("https://focusguard.example");
    expect(validateApiBase("http://localhost:8000")).toBe("http://localhost:8000");
  });

  it.each([
    "http://focusguard.example",
    "file:///tmp/fake-api",
    "https://user:password@focusguard.example",
    "https://focusguard.example/#confused",
  ])("rejects an unsafe control-plane address: %s", (value) => {
    expect(() => validateApiBase(value)).toThrow();
  });
});
