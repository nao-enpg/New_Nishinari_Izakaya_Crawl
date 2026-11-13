import type { Messages } from "../app/i18n";
// @ts-expect-error en にキーが欠けていると型エラーになることの確認
export const broken: Messages = { header: { title: "", login: "", mypage: "", logout: "" }, plans: { index: { confirmDelete: "" }, publicFalse: "" } };
