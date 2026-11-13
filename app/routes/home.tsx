import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [{ title: "西成泥酔旅行" }];
}

// F1（基盤と静的ページ）で現行のトップページに置き換える
export default function Home() {
  return <main className="p-8">西成泥酔旅行（TS版・準備中）</main>;
}
