import { DataGrid, GridColDef } from "@mui/x-data-grid";
import type { PlanningRow } from "../types";

interface PlanningTableProps {
  rows: PlanningRow[];
  loading: boolean;
}

const num = (value: number) =>
  value == null ? "" : Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 });

const numberCol = (field: keyof PlanningRow, headerName: string): GridColDef<PlanningRow> => ({
  field,
  headerName,
  type: "number",
  flex: 1,
  minWidth: 110,
  valueFormatter: (value: number) => num(value),
});

const columns: GridColDef<PlanningRow>[] = [
  { field: "prd_name", headerName: "Product", flex: 1.4, minWidth: 160 },
  { field: "due_date", headerName: "Due Date", flex: 1, minWidth: 110 },
  numberCol("po_bal", "PO Bal"),
  numberCol("unmovement", "Unmovement"),
  numberCol("f_g", "F/G"),
  numberCol("ship_pcs", "Ship (pcs)"),
  numberCol("net_required_pcs", "Net Required"),
  numberCol("rem_unmovement", "Rem Unmove"),
  numberCol("rem_fg", "Rem F/G"),
  {
    field: "status",
    headerName: "Status",
    flex: 1.1,
    minWidth: 140,
    renderCell: ({ value }) => (
      <span
        className={`badge badge-sm font-semibold ${
          value === "ready" ? "badge-success" : "badge-error"
        }`}
      >
        {value}
      </span>
    ),
  },
];

const PlanningTable = ({ rows, loading }: PlanningTableProps) => {
  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm">
      <div className="card-body p-2" style={{ height: "calc(100vh - 330px)", minHeight: 420 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={loading}
          getRowId={(r) => `${r.prd_name}|${r.due_date}`}
          density="compact"
          disableRowSelectionOnClick
          initialState={{ pagination: { paginationModel: { pageSize: 50 } } }}
          pageSizeOptions={[25, 50, 100]}
          getRowClassName={({ row }) =>
            row.status === "production plan" ? "bg-error/5" : ""
          }
          sx={{ border: 0 }}
        />
      </div>
    </div>
  );
};

export default PlanningTable;
