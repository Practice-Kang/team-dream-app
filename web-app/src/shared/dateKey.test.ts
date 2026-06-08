import { describe, expect, it } from "vitest";

import { toDateKey } from "./dateKey";

describe("toDateKey", () => {
  it("keeps plain sheet dates as calendar dates", () => {
    expect(toDateKey("2026. 6. 2")).toBe("2026-06-02");
  });

  it("normalizes spreadsheet UTC date-time exports to Korea calendar dates", () => {
    expect(toDateKey("2026. 6. 1 오후 3:00:00")).toBe("2026-06-02");
  });
});
