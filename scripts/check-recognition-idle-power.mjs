import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Exercise the patched desktop server while the model worker is a controlled promise.
const serverPath = process.argv[2];
assert(serverPath, "Pass the patched companion desktop/server.mjs");
const { makeServer } = await import(pathToFileURL(resolve(serverPath)).href);
const portProbe = createServer().listen(0, "127.0.0.1");
await once(portProbe, "listening");
const { port } = portProbe.address();
await new Promise((done) => portProbe.close(done));
const base = `http://127.0.0.1:${port}`;

const entered = Promise.withResolvers();
const finish = Promise.withResolvers();
const lifecycle = {
  phase: "ready",
  generation: 0,
  desired: true,
  changes: [],
  state() {
    return { phase: this.phase, enabled: this.desired };
  },
  setEnabled(enabled) {
    this.changes.push(enabled);
    this.desired = enabled;
    this.phase = enabled ? "ready" : "stopped";
    return this.state();
  },
  async worker() {
    entered.resolve();
    await finish.promise;
    return Response.json({ id: "test-held-job" }, { status: 202 });
  },
  close() {},
};

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
  assert.deepEqual(lifecycle.changes, []);
  finish.resolve();
  assert.equal((await running).status, 202);
  assert.equal(lifecycle.phase, "busy");
  assert.equal((await stop()).status, 409);
  assert.deepEqual(lifecycle.changes, []);
  lifecycle.phase = "ready";
  assert.equal((await stop()).status, 202);
  assert.deepEqual(lifecycle.changes, [false]);
  console.log("Guarded desktop power passed during admission, execution and idle.");
} finally {
  finish.resolve();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
