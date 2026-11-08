import { DatabaseSync } from "node:sqlite";
import { chmodSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const SCHEMA = readFileSync(new URL("../bunny-sync/schema.sql", import.meta.url), "utf8");

/**
 * The same small SQL interface used by the existing phone and TV sync handler.
 * Calls are synchronous under the hood, so batches remain atomic even when
 * multiple HTTP requests arrive at the same time.
 */
export class SQLiteAdapter {
  constructor(filename) {
    if (!filename || typeof filename !== "string") {
      throw new Error("A SQLite database filename is required");
    }
    const memory = filename === ":memory:";
    const path = memory ? filename : resolve(filename);
    if (!memory) mkdirSync(dirname(path), { recursive: true, mode: 0o700 });

    this.sqlite = new DatabaseSync(path);
    if (!memory) chmodSync(path, 0o600);
    this.sqlite.exec("PRAGMA busy_timeout = 5000");
    this.sqlite.exec("PRAGMA foreign_keys = ON");
    if (!memory) this.sqlite.exec("PRAGMA journal_mode = WAL");
    this.sqlite.exec(SCHEMA);
  }

  prepare(sql) {
    const statement = this.sqlite.prepare(sql);
    const bound = (parameters) => {
      const runSync = () => {
        const change = statement.run(...parameters);
        return { rowsAffected: Number(change.changes), lastInsertRowid: change.lastInsertRowid };
      };
      return {
        first: async () => statement.get(...parameters) ?? null,
        all: async () => statement.all(...parameters),
        run: async () => runSync(),
        runSync,
      };
    };
    return { bind: (...parameters) => bound(parameters), ...bound([]) };
  }

  async batch(statements, options = {}) {
    this.sqlite.exec(options.mode === "immediate" ? "BEGIN IMMEDIATE" : "BEGIN");
    try {
      const results = statements.map((statement) => statement.runSync());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  close() {
    this.sqlite.close();
  }
}
