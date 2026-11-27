import { memo, useMemo } from "react";
import {
  DataGrid,
  GridColDef,
  GridColumnGroupingModel,
  GridSortModel,
} from "@mui/x-data-grid";
import { CircleDollarSign, FileSpreadsheet } from "lucide-react";
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
  colorClass = "text-base-content/80",
  weightClass = "font-medium",
}: {
  value: number;
  strong?: boolean;
  decimals?: number;
  colorClass?: string;
  weightClass?: string;
}) => (
  <span
    className={`tabular-nums text-[13.5px] ${
      !value
        ? "text-base-content/35 font-normal"
        : strong
          ? "font-bold text-rose-600 dark:text-rose-400"
          : `${weightClass} ${colorClass}`
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
    <NumberCell value={value} decimals={2} colorClass={colorClass} weightClass="font-semibold" />
  ),
});

export const netDisplay = (v: number) => v;

const StatusPill = ({ value }: { value: PlanningStatus }) => {
  const isReady = value === "ready";
  return (
    <div className="flex items-center justify-center w-full h-full">
      <span
        className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[11.5px] font-semibold border shrink-0 ${
          isReady
            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
            : "bg-rose-50 text-rose-700 border-rose-200"
        }`}
      >
        <span
          className={`size-2 rounded-full shrink-0 ${
            isReady ? "bg-emerald-500" : "bg-rose-500"
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
    minWidth: 150,
    renderCell: ({ value }) => (
      <span className="font-bold text-base-content text-[13.5px] tracking-tight">{value}</span>
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
      <span className="font-semibold tabular-nums text-base-content/85 text-[13.5px] whitespace-nowrap">
        {toDMY(value)}
      </span>
    ),
  },
  {
    field: "po_bal",
    headerName: "PO Bal",
    type: "number",
    flex: 1.15,
    minWidth: 170,
    align: "center",
    headerAlign: "center",
    renderCell: ({ row, value }) => {
      const val = value == null ? "" : Number(value).toLocaleString("en-US");
      if (!val) {
        return <span className="tabular-nums text-[13.5px] text-base-content/30">-</span>;
      }
      return (
        <div className="inline-flex items-center justify-end w-[136px] gap-2 whitespace-nowrap px-2 py-0.5 text-[13.5px] tabular-nums font-bold text-base-content">
          <span className="flex-1 text-right">{val}</span>
          {/* Click Rev button to view history */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onViewHistory?.(row);
            }}
            className="inline-flex h-5 w-11 shrink-0 items-center justify-center rounded-md text-[10.5px] font-bold bg-base-100 text-[#4f46e5] border border-base-300 hover:bg-[#4f46e5] hover:text-white hover:border-[#4f46e5] transition-colors cursor-pointer shadow-2xs"
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
  amountCol("wh_fg_amount", "W/H F/G", "text-emerald-700"),
  amountCol("output_amount", "Output Amt", "text-rose-600", true),
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

const border = "color-mix(in oklab, var(--color-base-content) 9%, transparent)";
// หัวคอลัมน์: สีน้ำเงินทึบ ตัวหนังสือสีขาวทั้งตาราง
const headerBg = "#2563eb";
const invGroupBg = "#1e40af";
const headerText = "#ffffff";
const headerBorder = "rgba(255, 255, 255, 0.2)";

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
    <section
      aria-label="SO Balance table"
      className="rounded-2xl bg-base-100 border border-base-content/9 shadow-xs overflow-hidden"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-base-content/9">
        <div className="flex items-baseline gap-2.5">
          <h3 className="text-[13.5px] font-extrabold tracking-wide text-base-content uppercase">SO Balance</h3>
          <span className="text-xs font-medium text-base-content/55 tabular-nums">
            {rows.length.toLocaleString("en-US")} rows
          </span>
        </div>
        <div className="flex items-center gap-2">
          {onOpenExchangeRate && (
            <button
              type="button"
              onClick={onOpenExchangeRate}
              className="btn btn-sm h-8 min-h-0 px-3 btn-primary text-primary-content border-none text-xs font-semibold rounded-lg normal-case shadow-2xs gap-1.5 transition-colors cursor-pointer"
              title="Exchange Rate"
            >
              <CircleDollarSign size={14} className="shrink-0" />
              <span className="hidden sm:inline">Exchange Rate</span>
            </button>
          )}
          {onExport && (
            <button
              type="button"
              onClick={onExport}
              className="btn btn-sm h-8 min-h-0 px-3 bg-emerald-600 hover:bg-emerald-700 text-white border-none text-xs font-semibold rounded-lg normal-case shadow-2xs gap-1.5 transition-colors cursor-pointer"
              title="Export Excel"
            >
              <FileSpreadsheet size={14} className="shrink-0" />
              <span className="hidden sm:inline">Export Excel</span>
            </button>
          )}
        </div>
      </header>

      <div
        className="datagrid-outer bg-base-100"
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
            "--DataGrid-containerBackground": headerBg,

            // เส้นคั่นแนวตั้งระหว่างคอลัมน์ (เนื้อหาข้อมูล)
            "& .MuiDataGrid-withBorderColor": { borderColor: border },

            // ── Header Styling (Solid Blue) ───────────
            "& .MuiDataGrid-columnHeaders": {
              backgroundColor: headerBg,
              borderColor: headerBorder,
              "& .MuiDataGrid-withBorderColor": {
                borderColor: headerBorder,
              },
            },
            "& .MuiDataGrid-columnHeader, & .MuiDataGrid-columnHeaderGroupCell, & .MuiDataGrid-scrollbarFiller--header, & .MuiDataGrid-columnHeaders .MuiDataGrid-filler":
              {
                backgroundColor: headerBg,
              },
            "& .MuiDataGrid-columnHeader": {
              px: 1.25,
            },
            "& .MuiDataGrid-columnHeaderTitle": {
              fontSize: 13.5,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: headerText,
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
                  backgroundColor: headerBorder,
                  pointerEvents: "none",
                },
              },

            // ── Inventory Group Header ────────────────
            "& .MuiDataGrid-columnHeader.inv-group": {
              backgroundColor: invGroupBg,
              px: 0,
            },
            "& .MuiDataGrid-columnHeader.inv-group .MuiDataGrid-columnHeaderTitle":
              {
                fontWeight: 800,
                letterSpacing: "0.06em",
                color: headerText,
              },
            "& .MuiDataGrid-columnHeader.inv-group .MuiDataGrid-columnHeaderTitleContainer":
              {
                borderBottom: `1px solid ${headerBorder}`,
              },

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
    </section>
  );
};

export default memo(SOBalanceTable);
