const normalized = value => typeof value === "string" ? value.replace(/\u00a0/g, " ").trim().replace(/\s+/g, " ") : "";
const isDay = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

const WIP_SQL = `SELECT w.lot, w.prd_name, w.factory_desc, w.seq, w.proc_disp, w.scan_type,
  to_char(w.in_date, 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS scanned_at,
  w.updated_at::text AS updated_at
  FROM planning.wip_in_process w
  WHERE w.in_date >= $1::date AND w.in_date < $1::date + INTERVAL '1 day'
    AND UPPER(REGEXP_REPLACE(BTRIM(REPLACE(w.scan_type, chr(160), ' ')), '[[:space:]]+', ' ', 'g')) = 'SCAN IN'
  ORDER BY w.in_date DESC, w.lot LIMIT 5001`;
const ROUTES_SQL = `SELECT prd_name, factory_desc, seq, proc_id, proc_disp, gate_name,
  proc_type, prd_category, step_in_gate, total_proc_in_gate, updated_at::text AS updated_at
  FROM planning.prd_routing_master WHERE REPLACE(prd_name, '-', '') = ANY($1::text[])
  ORDER BY prd_name, seq LIMIT 100001`;

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

function createFinishedHandler({ pool, resolveRoute }) {
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
      const wips = (await client.query(WIP_SQL, [date])).rows;
      if (wips.length > 5000) throw new Error("WIP_LIMIT");
      const products = [...new Set(wips.filter(row => typeof row.prd_name === "string").map(row => row.prd_name.replace(/-/g, "")))];
      const routes = products.length ? (await client.query(ROUTES_SQL, [products])).rows : [];
      if (routes.length > 100000) throw new Error("ROUTE_LIMIT");
      const result = inferFinished(wips, routes, date, resolveRoute);
      await client.query("COMMIT");
      return res.json({ status: "OK", data: { date, ...result, coverage: "latest_wip_only", checkedAt: new Date().toISOString() } });
    } catch {
      if (client) await client.query("ROLLBACK").catch(() => {});
      return res.status(503).json({ code: "FINISHED_UNAVAILABLE", message: "Unable to read finished evidence from current WIP. Please retry." });
    } finally { client?.release(); }
  };
}

module.exports = { createFinishedHandler, inferFinished, categoryFor };
