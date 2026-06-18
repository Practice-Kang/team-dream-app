import { describe, expect, it } from "vitest";

import { matchesKoreanText, toChoseong } from "./koreanSearch";

describe("koreanSearch", () => {
  it("builds Hangul initial consonants", () => {
    expect(toChoseong("강민철")).toBe("ㄱㅁㅊ");
    expect(toChoseong("김 세화")).toBe("ㄱ ㅅㅎ");
  });

  it("matches by normal text or initial consonants", () => {
    expect(matchesKoreanText("강민철", "민철")).toBe(true);
    expect(matchesKoreanText("강민철", "ㄱㅁ")).toBe(true);
    expect(matchesKoreanText("강민철", "ㄱㅁㅊ")).toBe(true);
    expect(matchesKoreanText("강민철", "ㅂㅅㅎ")).toBe(false);
  });
});
