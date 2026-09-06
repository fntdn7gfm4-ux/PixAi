import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { readFile, mkdir, readdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import worker from "../server/worker.mjs";
await mkdir(".local", { recursive: true });
const sqlite = new DatabaseSync(".local/pixai.sqlite");
sqlite.exec(
  "CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY)",
);
for (const file of (await readdir("drizzle"))
  .filter((f) => f.endsWith(".sql"))
  .sort()) {
  if (
    !sqlite.prepare("SELECT name FROM _local_migrations WHERE name=?").get(file)
  ) {
    sqlite.exec("BEGIN");
    try {
      sqlite.exec(await readFile(`drizzle/${file}`, "utf8"));
      sqlite.prepare("INSERT INTO _local_migrations VALUES (?)").run(file);
      sqlite.exec("COMMIT");
    } catch (e) {
      sqlite.exec("ROLLBACK");
      throw e;
    }
  }
}
export function d1(database) {
  return {
    prepare(sql) {
      let args = [];
      return {
        bind(...a) {
          args = a;
          return this;
        },
        async first() {
          return database.prepare(sql).get(...args) || null;
        },
        async all() {
          return { results: database.prepare(sql).all(...args) };
        },
        async run() {
          const r = database.prepare(sql).run(...args);
          return { success: true, meta: { changes: Number(r.changes) } };
        },
      };
    },
    async batch(items) {
      database.exec("BEGIN");
      try {
        const r = [];
        for (const item of items) r.push(await item.run());
        database.exec("COMMIT");
        return r;
      } catch (e) {
        database.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};
const env = {
  ...process.env,
  DB: d1(sqlite),
  ASSETS: {
    async fetch(request) {
      let path = decodeURIComponent(new URL(request.url).pathname);
      if (path.endsWith("/")) path += "index.html";
      const base = resolve("public"),
        file = resolve(base, "." + path);
      if (!file.startsWith(base + "\\") && !file.startsWith(base + "/"))
        return new Response("Not found", { status: 404 });
      try {
        return new Response(await readFile(file), {
          headers: {
            "content-type": types[extname(file)] || "application/octet-stream",
          },
        });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    },
  },
};
const port = Number(process.env.PORT || 4173);
createServer(async (req, res) => {
  try {
    const url = `http://127.0.0.1:${port}${req.url}`;
    const request = new Request(url, {
      method: req.method,
      headers: req.headers,
      ...(!["GET", "HEAD"].includes(req.method)
        ? { body: req, duplex: "half" }
        : {}),
    });
    const r = await worker.fetch(request, env);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch {
    res.writeHead(500);
    res.end("Server error");
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`Pixaí sandbox: http://127.0.0.1:${port}`),
);
