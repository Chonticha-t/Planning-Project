import { memo } from "react";
import {
  DataGrid,
  GridColDef,
  GridColumnGroupingModel,
  GridSortModel,
} from "@mui/x-data-grid";
import { ClipboardList } from "lucide-react";
import { SORT_OPTIONS, type PlanningRow, type PlanningStatus } from "../types";
import { toDMY } from "../utils";

export { SORT_OPTIONS };

interface POBalanceTableProps {
  rows: PlanningRow[];
  loading?: boolean;
  sortModel: GridSortModel;
  onSortModelChange: (model: GridSortModel) => void;
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
  minWidth: 150,
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
      className={`status-pill inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
        isReady ? "status-pill-ready" : "status-pill-plan"
      }`}
    >
      <span className="status-dot size-2 rounded-full shrink-0" />
      <span>{isReady ? "Ready" : "Production Plan"}</span>
    </span>
  );
};

const columns: GridColDef<PlanningRow>[] = [
  {
    field: "prd_name",
    headerName: "Product",
    headerAlign: "center",
    flex: 1.4,
    minWidth: 160,
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
    minWidth: 125,
    renderCell: ({ value }) => (
      <span className="font-medium tabular-nums text-base-content text-[14px] whitespace-nowrap">
        {toDMY(value)}
      </span>
    ),
  },
  numberCol("po_bal", "PO Bal"),
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
    minWidth: 150,
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

const POBalanceTable = ({
  rows,
  loading: _loading,
  sortModel,
  onSortModelChange,
}: POBalanceTableProps) => {
  return (
    <div className="rounded-2xl border border-base-300/80 bg-base-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-base-300/80 bg-base-100">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
            <ClipboardList size={17} />
          </div>
          <h2 className="font-bold text-base-content tracking-wide text-sm">PO BALANCE</h2>
        </div>
        <span className="badge badge-sm badge-ghost font-semibold text-xs text-base-content/70 tabular-nums">
          {rows.length.toLocaleString("en-US")} rows
        </span>
      </div>

      <div
        className="datagrid-outer"
        style={{
          height: "calc(100vh - 260px)",
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
              px: 2,
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
              px: 2,
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
          }}
        />
      </div>
    </div>
  );
};

export default memo(POBalanceTable);
