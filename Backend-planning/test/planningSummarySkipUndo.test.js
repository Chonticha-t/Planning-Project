const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const express = require("express");

const routePath = path.resolve(
  __dirname,
  "../routes/10.17.87.244/Planning System/Planning Summary/Planning Summary.js"
);

function createMockDb(initial = {}) {
  const summaryRows = (initial.summaryRows || []).map((r) => ({ ...r }));
  const wipRows = (initial.wipRows || []).map((r) => ({ ...r }));
  const skipRows = new Map(
    (initial.skipRows || []).map((r) => [r.lot_no, { ...r }])
  );
  const assignRows = new Map(
    (initial.assignRows || []).map((r) => [r.lot_no, { ...r }])
  );
  const snapshotRows = new Map(
    (initial.snapshotRows || []).map((r) => [r.lot_no, { ...r }])
  );

  const likePatternToText = (val) =>
    String(val || "")
      .replace(/^%|%$/g, "")
      .replace(/\\([%_\\])/g, "$1")
      .toLowerCase();

  const runQuery = async (sql, params = []) => {
    const normalized = sql.replace(/\s+/g, " ").trim();

    if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(normalized)) {
      return { rows: [] };
    }
    if (/^CREATE TABLE IF NOT EXISTS planning\.planning_lot_assign/i.test(normalized)) {
      return { rows: [] };
    }
    if (/^CREATE TABLE IF NOT EXISTS planning\.planning_lot_skip_snapshot/i.test(normalized)) {
      return { rows: [] };
    }

    if (/FROM planning\.wip_in_process\s+WHERE prd_name = \$1/i.test(normalized)) {
      const [prd_name] = params;
      return {
        rows: wipRows
          .filter((r) => r.prd_name === prd_name)
          .map((r) => ({ ...r })),
      };
    }

    if (/^INSERT INTO planning\.planning_lot_skip_snapshot/i.test(normalized)) {
      const [lot_no, prd_name, snapshotJson] = params;
      snapshotRows.set(lot_no, {
        lot_no,
        prd_name,
        snapshot: JSON.parse(snapshotJson),
      });
      return { rows: [] };
    }

    if (/FROM planning\.planning_lot_skip_snapshot\s+WHERE prd_name = \$1/i.test(normalized)) {
      const [prd_name] = params;
      return {
        rows: Array.from(snapshotRows.values())
          .filter((r) => r.prd_name === prd_name)
          .map((r) => ({ lot_no: r.lot_no, snapshot: r.snapshot })),
      };
    }

    if (/^DELETE FROM planning\.planning_lot_skip_snapshot WHERE lot_no = \$1/i.test(normalized)) {
      snapshotRows.delete(params[0]);
      return { rows: [] };
    }

    if (/SELECT to_char\(MIN\(due_date\), 'YYYY-MM-DD'\) AS next_due_date FROM planning\.planning_summary/i.test(normalized)) {
      const [prd_name, due_date] = params;
      const candidates = summaryRows
        .filter(
          (r) =>
            r.prd_name === prd_name &&
            r.due_date > due_date &&
            (!r.status || r.status.toLowerCase() !== "ready")
        )
        .map((r) => r.due_date)
        .sort();
      return { rows: [{ next_due_date: candidates[0] || null }] };
    }

    if (/^INSERT INTO planning\.planning_lot_skip\b/i.test(normalized)) {
      const [prd_name, lot_no, due_date, skipped_due_date, seq, processName, skipped_by] = params;
      const existing = skipRows.get(lot_no);
      const nextSkippedDue =
        existing && existing.skipped_due_date > skipped_due_date
          ? existing.skipped_due_date
          : skipped_due_date;
      skipRows.set(lot_no, {
        prd_name,
        lot_no,
        due_date: due_date || null,
        skipped_due_date: nextSkippedDue,
        seq: seq ?? existing?.seq ?? null,
        process: processName ?? existing?.process ?? null,
        skipped_by,
        updated_at: new Date().toISOString(),
      });
      return { rows: [] };
    }

    if (/FROM planning\.planning_lot_skip\s+WHERE prd_name = \$1/i.test(normalized)) {
      const [prd_name] = params;
      return {
        rows: Array.from(skipRows.values())
          .filter((r) => r.prd_name === prd_name)
          .map((r) => ({
            lot_no: r.lot_no,
            skipped_due_date: r.skipped_due_date,
            seq: r.seq ?? null,
            process: r.process ?? null,
          })),
      };
    }

    if (/FROM planning\.planning_lot_skip\s+WHERE due_date IS NULL/i.test(normalized)) {
      return {
        rows: Array.from(skipRows.values())
          .filter((r) => !r.due_date)
          .map((r) => ({
            prd_name: r.prd_name,
            lot_no: r.lot_no,
            skipped_due_date: r.skipped_due_date,
            due_date: r.due_date,
            seq: r.seq ?? null,
            proc_disp: r.process ?? null,
          })),
      };
    }

    if (/^UPDATE planning\.planning_lot_skip SET due_date = \$2::date/i.test(normalized)) {
      const [lot_no, due_date] = params;
      const existing = skipRows.get(lot_no);
      if (existing) {
        existing.due_date = due_date || null;
      }
      return { rows: [] };
    }

    if (/^DELETE FROM planning\.planning_lot_skip WHERE lot_no = \$1/i.test(normalized)) {
      skipRows.delete(params[0]);
      return { rows: [] };
    }

    if (/FROM planning\.planning_lot_assign\s+WHERE prd_name = \$1/i.test(normalized)) {
      const [prd_name] = params;
      return {
        rows: Array.from(assignRows.values())
          .filter((r) => r.prd_name === prd_name)
          .map((r) => ({
            lot_no: r.lot_no,
            target_due_date: r.target_due_date,
            original_due_date: r.original_due_date || null,
          })),
      };
    }

    if (/^DELETE FROM planning\.planning_summary WHERE prd_name = \$1/i.test(normalized)) {
      const [prd_name] = params;
      for (let i = summaryRows.length - 1; i >= 0; i -= 1) {
        const r = summaryRows[i];
        if (
          r.prd_name === prd_name &&
          (!r.status || r.status.toLowerCase() !== "ready")
        ) {
          summaryRows.splice(i, 1);
        }
      }
      return { rows: [] };
    }

    if (/^INSERT INTO planning\.planning_summary\s*\(/i.test(normalized)) {
      const [
        prd_name,
        item,
        due_date,
        due_datetime,
        ship_to_p1,
        ship_to_p1_datetime,
        scan_in,
        priority,
        day_left,
        po_bal,
        inventory,
        net_required_pcs,
        cal_net_required,
        status,
        lot_no,
        proc_disp,
        seq,
        net_wip_qty,
        rem_wip_qty,
        factory_desc,
        prd_type,
        gate_name,
        yieldVal,
        lot_status,
        lot_problem,
        pending_reason,
      ] = params;
      summaryRows.push({
        prd_name,
        item,
        due_date,
        due_datetime: due_datetime || `${due_date} 00:00:00`,
        ship_to_p1,
        ship_to_p1_datetime,
        scan_in,
        priority,
        day_left,
        po_bal,
        inventory,
        net_required_pcs,
        cal_net_required,
        status,
        lot_no,
        proc_disp,
        seq,
        net_wip_qty,
        rem_wip_qty,
        factory_desc,
        prd_type,
        gate_name,
        yield: yieldVal,
        lot_status,
        lot_problem,
        pending_reason,
        updated_at: "2026-11-18 16:00:00",
      });
      return { rows: [] };
    }

    // reallocateProductWithSkips and PO fallback queries for one product
    if (/FROM planning\.planning_summary WHERE prd_name = \$1/i.test(normalized)) {
      const [prd_name] = params;
      const rows = summaryRows
        .filter(
          (r) =>
            r.prd_name === prd_name &&
            (!r.status || r.status.toLowerCase() !== "ready")
        )
        .sort((a, b) => {
          const d = String(a.due_date).localeCompare(String(b.due_date));
          if (d !== 0) return d;
          const sA = a.seq ?? -999999;
          const sB = b.seq ?? -999999;
          if (sB !== sA) return sB - sA;
          return String(a.lot_no || "").localeCompare(String(b.lot_no || ""));
        })
        .map((r) => ({ ...r }));
      if (/LIMIT 1$/i.test(normalized)) {
        return { rows: rows.slice(0, 1) };
      }
      return { rows };
    }

    // GET /table query (supports buildWhereClause filters including waiting-skip EXISTS predicates)
    if (/ROW_NUMBER\(\) OVER/i.test(normalized) && /FROM planning\.planning_summary/i.test(normalized)) {
      const waitingSkipsList = Array.from(skipRows.values()).filter((s) => !s.due_date);

      const searchMatch = normalized.match(/prd_name ILIKE \$(\d+)/i);
      const lotOnlyMatch = !searchMatch ? normalized.match(/lot_no ILIKE \$(\d+)/i) : null;
      const procMatch = normalized.match(/proc_disp = \$(\d+)/i);
      const gateMatch = normalized.match(/gate_name = \$(\d+)/i);
      const lotStatusMatch = normalized.match(/lot_status = \$(\d+)/i);
      const statusMatch = normalized.match(/AND status = \$(\d+)/i);

      const rows = summaryRows
        .filter((r) => {
          if (r.status && r.status.toLowerCase() === "ready") return false;
          const prdWaiting = waitingSkipsList.filter((s) => s.prd_name === r.prd_name);

          if (searchMatch) {
            const needle = likePatternToText(params[Number(searchMatch[1]) - 1]);
            const hitDirect =
              (r.prd_name && r.prd_name.toLowerCase().includes(needle)) ||
              (r.lot_no && r.lot_no.toLowerCase().includes(needle));
            const hitWait =
              !r.lot_no &&
              prdWaiting.some((s) => s.lot_no && s.lot_no.toLowerCase().includes(needle));
            if (!hitDirect && !hitWait) return false;
          } else if (lotOnlyMatch) {
            const needle = likePatternToText(params[Number(lotOnlyMatch[1]) - 1]);
            const hitDirect = r.lot_no && r.lot_no.toLowerCase().includes(needle);
            const hitWait =
              !r.lot_no &&
              prdWaiting.some((s) => s.lot_no && s.lot_no.toLowerCase().includes(needle));
            if (!hitDirect && !hitWait) return false;
          }

          if (statusMatch) {
            const val = params[Number(statusMatch[1]) - 1];
            if (r.status !== val) return false;
          }

          if (procMatch) {
            const val = params[Number(procMatch[1]) - 1];
            const hitDirect = r.proc_disp === val;
            const hitWait = !r.lot_no && prdWaiting.some((s) => s.process === val);
            if (!hitDirect && !hitWait) return false;
          }

          if (gateMatch) {
            const val = params[Number(gateMatch[1]) - 1];
            const hitDirect = r.gate_name === val;
            const hitWait = !r.lot_no && prdWaiting.some((s) => s.process === val);
            if (!hitDirect && !hitWait) return false;
          }

          if (lotStatusMatch) {
            const val = params[Number(lotStatusMatch[1]) - 1];
            const hitDirect = r.lot_status === val;
            const hitWait =
              String(val).toUpperCase() === "PENDING" &&
              !r.lot_no &&
              prdWaiting.length > 0;
            if (!hitDirect && !hitWait) return false;
          }

          return true;
        })
        .sort((a, b) => {
          const d = String(a.due_date).localeCompare(String(b.due_date));
          if (d !== 0) return d;
          const p = String(a.prd_name).localeCompare(String(b.prd_name));
          if (p !== 0) return p;
          const sA = a.seq ?? -999999;
          const sB = b.seq ?? -999999;
          if (sB !== sA) return sB - sA;
          return String(a.lot_no || "").localeCompare(String(b.lot_no || ""));
        })
        .map((r, idx) => {
          const skip = r.lot_no ? skipRows.get(r.lot_no) : null;
          const assign = r.lot_no ? assignRows.get(r.lot_no) : null;
          return {
            ...r,
            id: idx + 1,
            skipped_due_date: skip ? skip.skipped_due_date : null,
            assigned_due_date: assign ? assign.target_due_date : null,
            original_due_date: assign ? assign.original_due_date || null : null,
          };
        });
      return { rows };
    }

    throw new Error(`Unhandled SQL in test mock: ${normalized}`);
  };

  return {
    pool: {
      query: runQuery,
      connect: async () => ({
        query: runQuery,
        release() {},
      }),
    },
    state: { summaryRows, skipRows, assignRows, snapshotRows },
  };
}

