# Capacity Leveling load cache

`GET /api_p1/planning/capacity_leveling/load` caches the computed live view in process memory.
It reuses the bounded cache helper already used by Summary Gate, with an independent instance/budget.
No database schema or service installation is needed.

- `PLANNING_CAPACITY_CACHE_TTL_MS=60000` (default). `0` disables caching for baseline comparisons.
- `PLANNING_CAPACITY_CACHE_MAX_MB=128` (default), in MiB per process, with at most 16 entries.
  This limits serialized result/key sizes, not actual JavaScript heap usage. Check memory usage in
  the deployment; Summary Gate's independent budget also contributes to total process memory.
- Restart the backend after changing environment variables. Errors are not cached. `OVERSIZE`
  indicates a successful load which could not be retained due to the configured budget.

## Freshness

Each request still reads PostgreSQL's current date, the current capacity configuration and the latest
plan header. The cache key includes that date, the requested date range, the configuration revision,
and the latest immutable plan ID/version. Changes to capacity or plan head from another backend
process therefore select a new view immediately on the next request, without waiting for the TTL.
Cache hits skip the expensive Summary Gate works SQL, moves lookup, calendar loading and view rebuild.

Successful plan/capacity saves and history deletion invalidate local load entries after COMMIT.
Failed validation, conflicts and failed transactions do not invalidate them. An invalidated pending
read cannot repopulate the cache. Plan writes continue validating source rows and capacity directly
inside the transaction; saved history/snapshots and presence are not cached by this change.

External source-table and calendar changes can remain in an existing view for up to the TTL.
There is no new background monitor/push refresh. An already displayed page keeps its existing reload
behavior. Identical pending loads share expensive work; every caller still checks current dependencies.

`?refresh=true` bypasses the view cache and forces the existing calendar loader to reread its source.
The frontend uses this after saves/conflicts and for explicit Refresh/retry. Normal navigation uses
the cache. All original response fields, drafts and snapshot preview behavior are preserved.

## Diagnostics

`X-Capacity-Cache`, `X-Capacity-Cache-Reason`, and `X-Capacity-Cache-Age-Ms` report reuse and freshness.
`[capacity-load-perf]` logs total time, JSON time/bytes, arrival-row count, query count, accumulated
database work time, cache-read time, status/reason/age and cache statistics. No rows, identities,
SQL, keys or filter values are logged. `databaseWorkMs` sums concurrent query durations (including pool
wait, network and decoding); it is not a sequential wall-clock phase. Calendar loader DB work is
not included in this counter. `cacheReadMs` includes waiting for or building the view.
Set `PLANNING_CAPACITY_PERF=false` to disable diagnostic logging.

Compare `MISS` against `HIT` with the same date range. A normal HIT has three lightweight dependency
queries, and no works SQL; it is not a zero-query response. JSON serialization, compression, transfer
and frontend rendering still take time. The first load/explicit Refresh will still rebuild the view.
Tests use local HTTP and synthetic data; measure production improvement using these logs.
