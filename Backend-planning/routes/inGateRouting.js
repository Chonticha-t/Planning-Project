const express = require("express");
const { createFinishedHandler } = require("./inGateFinished");

const clean = value => typeof value === "string" ? value.replace(/\u00a0/g, " ").trim() : "";
const canonicalGate = name => ({ "AT-FVAC": "FVAC", "AT-FADL": "FADL", "AT-FIN": "FIN", MMOT1: "MMOT", MBLK1: "MBLK" }[name] || name);
const ROUTING_SQL = `SELECT prd_name, factory_desc, seq, proc_id, proc_disp, gate_name,
  step_in_gate, total_proc_in_gate, updated_at::text AS updated_at
  FROM planning.prd_routing_master WHERE prd_name = ANY($1::text[]) ORDER BY prd_name, seq LIMIT 10001`;
const WIP_SQL = `SELECT lot, prd_name, factory_desc, seq, proc_disp, updated_at::text AS updated_at
  FROM planning.wip_in_process WHERE lot = ANY($1::text[])`;

function resolveRoute(item, routes, wips) {
  const productRoutes = routes.filter(row => row.prd_name === item.product);
  const steps = productRoutes.filter(row => clean(row.gate_name).toUpperCase() !== "PRE_FFPC").map(row => ({
    seq: row.seq, processId: row.proc_id, process: row.proc_disp, gate: canonicalGate(row.gate_name),
    stepInGate: row.step_in_gate, totalInGate: row.total_proc_in_gate, updatedAt: row.updated_at,
  }));
  const result = { key: item.key, status: "no_routing", current: null, observed: null, steps };
  if (!steps.length) return { ...result, status: productRoutes.length ? "no_displayed_routing" : "no_routing" };
  if (!item.lot) return { ...result, status: "no_lot" };
  const matches = wips.filter(row => row.lot === item.lot);
  if (!matches.length) return { ...result, status: "no_wip" };
  if (matches.length !== 1) return { ...result, status: "ambiguous" };
  const wip = matches[0];
  if (wip.prd_name !== item.product) return { ...result, status: "product_mismatch" };
  result.observed = { process: wip.proc_disp, updatedAt: wip.updated_at };
  const candidates = routes.filter(row => row.prd_name === item.product
    && row.factory_desc === wip.factory_desc && clean(row.proc_disp) === clean(wip.proc_disp) && clean(wip.proc_disp));
  // WIP seq is derived upstream from the first matching process name; repeated names cannot prove an occurrence.
  if (candidates.length > 1) return { ...result, status: "ambiguous" };
  const current = candidates[0];
  if (!current) return { ...result, status: "process_not_found" };
  if (!Number.isInteger(wip.seq) || current.seq !== wip.seq) return { ...result, status: "inconsistent_position" };
  if (clean(current.gate_name).toUpperCase() === "PRE_FFPC") {
    return { ...result, status: "outside_displayed_routing", observed: { process: null, updatedAt: wip.updated_at } };
  }
  return { ...result, status: "matched", current: {
    seq: current.seq, process: wip.proc_disp, gate: canonicalGate(current.gate_name),
    stepInGate: current.step_in_gate, totalInGate: current.total_proc_in_gate, updatedAt: wip.updated_at,
  } };
}

function parseItems(body) {
  if (!Array.isArray(body?.items) || body.items.length < 1 || body.items.length > 100) throw new Error("INVALID_REQUEST");
  const keys = new Set();
  return body.items.map(item => {
    if (!item || typeof item.key !== "string" || !item.key || item.key.length > 2048 || keys.has(item.key)
      || typeof item.product !== "string" || !clean(item.product) || item.product.length > 150
      || !(item.lot === null || typeof item.lot === "string" && clean(item.lot) && item.lot.length <= 100)) throw new Error("INVALID_REQUEST");
    keys.add(item.key);
    return { key: item.key, product: item.product, lot: item.lot };
  });
}

function createInGateRoutingRouter({ pool }) {
  const router = express.Router();
  // Finished evidence is read-only and available in Viewer mode.
  router.get("/finished", createFinishedHandler({ pool, resolveRoute }));
  // Routing lookup is read-only and available in Viewer mode.
  router.post("/lookup", async (req, res) => {
    res.set("Cache-Control", "no-store");
    let items;
    try { items = parseItems(req.body); }
    catch { return res.status(400).json({ code: "INVALID_REQUEST", message: "Provide 1 to 100 valid routing identities with unique keys." }); }
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await client.query("SET LOCAL statement_timeout = '8s'");
      await client.query("SET LOCAL lock_timeout = '2s'");
      const routes = (await client.query(ROUTING_SQL, [[...new Set(items.map(item => item.product))]])).rows;
      if (routes.length > 10000) throw new Error("ROUTE_LIMIT");
      const lots = [...new Set(items.map(item => item.lot).filter(Boolean))];
      const wips = lots.length ? (await client.query(WIP_SQL, [lots])).rows : [];
      const results = items.map(item => resolveRoute(item, routes, wips));
      await client.query("COMMIT");
      return res.json({ status: "OK", data: { checkedAt: new Date().toISOString(), results } });
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => {});
      return res.status(503).json({ code: "ROUTING_UNAVAILABLE", message: "Routing and current WIP are unavailable. Please retry." });
    } finally { client?.release(); }
  });
  return router;
}

module.exports = { createInGateRoutingRouter, resolveRoute, parseItems };