async function withPlanningSummaryApp(db, callback) {
  const context = {
    module: { exports: {} },
    exports: {},
    console,
    process,
    setInterval: () => 0,
    clearInterval() {},
    require(name) {
      if (name === "express") return express;
      if (name === "../../config") return { pool_smart: db.pool };
      if (name === "../Auth/Auth") {
        return {
          verifyPlanner: (req, _res, next) => {
            req.user = { username: "planner-test", role: "Planner" };
            next();
          },
        };
      }
      if (name === "../WorkingDayCalendar/workingCalendar") {
        return {
          refreshPoCalendarFields: async (_client, poList) => {
            for (const po of poList) {
              if (po.base_day_left == null) po.base_day_left = po.first_day_left ?? 5;
              if (!po.base_priority) po.base_priority = po.first_priority || "Normal";
            }
          },
        };
      }
      throw new Error(`Unexpected dependency: ${name}`);
    },
  };

  vm.runInNewContext(fs.readFileSync(routePath, "utf8"), context);
  const app = express();
  app.use(express.json());
  app.use(context.module.exports);

  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    await callback({
      get: async (urlPath) => {
        const res = await fetch(`${baseUrl}${urlPath}`);
        return { status: res.status, body: await res.json() };
      },
      post: async (urlPath, payload) => {
        const res = await fetch(`${baseUrl}${urlPath}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        return { status: res.status, body: await res.json() };
      },
    });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test("skip_due on only Due Date waits on need wip row and unskip_due restores original Lot", async () => {
  const db = createMockDb({
    summaryRows: [
      {
        prd_name: "PROD-A",
        item: "94-001",
        due_date: "2026-11-20",
        due_datetime: "2026-11-20 00:00:00",
        ship_to_p1: "2026-11-19",
        ship_to_p1_datetime: null,
        scan_in: "2026-11-18 08:00:00",
        priority: "Normal",
        day_left: 2,
        po_bal: 100,
        inventory: 0,
        net_required_pcs: -100,
        cal_net_required: -100,
        status: "production plan",
        lot_no: "LOT-001",
        proc_disp: "PROC-A",
        seq: 10,
        net_wip_qty: 100,
        rem_wip_qty: 0,
        factory_desc: "FAC-1",
        prd_type: "FPC",
        gate_name: "FFPC",
        yield: 99,
        lot_status: "PENDING",
        lot_problem: "Machine down",
        pending_reason: "Waiting maintenance",
        updated_at: "2026-11-18 10:00:00",
      },
    ],
  });

  await withPlanningSummaryApp(db, async (api) => {
    const skipRes = await api.post("/skip_due", {
      prd_name: "PROD-A",
      lot_no: "LOT-001",
      due_date: "2026-11-20",
      seq: 10,
      process: "PROC-A",
    });

    assert.equal(skipRes.status, 200);
    assert.equal(skipRes.body.status, "OK");
    assert.equal(skipRes.body.data.new_due_date, null);
    assert.match(skipRes.body.message, /waiting for next Due Date/);

    // After skip, summary table has need wip row and Option A exposes waiting skipped lot metadata
    const tableAfterSkip = await api.get("/table");
    assert.equal(tableAfterSkip.status, 200);
    assert.equal(tableAfterSkip.body.data.length, 1);
    const waitRow = tableAfterSkip.body.data[0];
    assert.equal(waitRow.status, "need wip");
    assert.equal(waitRow.lot_no, null);
    assert.equal(waitRow.net_wip_qty, null);
    assert.equal(waitRow.skipped_due_date, "2026-11-20");
    assert.equal(waitRow.skipped_lot_no, "LOT-001");
    assert.equal(waitRow.skipped_lot_status, "PENDING");
    assert.equal(waitRow.skipped_lot_net_wip_qty, 100);
    assert.equal(waitRow.skipped_lot_proc_disp, "PROC-A");
    assert.equal(waitRow.skipped_lot_gate_name, "FFPC");
    assert.equal(waitRow.skipped_lot_problem, "Machine down");
    assert.equal(waitRow.skipped_pending_reason, "Waiting maintenance");

    // Filtered views (Lot Status = PENDING or searching by skipped lot number) must still show it
    const pendingFiltered = await api.get("/table?lot_status=PENDING");
    assert.equal(pendingFiltered.status, 200);
    assert.equal(pendingFiltered.body.data.length, 1);
    assert.equal(pendingFiltered.body.data[0].skipped_lot_no, "LOT-001");
    assert.equal(pendingFiltered.body.data[0].skipped_lot_net_wip_qty, 100);
    assert.equal(pendingFiltered.body.data[0].skipped_lot_proc_disp, "PROC-A");

    const lotFiltered = await api.get("/table?prd_name=LOT-001");
    assert.equal(lotFiltered.status, 200);
    assert.equal(lotFiltered.body.data.length, 1);
    assert.equal(lotFiltered.body.data[0].skipped_lot_no, "LOT-001");
    assert.equal(lotFiltered.body.data[0].skipped_lot_net_wip_qty, 100);
    assert.equal(lotFiltered.body.data[0].skipped_lot_proc_disp, "PROC-A");
  });

  // Simulate server restart (fresh router instance, relying on persisted DB snapshot) before Undo
  await withPlanningSummaryApp(db, async (api) => {
    const tableBeforeUndo = await api.get("/table");
    assert.equal(tableBeforeUndo.body.data[0].skipped_lot_no, "LOT-001");

    const undoRes = await api.post("/unskip_due", {
      prd_name: "PROD-A",
      lot_no: "LOT-001",
    });

    assert.equal(undoRes.status, 200);
    assert.equal(undoRes.body.status, "OK");
    assert.equal(undoRes.body.data.restored_due_date, "2026-11-20");

    const tableAfterUndo = await api.get("/table");
    assert.equal(tableAfterUndo.status, 200);
    assert.equal(tableAfterUndo.body.data.length, 1);
    const restoredRow = tableAfterUndo.body.data[0];
    assert.equal(restoredRow.status, "production plan");
    assert.equal(restoredRow.due_date, "2026-11-20");
    assert.equal(restoredRow.lot_no, "LOT-001");
    assert.equal(restoredRow.net_wip_qty, 100);
    assert.equal(restoredRow.proc_disp, "PROC-A");
    assert.equal(restoredRow.gate_name, "FFPC");
    assert.equal(restoredRow.lot_status, "PENDING");
    assert.equal(restoredRow.lot_problem, "Machine down");
    assert.equal(restoredRow.pending_reason, "Waiting maintenance");
    assert.equal(restoredRow.skipped_due_date, null);
  });
});

test("skip_due does not falsely report full next Due Date and unskip_due restores original Due Date", async () => {
  const db = createMockDb({
    summaryRows: [
      {
        prd_name: "PROD-B",
        item: "94-002",
        due_date: "2026-11-20",
        due_datetime: "2026-11-20 00:00:00",
        ship_to_p1: "2026-11-19",
        ship_to_p1_datetime: null,
        scan_in: "2026-11-18 08:00:00",
        priority: "Normal",
        day_left: 2,
        po_bal: 100,
        inventory: 0,
        net_required_pcs: -100,
        cal_net_required: -100,
        status: "production plan",
        lot_no: "LOT-001",
        proc_disp: "PROC-A",
        seq: 10,
        net_wip_qty: 100,
        rem_wip_qty: 0,
        factory_desc: "FAC-1",
        prd_type: "FPC",
        gate_name: "FFPC",
        yield: 98,
        lot_status: "PENDING",
        lot_problem: "Hold check",
        pending_reason: "QA check",
        updated_at: "2026-11-18 10:00:00",
      },
      {
        prd_name: "PROD-B",
        item: "94-002",
        due_date: "2026-11-25",
        due_datetime: "2026-11-25 00:00:00",
        ship_to_p1: "2026-11-24",
        ship_to_p1_datetime: null,
        scan_in: "2026-11-18 09:00:00",
        priority: "Normal",
        day_left: 7,
        po_bal: 100,
        inventory: 0,
        net_required_pcs: -100,
        cal_net_required: -100,
        status: "production plan",
        lot_no: "LOT-002",
        proc_disp: "PROC-B",
        seq: 5,
        net_wip_qty: 100,
        rem_wip_qty: 0,
        factory_desc: "FAC-1",
        prd_type: "FPC",
        gate_name: "FFPC",
        yield: 99,
        lot_status: "WIP",
        lot_problem: "",
        pending_reason: "",
        updated_at: "2026-11-18 10:00:00",
      },
    ],
    assignRows: [
      {
        prd_name: "PROD-B",
        lot_no: "LOT-002",
        target_due_date: "2026-11-25",
        original_due_date: "2026-11-25",
      },
    ],
  });

  await withPlanningSummaryApp(db, async (api) => {
    const skipRes = await api.post("/skip_due", {
      prd_name: "PROD-B",
      lot_no: "LOT-001",
      due_date: "2026-11-20",
      seq: 10,
      process: "PROC-A",
    });

    assert.equal(skipRes.status, 200);
    assert.equal(skipRes.body.status, "OK");
    assert.equal(skipRes.body.data.new_due_date, null);
    assert.match(skipRes.body.message, /waiting for next Due Date/);
    assert.doesNotMatch(skipRes.body.message, /2026-11-25/);

    const tableAfterSkip = await api.get("/table");
    assert.equal(tableAfterSkip.body.data.length, 2);
    const due20Row = tableAfterSkip.body.data.find((r) => r.due_date === "2026-11-20");
    const due25Row = tableAfterSkip.body.data.find((r) => r.due_date === "2026-11-25");

    assert.equal(due20Row.status, "need wip");
    assert.equal(due20Row.lot_no, null);
    assert.equal(due20Row.skipped_lot_no, "LOT-001");
    assert.equal(due20Row.skipped_due_date, "2026-11-20");

    assert.equal(due25Row.status, "production plan");
    assert.equal(due25Row.lot_no, "LOT-002");

    const undoRes = await api.post("/unskip_due", {
      prd_name: "PROD-B",
      lot_no: "LOT-001",
    });

    assert.equal(undoRes.status, 200);
    assert.equal(undoRes.body.data.restored_due_date, "2026-11-20");

    const tableAfterUndo = await api.get("/table");
    assert.equal(tableAfterUndo.body.data.length, 2);
    const restored20Row = tableAfterUndo.body.data.find((r) => r.due_date === "2026-11-20");
    assert.equal(restored20Row.status, "production plan");
    assert.equal(restored20Row.lot_no, "LOT-001");
    assert.equal(restored20Row.net_wip_qty, 100);
    assert.equal(restored20Row.skipped_due_date, null);
  });
});

test("skip_due when another Lot fills the Due Date still exposes waiting row across filters and unskip_due restores it", async () => {
  const db = createMockDb({
    summaryRows: [
      {
        prd_name: "PROD-C",
        item: "95-003",
        due_date: "2026-11-26",
        due_datetime: "2026-11-26 00:00:00",
        ship_to_p1: "2026-11-20",
        ship_to_p1_datetime: null,
        scan_in: null,
        priority: "Urgent",
        day_left: -6,
        po_bal: 100,
        inventory: 0,
        net_required_pcs: -100,
        cal_net_required: -100,
        status: "production plan",
        lot_no: "LOT-PENDING",
        proc_disp: "MFPC",
        seq: 28,
        net_wip_qty: 100,
        rem_wip_qty: 0,
        factory_desc: "P1",
        prd_type: "SMT",
        gate_name: "MFPC",
        yield: 96.46,
        lot_status: "PENDING",
        lot_problem: null,
        pending_reason: "1.1 Demand down",
        updated_at: "2026-11-18 10:00:00",
      },
      {
        prd_name: "PROD-C",
        item: "95-003",
        due_date: "2026-11-26",
        due_datetime: "2026-11-26 00:00:00",
        ship_to_p1: "2026-11-20",
        ship_to_p1_datetime: null,
        scan_in: null,
        priority: "Urgent",
        day_left: -6,
        po_bal: 100,
        inventory: 0,
        net_required_pcs: -100,
        cal_net_required: -100,
        status: "production plan",
        lot_no: "LOT-FILLER",
        proc_disp: "MFPC",
        seq: 20,
        net_wip_qty: 100,
        rem_wip_qty: 0,
        factory_desc: "P1",
        prd_type: "SMT",
        gate_name: "MFPC",
        yield: 99,
        lot_status: "WIP",
        lot_problem: null,
        pending_reason: null,
        updated_at: "2026-11-18 10:00:00",
      },
    ],
  });

  await withPlanningSummaryApp(db, async (api) => {
    const skipRes = await api.post("/skip_due", {
      prd_name: "PROD-C",
      lot_no: "LOT-PENDING",
      due_date: "2026-11-26",
      seq: 28,
      process: "MFPC",
    });

    assert.equal(skipRes.status, 200);
    assert.equal(skipRes.body.data.new_due_date, null);

    // No need wip row remains in planning_summary because LOT-FILLER satisfied all 100 pcs;
    // GET /table must still synthesize the waiting row so LOT-PENDING never disappears.
    const tableAll = await api.get("/table");
    assert.equal(tableAll.status, 200);
    const fillerRow = tableAll.body.data.find((r) => r.lot_no === "LOT-FILLER");
    const waitingRow = tableAll.body.data.find((r) => r.skipped_lot_no === "LOT-PENDING");
    assert.ok(fillerRow);
    assert.ok(waitingRow);
    assert.equal(waitingRow.status, "need wip");
    assert.equal(waitingRow.lot_no, null);
    assert.equal(waitingRow.net_wip_qty, null);
    assert.equal(waitingRow.skipped_due_date, "2026-11-26");
    assert.equal(waitingRow.skipped_lot_net_wip_qty, 100);
    assert.equal(waitingRow.skipped_lot_proc_disp, "MFPC");

    const pendingOnly = await api.get("/table?lot_status=PENDING");
    assert.equal(pendingOnly.status, 200);
    assert.equal(pendingOnly.body.data.length, 1);
    assert.equal(pendingOnly.body.data[0].skipped_lot_no, "LOT-PENDING");

    const lotSearch = await api.get("/table?prd_name=LOT-PENDING");
    assert.equal(lotSearch.status, 200);
    assert.equal(lotSearch.body.data.length, 1);
    assert.equal(lotSearch.body.data[0].skipped_lot_no, "LOT-PENDING");

    const undoRes = await api.post("/unskip_due", {
      prd_name: "PROD-C",
      lot_no: "LOT-PENDING",
    });
    assert.equal(undoRes.status, 200);
    assert.equal(undoRes.body.data.restored_due_date, "2026-11-26");

    const tableRestored = await api.get("/table");
    assert.equal(tableRestored.body.data.length, 1);
    assert.equal(tableRestored.body.data[0].lot_no, "LOT-PENDING");
  });
});
