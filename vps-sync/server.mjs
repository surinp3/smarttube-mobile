import { createServer } from "node:http";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { webcrypto } from "node:crypto";
import { createSyncHandler } from "../bunny-sync/handler.mjs";
import { SQLiteAdapter } from "./sqlite.mjs";

const MIN_SETUP_LENGTH = 20;

function headersFromNode(request) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value != null) headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  return headers;
}

function sendJsonError(response, status) {
  if (response.headersSent) return response.end();
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify({ error: "Sync service error" }));
}

export function createSyncServer({ database, setupCode, rumbleApiKey = "", onError = console.error } = {}) {
  if (!database) throw new Error("A database adapter is required");
  if (typeof setupCode !== "string" || setupCode.length < MIN_SETUP_LENGTH || setupCode.length > 512) {
    throw new Error("SMARTTUBE_SETUP_CODE must be a secret of 20–512 characters");
  }

  const handler = createSyncHandler(database, {
    crypto: webcrypto,
    setupCode,
    rumbleApiKey,
    onError,
  });

  return createServer(async (incoming, outgoing) => {
    try {
      // Ignore untrusted Host/X-Forwarded-* values when constructing the URL.
      if (!incoming.url?.startsWith("/") || incoming.url.startsWith("//")) {
        return sendJsonError(outgoing, 400);
      }
      const method = incoming.method?.toUpperCase() ?? "GET";
      const requestOptions = { method, headers: headersFromNode(incoming) };
      if (method !== "GET" && method !== "HEAD") {
        requestOptions.body = Readable.toWeb(incoming);
        requestOptions.duplex = "half";
      }
      const request = new Request(`http://127.0.0.1${incoming.url}`, requestOptions);
      const answer = await handler(request);
      const body = Buffer.from(await answer.arrayBuffer());
      for (const [name, value] of answer.headers) outgoing.setHeader(name, value);
      outgoing.statusCode = answer.status;
      outgoing.end(body);
    } catch (error) {
      onError(error);
      sendJsonError(outgoing, 500);
    }
  });
}

export function startSyncServer(environment = process.env) {
  // Keep newly created SQLite files private to the service account.
  process.umask(0o077);
  const dbPath = environment.SMARTTUBE_DB_PATH || "/data/smarttube.sqlite";
  const bind = environment.SMARTTUBE_BIND || "0.0.0.0";
  const port = Number(environment.SMARTTUBE_PORT || 8765);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMARTTUBE_PORT must be a TCP port from 1 to 65535");
  }
  // Reject an unconfigured service before binding its public-facing port.
  const setupCode = environment.SMARTTUBE_SETUP_CODE;
  if (typeof setupCode !== "string" || setupCode.length < MIN_SETUP_LENGTH || setupCode.length > 512) {
    throw new Error("SMARTTUBE_SETUP_CODE must be a secret of 20–512 characters");
  }
  const database = new SQLiteAdapter(dbPath);
  const server = createSyncServer({
    database,
    setupCode,
    rumbleApiKey: environment.APISH_KEY || "",
  });
  server.listen(port, bind, () => {
    console.log(`SmartTube sync listening on ${bind}:${port}`);
  });
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    server.close(() => database.close());
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  return { server, database };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startSyncServer();
}
