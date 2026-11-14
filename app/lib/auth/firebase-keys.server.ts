import { importX509 } from "jose";

/** Firebase の ID トークンの署名を確かめる公開鍵（X.509 証明書の形で配られる） */
export const FIREBASE_CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

type Fetcher = (input: string) => Promise<Response>;

export interface KeyStoreOptions {
  fetcher?: Fetcher;
  now?: () => number;
  /** Cache-Control に max-age が無いときの保持時間 */
  defaultMaxAgeSeconds?: number;
  /**
   * 知らない kid が来たときに取り直す間隔の下限。
   * 鍵の入れ替わりには追従したいが、でたらめな kid を送り続けられて Google に取りに行き続けるのは避ける。
   */
  minRefetchIntervalSeconds?: number;
}

export interface KeyStore {
  /** kid に対応する鍵。無ければ null */
  get(kid: string): Promise<CryptoKey | null>;
  /** テスト用: 証明書の取得回数 */
  readonly fetchCount: number;
}

interface CachedKeys {
  keys: Map<string, CryptoKey>;
  expiresAt: number;
  fetchedAt: number;
}

export function parseMaxAge(cacheControl: string | null): number | null {
  const m = cacheControl?.match(/(?:^|,)\s*max-age=(\d+)/i);
  return m ? Number(m[1]) : null;
}

/**
 * 公開鍵を Cache-Control の max-age に従って保持する。
 * Workers では isolate が生きている間だけモジュールの変数が残るので、isolate ごとに1回取りに行く。
 */
export function createKeyStore(options: KeyStoreOptions = {}): KeyStore {
  const fetcher = options.fetcher ?? ((url: string) => fetch(url));
  const now = options.now ?? Date.now;
  const defaultMaxAge = options.defaultMaxAgeSeconds ?? 3600;
  const minRefetch = (options.minRefetchIntervalSeconds ?? 60) * 1000;

  let cached: CachedKeys | null = null;
  let inflight: Promise<CachedKeys> | null = null;
  let fetchCount = 0;

  async function load(): Promise<CachedKeys> {
    fetchCount++;
    const res = await fetcher(FIREBASE_CERTS_URL);
    if (!res.ok) throw new Error(`公開鍵の取得に失敗した（HTTP ${res.status}）`);
    const body = (await res.json()) as Record<string, string>;
    const keys = new Map<string, CryptoKey>();
    for (const [kid, pem] of Object.entries(body)) {
      keys.set(kid, await importX509(pem, "RS256"));
    }
    if (keys.size === 0) throw new Error("公開鍵が1本も無い");
    const t = now();
    const maxAge = parseMaxAge(res.headers.get("cache-control")) ?? defaultMaxAge;
    return { keys, fetchedAt: t, expiresAt: t + maxAge * 1000 };
  }

  async function refresh(): Promise<CachedKeys> {
    // 同時に来たリクエストで何度も取りに行かない
    inflight ??= load().finally(() => {
      inflight = null;
    });
    cached = await inflight;
    return cached;
  }

  return {
    get fetchCount() {
      return fetchCount;
    },
    async get(kid) {
      let current = cached && cached.expiresAt > now() ? cached : await refresh();
      const key = current.keys.get(kid);
      if (key) return key;
      // 知らない kid: 鍵が入れ替わった可能性があるので、間隔を空けて1回だけ取り直す
      if (now() - current.fetchedAt >= minRefetch) {
        current = await refresh();
        return current.keys.get(kid) ?? null;
      }
      return null;
    },
  };
}
