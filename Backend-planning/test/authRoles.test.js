const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const express = require("express");
const crypto = require("node:crypto");

const authPath = path.join(__dirname, "../routes/10.17.87.244/Planning System/Auth/Auth.js");

async function harness(run) {
  const users = [
    { user_id: 1, username: "admin", full_name: "Administrator", password_hash: "admin", role: "admin", is_active: true },
    { user_id: 2, username: "planner", full_name: "Planner", password_hash: "password123", role: "planner", is_active: true },
    { user_id: 3, username: "viewer", full_name: "Viewer", password_hash: "password123", role: "viewer", is_active: true },
    { user_id: 4, username: "inactive", full_name: "Inactive", password_hash: "password123", role: "planner", is_active: false },
  ];
  const calls = [];
  let failInsert = false;
  let connections = 0, releases = 0;
  const pool = {
    async query(sql, params = []) {
      calls.push(sql);
      if (sql.includes("WHERE LOWER(username)")) return { rows: users.filter(user => user.username.toLowerCase() === params[0].toLowerCase()) };
      if (sql.includes("RETURNING user_id")) {
        if (failInsert) throw new Error("Simulated database error");
        const user = { user_id: users.length + 1, username: params[0], password_hash: params[1], full_name: params[2], role: params[3], is_active: true };
        users.push(user);
        const { password_hash, ...publicUser } = user;
        return { rows: [publicUser] };
      }
      return { rows: [] };
    },
    async connect() { connections++; return { query: pool.query, release() { releases++; } }; },
  };
  const context = { module: { exports: {} }, require(name) { return name === "../../config" ? { pool_smart: pool } : require(name); }, process: { env: { PLANNING_JWT_SECRET: "test-secret" } }, Buffer, console: { error() {} } };
  vm.runInNewContext(fs.readFileSync(authPath, "utf8"), context, { filename: authPath });
  const auth = context.module.exports;
  await auth.initAuthDb();
  const app = express();
  app.use(express.json());
  app.use("/auth", auth.router);
  app.post("/planning", auth.verifyPlanner, (req, res) => res.json({ actor: req.user.username }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const request = async (url, body, token) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${url}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const login = async username => (await request("/auth/login", { username, password: username === "admin" ? "admin" : "password123" })).body.data?.token;
  try { await run({ request, login, users, calls, setFail: () => { failInsert = true; } }); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); assert.equal(connections, releases); }
}

const newUser = { username: "new.planner", full_name: "New Planner", password: "password123", role: "planner" };

test("Planner and Admin can sign in, restore sessions and perform planning writes", async () => harness(async ({ login, request }) => {
  for (const username of ["admin", "planner"]) {
    const token = await login(username);
    assert.ok(token);
    const me = await request("/auth/me", undefined, token);
    assert.equal(me.status, 200);
    assert.equal(me.body.data.role, username);
    assert.equal((await request("/planning", {}, token)).status, 200);
  }
}));

test("only Admin can create users, including when Planner calls the API directly", async () => harness(async ({ login, request, users }) => {
  assert.equal((await request("/auth/users", newUser)).status, 401);
  assert.equal((await request("/auth/users", newUser, await login("planner"))).status, 403);
  assert.equal(users.length, 4);
  const admin = await login("admin");
  for (const role of ["planner", "admin"]) {
    const created = await request("/auth/users", { ...newUser, username: `new.${role}`, role }, admin);
    assert.equal(created.status, 201);
    assert.equal(created.body.data.user.role, role);
    assert.equal(created.body.data.user.is_active, true);
    assert.equal("password_hash" in created.body.data.user, false);
    assert.ok(await login(`new.${role}`));
  }
}));

test("user creation validates fields, rejects case-insensitive duplicates and releases its connection", async () => harness(async ({ login, request, calls }) => {
  const token = await login("admin");
  for (const changes of [{ username: " " }, { username: "a".repeat(51) }, { full_name: " " }, { password: " " }, { role: "viewer" }, { role: "superadmin" }]) {
    assert.equal((await request("/auth/users", { ...newUser, ...changes }, token)).status, 400);
  }
  const duplicate = await request("/auth/users", { ...newUser, username: "ADMIN" }, token);
  assert.equal(duplicate.status, 409);
  assert.ok(duplicate.body.errors.username);
  assert.ok(calls.includes("ROLLBACK"));
}));

test("short usernames, unrestricted username characters and short passwords can be created and used to log in", async () => harness(async ({ login, request }) => {
  const token = await login("admin");
  for (const username of ["yo", "a", "user name+test"]) {
    assert.equal((await request("/auth/users", { ...newUser, username, password: "yo" }, token)).status, 201);
    const result = await request("/auth/login", { username, password: "yo" });
    assert.equal(result.status, 200);
    assert.equal(result.body.data.user.username, username);
  }
}));

test("failed inserts roll back and return a useful error without database details", async () => harness(async ({ login, request, calls, setFail }) => {
  const token = await login("admin");
  setFail();
  const result = await request("/auth/users", newUser, token);
  assert.equal(result.status, 500);
  assert.ok(!JSON.stringify(result.body).includes("Simulated"));
  assert.ok(calls.includes("ROLLBACK"));
}));

test("Viewer, inactive accounts, invalid passwords, expired and forged tokens cannot write", async () => harness(async ({ request }) => {
  for (const username of ["viewer", "inactive"]) assert.equal((await request("/auth/login", { username, password: "password123" })).status, 403);
  assert.equal((await request("/auth/login", { username: "admin", password: "wrong" })).status, 401);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  for (const [role, exp, secret, expected] of [["admin", 1, "test-secret", 401], ["admin", 9999999999, "wrong", 401], ["viewer", 9999999999, "test-secret", 403]]) {
    const data = `${header}.${Buffer.from(JSON.stringify({ role, exp })).toString("base64url")}`;
    const token = `${data}.${crypto.createHmac("sha256", secret).update(data).digest("base64url")}`;
    assert.equal((await request("/planning", {}, token)).status, expected);
    assert.equal((await request("/auth/users", newUser, token)).status, expected);
  }
}));
