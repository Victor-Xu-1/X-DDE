import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Exercise the patched desktop server while the model worker is a controlled promise.
const serverPath = process.argv[2];
assert(serverPath, "Pass the patched companion desktop/server.mjs");
const { makeServer } = await import(pathToFileURL(resolve(serverPath)).href);
const { Lifecycle } = await import(
  pathToFileURL(resolve(dirname(serverPath), "lifecycle.mjs")).href
);
const portProbe = createServer().listen(0, "127.0.0.1");
await once(portProbe, "listening");
const { port } = portProbe.address();
await new Promise((done) => portProbe.close(done));
const base = `http://127.0.0.1:${port}`;

const entered = Promise.withResolvers();
const finish = Promise.withResolvers();
const heartbeatEntered = Promise.withResolvers();
const oldHeartbeat = Promise.withResolvers();
const commands = [];
let heartbeats = 0;
const lifecycle = new Lifecycle(
  { workerPort: 1, workerToken: "fixture" },
  {
    async fetch(url) {
      const path = new URL(url).pathname;
      if (path === "/api/heartbeat") {
        if (++heartbeats === 1) {
          heartbeatEntered.resolve();
          await oldHeartbeat.promise;
        }
        return Response.json({ phase: "ready", job: null });
      }
      assert.equal(path, "/api/jobs");
      entered.resolve();
      await finish.promise;
      return Response.json(
        { id: "test-held-job", status: "running", startedAt: Date.now() / 1000 },
        { status: 202 },
      );
    },
    execute: async (_file, args) => commands.push(args.at(-2)),
  },
);
lifecycle.desired = true;
lifecycle.phase = "ready";

const server = makeServer({ port, version: "test" }, lifecycle).listen(
  port,
  "127.0.0.1",
);
await once(server, "listening");
try {
  assert.equal((await (await fetch(base + "/health")).json()).idlePower, true);
  const session = await fetch(base + "/api/session");
  const { csrf, phase } = await session.json();
  assert.equal(phase, "ready");
  const headers = {
    cookie: session.headers.get("set-cookie").split(";", 1)[0],
    "x-csrf-token": csrf,
  };
  const stop = () =>
    fetch(base + "/api/power/idle", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
  const submit = () =>
    fetch(base + "/api/jobs", {
      method: "POST",
      headers,
      body: new FormData(),
    });
  const stale = lifecycle.tick();
  await heartbeatEntered.promise;
  const running = submit();
  await Promise.race([
    entered.promise,
    running.then((reply) => {
      throw new Error(`Job admission was not reached (HTTP ${reply.status})`);
    }),
  ]);
  assert.equal((await stop()).status, 409);
  assert.equal(lifecycle.phase, "ready");
  assert.equal((await submit()).status, 409);
  assert.deepEqual(commands, []);
  finish.resolve();
  assert.equal((await running).status, 202);
  oldHeartbeat.resolve();
  await stale;
  assert.equal(lifecycle.phase, "busy");
  assert.equal(lifecycle.job.status, "running");
  assert.equal((await stop()).status, 409);
  assert.deepEqual(commands, []);
  await lifecycle.tick();
  assert.equal(lifecycle.phase, "ready");
  assert.equal((await stop()).status, 202);
  await lifecycle.transition;
  assert.equal(lifecycle.phase, "stopped");
  assert.deepEqual(commands, ["stop"]);
  console.log("Guarded desktop power passed for admission, stale heartbeat, execution and idle.");
} finally {
  oldHeartbeat.resolve();
  finish.resolve();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
