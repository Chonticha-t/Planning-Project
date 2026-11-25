import type { SOBalanceHistoryRow } from "./types";

export interface SOBalanceHistoryLineEntry extends SOBalanceHistoryRow {
  isInitial: boolean;
  isCurrent: boolean;
  changeFromPrev: number | null;
}

export interface SOBalanceHistoryLineGroup {
  key: string;
  so_no: string;
  po_no: string;
  isActive: boolean;
  movedToDates: string[];
  movedFromDates: string[];
  highestRev: number;
  latestPoBal: number | null;
  revisions: SOBalanceHistoryLineEntry[];
}

const uniqueSortedDates = (dates: (string[] | undefined)[]): string[] => {
  const set = new Set<string>();
  for (const list of dates) {
    if (!Array.isArray(list)) continue;
    for (const d of list) {
      if (d) set.add(d);
    }
  }
  return Array.from(set).sort();
};

export const groupHistoryByLine = (
  rows: SOBalanceHistoryRow[],
): SOBalanceHistoryLineGroup[] => {
  const grouped = new Map<string, { so_no: string; po_no: string; items: SOBalanceHistoryRow[] }>();

  for (const row of rows) {
    const soNo = row.so_no ?? "";
    const poNo = row.po_no ?? "";
    const key = JSON.stringify([soNo, poNo]);
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.items.push(row);
    } else {
      grouped.set(key, { so_no: soNo, po_no: poNo, items: [row] });
    }
  }

  return Array.from(grouped.entries())
    .map(([key, { so_no, po_no, items }]) => {
      const sorted = [...items].sort((a, b) => (a.source_rev ?? -1) - (b.source_rev ?? -1));
      const highestRev = sorted.reduce(
        (maxRev, item) => Math.max(maxRev, item.source_rev ?? -Infinity),
        -Infinity,
      );
      const isActive = sorted.some((item) => item.is_active !== false);
      const movedToDates = isActive
        ? []
        : uniqueSortedDates(sorted.map((item) => item.moved_to_dates));
      const movedFromDates = isActive
        ? uniqueSortedDates(sorted.map((item) => item.moved_from_dates))
        : [];

      const revisions: SOBalanceHistoryLineEntry[] = sorted.map((item, idx) => {
        const prevItem = idx > 0 ? sorted[idx - 1] : null;
        const changeFromPrev =
          prevItem && item.po_bal != null && prevItem.po_bal != null
            ? item.po_bal - prevItem.po_bal
            : null;
        return {
          ...item,
          isInitial: idx === 0,
          isCurrent: item.source_rev === highestRev,
          changeFromPrev,
        };
      });

      const currentEntry = revisions[revisions.length - 1];
      return {
        key,
        so_no,
        po_no,
        isActive,
        movedToDates,
        movedFromDates,
        highestRev,
        latestPoBal: currentEntry ? currentEntry.po_bal : null,
        revisions,
      };
    })
    .sort(
      (a, b) =>
        Number(b.isActive) - Number(a.isActive) ||
        a.so_no.localeCompare(b.so_no) ||
        a.po_no.localeCompare(b.po_no),
    );
};

export const computeLatestLinesTotal = (
  groups: SOBalanceHistoryLineGroup[],
): number | null => {
  const activeGroups = groups.filter((g) => g.isActive);
  if (activeGroups.length === 0) return null;
  if (activeGroups.every((g) => g.latestPoBal == null)) return null;
  return activeGroups.reduce((sum, g) => sum + (g.latestPoBal ?? 0), 0);
};
