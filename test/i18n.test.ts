import { describe, expect, it } from "vitest";
import { getLocale, messages, withLocale } from "../app/i18n";

describe("PoC g: 自前の型付き辞書", () => {
  it("未知の locale は ja", () => {
    expect(getLocale(new URL("http://x/?locale=fr"))).toBe("ja");
    expect(getLocale(new URL("http://x/?locale=en"))).toBe("en");
    expect(getLocale(new URL("http://x/"))).toBe("ja");
  });
  it("言語切り替えで検索条件を残す", () => {
    expect(withLocale("/izakayas?tag=1&tag=2&locale=ja", "en")).toBe("/izakayas?tag=1&tag=2&locale=en");
  });
  it("英語でも削除確認が英語になる", () => {
    expect(messages.en.plans.index.confirmDelete).toBe("Are you sure you want to delete?");
  });
});
