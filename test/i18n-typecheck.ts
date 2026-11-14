import type { Messages } from "../app/i18n";
// header.logout を欠かせている。@ts-expect-error が成立する＝キーの欠落が型エラーとして検出される
// @ts-expect-error en にキーが欠けていると型エラーになることの確認
export const broken: Messages = { header: { title: "", login: "", mypage: "" }, plans: { index: { confirmDelete: "" }, publicFalse: "" } };
