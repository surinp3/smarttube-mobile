/**
 * The HTTP protocol for SmartTube phone/TV synchronization.
 *
 * Pure Web APIs + a tiny `db.prepare(...).bind(...).first()/run()` adapter make
 * this testable with an in-memory SQLite database, without Bunny credentials.
 * Never expose the Bunny Database access token to an Android application.
 */

const ACCOUNT_ID = "pat-smarttube";
const PAIR_TTL_MS = 5 * 60 * 1000;
const MAX_BODY_BYTES = 70_000;
const MAX_STATE_BYTES = 65_536;
const MAX_CHANNELS = 500;
const MAX_SIDEBAR = 500;
const MAX_PROGRESS = 2_000;
const PROVIDERS = new Set(["youtube", "rumble"]);
const FILTERS = new Set(["youtube", "rumble", "both"]);

export const EMPTY_STATE = Object.freeze({
  sourceFilter: "both",
  channels: [],
  sidebar: [],
  progress: [],
});

function result(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
      "Vary": "Authorization",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function limitedString(value, maxLength) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function nonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function allowedKeys(value, keys) {
  return Object.keys(value).every((key) => keys.includes(key));
}

/** Only the requested, non-secret fields may ever be synchronized. */
export function validateState(state) {
  if (!isObject(state) ||
      !allowedKeys(state, ["sourceFilter", "channels", "sidebar", "progress"]) ||
      !FILTERS.has(state.sourceFilter) ||
      !Array.isArray(state.channels) || state.channels.length > MAX_CHANNELS ||
      !Array.isArray(state.sidebar) || state.sidebar.length > MAX_SIDEBAR ||
      !Array.isArray(state.progress) || state.progress.length > MAX_PROGRESS) {
    return null;
  }

  for (const channel of state.channels) {
    if (!isObject(channel) ||
        !allowedKeys(channel, ["provider", "id", "name", "subscribed", "order"]) ||
        !PROVIDERS.has(channel.provider) ||
        !limitedString(channel.id, 200) ||
        !limitedString(channel.name, 200) ||
        typeof channel.subscribed !== "boolean" ||
        !nonnegativeInteger(channel.order)) {
      return null;
    }
  }

  for (const item of state.sidebar) {
    if (!isObject(item) ||
        !allowedKeys(item, ["provider", "id", "label", "order", "pinned"]) ||
        !["section", "youtube", "rumble"].includes(item.provider) ||
        !limitedString(item.id, 200) ||
        !limitedString(item.label, 200) ||
        !nonnegativeInteger(item.order) ||
        typeof item.pinned !== "boolean") {
      return null;
    }
  }

  for (const progress of state.progress) {
    if (!isObject(progress) ||
        !allowedKeys(progress, ["provider", "id", "positionMs", "durationMs", "updatedAtMs"]) ||
        !PROVIDERS.has(progress.provider) ||
        !limitedString(progress.id, 200) ||
        !nonnegativeInteger(progress.positionMs) ||
        !nonnegativeInteger(progress.durationMs) ||
        !nonnegativeInteger(progress.updatedAtMs)) {
      return null;
    }
  }

  const json = JSON.stringify(state);
  return new TextEncoder().encode(json).length <= MAX_STATE_BYTES ? json : null;
}

async function parseBody(request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return { error: result(415, { error: "JSON content type required" }) };
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return { error: result(413, { error: "Payload too large" }) };
  }

  const reader = request.body?.getReader();
  if (!reader) return { error: result(400, { error: "Missing JSON body" }) };
  let total = 0;
  const parts = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        return { error: result(413, { error: "Payload too large" }) };
      }
      parts.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.byteLength;
    }
    const data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return { data };
  } catch {
    return { error: result(400, { error: "Invalid JSON" }) };
  } finally {
    reader.releaseLock();
  }
}

function secretEquals(left, right) {
  if (!limitedString(left, 512) || !limitedString(right, 512)) return false;
  // Do not break on the first differing character.
  let difference = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    difference |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return difference === 0;
}

