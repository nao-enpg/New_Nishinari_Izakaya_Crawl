import { ja } from "./ja";

/** ja と同じ形（キー）を強制する型。en にキーが欠けると型エラーになる（現行の訳抜けバグを防ぐ） */
type Shape<T> = { [K in keyof T]: T[K] extends string ? string : Shape<T[K]> };
export type Messages = Shape<typeof ja>;

export const en = {
  header: { title: "Nishinari Izakaya Crawl", login: "Login with Google", mypage: "My Page", logout: "Logout" },
  plans: { index: { confirmDelete: "Are you sure you want to delete?" }, publicFalse: "This plan is private" },
} satisfies Messages;

export const LOCALES = ["ja", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const messages: Record<Locale, Messages> = { ja, en };

/** ?locale= を読む。未知の値は既定の ja にする（現行は 500 になるバグ） */
export function getLocale(url: URL): Locale {
  const v = url.searchParams.get("locale");
  return (LOCALES as readonly string[]).includes(v ?? "") ? (v as Locale) : "ja";
}

/** 言語を切り替えても、ほかのクエリ（検索条件など）を残す（現行は消えるバグ） */
export function withLocale(href: string, locale: Locale, base = "http://x"): string {
  const u = new URL(href, base);
  u.searchParams.set("locale", locale);
  return u.pathname + u.search + u.hash;
}
