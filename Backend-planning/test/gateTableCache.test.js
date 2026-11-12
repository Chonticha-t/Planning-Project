const test = require("node:test");
const assert = require("node:assert/strict");
const { createGateTableCache } = require("../routes/10.17.87.244/Planning System/Planning Summary Gate/gateTableCache");

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test("twenty simultaneous table reads share one query, hit until expiry, and isolate filters", async () => {
  let clock = 0, queries = 0;
  const cache = createGateTableCache({ now: () => clock });
  const load = async () => { queries++; return [{ lot_no: "SYNTHETIC" }]; };
  const results = await Promise.all(Array.from({ length: 20 }, () => cache.read("all", load)));
  assert.equal(queries, 1);
  assert.equal(results.filter(result => result.status === "SHARED").length, 19);
  assert.ok(results.every(result => result.value === results[0].value));
  clock = 59999;
  assert.equal((await cache.read("all", load)).status, "HIT");
  await cache.read("FPC", load);
  assert.equal(queries, 2);
  clock = 60000;
  const expired = await cache.read("all", load);
  assert.equal(expired.status, "MISS");
  assert.equal(expired.reason, "EXPIRED");
  assert.equal(expired.previousAgeMs, 60000);
  assert.equal(queries, 3);
});

test("default TTL supports navigating back after more than five seconds", async () => {
  let clock = 0;
  const cache = createGateTableCache({ now: () => clock });
  const first = await cache.read("all", async () => []);
  assert.equal(first.reason, "ABSENT");
  clock = 15000;
  const back = await cache.read("all", () => assert.fail("navigation must reuse fresh data"));
  assert.equal(back.status, "HIT");
  assert.equal(back.ageMs, 15000);
  assert.equal(cache.stats().ttlMs, 60000);
});

test("invalidation and replacement cannot revive an older pending query", async () => {
  const cache = createGateTableCache();
  const old = deferred();
  const pending = cache.read("all", () => old.promise);
  cache.invalidate();
  await cache.read("all", async () => ["new"]);
  old.resolve(["old"]);
  assert.deepEqual((await pending).value, ["old"]);
  assert.deepEqual((await cache.read("all", () => assert.fail("must hit new data"))).value, ["new"]);
});

test("manual refresh bypasses older reads, coalesces simultaneous refreshes, and replaces cached data", async () => {
  const cache = createGateTableCache();
  const old = deferred(), fresh = deferred();
  const ordinary = cache.read("all", () => old.promise);
  const forced = cache.read("all", () => fresh.promise, { force: true });
  const shared = cache.read("all", () => assert.fail("must share"), { force: true });
  fresh.resolve(["fresh"]);
  assert.equal((await forced).status, "REFRESH");
  assert.equal((await shared).status, "SHARED");
  old.resolve(["old"]);
  await ordinary;
  assert.deepEqual((await cache.read("all", () => assert.fail("must hit"))).value, ["fresh"]);
  assert.deepEqual((await cache.read("all", async () => ["manual"], { force: true })).value, ["manual"]);
});

test("failures reject shared readers and are retried without retaining a rejected result", async () => {
  const cache = createGateTableCache();
  const load = async () => { throw new Error("Synthetic outage"); };
  const results = await Promise.allSettled([cache.read("all", load), cache.read("all", load)]);
  assert.ok(results.every(result => result.status === "rejected"));
  assert.equal(cache.stats().entries, 0);
  assert.deepEqual((await cache.read("all", async () => [])).value, []);
});

test("entry and byte budgets bound retained results, including pending entries and oversized payloads", async () => {
  const cache = createGateTableCache({ maxEntries: 2, maxBytes: 40 });
  const old = deferred();
  const pending = cache.read("old", () => old.promise);
  await cache.read("a", async () => ["a"]);
  await cache.read("b", async () => ["b"]);
  old.resolve(["old"]);
  await pending;
  assert.equal(cache.stats().entries, 2);
  const large = await cache.read("large", async () => ["X".repeat(100)]);
  assert.equal(large.value[0].length, 100);
  assert.equal(large.status, "OVERSIZE");
  assert.equal(cache.stats().oversized, 1);
  assert.ok(cache.stats().bytes <= 40);
  assert.equal((await cache.read("large", async () => [])).status, "MISS");
  await cache.read("c", async () => ["X".repeat(20)]);
  await cache.read("d", async () => ["Y".repeat(20)]);
  assert.ok(cache.stats().bytes <= 40);
  cache.invalidate();
  assert.equal(cache.stats().bytes, 0);
  assert.equal(cache.stats().entries, 0);
});

test("default budget retains the observed 39.5 MB response and reports an insufficient configured budget", async () => {
  const rows = [{ payload: "X".repeat(39494216) }];
  const cache = createGateTableCache();
  assert.equal((await cache.read("all", async () => rows)).status, "MISS");
  assert.equal(cache.stats().entries, 1);
  assert.ok(cache.stats().bytes > 32 * 1024 * 1024);
  assert.ok(cache.stats().bytes < cache.stats().maxBytes);
  assert.equal((await cache.read("all", () => assert.fail("large response must be cached"))).status, "HIT");
  cache.invalidate();
  const smaller = createGateTableCache({ maxBytes: 32 * 1024 * 1024 });
  assert.equal((await smaller.read("all", async () => rows)).status, "OVERSIZE");
  assert.equal(smaller.stats().entries, 0);
  assert.equal(smaller.stats().bytes, 0);
  assert.equal(smaller.stats().oversized, 1);
});

test("disabled cache and oversized keys bypass storage for before/after comparisons", async () => {
  for (const options of [{ ttlMs: 0 }, { maxEntries: 0 }, { maxBytes: 0 }]) {
    const cache = createGateTableCache(options);
    let queries = 0;
    const load = async () => [++queries];
    assert.equal((await cache.read("all", load)).status, "BYPASS");
    await cache.read("all", load);
    assert.equal(queries, 2);
    assert.equal(cache.stats().entries, 0);
  }
  const cache = createGateTableCache();
  assert.equal((await cache.read("x".repeat(16385), async () => [])).status, "BYPASS");
});
