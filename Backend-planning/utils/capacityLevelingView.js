const {
  SHIFTS, dateRange, occupancyCalendarRange, buildArrivalCards, shiftMinutesPerMachine,
  capacityGrid, arrivalWorkKey, isDate, resolveBoardCardOrder,
} = require("./capacityLeveling");

// Build both the live response and the saved view from server-owned inputs.
async function buildLevelingView({ sourceRows, moves, config, today, start, end, loadCalendar,
  history = {}, order = [], plan = null, legacy = false, calculationMethod }) {
  const { cards, orphanMoves, undated, duplicates } = buildArrivalCards(sourceRows, moves, today, config);
  const range = occupancyCalendarRange(cards, start, end);
  const maxLead = cards.reduce((max, card) => Math.max(max, card.leadDays || 1), 1);
  range.end = new Date(Date.parse(`${range.end}T00:00:00Z`) + (maxLead * 7 + 14) * 86400000).toISOString().slice(0, 10);
  const { calendar } = await loadCalendar(range.start, range.end);
  const days = dateRange(start, end).map((date) => ({ date, isWorking: calendar.isWorking(date) }));
  const calendarDays = dateRange(range.start, range.end).map((date) => ({ date, isWorking: calendar.isWorking(date) }));
  return {
    today, days, calendarDays,
    gates: config.map(({ gate, group, shifts }) => ({ gate, group,
      standardShiftMin: Object.fromEntries(SHIFTS.map((code) => [code, shiftMinutesPerMachine(shifts[code], false)])),
    })),
    capacity: capacityGrid(config, days),
    cards: cards.map((card) => ({ ...card, moveHistory: Array.isArray(history?.[card.id]) ? history[card.id] : [] })),
    orphanMoves, undatedCount: undated,
    arrivalRows: sourceRows.map((row, index) => ({ ...row, workKey: arrivalWorkKey(row, index) })),
    undatedArrivalCount: sourceRows.filter((row) => !isDate(row.arrive_by)).length,
    loadBasis: "summary_gate_arrivals_v1", duplicateWorkCount: duplicates, calculationMethod,
    legacyPlanAvailable: Boolean(legacy), plan,
    boardCardOrder: resolveBoardCardOrder(order, cards, today),
  };
}

module.exports = { buildLevelingView };