function randomToken(cryptoApi) {
  const bytes = cryptoApi.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomPairCode(cryptoApi) {
  const bytes = cryptoApi.getRandomValues(new Uint8Array(8));
  let number = 0n;
  for (const byte of bytes) number = (number << 8n) | BigInt(byte);
  return (number % 10_000_000_000n).toString().padStart(10, "0");
}

async function sha256(cryptoApi, value) {
  const digest = await cryptoApi.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function bearerToken(request) {
  const header = request.headers.get("authorization");
  const match = /^Bearer ([a-f0-9]{64})$/.exec(header ?? "");
  return match ? match[1] : null;
}

async function getDevice(db, cryptoApi, request) {
  const token = bearerToken(request);
  if (!token) return null;
  const hash = await sha256(cryptoApi, token);
  const device = await db.prepare(
    "SELECT account_id FROM sync_devices WHERE token_hash = ?"
  ).bind(hash).first();
  return device ? { accountId: device.account_id, hash } : null;
}

async function rateLimit(db, name, nowMs, limit, periodMs = 60_000) {
  const bucket = Math.floor(nowMs / periodMs);
  await db.prepare(
    "INSERT INTO sync_rate_limits(name, bucket, attempts) VALUES (?, ?, 1) " +
    "ON CONFLICT(name) DO UPDATE SET bucket = excluded.bucket, " +
    "attempts = CASE WHEN bucket = excluded.bucket THEN attempts + 1 ELSE 1 END"
  ).bind(name, bucket).run();
  const row = await db.prepare("SELECT attempts FROM sync_rate_limits WHERE name = ?")
    .bind(name).first();
  return Number(row?.attempts ?? 0) <= limit;
}

function httpsUrlOrNull(value) {
  if (typeof value !== "string" || value.length > 800) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function durationMilliseconds(value) {
  const seconds = Number(value.duration_s);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  if (typeof value.duration !== "string" || !/^\d{1,3}:\d{2}(?::\d{2})?$/.test(value.duration)) return 0;
  return value.duration.split(":").reduce((total, part) => total * 60 + Number(part), 0) * 1000;
}

function normalizeRumbleVideo(value) {
  if (!isObject(value) || !limitedString(value.id, 100) ||
      !limitedString(value.title, 600)) return null;
  const channel = isObject(value.channel) ? value.channel : {};
  const files = Array.isArray(value.files) ? value.files
    .filter((file) => isObject(file) && httpsUrlOrNull(file.url) &&
      (file.type === "hls" || file.type === "mp4" ||
       /\.(mp4|m3u8)$/i.test(new URL(file.url).pathname)))
    .slice(0, 12)
    .map((file) => ({
      url: httpsUrlOrNull(file.url),
      type: file.type === "hls" || file.url.includes(".m3u8") ? "hls" : "mp4",
      quality: typeof file.quality_text === "string" ? file.quality_text.slice(0, 50) : "",
    })) : [];
  return {
    provider: "rumble",
    id: value.id.slice(0, 100),
    url: httpsUrlOrNull(value.url),
    title: value.title.slice(0, 600),
    thumbnail: httpsUrlOrNull(value.thumbnail),
    durationMs: durationMilliseconds(value),
    publishedAt: typeof value.published_at === "string" ? value.published_at.slice(0, 80) : "",
    live: value.live === true,
    short: value.short === true,
    channelId: String(channel.id ?? value.channel_id ?? "").slice(0, 100),
    channelName: String(channel.name ?? "").slice(0, 200),
    channelUrl: httpsUrlOrNull(channel.url),
    streamUrl: httpsUrlOrNull(value.hls) ?? files[0]?.url ?? null,
    files,
  };
}

function parseRumbleVideoUrl(request) {
  const input = new URL(request.url).searchParams.get("url");
  if (!input || input.length > 400) return null;
  try {
    const video = new URL(input);
    if (video.protocol !== "https:" || video.hostname !== "rumble.com" ||
        !/^\/v[a-zA-Z0-9]{4,100}(?:-[a-zA-Z0-9._-]{1,240})?(?:\.html)?$/.test(video.pathname) ||
        video.search || video.hash) return null;
    return `https://rumble.com${video.pathname}`;
  } catch { return null; }
}

function parseRumbleQuery(request) {
  const url = new URL(request.url);
  const page = url.searchParams.get("page") ?? "1";
  if (!/^[1-9]\d?$/.test(page) || Number(page) > 10) return null;
  if (url.pathname === "/v1/rumble/live") {
    return { mode: "live", page: Number(page), cacheKey: `live:${page}` };
  }
  if (url.pathname === "/v1/rumble/search") {
    const q = url.searchParams.get("q")?.trim();
    if (!q || q.length < 2 || q.length > 100) return null;
    return { mode: "search", query: q, page: Number(page), cacheKey: `s:${q.toLowerCase()}:${page}` };
  }
  const channelUrl = url.searchParams.get("url");
  if (!channelUrl || channelUrl.length > 300) return null;
  try {
    const channel = new URL(channelUrl);
    if (channel.protocol !== "https:" || channel.hostname !== "rumble.com" ||
        !/^\/(c|user)\/[a-zA-Z0-9_-]{2,100}\/?$/.test(channel.pathname) ||
        channel.search || channel.hash) return null;
    const canonicalUrl = `https://rumble.com${channel.pathname.replace(/\/$/, "")}`;
    return { mode: "channel", query: canonicalUrl, page: Number(page),
      cacheKey: `c:${canonicalUrl.toLowerCase()}:${page}` };
  } catch {
    return null;
  }
}

async function rumbleVideos(db, request, config, timestamp) {
  const input = parseRumbleQuery(request);
  if (!input) return result(400, { error: "Invalid Rumble search or channel URL" });
  const cached = await db.prepare("SELECT body_json, expires_at_ms FROM rumble_cache WHERE cache_key = ?")
    .bind(input.cacheKey).first();
  if (cached && cached.expires_at_ms > timestamp) {
    return result(200, { ...JSON.parse(cached.body_json), cached: true });
  }
  if (!limitedString(config.rumbleApiKey, 512)) {
    return result(503, { error: "Rumble discovery API key not configured" });
  }
  // 30 paid lookups/day, under API.SH's advertised 1,000 monthly free calls.
  // This is intentionally conservative; cached responses cost no credits.
  if (!await rateLimit(db, "rumble-fetch", timestamp, 30, 86_400_000)) {
    return result(429, { error: "Daily Rumble lookup allowance reached" });
  }
  const endpoint = input.mode === "channel" ? "channel/videos" : input.mode;
  const upstream = new URL(`https://api.api.sh/rumble/v1/${endpoint}`);
  if (input.query !== undefined) {
    upstream.searchParams.set(input.mode === "search" ? "q" : "url", input.query);
  }
  upstream.searchParams.set("page", String(input.page));
  let response;
  try {
    response = await (config.fetch ?? fetch)(upstream, {
      headers: { "x-api-key": config.rumbleApiKey, "accept": "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    return result(502, { error: "Rumble directory service unreachable" });
  }
  if (!response.ok) return result(502, { error: "Rumble directory service rejected request" });
  let data;
  try { data = await response.json(); }
  catch { return result(502, { error: "Invalid Rumble directory response" }); }
  const videos = input.mode === "live" ? data?.streams : data?.videos;
  if (!isObject(data) || !Array.isArray(videos)) {
    return result(502, { error: "Rumble directory did not return videos" });
  }
  const payload = {
    videos: videos.slice(0, 50).map(normalizeRumbleVideo).filter(Boolean),
    page: input.page,
    nextPage: nonnegativeInteger(data.next_page) ? data.next_page : null,
    channel: input.mode === "channel" && isObject(data.channel) ? {
      name: String(data.channel.name ?? "").slice(0, 200),
      url: httpsUrlOrNull(data.channel.url),
    } : null,
  };
  const text = JSON.stringify(payload);
  if (new TextEncoder().encode(text).length <= 250_000) {
    await db.prepare(
      "INSERT INTO rumble_cache(cache_key, body_json, expires_at_ms) VALUES (?, ?, ?) " +
      "ON CONFLICT(cache_key) DO UPDATE SET body_json = excluded.body_json, expires_at_ms = excluded.expires_at_ms"
    ).bind(input.cacheKey, text, timestamp + 60 * 60 * 1000).run();
  }
  return result(200, { ...payload, cached: false });
}

/** Search results do not contain media URLs; resolve streams only when a video is opened. */
async function rumbleVideo(db, request, config, timestamp) {
  const videoUrl = parseRumbleVideoUrl(request);
  if (!videoUrl) return result(400, { error: "Invalid Rumble video URL" });
  const cacheKey = `v:${videoUrl.toLowerCase()}`;
  const cached = await db.prepare("SELECT body_json, expires_at_ms FROM rumble_cache WHERE cache_key = ?")
    .bind(cacheKey).first();
  if (cached && cached.expires_at_ms > timestamp)
    return result(200, { ...JSON.parse(cached.body_json), cached: true });
  if (!limitedString(config.rumbleApiKey, 512))
    return result(503, { error: "Rumble video API key not configured" });
  if (!await rateLimit(db, "rumble-fetch", timestamp, 30, 86_400_000))
    return result(429, { error: "Daily Rumble lookup allowance reached" });
  const upstream = new URL("https://api.api.sh/rumble/v1/video");
  upstream.searchParams.set("url", videoUrl);
  let response;
  try {
    response = await (config.fetch ?? fetch)(upstream, {
      headers: { "x-api-key": config.rumbleApiKey, accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
  } catch { return result(502, { error: "Rumble video service unreachable" }); }
  if (!response.ok) return result(502, { error: "Rumble video service rejected request" });
  let data;
  try { data = await response.json(); }
  catch { return result(502, { error: "Invalid Rumble video response" }); }
  const video = normalizeRumbleVideo(data);
  if (!video || !video.streamUrl)
    return result(502, { error: "Rumble did not provide a playable media stream" });
  const payload = { video };
  const body = JSON.stringify(payload);
  await db.prepare(
    "INSERT INTO rumble_cache(cache_key, body_json, expires_at_ms) VALUES (?, ?, ?) " +
    "ON CONFLICT(cache_key) DO UPDATE SET body_json = excluded.body_json, expires_at_ms = excluded.expires_at_ms"
  ).bind(cacheKey, body, timestamp + 10 * 60 * 1000).run();
  return result(200, { ...payload, cached: false });
}

/**
 * Construct an HTTP handler. A server-side setup code is only used from the
 * phone on its first sign-in or when recovering a lost phone. It is never put
 * into an APK or transmitted to the Google TV device.
 */
export function createSyncHandler(db, config = {}) {
  const cryptoApi = config.crypto ?? crypto;
  const now = config.now ?? (() => Date.now());
  const setupCode = config.setupCode;
  const onError = config.onError ?? (() => {});

  return async (request) => {
    const path = new URL(request.url).pathname.replace(/\/$/, "");
    const method = request.method.toUpperCase();
    if (path === "/health" && method === "GET") {
      return result(200, { ok: true, service: "smarttube-bunny-sync", version: 1 });
    }

    try {
      if (path === "/v1/device/bootstrap" && method === "POST") {
        if (!limitedString(setupCode, 512) || setupCode.length < 20) {
          return result(503, { error: "Server setup code not configured" });
        }
        if (!await rateLimit(db, "bootstrap", now(), 20)) {
          return result(429, { error: "Too many attempts; retry later" });
        }
        const parsed = await parseBody(request);
        if (parsed.error) return parsed.error;
        const body = parsed.data;
        if (!isObject(body) || !secretEquals(body.setupCode, setupCode) ||
            !limitedString(body.deviceName, 80)) {
          return result(401, { error: "Invalid setup code or device name" });
        }
        const token = randomToken(cryptoApi);
        const hash = await sha256(cryptoApi, token);
        const timestamp = now();
        const defaultState = JSON.stringify(EMPTY_STATE);
        await db.batch([
          db.prepare("INSERT OR IGNORE INTO sync_accounts(id, created_at_ms) VALUES (?, ?)")
            .bind(ACCOUNT_ID, timestamp),
          db.prepare("INSERT OR IGNORE INTO sync_state(account_id, revision, body_json, updated_at_ms) VALUES (?, 0, ?, ?)")
            .bind(ACCOUNT_ID, defaultState, timestamp),
          db.prepare("INSERT INTO sync_devices(token_hash, account_id, device_name, created_at_ms, last_seen_ms) VALUES (?, ?, ?, ?, ?)")
            .bind(hash, ACCOUNT_ID, body.deviceName, timestamp, timestamp),
        ], { mode: "immediate" });
        return result(201, { deviceToken: token, revision: 0 });
      }

      if (path === "/v1/pair/start" && method === "POST") {
        if (!await rateLimit(db, "pair-start", now(), 30)) {
          return result(429, { error: "Too many pairing requests; retry later" });
        }
        const timestamp = now();
        await db.prepare("DELETE FROM sync_pairings WHERE expires_at_ms < ?")
          .bind(timestamp).run();
        const token = randomToken(cryptoApi);
        const tokenHash = await sha256(cryptoApi, token);
        let code;
        // An extremely rare code collision should never become a 500 response.
        for (let attempts = 0; attempts < 4; attempts++) {
          code = randomPairCode(cryptoApi);
          const codeHash = await sha256(cryptoApi, code);
          const exists = await db.prepare("SELECT code_hash FROM sync_pairings WHERE code_hash = ?")
            .bind(codeHash).first();
          if (exists) continue;
          await db.prepare("INSERT INTO sync_pairings(code_hash, pending_token_hash, created_at_ms, expires_at_ms) VALUES (?, ?, ?, ?)")
            .bind(codeHash, tokenHash, timestamp, timestamp + PAIR_TTL_MS).run();
          return result(201, { code, pendingToken: token, expiresInSeconds: 300 });
        }
        return result(503, { error: "Unable to generate a unique pairing code" });
      }

      if (path === "/v1/pair/status" && method === "GET") {
        const token = bearerToken(request);
        if (!token) return result(401, { error: "Missing device token" });
        const hash = await sha256(cryptoApi, token);
        const active = await db.prepare("SELECT account_id FROM sync_devices WHERE token_hash = ?")
          .bind(hash).first();
        if (active) return result(200, { status: "approved" });
        const pending = await db.prepare("SELECT expires_at_ms FROM sync_pairings WHERE pending_token_hash = ?")
          .bind(hash).first();
        return pending && pending.expires_at_ms > now()
          ? result(200, { status: "pending" })
          : result(410, { status: "expired" });
      }

      const device = await getDevice(db, cryptoApi, request);
      if (!device) return result(401, { error: "Device is not paired" });

      if ((path === "/v1/rumble/search" || path === "/v1/rumble/channel" || path === "/v1/rumble/live") && method === "GET") {
        return rumbleVideos(db, request, config, now());
      }
      if (path === "/v1/rumble/video" && method === "GET") {
        return rumbleVideo(db, request, config, now());
      }

      if (path === "/v1/pair/approve" && method === "POST") {
        if (!await rateLimit(db, "pair-approve", now(), 30)) {
          return result(429, { error: "Too many pairing attempts; retry later" });
        }
        const parsed = await parseBody(request);
        if (parsed.error) return parsed.error;
        const rawCode = parsed.data?.code;
        const code = typeof rawCode === "string" ? rawCode.replace(/[\s-]/g, "") : "";
        if (!/^\d{10}$/.test(code)) return result(400, { error: "10-digit pairing code required" });
        const codeHash = await sha256(cryptoApi, code);
        const pair = await db.prepare(
          "SELECT pending_token_hash FROM sync_pairings WHERE code_hash = ? AND expires_at_ms > ?"
        ).bind(codeHash, now()).first();
        if (!pair) return result(404, { error: "Pairing code unknown or expired" });
        const timestamp = now();
        const activation = await db.batch([
          db.prepare(
            "INSERT INTO sync_devices(token_hash, account_id, device_name, created_at_ms, last_seen_ms) " +
            "SELECT pending_token_hash, ?, 'Google TV', ?, ? FROM sync_pairings " +
            "WHERE code_hash = ? AND expires_at_ms > ?"
          ).bind(device.accountId, timestamp, timestamp, codeHash, timestamp),
          db.prepare("DELETE FROM sync_pairings WHERE code_hash = ?")
            .bind(codeHash),
        ], { mode: "immediate" });
        if (Number(activation[0]?.rowsAffected ?? 0) !== 1) {
          return result(404, { error: "Pairing code unknown or expired" });
        }
        return result(200, { status: "approved" });
      }

      if (path === "/v1/state" && method === "GET") {
        const row = await db.prepare(
          "SELECT revision, body_json, updated_at_ms FROM sync_state WHERE account_id = ?"
        ).bind(device.accountId).first();
        if (!row) return result(404, { error: "Sync account not initialized" });
        return result(200, {
          revision: Number(row.revision),
          state: JSON.parse(row.body_json),
          updatedAtMs: Number(row.updated_at_ms),
        });
      }

      if (path === "/v1/state" && method === "PUT") {
        const parsed = await parseBody(request);
        if (parsed.error) return parsed.error;
        const revision = parsed.data?.revision;
        const json = validateState(parsed.data?.state);
        if (!nonnegativeInteger(revision) || json === null) {
          return result(400, { error: "Invalid revision or sync state" });
        }
        const timestamp = now();
        const update = await db.prepare(
          "UPDATE sync_state SET revision = revision + 1, body_json = ?, updated_at_ms = ? " +
          "WHERE account_id = ? AND revision = ?"
        ).bind(json, timestamp, device.accountId, revision).run();
        if (update.rowsAffected === 1) {
          return result(200, { revision: revision + 1, updatedAtMs: timestamp });
        }
        const latest = await db.prepare(
          "SELECT revision, body_json, updated_at_ms FROM sync_state WHERE account_id = ?"
        ).bind(device.accountId).first();
        return result(409, {
          error: "Revision conflict; merge latest state and retry",
          revision: Number(latest.revision),
          state: JSON.parse(latest.body_json),
          updatedAtMs: Number(latest.updated_at_ms),
        });
      }

      return result(404, { error: "Unknown sync endpoint" });
    } catch (error) {
      onError(error);
      return result(500, { error: "Sync service error" });
    }
  };
}
