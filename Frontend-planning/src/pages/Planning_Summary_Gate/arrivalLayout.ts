// Keep schedule columns and chart category bands on the same horizontal grid.
export const ARRIVAL_GATE_WIDTH = 64;
export const ARRIVAL_DAY_MIN_WIDTH = 60;
export const getArrivalMinWidth = (dayCount: number): number =>
  ARRIVAL_GATE_WIDTH + dayCount * ARRIVAL_DAY_MIN_WIDTH;
