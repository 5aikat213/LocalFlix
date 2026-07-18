import { describe, expect, it } from "vitest";
import { rootHealthMessage } from "./admin-model";

describe("admin diagnostics", () => {
  it("explains inaccessible macOS media roots", () => {
    expect(rootHealthMessage(false)).toMatch(/Full Disk Access/);
    expect(rootHealthMessage(true)).toBe("Online and readable");
  });
});
