import { describe, expect, it } from "vitest";
import { parseWorkerCommand } from "./main";

describe("worker command parsing", () => {
  it.each(["worker", "sync", "index", "refresh-metadata"] as const)("accepts %s", (command) => {
    expect(parseWorkerCommand([command])).toBe(command);
  });

  it("rejects an unknown command", () => {
    expect(() => parseWorkerCommand(["explode"])).toThrow(/worker|sync/);
  });
});
