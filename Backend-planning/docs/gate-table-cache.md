# Planning Summary Gate table cache

`GET /api_p1/planning/planning_summary_gate/table` uses a process-local cache by default.
The existing start script runs one Node process. No additional dependency or service is needed.
Only this read endpoint is cached; authentication, plan writes and transaction validation still read
their original sources. Planning Summary Gate reads external database changes when the table cache
expires or when the user selects Refresh.

## Configuration and bounds

- `PLANNING_GATE_CACHE_TTL_MS=60000` is the default. Set `0` and restart to disable caching.
- At most 16 entries are retained, including tracked pending queries.
- `PLANNING_GATE_CACHE_MAX_MB=64` sets the serialized payload and key budget in MiB per process.
  The default accommodates the observed 39.5 MB table response; the former 32 MiB budget discarded it.
  Actual JavaScript heap usage differs and can exceed the serialized budget.
  An individual result larger than the budget is returned without retention. Keys over 16 KiB bypass.
- Expired entries are removed on subsequent reads; there is no additional background timer.
- SQL and bound parameters form the key, so filters producing different queries cannot share results.
  This endpoint currently returns the same dataset to all callers. If authorization later changes
  its rows, that scope must also be part of the query/key before caching those rows.

## Freshness and concurrency

Identical concurrent reads share one query. The TTL starts after the database read finishes.
Errors are never cached. `?refresh=true` bypasses a completed entry or an older ordinary pending read;
concurrent forced reads can share a fresh pending read. The frontend Refresh button sends this flag.

The table response includes `cache_ttl_ms`, the remaining cache lifetime, or `null` when the
result is not retained. The page loads immediately and schedules its next ordinary read using
that lifetime, with a default interval of one minute. Hidden or offline tabs resume overdue
reads when visible and online. If a refresh fails, the page keeps the last successful rows and
their Updated time and retries while visible and online.

Browser/proxy caching remains disabled. Evicted or replaced pending reads can complete for their
original callers. Only the current entry may populate the cache.
Manual refresh always requests a database read rather than intentionally serving an expired result.

Each Node process has its own cache. In a cluster, a refresh affects the receiving process;
the other processes rely on their own TTL. Use a shared cache and distributed invalidation
(for example Redis) if cluster-wide invalidation is required. Confirm the actual deployment topology
before increasing the TTL. Future backend writes to the source must invalidate after commit.

## Observe and compare

Responses include `X-Gate-Cache` (`MISS`, `HIT`, `SHARED`, `REFRESH`, `BYPASS`, `OVERSIZE`) and
`X-Gate-Cache-Age-Ms`. Existing `Server-Timing` and `[gate-table-perf]` logs remain available.
`X-Gate-Cache-Reason` and log field `cacheReason` distinguish `EXPIRED`, `ABSENT`, `FORCED`, `FRESH`,
`IN_FLIGHT`, `BYTE_LIMIT`, and `DISABLED_OR_KEY_LIMIT`. `cachePreviousAgeMs` reports the age of the
previous entry on expiry/forced reads. The age of a newly loaded MISS alone cannot diagnose expiry.
Logs additionally contain `cacheStatus`, `cacheAgeMs`, and cumulative per-process `cacheStats`
(hits, misses, shared reads, refreshes, bypasses, oversized results, evictions, invalidations,
retained entries/bytes, configured maxBytes and ttlMs). `OVERSIZE` means the query succeeded but
the response exceeded the cache budget and was not retained. Repeated `MISS`/`OVERSIZE` with zero
entries means repeated database work; increasing TTL does not fix an insufficient byte budget.
Cache hits/shared readers have no database timing because they do not execute their own query.
The query owner records database timing. Row counts and response sizes are still recorded;
rows, SQL, parameters and cache keys are never added to logs. Set `PLANNING_GATE_PERF=false`
to disable the profiler; cache response headers remain available.

1. Run with TTL `0`, collect representative repeated and concurrent reads and keep perf logs.
2. Restart with TTL `60000`, repeat the same requests/data, and compare query counts, cache hit ratio,
   total p50/p95, response bytes and Node heap usage. Separate HIT/MISS/SHARED when comparing timings.
3. Confirm source changes and deletions become visible after the cache lifetime, and that Refresh
   returns fresh results before expiry.
4. If JSON size, transfer or frontend rendering dominates, reduce payload or rendering work next.

The automated tests use synthetic database results and local HTTP. They establish query reuse and
freshness behavior, not a measured speedup against the production database. No schema change is needed.

Run checks from `Backend-planning`: `npm test`. In environments that disallow child processes,
Node 24 also supports `node --test --experimental-test-isolation=none test/*.test.js`.
