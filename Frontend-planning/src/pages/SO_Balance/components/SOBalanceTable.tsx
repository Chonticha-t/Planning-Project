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
    className={`tabular-nums text-[14px] ${
      !value
        ? "text-base-content/30"
        : strong
          ? "font-bold text-error"
          : colorClass
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
    <span
      className={`status-pill inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${
        isReady ? "status-pill-ready" : "status-pill-plan"
      }`}
    >
      <span className="status-dot size-2 rounded-full shrink-0" />
      <span>{isReady ? "Ready" : "Production Plan"}</span>
    </span>
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
      <span className="font-semibold text-base-content text-[14px]">{value}</span>
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
      <span className="font-medium tabular-nums text-base-content text-[14px] whitespace-nowrap">
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
        return <span className="tabular-nums text-[14px] text-base-content/30">-</span>;
      }
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onViewHistory?.(row);
          }}
          className="group inline-flex items-center justify-center gap-1.5 whitespace-nowrap pl-2 pr-1 py-0.5 rounded-md text-[14px] tabular-nums font-semibold text-base-content/85 hover:bg-primary/10 hover:text-primary transition-all duration-150 cursor-pointer"
          title="ดูประวัติการคำนวณ (SO History)"
          aria-label={`View SO history for ${row.prd_name} due ${toDMY(row.due_date)}`}
        >
          <span>{val}</span>
          {/* Show current revision; click to open full history */}
          <span className="inline-flex h-6 shrink-0 items-center justify-center rounded-md bg-primary/10 px-1.5 text-[11px] font-bold text-primary ring-1 ring-primary/20 transition-colors group-hover:bg-primary group-hover:text-primary-content">
            {row.source_rev == null ? "Rev -" : `Rev ${row.source_rev}`}
          </span>
        </button>
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
  amountCol("wh_fg_amount", "W/H F/G", "text-emerald-500 font-semibold"),
  amountCol("output_amount", "Output Amt", "text-red-500 font-semibold", true),
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

const border = "color-mix(in oklab, var(--color-base-content) 11%, transparent)";

const invBgGroup =
  "color-mix(in oklab, var(--color-base-content) 7%, var(--color-base-200))";

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
    <div className="flex flex-col gap-2.5 p-4 rounded-2xl bg-base-100 border border-base-300 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardList size={15} className="text-primary" />
          <h3 className="font-bold text-sm tracking-wide text-base-content uppercase">SO Balance</h3>
          <span className="text-[11px] text-base-content/60">Click SO Bal to view calculation history</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 items-center px-2.5 rounded-md bg-base-200/80 border border-base-300 text-[11px] font-bold text-base-content/70 tabular-nums">
            {rows.length.toLocaleString("en-US")} rows
          </span>
          {onOpenExchangeRate && (
            <button
              type="button"
              onClick={onOpenExchangeRate}
              className="btn btn-xs h-7 px-2.5 btn-primary text-xs font-semibold rounded-lg normal-case shadow-xs gap-1.5 cursor-pointer"
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
              className="btn btn-xs h-7 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white border-none text-xs font-semibold rounded-lg normal-case shadow-xs gap-1.5 cursor-pointer"
              title="Export Excel"
            >
              <FileSpreadsheet size={13} className="shrink-0" />
              <span className="hidden sm:inline">Export Excel</span>
            </button>
          )}
        </div>
      </div>

      <div
        className="datagrid-outer rounded-xl border border-base-300 overflow-hidden"
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
          rowHeight={44}
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
            fontSize: 14,
            color: "var(--color-base-content)",
            "--DataGrid-rowBorderColor": border,
            "--DataGrid-containerBackground": "var(--color-base-200)",

            // ── Header Styling (คมชัด ไม่จืด) ────────
            "& .MuiDataGrid-columnHeaders": {
              backgroundColor: "var(--color-base-200)",
            },
            "& .MuiDataGrid-columnHeader": {
              backgroundColor: "var(--color-base-200)",
              px: 1.25,
            },
            "& .MuiDataGrid-columnHeaderTitle": {
              fontSize: 13.5,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color:
                "color-mix(in oklab, var(--color-base-content) 85%, transparent)",
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

            // ── Inventory Group Header (แถบเทาสวย ชัดเจน สไตล์ที่ชอบ) ─
            "& .MuiDataGrid-columnHeaderGroupCell": {
              backgroundColor: "var(--color-base-200)",
            },
            "& .MuiDataGrid-columnHeader.inv-group": {
              backgroundColor: invBgGroup,
              px: 0,
            },
            "& .MuiDataGrid-columnHeader.inv-group .MuiDataGrid-columnHeaderTitle":
              {
                fontWeight: 800,
                letterSpacing: "0.06em",
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

            // ── Cells / Rows (นิ่ง ไม่กระพริบ ไม่ Dim แสง) ──
            "& .MuiDataGrid-cell": {
              px: 1.25,
              borderColor: border,
            },
            "& .MuiDataGrid-row:hover": {
              backgroundColor:
                "color-mix(in oklab, var(--color-base-content) 4.5%, transparent)",
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
                fontSize: 13,
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
            "& *::-webkit-scrollbar": { width: 8, height: 8 },
            "& *::-webkit-scrollbar-button": { display: "none", width: 0, height: 0 },
            "& *::-webkit-scrollbar-track": { backgroundColor: "transparent" },
            "& *::-webkit-scrollbar-thumb": {
              backgroundColor: "color-mix(in oklab, var(--color-base-content) 22%, transparent)",
              borderRadius: 8,
            },
            "& *::-webkit-scrollbar-thumb:hover": {
              backgroundColor: "color-mix(in oklab, var(--color-base-content) 35%, transparent)",
            },
            "& *::-webkit-scrollbar-corner": { backgroundColor: "transparent" },
          }}
        />
      </div>
    </div>
  );
};

export default memo(SOBalanceTable);
