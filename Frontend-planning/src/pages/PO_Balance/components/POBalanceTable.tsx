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
  loading: boolean;
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
  colorClass = "text-base-content/80",
}: {
  value: number;
  strong?: boolean;
  decimals?: number;
  colorClass?: string;
}) => (
  <span
    className={`tabular-nums ${
      !value
        ? "text-base-content/30"
        : strong
          ? "font-semibold text-error"
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
): GridColDef<PlanningRow> => ({
  field,
  headerName,
  type: "number",
  flex: 1,
  minWidth: 110,
  align: "center",
  headerAlign: "center",
  ...(transform && {
    valueGetter: (value: number) => (value == null ? value : transform(value)),
  }),
  renderCell: ({ value }) => <NumberCell value={value} strong={strong} />,
});

// Inventory columns — same as numberCol; inv-header marks them as grouped (see header centering)
const invCol = (
  field: keyof PlanningRow,
  headerName: string,
  edge?: "inv-first" | "inv-last",
): GridColDef<PlanningRow> => ({
  ...numberCol(field, headerName),
  headerClassName: edge ? `inv-header ${edge}` : "inv-header",
});

// Amount columns (THB) — same as numberCol but shows 2 decimals
const amountCol = (
  field: keyof PlanningRow,
  headerName: string,
  colorClass?: string,
): GridColDef<PlanningRow> => ({
  ...numberCol(field, headerName),
  minWidth: 150,
  renderCell: ({ value }) => (
    <NumberCell value={value} decimals={2} colorClass={colorClass} />
  ),
});

// net_required_pcs ได้รับค่าติดลบมาจาก database แล้ว ไม่ต้องแปลงค่า
export const netDisplay = (v: number) => v;

const STATUS_STYLE: Record<PlanningStatus, { label: string; color: string }> = {
  ready: { label: "Ready", color: "var(--color-success)" },
  "production plan": { label: "Production Plan", color: "var(--color-error)" },
};

const StatusPill = ({ value }: { value: PlanningStatus }) => {
  const s = STATUS_STYLE[value] ?? {
    label: value,
    color: "var(--color-base-content)",
  };
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{
        color: s.color,
        backgroundColor: `color-mix(in oklab, ${s.color} 12%, transparent)`,
      }}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ backgroundColor: s.color }}
      />
      {s.label}
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
      <span className="font-medium text-base-content">{value}</span>
    ),
  },
  {
    field: "due_date",
    headerName: "Due Date",
    headerAlign: "center",
    flex: 1,
    minWidth: 110,
    // value ยังเป็น YYYY-MM-DD เพื่อให้เรียงลำดับถูก — แปลงแค่ตอนแสดง
    renderCell: ({ value }) => (
      <span className="font-medium tabular-nums text-base-content">
        {toDMY(value)}
      </span>
    ),
  },
  numberCol("po_bal", "PO Bal"),
  // ── Inventory group ──────────────────────────
  invCol("unmovement", "Unmovement", "inv-first"),
  invCol("rem_unmovement", "Rem Unmove"),
  invCol("f_g", "F/G"),
  invCol("rem_fg", "Rem F/G", "inv-last"),
  // ─────────────────────────────────────────────
  numberCol("net_required_pcs", "Net Required", true),
  // Output Amount ใช้แดง red-600 ให้ต่างเฉดจาก Net Required (text-error)
  amountCol("wh_fg_amount", "W/H F/G", "text-green-600"),
  amountCol("output_amount", "Output Amt", "text-red-600"),
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
    headerName: "Inventory",
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
  "color-mix(in oklab, var(--color-base-content) 7%, var(--color-base-200))";

const POBalanceTable = ({
  rows,
  loading,
  sortModel,
  onSortModelChange,
}: POBalanceTableProps) => {
  return (
    <div className="card bg-base-100 border border-base-300 shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-base-300">
        <div className="flex items-center gap-2.5">
          <ClipboardList size={18} className="text-base-content/60" />
          <h2 className="font-semibold text-base-content">PO BALANCE</h2>
        </div>
        <span className="text-[13px] text-base-content/60 tabular-nums">
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
        // ปิดการคลิกหัวคอลัมน์เพื่อ sort โดยตรง — ให้เรียงลำดับผ่านเมนู Sort by ใน FilterBar เท่านั้น
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
          loading={loading}
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

            // ── Header ──────────────────────────────
            "& .MuiDataGrid-columnHeader": {
              backgroundColor: "var(--color-base-200)",
              px: 2,
            },
            "& .MuiDataGrid-columnHeaderTitle": {
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color:
                "color-mix(in oklab, var(--color-base-content) 80%, transparent)",
            },

            // คอลัมน์ที่ไม่มีกลุ่ม (Product, Due Date, PO Bal, Net Required, W/H F/G, Output Amount, Status)
            // DataGrid วางชื่อไว้แถวล่าง → ดันขึ้นครึ่งหนึ่งของแถวกลุ่ม ให้อยู่กลางหัวตารางทั้ง 2 แถว
            "& .MuiDataGrid-columnHeader:not(.inv-header):not(.MuiDataGrid-columnHeader--filledGroup):not(.MuiDataGrid-columnHeader--emptyGroup)":
              {
                overflow: "visible",
                "& .MuiDataGrid-columnHeaderTitleContainer": {
                  transform: `translateY(-${GROUP_HEADER_H / 2}px)`,
                },
                // DataGrid รวมช่องแถวบนของคอลัมน์ที่ไม่มีกลุ่มซึ่งอยู่ติดกันเป็นช่องเดียว → ไม่มีเส้นคั่น
                // เลยต่อเส้นขวาขึ้นไปถึงแถวบน ให้เส้นยาวเต็มหัวตาราง
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

            // ── Inventory: group header row ──────────
            "& .MuiDataGrid-columnHeaderGroupCell": {
              backgroundColor: "var(--color-base-200)",
            },
            // ใส่สีเฉพาะช่อง INVENTORY — คอลัมน์ย่อยกับข้อมูลใช้พื้นปกติ
            "& .MuiDataGrid-columnHeader.inv-group": {
              backgroundColor: invBgGroup,
              px: 0,
            },
            // เส้นคั่นใต้ INVENTORY — สี/ความหนาเดียวกับเส้นขอบซ้ายขวา
            "& .MuiDataGrid-columnHeader.inv-group .MuiDataGrid-columnHeaderTitleContainer":
              {
                borderBottom: `1px solid ${border}`,
              },
            // เส้นคั่นแนวตั้งระหว่างคอลัมน์ (หัวตาราง + ข้อมูล)
            "& .MuiDataGrid-withBorderColor": { borderColor: border },

            "& .MuiDataGrid-columnSeparator": { display: "none" },
            // ซ่อนเส้นโหลด (LinearProgress) ใต้หัวตาราง
            "& .MuiLinearProgress-root": { display: "none" },
            // ซ่อนไอคอน sort ดั้งเดิมของ DataGrid บนหัวคอลัมน์
            "& .MuiDataGrid-iconButtonContainer": { display: "none" },
            "& .MuiDataGrid-columnHeader--sortable": {
              cursor: "default",
            },

            // ── Cells / rows ─────────────────────────
            "& .MuiDataGrid-cell": { px: 2, borderColor: border },
            "& .MuiDataGrid-row:hover": {
              backgroundColor:
                "color-mix(in oklab, var(--color-base-content) 4%, transparent)",
            },
            "& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within, & .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within":
              { outline: "none" },

            // ── Footer ───────────────────────────────
            "& .MuiDataGrid-footerContainer": {
              borderTop: `1px solid ${border}`,
              minHeight: 48,
            },
            "& .MuiTablePagination-root, & .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows":
              {
                fontSize: 13,
                color:
                  "color-mix(in oklab, var(--color-base-content) 65%, transparent)",
              },
            "& .MuiDataGrid-overlay": { backgroundColor: "transparent" },
            "& .MuiDataGrid-virtualScroller": { willChange: "transform" },
          }}
        />
      </div>
    </div>
  );
};

export default memo(POBalanceTable);
