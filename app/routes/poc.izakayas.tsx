import { env } from "cloudflare:workers";
import { useFetcher } from "react-router";
import type { Route } from "./+types/poc.izakayas";
import { getPrisma } from "../lib/db.server";
import { searchIzakayas } from "../lib/izakaya.server";

const USER_ID = 1; // PoC: ログインの代わり

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const tagIds = url.searchParams.getAll("tag").map(Number).filter(Boolean);
  const prisma = getPrisma(env.DB);
  const izakayas = await searchIzakayas(prisma, { tagIds, name: url.searchParams.get("name") ?? undefined });
  const favs = await prisma.favorite.findMany({ where: { userId: USER_ID }, select: { izakayaId: true } });
  const favSet = new Set(favs.map((f) => f.izakayaId));
  return {
    izakayas: izakayas.map((i) => ({ id: i.id, name: i.name, tags: i.tags.map((t) => t.tag.name), favorite: favSet.has(i.id) })),
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const izakayaId = Number(form.get("izakayaId"));
  const favorite = form.get("favorite") === "true";
  const delay = Number(new URL(request.url).searchParams.get("delay") ?? 0);
  if (delay) await new Promise((r) => setTimeout(r, delay));
  // 冪等: 2回押されてもエラーにしない（現行のバグの修正）
  if (favorite) {
    await env.DB.prepare("INSERT OR IGNORE INTO favorites (user_id, izakaya_id) VALUES (?1, ?2)").bind(USER_ID, izakayaId).run();
  } else {
    await env.DB.prepare("DELETE FROM favorites WHERE user_id = ?1 AND izakaya_id = ?2").bind(USER_ID, izakayaId).run();
  }
  return { ok: true };
}

function FavoriteButton({ id, favorite }: { id: number; favorite: boolean }) {
  const fetcher = useFetcher();
  // 楽観的更新: 送信中は送ろうとしている値を表示する
  const shown = fetcher.formData ? fetcher.formData.get("favorite") === "true" : favorite;
  return (
    <fetcher.Form method="post" action="?delay=1500">
      <input type="hidden" name="izakayaId" value={id} />
      <input type="hidden" name="favorite" value={String(!shown)} />
      <button type="submit" data-testid={`fav-${id}`} aria-pressed={shown}>
        {shown ? "♥" : "♡"}
      </button>
    </fetcher.Form>
  );
}

export default function PocIzakayas({ loaderData }: Route.ComponentProps) {
  return (
    <ul>
      {loaderData.izakayas.map((i) => (
        <li key={i.id}>
          {i.name}（{i.tags.join("・")}）<FavoriteButton id={i.id} favorite={i.favorite} />
        </li>
      ))}
    </ul>
  );
}
