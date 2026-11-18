// Product routing gates, shared by Planning Summary Gate and Capacity Leveling.

// The routing master names some gates differently from Summary Gate.
const ROUTE_GATE_ALIASES = Object.freeze({ "AT-FVAC": "FVAC", "AT-FADL": "FADL", "AT-FIN": "FIN", MMOT1: "MMOT", MBLK1: "MBLK" });

// SQL that maps a routing gate column to its Summary Gate name (constants only, no user input).
const routedGateSql = (column) => `CASE ${column} ${Object.entries(ROUTE_GATE_ALIASES)
  .map(([from, to]) => `WHEN '${from}' THEN '${to}'`).join(" ")} ELSE ${column} END`;

// Summary Gate applies one route per product category, so a product routed FFPC -> FIN still gets
// FVAC and FADL rows it never visits. Use this in place of planning.planning_summary_gate to keep
// only gates in the product routing; products without any routing keep every gate.
const ROUTED_SUMMARY_GATE_SQL = `
    SELECT g.*
    FROM planning.planning_summary_gate g
    LEFT JOIN (
      SELECT r.prd_name, array_agg(DISTINCT ${routedGateSql("r.gate_name")}) AS gates
      FROM planning.prd_routing_master r
      WHERE r.prd_name IN (SELECT DISTINCT prd_name FROM planning.planning_summary_gate)
      GROUP BY r.prd_name
    ) rt ON rt.prd_name = g.prd_name
    WHERE rt.prd_name IS NULL OR g.gate_name = ANY(rt.gates)`;

module.exports = { ROUTE_GATE_ALIASES, routedGateSql, ROUTED_SUMMARY_GATE_SQL };
