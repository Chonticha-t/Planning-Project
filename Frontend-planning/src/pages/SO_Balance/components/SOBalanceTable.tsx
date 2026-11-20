import { memo, useMemo } from "react";
import {
  DataGrid,
  GridColDef,
  GridColumnGroupingModel,
  GridSortModel,
} from "@mui/x-data-grid";
import { CircleDollarSign, ClipboardList, FileSpreadsheet } from "lucide-react";
import { SORT_OPTIONS, type PlanningRow, type PlanningStatus } from "../types";
import { toDMY } from "../utils";

export { SORT_OPTIONS };

interface SOBalanceTableProps {
  rows: PlanningRow[];
  loading?: boolean;
  sortModel: GridSortModel;
  onSortModelChange: (model: GridSortModel) => void;
  onViewHistory?: (row: PlanningRow) => void;
  onExport?: () => void;
  onOpenExchangeRate?: () => void;
}

const num = (value: number, decimals = 0) =>
  value == null
    ? ""
    : Number(value).toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

const NumberCell = ({
  value,
  strong,
  decimals,
  colorClass = "text-base-content/85",
}: {
  value: number;
  strong?: boolean;
  decimals?: number;
  colorClass?: string;
}) => (
  <span
    className={`tabular-nums text-[13.5px] ${
      !value
        ? "text-base-content/50 font-medium"
        : strong
          ? "font-bold text-rose-600 dark:text-rose-400"
          : `font-bold ${colorClass}`
    }`}
  >
    {num(value, decimals)}
  </span>
);

const numberCol = (
  field: keyof PlanningRow,
  headerName: string,
  strong = false,
  transform?: (value: number) => number,
  ignoreSign = false,
): GridColDef<PlanningRow> => ({
  field,
  headerName,
  type: "number",
  flex: 1,
  minWidth: 110,
  align: "center",
  headerAlign: "center",
  ...(ignoreSign && { sortComparator: absSortComparator }),
  ...(transform && {
    valueGetter: (value: number) => (value == null ? value : transform(value)),
  }),
  renderCell: ({ value }) => <NumberCell value={value} strong={strong} />,
});

// Inventory columns — แนวเดิมที่ชอบ มี edge สำหรับจัดกรุ๊ป
const invCol = (
  field: keyof PlanningRow,
  headerName: string,
  edge?: "inv-first" | "inv-last",
): GridColDef<PlanningRow> => ({
  ...numberCol(field, headerName),
  headerClassName: edge ? `inv-header ${edge}` : "inv-header",
});

// เรียงลำดับตามขนาดตัวเลขโดยไม่คิดเครื่องหมายลบ (-)
const absSortComparator = (
  v1: number | null | undefined,
  v2: number | null | undefined,
) => {
  const a = v1 == null ? -1 : Math.abs(Number(v1));
  const b = v2 == null ? -1 : Math.abs(Number(v2));
  return a - b;
};

// Amount columns (THB) — แสดงทศนิยม 2 ตำแหน่ง
const amountCol = (
  field: keyof PlanningRow,
  headerName: string,
  colorClass?: string,
  ignoreSign = false,
): GridColDef<PlanningRow> => ({
  ...numberCol(field, headerName),
  minWidth: 135,
  ...(ignoreSign && { sortComparator: absSortComparator }),
  renderCell: ({ value }) => (
    <NumberCell value={value} decimals={2} colorClass={colorClass} />
  ),
});

export const netDisplay = (v: number) => v;

