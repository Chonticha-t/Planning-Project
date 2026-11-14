const normalized = value => typeof value === "string" ? value.replace(/\u00a0/g, " ").trim().replace(/\s+/g, " ") : "";
const isDay = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

const FINISHED_LOG_SQL = `WITH active_plan AS (
  SELECT baseline_snapshot->'viewSnapshot'->'data'->'cards' AS cards
  FROM planning.work_plan
  WHERE calculation_method = 'gate_arrival_max_target_v1'
    AND deleted_at IS NULL
    AND jsonb_typeof(baseline_snapshot->'viewSnapshot'->'data'->'cards') = 'array'
  ORDER BY version_no DESC
  LIMIT 1
), planned_on_day AS (
  SELECT DISTINCT BTRIM(c->>'lotNo') AS lot_no, BTRIM(c->>'gate') AS gate_name
  FROM active_plan p, jsonb_array_elements(p.cards) AS c
  WHERE c->>'kind' = 'lot'
    AND c->>'plannedDate' = $1
    AND NULLIF(BTRIM(c->>'lotNo'), '') IS NOT NULL
    AND NULLIF(BTRIM(c->>'gate'), '') IS NOT NULL
)
SELECT g.prd_name, g.lot_no, g.gate_name, g.next_gate, g.source_process, g.scan_type,
  to_char(g.source_in_date, 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS scanned_at,
  g.process_group,
  COALESCE(g.source_updated_at::text, g.recorded_at::text) AS updated_at
  FROM planning.gate_output_log g
  WHERE g.gate_name <> 'PRE_FFPC'
    AND (
      (g.source_in_date >= $1::date AND g.source_in_date < $1::date + INTERVAL '1 day')
      OR EXISTS (
        SELECT 1 FROM planned_on_day p
        WHERE p.lot_no = g.lot_no AND p.gate_name = g.gate_name
      )
    )
  ORDER BY g.source_in_date DESC, g.lot_no LIMIT 5001`;

// Same category rules as the Summary Gate source; conflicting product aliases stay unclassified.
function categoryFor(product, routes) {
  const group = routes.filter(row => row.prd_name.replace(/-/g, "") === product.replace(/-/g, ""));
  const names = new Set(group.map(row => row.prd_name));
  const categories = new Set(group.map(row => row.prd_category));
  if (!group.length || names.size !== 1 || categories.size !== 1 || !["FPC", "FULL", "SMT"].includes(group[0].prd_category)) return null;
  if (group[0].prd_category === "SMT") return "SMT";
  if (!group.some(row => row.proc_type === "FPC") || group.some(row => !["FPC", "SMT"].includes(row.proc_type)
    || row.proc_type === "FPC" && !normalized(row.proc_disp))) return null;
  return group.some(row => row.proc_type === "FPC" && row.proc_disp.includes("AT-")) ? "EFPC_AUTO" : "EFPC_GEN";
}

/** The next gate's latest SCAN IN is evidence for its immediate predecessor, never every earlier gate. */
function inferFinished(wips, routes, date, resolveRoute) {
  const rows = new Map();
  const byProduct = new Map();
  const byAlias = new Map();
  const categories = new Map();
  for (const row of routes) {
    const group = byProduct.get(row.prd_name) || [];
    group.push(row);
    byProduct.set(row.prd_name, group);
    const alias = row.prd_name.replace(/-/g, "");
    const aliases = byAlias.get(alias) || [];
    aliases.push(row);
    byAlias.set(alias, aliases);
  }
  let unresolved = 0;
  for (const wip of wips) {
    if (typeof wip.prd_name !== "string" || !wip.prd_name || typeof wip.lot !== "string" || !wip.lot) { unresolved++; continue; }
    if (normalized(wip.scan_type).toUpperCase() !== "SCAN IN" || typeof wip.scanned_at !== "string" || wip.scanned_at.slice(0, 10) !== date) continue;
    const route = resolveRoute({ key: "finished", product: wip.prd_name, lot: wip.lot }, byProduct.get(wip.prd_name) || [], [wip]);
    if (route.status !== "matched") { unresolved++; continue; }
    const steps = [...route.steps].sort((a, b) => a.seq - b.seq);
    let index = steps.findIndex(step => step.seq === route.current.seq);
    while (index >= 0 && steps[index].gate === route.current.gate) index--;
    const previous = steps[index]?.gate;
    if (!previous || previous === "PRE_FFPC") continue;
    const id = JSON.stringify([wip.prd_name, wip.lot, previous]);
    const existing = rows.get(id);
    if (existing && existing.scannedAt >= wip.scanned_at) continue;
    if (!categories.has(wip.prd_name)) categories.set(wip.prd_name, categoryFor(wip.prd_name, byAlias.get(wip.prd_name.replace(/-/g, "")) || []));
    rows.set(id, { id, product: wip.prd_name, lotNo: wip.lot, gate: previous, nextGate: route.current.gate,
      currentProcess: route.current.process, scannedAt: wip.scanned_at, scanType: "SCAN IN",
      processGroup: categories.get(wip.prd_name), sourceUpdatedAt: wip.updated_at });
  }
  return { rows: [...rows.values()].sort((a, b) => b.scannedAt.localeCompare(a.scannedAt) || a.id.localeCompare(b.id)), unresolved };
}

function createFinishedHandler({ pool }) {
  return async (req, res) => {
    res.set("Cache-Control", "no-store");
    const date = req.query.date;
    if (!isDay(date)) return res.status(400).json({ code: "INVALID_DATE", message: "Choose a valid calendar date." });
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL statement_timeout = '8s'");
      await client.query("SET LOCAL lock_timeout = '2s'");
      const finished = (await client.query(FINISHED_LOG_SQL, [date])).rows;
      if (finished.length > 5000) throw new Error("WIP_LIMIT");
      const rows = finished.map(row => ({
        id: JSON.stringify([row.prd_name, row.lot_no, row.gate_name]),
        product: row.prd_name,
        lotNo: row.lot_no,
        gate: row.gate_name,
        nextGate: row.next_gate,
        currentProcess: row.source_process,
        scannedAt: row.scanned_at,
        scanType: "SCAN IN",
        processGroup: row.process_group,
        sourceUpdatedAt: row.updated_at,
      }));
      await client.query("COMMIT");
      return res.json({ status: "OK", data: { date, rows, unresolved: 0, coverage: "latest_wip_only", checkedAt: new Date().toISOString() } });
    } catch {
      if (client) await client.query("ROLLBACK").catch(() => {});
      return res.status(503).json({ code: "FINISHED_UNAVAILABLE", message: "Unable to read finished evidence from gate output log. Please retry." });
    } finally { client?.release(); }
  };
}

module.exports = { createFinishedHandler, inferFinished, categoryFor };
