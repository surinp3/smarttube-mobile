import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createSyncServer } from "../server.mjs";
import { SQLiteAdapter } from "../sqlite.mjs";

const SETUP_CODE = "local-test-setup-code-very-long-and-private";

async function listen(dbFile, options = {}) {
  const database = new SQLiteAdapter(dbFile);
  const server = createSyncServer({ database, setupCode: SETUP_CODE, ...options });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  let stopped = false;
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    close: async () => {
      if (stopped) return;
      stopped = true;
      const closed = once(server, "close");
      server.close();
      await closed;
      database.close();
    },
  };
}

async function call(baseUrl, method, path, body, token) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json(), response };
}

test("VPS service authenticates phone, pairs TV, and persists settings across restarts", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "smarttube-vps-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const dbFile = join(directory, "sync.sqlite");
  const first = await listen(dbFile);
  t.after(() => first.close().catch(() => {}));

  const health = await call(first.baseUrl, "GET", "/health");
  assert.equal(health.status, 200);
  const badSetup = await call(first.baseUrl, "POST", "/v1/device/bootstrap", {
    setupCode: "wrong", deviceName: "Phone",
  });
  assert.equal(badSetup.status, 401);
  const phone = await call(first.baseUrl, "POST", "/v1/device/bootstrap", {
    setupCode: SETUP_CODE, deviceName: "Pat phone",
  });
  assert.equal(phone.status, 201);
  const token = phone.body.deviceToken;
  assert.match(token, /^[a-f0-9]{64}$/);

  const pairing = await call(first.baseUrl, "POST", "/v1/pair/start");
  assert.equal(pairing.status, 201);
  assert.match(pairing.body.code, /^\d{10}$/);
  const approved = await call(first.baseUrl, "POST", "/v1/pair/approve", {
    code: pairing.body.code,
  }, token);
  assert.equal(approved.status, 200);

  const state = {
    sourceFilter: "both",
    channels: [{ provider: "rumble", id: "channel1", name: "Channel One", subscribed: true, order: 0 }],
    sidebar: [{ provider: "rumble", id: "channel1", label: "Channel One", pinned: true, order: 0 }],
    progress: [{ provider: "rumble", id: "video1", positionMs: 12000, durationMs: 50000, updatedAtMs: Date.now() }],
  };
  const saved = await call(first.baseUrl, "PUT", "/v1/state", { revision: 0, state }, token);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.revision, 1);
  const tvState = await call(first.baseUrl, "GET", "/v1/state", undefined, pairing.body.pendingToken);
  assert.deepEqual(tvState.body.state, state);
  const conflict = await call(first.baseUrl, "PUT", "/v1/state", { revision: 0, state }, token);
  assert.equal(conflict.status, 409);

  await first.close();
  const second = await listen(dbFile);
  t.after(() => second.close().catch(() => {}));
  const restored = await call(second.baseUrl, "GET", "/v1/state", undefined, pairing.body.pendingToken);
  assert.equal(restored.status, 200);
  assert.equal(restored.body.revision, 1);
  assert.deepEqual(restored.body.state, state);
});

test("VPS service rejects unconfigured secrets and oversized HTTP requests", async (t) => {
  const db = new SQLiteAdapter(":memory:");
  t.after(() => db.close());
  assert.throws(() => createSyncServer({ database: db, setupCode: "short" }), /SETUP_CODE/);
  const server = createSyncServer({ database: db, setupCode: SETUP_CODE });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    const closed = once(server, "close");
    server.close();
    await closed;
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/v1/device/bootstrap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ setupCode: SETUP_CODE, deviceName: "x".repeat(100_000) }),
  });
  assert.equal(response.status, 413);
});
