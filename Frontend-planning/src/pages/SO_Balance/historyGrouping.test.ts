/// <reference types="node" />
import test from "node:test";
import assert from "node:assert/strict";
import type { SOBalanceHistoryRow } from "./types.ts";
import { computeLatestLinesTotal, groupHistoryByLine } from "./historyGrouping.ts";

const row = (overrides: Partial<SOBalanceHistoryRow>): SOBalanceHistoryRow => ({
  prd_name: "TEST-PRODUCT",
  due_date: "2026-11-24",
  so_no: "SO-001",
  po_no: "PO-001",
  source_rev: 0,
  po_bal: 100,
  source_update_at: "2026-11-24 08:00:00",
  ...overrides,
});

test("groupHistoryByLine groups revisions per (so_no, po_no) and computes per-line change & current", () => {
  const groups = groupHistoryByLine([
    row({ so_no: "SO-2", po_no: "PO-1", source_rev: 0, po_bal: 20 }),
    row({ so_no: "SO-1", po_no: "PO-1", source_rev: 2, po_bal: 55 }),
    row({ so_no: "SO-1", po_no: "PO-1", source_rev: 0, po_bal: 50 }),
    row({ so_no: "SO-1", po_no: "PO-1", source_rev: 1, po_bal: 60 }),
  ]);

  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((g) => [g.so_no, g.po_no, g.highestRev, g.latestPoBal, g.isActive]),
    [
      ["SO-1", "PO-1", 2, 55, true],
      ["SO-2", "PO-1", 0, 20, true],
    ],
  );

  // SO-1 / PO-1 revisions sorted ASC with per-line delta
  assert.deepEqual(
    groups[0].revisions.map((r) => ({
      rev: r.source_rev,
      isInitial: r.isInitial,
      isCurrent: r.isCurrent,
      changeFromPrev: r.changeFromPrev,
    })),
    [
      { rev: 0, isInitial: true, isCurrent: false, changeFromPrev: null },
      { rev: 1, isInitial: false, isCurrent: false, changeFromPrev: 10 },
      { rev: 2, isInitial: false, isCurrent: true, changeFromPrev: -5 },
    ],
  );

  // SO-2 / PO-1 is independent: rev 0 is both initial and current
  assert.deepEqual(
    groups[1].revisions.map((r) => ({
      rev: r.source_rev,
      isInitial: r.isInitial,
      isCurrent: r.isCurrent,
      changeFromPrev: r.changeFromPrev,
    })),
    [{ rev: 0, isInitial: true, isCurrent: true, changeFromPrev: null }],
  );

  // Latest total = sum of each active line's latest revision (55 + 20)
  assert.equal(computeLatestLinesTotal(groups), 75);
});

test("groupHistoryByLine separates moved/removed lines from active total and preserves move dates", () => {
  const groups = groupHistoryByLine([
    row({
      so_no: "SO-1", po_no: "PO-1", source_rev: 0, po_bal: 4906,
      is_active: false, moved_to_dates: ["2026-11-27"], moved_from_dates: [],
    }),
    row({
      so_no: "SO-3", po_no: "PO-3", source_rev: 0, po_bal: 5000,
      is_active: true, moved_to_dates: [], moved_from_dates: ["2026-12-16", "2026-12-11"],
    }),
    row({
      so_no: "SO-2", po_no: "PO-2", source_rev: 0, po_bal: 94,
      is_active: false, moved_to_dates: [], moved_from_dates: [],
    }),
  ]);

  // Active lines sort first, then inactive lines by so_no/po_no
  assert.deepEqual(
    groups.map((g) => ({
      so_no: g.so_no,
      isActive: g.isActive,
      movedToDates: g.movedToDates,
      movedFromDates: g.movedFromDates,
    })),
    [
      { so_no: "SO-3", isActive: true, movedToDates: [], movedFromDates: ["2026-12-11", "2026-12-16"] },
      { so_no: "SO-1", isActive: false, movedToDates: ["2026-11-27"], movedFromDates: [] },
      { so_no: "SO-2", isActive: false, movedToDates: [], movedFromDates: [] },
    ],
  );

  // Active total excludes moved/removed lines (5000 only, not 10000)
  assert.equal(computeLatestLinesTotal(groups), 5000);
});

test("groupHistoryByLine handles NULL balances without producing NaN deltas", () => {
  const groups = groupHistoryByLine([
    row({ so_no: "SO-1", po_no: "PO-1", source_rev: 0, po_bal: null }),
    row({ so_no: "SO-1", po_no: "PO-1", source_rev: 1, po_bal: 0 }),
    row({ so_no: "SO-2", po_no: "PO-2", source_rev: 0, po_bal: null }),
  ]);

  assert.equal(groups[0].revisions[1].changeFromPrev, null);
  assert.equal(computeLatestLinesTotal(groups), 0);

  const allNull = groupHistoryByLine([
    row({ so_no: "SO-1", po_no: "PO-1", source_rev: 0, po_bal: null }),
  ]);
  assert.equal(computeLatestLinesTotal(allNull), null);

  const onlyInactive = groupHistoryByLine([
    row({ so_no: "SO-1", po_no: "PO-1", source_rev: 0, po_bal: 100, is_active: false }),
  ]);
  assert.equal(computeLatestLinesTotal(onlyInactive), null);
});
