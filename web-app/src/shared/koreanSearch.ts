const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
const JUNGSEONG_COUNT = 21;
const JONGSEONG_COUNT = 28;
const CHOSEONG = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

export function matchesKoreanText(text: string, keyword: string): boolean {
  const normalizedText = normalizeSearchText(text);
  const normalizedKeyword = normalizeSearchText(keyword);
  if (!normalizedKeyword) return true;

  return normalizedText.includes(normalizedKeyword) || toChoseong(normalizedText).includes(normalizedKeyword);
}

export function toChoseong(text: string): string {
  return Array.from(text)
    .map((char) => {
      const code = char.charCodeAt(0);
      if (code < HANGUL_BASE || code > HANGUL_LAST) return char;

      const choseongIndex = Math.floor((code - HANGUL_BASE) / (JUNGSEONG_COUNT * JONGSEONG_COUNT));
      return CHOSEONG[choseongIndex] ?? char;
    })
    .join("");
}

function normalizeSearchText(value: string): string {
  return value.toLocaleLowerCase("ko-KR").replace(/\s+/g, "");
}
