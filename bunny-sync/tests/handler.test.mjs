import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { webcrypto } from "node:crypto";
import { createSyncHandler, EMPTY_STATE, validateState } from "../handler.mjs";

class SQLiteAdapter {
  constructor() {
    this.sqlite = new DatabaseSync(":memory:");
    this.sqlite.exec(readFileSync(new URL("../schema.sql", import.meta.url), "utf8"));
  }

  prepare(sql) {
    const sqlite = this.sqlite;
    const makeStatement = (params) => ({
      sql,
      params,
      first: async () => sqlite.prepare(sql).get(...params) ?? null,
      all: async () => sqlite.prepare(sql).all(...params),
      run: async () => {
        const result = sqlite.prepare(sql).run(...params);
        return { rowsAffected: Number(result.changes), lastInsertRowid: result.lastInsertRowid };
      },
    });
    return {
      bind: (...params) => makeStatement(params),
      ...makeStatement([]),
    };
  }

  async batch(statements, options = {}) {
    this.sqlite.exec(options.mode === "immediate" ? "BEGIN IMMEDIATE" : "BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }
}

function harness(overrides = {}) {
  const db = new SQLiteAdapter();
  let currentTime = 1_800_000_000_000;
  const handler = createSyncHandler(db, {
    crypto: webcrypto,
    setupCode: "pat-synced-phone-setup-code-very-long",
    now: () => currentTime,
    ...overrides,
  });
  const request = async (method, path, body, token) => {
    const headers = new Headers();
    if (body !== undefined) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await handler(new Request(`https://sync.example.com${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }));
    return { status: response.status, body: await response.json(), response };
  };
  const bootstrap = async () => request("POST", "/v1/device/bootstrap", {
    setupCode: "pat-synced-phone-setup-code-very-long",
    deviceName: "Pat's phone",
  });
  return { db, request, bootstrap, advance: (ms) => { currentTime += ms; } };
}

test("only whitelisted sync state fields are accepted", () => {
  assert.equal(validateState(EMPTY_STATE), JSON.stringify(EMPTY_STATE));
  assert.equal(validateState({ ...EMPTY_STATE, secret: "never stored" }), null);
  assert.equal(validateState({ ...EMPTY_STATE, sourceFilter: "unknown" }), null);
  assert.equal(validateState({ ...EMPTY_STATE, progress: [{ provider: "rumble", id: "v123", positionMs: 42, durationMs: 99, updatedAtMs: 1234 }] }) !== null, true);
  assert.equal(validateState({ ...EMPTY_STATE, channels: [{ provider: "rumble", id: "id", name: "Channel", subscribed: true, order: 0 }] }) !== null, true);
  assert.equal(validateState({ ...EMPTY_STATE, sidebar: [{ provider: "section", id: "home", label: "Home", order: 0, pinned: true }] }) !== null, true);
});

test("initial phone setup requires a server-side setup code", async () => {
  const h = harness();
  const health = await h.request("GET", "/health");
  assert.equal(health.status, 200);
  const denied = await h.request("POST", "/v1/device/bootstrap", { setupCode: "wrong", deviceName: "Phone" });
  assert.equal(denied.status, 401);
  const created = await h.bootstrap();
  assert.equal(created.status, 201);
  assert.match(created.body.deviceToken, /^[0-9a-f]{64}$/);
  const state = await h.request("GET", "/v1/state", undefined, created.body.deviceToken);
  assert.equal(state.status, 200);
  assert.equal(state.body.revision, 0);
  assert.deepEqual(state.body.state, EMPTY_STATE);
});

test("TV pairs by code from the phone without learning the setup code", async () => {
  const h = harness();
  const phone = await h.bootstrap();
  const start = await h.request("POST", "/v1/pair/start");
  assert.equal(start.status, 201);
  assert.match(start.body.code, /^\d{10}$/);
  assert.match(start.body.pendingToken, /^[a-f0-9]{64}$/);
  const wait = await h.request("GET", "/v1/pair/status", undefined, start.body.pendingToken);
  assert.deepEqual(wait.body, { status: "pending" });

  const denied = await h.request("POST", "/v1/pair/approve", { code: start.body.code });
  assert.equal(denied.status, 401);
  const approved = await h.request("POST", "/v1/pair/approve", { code: start.body.code }, phone.body.deviceToken);
  assert.equal(approved.status, 200);
  assert.equal(approved.body.status, "approved");
  const tv = await h.request("GET", "/v1/pair/status", undefined, start.body.pendingToken);
  assert.deepEqual(tv.body, { status: "approved" });
  const tvState = await h.request("GET", "/v1/state", undefined, start.body.pendingToken);
  assert.equal(tvState.status, 200);
  assert.deepEqual(tvState.body.state, EMPTY_STATE);
});

test("a paired TV gets channel order and has conflict-safe updates", async () => {
  const h = harness();
  const phone = await h.bootstrap();
  const start = await h.request("POST", "/v1/pair/start");
  await h.request("POST", "/v1/pair/approve", { code: start.body.code }, phone.body.deviceToken);
  const nextState = {
    sourceFilter: "both",
    channels: [{ provider: "rumble", id: "AskRSB", name: "The Robert Scott Bell Show", subscribed: true, order: 0 }],
    sidebar: [{ provider: "rumble", id: "AskRSB", label: "The Robert Scott Bell Show", pinned: true, order: 1 }],
    progress: [{ provider: "rumble", id: "v123", positionMs: 12000, durationMs: 30000, updatedAtMs: 1800000000000 }],
  };
  const updated = await h.request("PUT", "/v1/state", { revision: 0, state: nextState }, phone.body.deviceToken);
  assert.equal(updated.status, 200);
  assert.equal(updated.body.revision, 1);

  const tv = await h.request("GET", "/v1/state", undefined, start.body.pendingToken);
  assert.equal(tv.status, 200);
  assert.deepEqual(tv.body.state, nextState);

  const stale = await h.request("PUT", "/v1/state", { revision: 0, state: EMPTY_STATE }, start.body.pendingToken);
  assert.equal(stale.status, 409);
  assert.equal(stale.body.revision, 1);
  assert.deepEqual(stale.body.state, nextState);

  const retry = await h.request("PUT", "/v1/state", { revision: 1, state: EMPTY_STATE }, start.body.pendingToken);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.revision, 2);
});

test("pairing codes expire, while approved device tokens remain valid", async () => {
  const h = harness();
  const phone = await h.bootstrap();
  const start = await h.request("POST", "/v1/pair/start");
  h.advance(301_000);
  const status = await h.request("GET", "/v1/pair/status", undefined, start.body.pendingToken);
  assert.equal(status.status, 410);
  const approved = await h.request("POST", "/v1/pair/approve", { code: start.body.code }, phone.body.deviceToken);
  assert.equal(approved.status, 404);
});

test("large/invalid state and malformed requests cannot be stored", async () => {
  const h = harness();
  const phone = await h.bootstrap();
  const wrong = await h.request("PUT", "/v1/state", { revision: 0, state: { ...EMPTY_STATE, accountKey: "leak" } }, phone.body.deviceToken);
  assert.equal(wrong.status, 400);
  const huge = await h.request("PUT", "/v1/state", { revision: 0, state: { ...EMPTY_STATE, channels: Array(600).fill({ provider: "rumble", id: "x", name: "x", subscribed: true, order: 0 }) } }, phone.body.deviceToken);
  assert.ok([400, 413].includes(huge.status));
});

test("Rumble search requires authorization and keeps its API key on the server", async () => {
  const requests = [];
  const h = harness({
    rumbleApiKey: "private-provider-key",
    fetch: async (url, options) => {
      requests.push({ url: String(url), headers: options.headers });
      return Response.json({
        videos: [{
          id: "v123", title: "An interview", url: "https://rumble.com/v123",
          thumbnail: "https://images.rumble.com/example.jpg", duration_s: 91,
          files: [{ type: "hls", url: "https://video.rumble.com/stream.m3u8" }],
          channel: { id: "pat", name: "Pat's Channel", url: "https://rumble.com/c/pat" },
        }],
      });
    },
  });
  const unauthorized = await h.request("GET", "/v1/rumble/search?q=an+interview");
  assert.equal(unauthorized.status, 401);
  const phone = await h.bootstrap();
  const first = await h.request("GET", "/v1/rumble/search?q=an+interview", undefined, phone.body.deviceToken);
  assert.equal(first.status, 200);
  assert.equal(first.body.videos[0].provider, "rumble");
  assert.equal(first.body.videos[0].streamUrl, "https://video.rumble.com/stream.m3u8");
  assert.equal(JSON.stringify(first.body).includes("private-provider-key"), false);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].headers["x-api-key"], "private-provider-key");
  const cached = await h.request("GET", "/v1/rumble/search?q=an+interview", undefined, phone.body.deviceToken);
  assert.equal(cached.status, 200);
  assert.equal(cached.body.cached, true);
  assert.equal(requests.length, 1);
});

test("Rumble channel discovery rejects arbitrary URLs and needs a server key", async () => {
  const h = harness();
  const phone = await h.bootstrap();
  const bad = await h.request("GET", "/v1/rumble/channel?url=https%3A%2F%2Fexample.com%2Fc%2Ffoo", undefined, phone.body.deviceToken);
  assert.equal(bad.status, 400);
  const noKey = await h.request("GET", "/v1/rumble/channel?url=https%3A%2F%2Frumble.com%2Fc%2Fpat", undefined, phone.body.deviceToken);
  assert.equal(noKey.status, 503);
});

test("Rumble Home can discover live videos before any channels are followed", async () => {
  const requests = [];
  const h = harness({
    rumbleApiKey: "server-only-rumble-key",
    fetch: async (url) => {
      requests.push(String(url));
      return Response.json({ streams: [{
        id: "v79xhhm", title: "Live event", live: true,
        url: "https://rumble.com/v79xhhm-live-event.html",
      }], next_page: 2 });
    },
  });
  assert.equal((await h.request("GET", "/v1/rumble/live")).status, 401);
  const phone = await h.bootstrap();
  const token = phone.body.deviceToken;
  const feed = await h.request("GET", "/v1/rumble/live", undefined, token);
  assert.equal(feed.status, 200);
  assert.equal(feed.body.videos[0].id, "v79xhhm");
  assert.equal(feed.body.videos[0].live, true);
  assert.equal(feed.body.nextPage, 2);
  assert.equal((await h.request("GET", "/v1/rumble/live", undefined, token)).body.cached, true);
  assert.deepEqual(requests, ["https://api.api.sh/rumble/v1/live?page=1"]);
});

test("Rumble search cards without streams resolve playable media on opening", async () => {
  const requests = [];
  const h = harness({
    rumbleApiKey: "server-only-rumble-key",
    fetch: async (url) => {
      const endpoint = new URL(String(url));
      requests.push(endpoint);
      if (endpoint.pathname.endsWith("/search")) return Response.json({ videos: [{
        id: "v79xhhm", title: "Example", duration: "1:02:03",
        url: "https://rumble.com/v79xhhm-example.html",
        thumbnail: "https://hugh.cdn.rumble.cloud/example.jpg",
        channel: { name: "Example Channel", url: "https://rumble.com/c/ExampleChannel" },
      }] });
      return Response.json({
        id: "v79xhhm", title: "Example", duration_s: 3723,
        url: "https://rumble.com/v79xhhm-example.html",
        hls: "https://rumble.com/hls-vod/example/playlist.m3u8",
        channel: { name: "Example Channel", url: "https://rumble.com/c/ExampleChannel" },
        files: [
          { kind: "tar", url: "https://hugh.cdn.rumble.cloud/video.tar?r_file=chunklist.m3u8" },
          { type: "mp4", url: "https://hugh.cdn.rumble.cloud/video.mp4", quality_text: "720p" },
        ],
      });
    },
  });
  const phone = await h.bootstrap();
  const token = phone.body.deviceToken;
  const listing = await h.request("GET", "/v1/rumble/search?q=example", undefined, token);
  assert.equal(listing.status, 200);
  assert.equal(listing.body.videos[0].durationMs, 3723000);
  assert.equal(listing.body.videos[0].streamUrl, null);
  const address = encodeURIComponent(listing.body.videos[0].url);
  const resolved = await h.request("GET", `/v1/rumble/video?url=${address}`, undefined, token);
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.video.streamUrl, "https://rumble.com/hls-vod/example/playlist.m3u8");
  assert.equal(resolved.body.video.files.length, 1);
  assert.equal(resolved.body.video.files[0].type, "mp4");
  assert.equal(JSON.stringify(resolved.body).includes("server-only-rumble-key"), false);
  assert.ok(requests[1].pathname.endsWith("/rumble/v1/video"));
  assert.equal(requests[1].searchParams.get("url"), "https://rumble.com/v79xhhm-example.html");
  const cached = await h.request("GET", `/v1/rumble/video?url=${address}`, undefined, token);
  assert.equal(cached.status, 200);
  assert.equal(cached.body.cached, true);
  assert.equal(requests.length, 2);
});

test("Rumble video detail blocks other origins and unpaired users", async () => {
  const h = harness();
  const address = encodeURIComponent("https://rumble.com/v79xhhm-example.html");
  const denied = await h.request("GET", `/v1/rumble/video?url=${address}`);
  assert.equal(denied.status, 401);
  const phone = await h.bootstrap();
  const bad = await h.request("GET", `/v1/rumble/video?url=${encodeURIComponent("https://example.com/v79xhhm")}`,
    undefined, phone.body.deviceToken);
  assert.equal(bad.status, 400);
  const unavailable = await h.request("GET", `/v1/rumble/video?url=${address}`, undefined, phone.body.deviceToken);
  assert.equal(unavailable.status, 503);
});