const StatusPill = ({ value }: { value: PlanningStatus }) => {
  const isReady = value === "ready";
  return (
    <div className="flex items-center justify-center w-full h-full">
      <span
        className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[11.5px] font-bold border-[1.5px] bg-transparent shrink-0 ${
          isReady
            ? "border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-300"
            : "border-rose-600 text-rose-700 dark:border-rose-400 dark:text-rose-300"
        }`}
      >
        <span
          className={`size-2 rounded-full shrink-0 ${
            isReady ? "bg-emerald-600 dark:bg-emerald-400" : "bg-rose-600 dark:bg-rose-400"
          }`}
        />
        <span>{isReady ? "Ready" : "Production Plan"}</span>
      </span>
    </div>
  );
};

const getColumns = (
  onViewHistory?: (row: PlanningRow) => void
): GridColDef<PlanningRow>[] => [
  {
    field: "prd_name",
    headerName: "Product",
    headerAlign: "center",
    flex: 1,
    minWidth: 140,
    renderCell: ({ value }) => (
      <span className="font-semibold text-base-content text-[13.5px] tracking-tight">{value}</span>
    ),
  },
  {
    field: "due_date",
    headerName: "Due Date",
    align: "center",
    headerAlign: "center",
    flex: 1,
    minWidth: 115,
    renderCell: ({ value }) => (
      <span className="font-medium tabular-nums text-base-content/85 text-[13px] whitespace-nowrap">
        {toDMY(value)}
      </span>
    ),
  },
  {
    field: "po_bal",
    headerName: "SO Bal",
    type: "number",
    flex: 1.15,
    minWidth: 170,
    align: "center",
    headerAlign: "center",
    renderCell: ({ row, value }) => {
      const val = value == null ? "" : Number(value).toLocaleString("en-US");
      if (!val) {
        return <span className="tabular-nums text-[13.5px] text-base-content/25">-</span>;
      }
      return (
        <div className="inline-flex items-center justify-end w-[136px] gap-2 whitespace-nowrap px-2 py-0.5 text-[13.5px] tabular-nums font-semibold text-base-content">
          <span className="flex-1 text-right">{val}</span>
          {/* Click Rev button to view history */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onViewHistory?.(row);
            }}
            className="inline-flex h-5 w-11 shrink-0 items-center justify-center rounded text-[10.5px] font-bold bg-primary/15 text-primary border border-primary/25 hover:bg-primary hover:text-primary-content transition-all cursor-pointer shadow-2xs"
            title="ดูประวัติการคำนวณ (SO History)"
            aria-label={`View SO history for ${row.prd_name} due ${toDMY(row.due_date)}`}
          >
            {row.source_rev == null ? "Rev -" : `Rev ${row.source_rev}`}
          </button>
        </div>
      );
    },
  },
  // ── Inventory group (แนวเดิมตามภาพที่ชอบ) ────
  invCol("unmovement", "Unmovement", "inv-first"),
  invCol("rem_unmovement", "Rem Unmove"),
  invCol("f_g", "F/G"),
  invCol("rem_fg", "Rem F/G", "inv-last"),
  // ─────────────────────────────────────────────
  numberCol("net_required_pcs", "Net Required", true, undefined, true),
  amountCol("wh_fg_amount", "W/H F/G", "text-emerald-700 dark:text-emerald-300"),
  amountCol("output_amount", "Output Amt", "text-rose-700 dark:text-rose-300", true),
  {
    field: "status",
    headerName: "Status",
    align: "center",
    headerAlign: "center",
    flex: 1.1,
    minWidth: 155,
    renderCell: ({ value }) => <StatusPill value={value} />,
  },
];

const columnGroupingModel: GridColumnGroupingModel = [
  {
    groupId: "inventory",
    headerName: "INVENTORY",
    headerAlign: "center",
    headerClassName: "inv-group",
    children: [
      { field: "unmovement" },
      { field: "rem_unmovement" },
      { field: "f_g" },
      { field: "rem_fg" },
    ],
  },
];

const GROUP_HEADER_H = 28;

const border = "color-mix(in oklab, var(--color-base-content) 8%, transparent)";

const invBgGroup =
  "color-mix(in oklab, var(--color-base-content) 5.5%, var(--color-base-200))";

const SOBalanceTable = ({
  rows,
  loading: _loading,
  sortModel,
  onSortModelChange,
  onViewHistory,
  onExport,
  onOpenExchangeRate,
}: SOBalanceTableProps) => {
  const columns = useMemo(() => getColumns(onViewHistory), [onViewHistory]);
  return (
    <div className="flex flex-col gap-3 p-4 rounded-2xl bg-base-100 border border-base-300/60 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ClipboardList size={15} />
          </span>
          <h3 className="font-bold text-sm tracking-wide text-base-content uppercase">SO Balance</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 items-center px-2.5 rounded-lg bg-base-200/60 border border-base-300/50 text-[11px] font-semibold text-base-content/70 tabular-nums">
            {rows.length.toLocaleString("en-US")} rows
          </span>
          {onOpenExchangeRate && (
            <button
              type="button"
              onClick={onOpenExchangeRate}
              className="btn btn-xs h-7 px-3 btn-primary text-primary-content border-none text-xs font-semibold rounded-lg normal-case shadow-2xs gap-1.5 transition-all cursor-pointer"
              title="Exchange Rate"
            >
              <CircleDollarSign size={13} className="shrink-0" />
              <span className="hidden sm:inline">Exchange Rate</span>
            </button>
          )}
          {onExport && (
            <button
              type="button"
              onClick={onExport}
              className="btn btn-xs h-7 px-3 bg-emerald-600 hover:bg-emerald-700 text-white border-none text-xs font-semibold rounded-lg normal-case shadow-2xs gap-1.5 transition-all cursor-pointer"
              title="Export Excel"
            >
              <FileSpreadsheet size={13} className="shrink-0" />
              <span className="hidden sm:inline">Export Excel</span>
            </button>
          )}
        </div>
      </div>

      <div
        className="datagrid-outer rounded-xl border border-base-300/70 overflow-hidden bg-base-100 shadow-2xs"
        style={{
          height: "calc(100vh - 300px)",
          minHeight: 520,
          position: "relative",
        }}
        onClickCapture={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest(".MuiDataGrid-columnHeader")) {
            e.stopPropagation();
          }
        }}
      >
        <DataGrid
          rows={rows}
          columns={columns}
          columnGroupingModel={columnGroupingModel}
          loading={false}
          getRowId={(r) => `${r.prd_name}|${r.due_date}`}
          rowHeight={43}
          resizeThrottleMs={0}
          columnHeaderHeight={36}
          columnGroupHeaderHeight={GROUP_HEADER_H}
          disableRowSelectionOnClick
          disableColumnMenu
          slots={{ loadingOverlay: () => null }}
          sortModel={sortModel}
          onSortModelChange={onSortModelChange}
          showColumnVerticalBorder
          showCellVerticalBorder
          initialState={{ pagination: { paginationModel: { pageSize: 50 } } }}
          pageSizeOptions={[25, 50, 100]}
          sx={{
            border: 0,
            borderRadius: 0,
            fontSize: 13.5,
            color: "var(--color-base-content)",
            "--DataGrid-rowBorderColor": border,
            "--DataGrid-containerBackground": "var(--color-base-200)",

            // ── Header Styling (โมเดิร์น คมชัด เรียบหรู) ────────
            "& .MuiDataGrid-columnHeaders": {
              backgroundColor: "var(--color-base-200)",
              borderBottom: `1px solid ${border}`,
            },
            "& .MuiDataGrid-columnHeader": {
              backgroundColor: "var(--color-base-200)",
              px: 1.5,
            },
            "& .MuiDataGrid-columnHeaderTitle": {
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              color:
                "color-mix(in oklab, var(--color-base-content) 72%, transparent)",
            },

            // คอลัมน์ที่ไม่มีกลุ่ม: จัดข้อความให้อยู่กึ่งกลางความสูง 2 แถว พร้อมเส้นคั่นแนวตั้งยาวเต็ม
            "& .MuiDataGrid-columnHeader:not(.inv-header):not(.MuiDataGrid-columnHeader--filledGroup):not(.MuiDataGrid-columnHeader--emptyGroup)":
              {
                overflow: "visible",
                "& .MuiDataGrid-columnHeaderTitleContainer": {
                  transform: `translateY(-${GROUP_HEADER_H / 2}px)`,
                },
                "&::after": {
                  content: '""',
                  position: "absolute",
                  top: -GROUP_HEADER_H,
                  right: -1,
                  width: "1px",
                  height: GROUP_HEADER_H,
                  backgroundColor: border,
                  pointerEvents: "none",
                },
              },

            // ── Inventory Group Header ─
            "& .MuiDataGrid-columnHeaderGroupCell": {
              backgroundColor: "var(--color-base-200)",
            },
            "& .MuiDataGrid-columnHeader.inv-group": {
              backgroundColor: invBgGroup,
              px: 0,
            },
            "& .MuiDataGrid-columnHeader.inv-group .MuiDataGrid-columnHeaderTitle":
              {
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.08em",
                color: "var(--color-base-content)",
              },
            "& .MuiDataGrid-columnHeader.inv-group .MuiDataGrid-columnHeaderTitleContainer":
              {
                borderBottom: `1px solid ${border}`,
              },

            // เส้นคั่นแนวตั้งระหว่างคอลัมน์ (หัวตาราง + เนื้อหาข้อมูล)
            "& .MuiDataGrid-withBorderColor": { borderColor: border },

            "& .MuiDataGrid-columnSeparator": { display: "none" },
            "& .MuiLinearProgress-root": { display: "none" },
            "& .MuiDataGrid-iconButtonContainer": { display: "none" },
            "& .MuiDataGrid-columnHeader--sortable": {
              cursor: "default",
            },

            // ── Cells / Rows (Subtle zebra + Smooth hover) ──
            "& .MuiDataGrid-cell": {
              px: 1.5,
              borderColor: border,
            },
            "& .MuiDataGrid-row:nth-of-type(even)": {
              backgroundColor:
                "color-mix(in oklab, var(--color-base-content) 1.5%, transparent)",
            },
            "& .MuiDataGrid-row:hover": {
              backgroundColor:
                "color-mix(in oklab, var(--color-primary) 5%, transparent) !important",
              transition: "background-color 140ms ease",
            },
            "& .MuiDataGrid-virtualScroller": {
              opacity: "1 !important",
              willChange: "transform",
            },
            "& .MuiDataGrid-virtualScroller--hasScrollX": {
              flex: "0 0 calc(100% - var(--DataGrid-scrollbarSize, 17px)) !important",
              height: "calc(100% - var(--DataGrid-scrollbarSize, 17px)) !important",
              maxHeight: "calc(100% - var(--DataGrid-scrollbarSize, 17px)) !important",
            },
            "& .MuiDataGrid-virtualScrollerContent": {
              paddingBottom: "4px !important",
            },
            "& .MuiDataGrid-overlayWrapper": {
              display: "none !important",
            },
            "& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within, & .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within":
              { outline: "none" },

            // ── Horizontal Scrollbar: วางไว้ด้านล่างข้อมูล ไม่ลอยทับแถวตาราง ──
            "& .MuiDataGrid-scrollbar--horizontal": {
              position: "absolute !important",
              bottom: "0 !important",
              left: "0 !important",
              right: "0 !important",
              zIndex: 10,
              borderTop: `1px solid ${border}`,
              backgroundColor: "color-mix(in oklab, var(--color-base-200) 65%, var(--color-base-100))",
            },
            "& .MuiDataGrid-scrollbar--horizontal.MuiDataGrid-scrollbar--hidden": {
              display: "none !important",
            },

            // ── Footer / Pagination ──────────────────
            "& .MuiDataGrid-footerContainer": {
              borderTop: `1px solid ${border}`,
              minHeight: 46,
            },
            "& .MuiTablePagination-root, & .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows":
              {
                fontSize: 12.5,
                fontWeight: 500,
                color:
                  "color-mix(in oklab, var(--color-base-content) 70%, transparent)",
              },
            "& .MuiDataGrid-overlay": { backgroundColor: "transparent" },

            // ── Slim scrollbars without the ▲ ▼ arrow buttons ──
            // daisyUI sets the standard `scrollbar-color` on :root (inherited); Chromium then ignores
            // ::-webkit-scrollbar rules, so reset it to auto inside the grid.
            "& *": { scrollbarColor: "auto", scrollbarWidth: "auto" },
            // The pagination bar overflowed by a pixel and showed its own tiny scrollbar.
            "& .MuiTablePagination-root": { overflow: "hidden" },
            "& *::-webkit-scrollbar": { width: 7, height: 7 },
            "& *::-webkit-scrollbar-button": { display: "none", width: 0, height: 0 },
            "& *::-webkit-scrollbar-track": { backgroundColor: "transparent" },
            "& *::-webkit-scrollbar-thumb": {
              backgroundColor: "color-mix(in oklab, var(--color-base-content) 18%, transparent)",
              borderRadius: 8,
            },
            "& *::-webkit-scrollbar-thumb:hover": {
              backgroundColor: "color-mix(in oklab, var(--color-base-content) 30%, transparent)",
            },
            "& *::-webkit-scrollbar-corner": { backgroundColor: "transparent" },
          }}
        />
      </div>
    </div>
  );
};

export default memo(SOBalanceTable);
