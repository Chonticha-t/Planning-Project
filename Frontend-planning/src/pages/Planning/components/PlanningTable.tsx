import { DataGrid, GridColDef } from "@mui/x-data-grid";
import { ClipboardList } from "lucide-react";
import type { PlanningRow, PlanningStatus } from "../types";

interface PlanningTableProps {
  rows: PlanningRow[];
  loading: boolean;
}

const num = (value: number) =>
  value == null ? "" : Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 });

// ตัวเลข: ชิดขวา ใช้ tabular-nums ให้หลักตรงกัน และทำค่า 0 ให้จางลง
const NumberCell = ({ value, strong }: { value: number; strong?: boolean }) => (
  <span
    className={`tabular-nums ${
      !value ? "text-base-content/30" : strong ? "font-semibold text-error" : "text-base-content/80"
    }`}
  >
    {num(value)}
  </span>
);

const numberCol = (
  field: keyof PlanningRow,
  headerName: string,
  strong = false,
): GridColDef<PlanningRow> => ({
  field,
  headerName,
  type: "number",
  flex: 1,
  minWidth: 110,
  renderCell: ({ value }) => <NumberCell value={value} strong={strong} />,
});

const STATUS_STYLE: Record<PlanningStatus, { label: string; color: string }> = {
  ready: { label: "Ready", color: "var(--color-success)" },
  "production plan": { label: "Production Plan", color: "var(--color-error)" },
};

const StatusPill = ({ value }: { value: PlanningStatus }) => {
  const s = STATUS_STYLE[value] ?? { label: value, color: "var(--color-base-content)" };
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{
        color: s.color,
        backgroundColor: `color-mix(in oklab, ${s.color} 12%, transparent)`,
      }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: s.color }} />
      {s.label}
    </span>
  );
};

const columns: GridColDef<PlanningRow>[] = [
  {
    field: "prd_name",
    headerName: "Product",
    flex: 1.4,
    minWidth: 160,
    renderCell: ({ value }) => <span className="font-medium text-base-content">{value}</span>,
  },
  {
    field: "due_date",
    headerName: "Due Date",
    flex: 1,
    minWidth: 110,
    renderCell: ({ value }) => <span className="tabular-nums text-base-content/70">{value}</span>,
  },
  numberCol("po_bal", "PO Bal"),
  numberCol("unmovement", "Unmovement"),
  numberCol("f_g", "F/G"),
  numberCol("ship_pcs", "Ship (pcs)"),
  numberCol("net_required_pcs", "Net Required", true),
  numberCol("rem_unmovement", "Rem Unmove"),
  numberCol("rem_fg", "Rem F/G"),
  {
    field: "status",
    headerName: "Status",
    flex: 1.1,
    minWidth: 150,
    renderCell: ({ value }) => <StatusPill value={value} />,
  },
];

const border = "color-mix(in oklab, var(--color-base-content) 8%, transparent)";

const PlanningTable = ({ rows, loading }: PlanningTableProps) => {
  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-base-300">
        <div className="flex items-center gap-2.5">
          <ClipboardList size={18} className="text-base-content/60" />
          <h2 className="font-semibold text-base-content">Production Plan</h2>
        </div>
        <span className="text-xs text-base-content/60 tabular-nums">
          {rows.length.toLocaleString("en-US")} rows
        </span>
      </div>

      <div style={{ height: "calc(100vh - 260px)", minHeight: 520 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={loading}
          getRowId={(r) => `${r.prd_name}|${r.due_date}`}
          rowHeight={44}
          columnHeaderHeight={40}
          disableRowSelectionOnClick
          disableColumnMenu
          initialState={{ pagination: { paginationModel: { pageSize: 50 } } }}
          pageSizeOptions={[25, 50, 100]}
          sx={{
            border: 0,
            borderRadius: 0,
            fontSize: 13,
            color: "var(--color-base-content)",
            "--DataGrid-rowBorderColor": border,
            "--DataGrid-containerBackground": "var(--color-base-200)",

            // Header
            "& .MuiDataGrid-columnHeader": {
              backgroundColor: "var(--color-base-200)",
              px: 2,
            },
            "& .MuiDataGrid-columnHeaderTitle": {
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "color-mix(in oklab, var(--color-base-content) 55%, transparent)",
            },
            "& .MuiDataGrid-columnSeparator": { display: "none" },
            "& .MuiDataGrid-sortIcon": { opacity: 0.5 },

            // Cells / rows
            "& .MuiDataGrid-cell": { px: 2, borderColor: border },
            "& .MuiDataGrid-row:hover": {
              backgroundColor: "color-mix(in oklab, var(--color-base-content) 4%, transparent)",
            },
            "& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within, & .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within":
              { outline: "none" },

            // Footer
            "& .MuiDataGrid-footerContainer": {
              borderTop: `1px solid ${border}`,
              minHeight: 48,
            },
            "& .MuiTablePagination-root, & .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows":
              {
                fontSize: 12,
                color: "color-mix(in oklab, var(--color-base-content) 65%, transparent)",
              },
            "& .MuiDataGrid-overlay": { backgroundColor: "transparent" },
          }}
        />
      </div>
    </div>
  );
};

export default PlanningTable;
