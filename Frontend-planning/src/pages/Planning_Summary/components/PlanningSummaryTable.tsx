import { memo, useMemo } from "react";
import {
  DataGrid,
  GridColDef,
  GridSortModel,
} from "@mui/x-data-grid";
import { LayoutDashboard, FileSpreadsheet } from "lucide-react";
import { SORT_OPTIONS, type PlanningSummaryRow } from "../types";
import { toDMY } from "../../PO_Balance/utils";

export { SORT_OPTIONS };

interface PlanningSummaryTableProps {
  rows: PlanningSummaryRow[];
  loading?: boolean;
  sortModel: GridSortModel;
  onSortModelChange: (model: GridSortModel) => void;
  onExport?: () => void;
}

const num = (value: number | null | undefined, decimals = 0) =>
  value == null
    ? ""
    : Number(value).toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

const NumberCell = ({
  value,
  strong,
  decimals = 0,
  colorClass = "text-base-content/85",
}: {
  value: number | null | undefined;
  strong?: boolean;
  decimals?: number;
  colorClass?: string;
}) => (
  <span
    className={`tabular-nums text-[14px] ${
      !value
        ? "text-base-content/25"
        : strong
        ? "font-bold text-error"
        : colorClass
    }`}
  >
    {num(value, decimals)}
  </span>
);

// ── Status Pill ตรงตามสไตล์หน้า PO (Pill พร้อม Dot สวยงาม คมชัด) ──
const StatusPill = ({ value }: { value: string }) => {
  if (!value) return <span className="text-base-content/30">-</span>;
  const s = value.toLowerCase().trim();

  const isReady = s === "ready" || s === "ok";
  const isPlan = s.includes("plan") || s === "production plan";

  if (isReady) {
    return (
      <span className="status-pill inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold status-pill-ready whitespace-nowrap shrink-0">
        <span className="status-dot size-2 rounded-full shrink-0" />
        <span>Ready</span>
      </span>
    );
  }

  if (isPlan) {
    return (
      <span className="status-pill inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold status-pill-plan whitespace-nowrap shrink-0">
        <span className="status-dot size-2 rounded-full shrink-0" />
        <span>Production Plan</span>
      </span>
    );
  }

  return (
    <span className="status-pill status-pill-wip inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap shrink-0">
      <span className="status-dot size-2 rounded-full shrink-0" />
      <span>{value}</span>
    </span>
  );
};

// ── Priority Cell ──
const PriorityCell = ({ priority }: { priority: string | null | undefined }) => {
  if (!priority || priority.trim() === "") return <span className="text-base-content/25">-</span>;
  const p = priority.trim();
  const upper = p.toUpperCase();

  if (upper.includes("URGENT") || upper === "P1") {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#dc2626] text-white font-bold text-[12px] tracking-wider uppercase select-all">
        {p}
      </div>
    );
  }

  if (upper.includes("HIGH") || upper === "P2") {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#facc15] text-black font-bold text-[12px] tracking-wider uppercase select-all">
        {p}
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center text-base-content/75 font-medium text-[12px] tracking-wide">
      {p}
    </div>
  );
};

// ── Clean Lot Status Badge ──
const LotStatusBadge = ({ status }: { status: string }) => {
  if (!status || status.trim() === "") return <span className="text-base-content/25">-</span>;
  const upper = status.toUpperCase().trim();

  let colorClass = "bg-base-200 text-base-content/70 border border-base-content/20";
  if (upper === "HOLD") colorClass = "lot-badge-hold font-bold";
  else if (upper === "PENDING") colorClass = "lot-badge-pending font-bold";
  else if (upper === "WIP") colorClass = "lot-badge-wip font-semibold";
  else if (upper === "RUN") colorClass = "lot-badge-run font-semibold";
  else if (upper === "WAIT") colorClass = "lot-badge-wait font-semibold";

  return (
    <span
      className={`inline-flex items-center justify-center h-[22px] px-2.5 rounded-md text-[11px] tracking-wider uppercase leading-none whitespace-nowrap shrink-0 shadow-xs ${colorClass}`}
    >
      {upper}
    </span>
  );
};


const border = "color-mix(in oklab, var(--color-base-content) 10%, transparent)";
const headerBg = "var(--color-base-200)";

const PlanningSummaryTable = memo(
  ({
    rows,
    loading = false,
    sortModel,
    onSortModelChange,
    onExport,
  }: PlanningSummaryTableProps) => {
    const columns: GridColDef<PlanningSummaryRow>[] = useMemo(
      () => [
        // ── Plan Overview ─────────────────────────
        {
          field: "prd_name",
          headerName: "Product",
          headerAlign: "center",
          minWidth: 170,
          flex: 1.2,
          renderCell: ({ value }) => (
            <span className="font-semibold text-base-content text-[14px] truncate">
              {value}
            </span>
          ),
        },
        {
          field: "due_date",
          headerName: "Due Date",
          headerAlign: "center",
          align: "center",
          minWidth: 120,
          flex: 0.9,
          renderCell: ({ value }) => (
            <span className="font-medium tabular-nums text-base-content text-[14px] whitespace-nowrap">
              {toDMY(value)}
            </span>
          ),
        },
        {
          field: "ship_to_p1",
          headerName: "Ship to P1",
          headerAlign: "center",
          align: "center",
          minWidth: 125,
          flex: 0.9,
          renderCell: ({ value }) =>
            value ? (
              <span className="font-medium tabular-nums text-[#0D47A1] dark:text-[#60a5fa] text-[14px] whitespace-nowrap">
                {toDMY(value)}
              </span>
            ) : (
              <span className="text-base-content/25">-</span>
            ),
        },
        {
          field: "priority",
          headerName: "Priority",
          headerAlign: "center",
          align: "center",
          minWidth: 110,
          flex: 0.8,
          renderCell: ({ value }) => <PriorityCell priority={value} />,
        },
        {
          field: "status",
          headerName: "Status",
          headerAlign: "center",
          align: "center",
          minWidth: 170,
          flex: 1.1,
          renderCell: ({ value }) => <StatusPill value={value} />,
        },

        // ── Group 1: Demand & Balance ────────────
        {
          field: "net_required_pcs",
          headerName: "Net Required",
          headerAlign: "center",
          align: "center",
          type: "number",
          minWidth: 130,
          flex: 1,
          renderCell: ({ value }) => <NumberCell value={value} strong />,
        },

        // ── Group 2: WIP & Lot Tracking ──────────
        {
          field: "lot_no",
          headerName: "Lot No",
          headerAlign: "center",
          align: "center",
          minWidth: 160,
          flex: 1.1,
          renderCell: ({ value }) => (
            <span className="font-mono font-bold text-[15px] text-base-content tracking-wide select-all">
              {value || "-"}
            </span>
          ),
        },
        {
          field: "net_wip_qty",
          headerName: "Net WIP",
          headerAlign: "center",
          align: "center",
          type: "number",
          minWidth: 120,
          flex: 0.9,
          renderCell: ({ value }) => (
            <NumberCell
              value={value}
              colorClass="text-emerald-600 dark:text-emerald-400 font-semibold"
            />
          ),
        },
        {
          field: "proc_disp",
          headerName: "Process",
          headerAlign: "center",
          minWidth: 140,
          flex: 1,
          renderCell: ({ value }) => (
            <span className="text-[13.5px] text-base-content/80 truncate">
              {value || "-"}
            </span>
          ),
        },
        {
          field: "lot_status",
          headerName: "Lot Status",
          headerAlign: "center",
          align: "center",
          minWidth: 130,
          flex: 0.9,
          renderCell: ({ value }) => <LotStatusBadge status={value} />,
        },
      ],
      []
    );

    return (
      <div className="rounded-2xl border border-base-300/80 bg-base-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden">
        {/* Table Top Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-base-300/80 bg-base-100">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <LayoutDashboard size={17} />
            </div>
            <h2 className="font-bold text-base-content tracking-wide text-sm">
              PLANNING SUMMARY
            </h2>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="badge badge-sm badge-ghost font-semibold text-xs text-base-content/70 tabular-nums">
              {rows.length.toLocaleString("en-US")} rows
            </span>
            {onExport && (
              <button
                type="button"
                className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white border-none rounded-lg text-[13px] gap-1.5 font-medium shadow-xs transition-colors cursor-pointer"
                onClick={onExport}
              >
                <FileSpreadsheet size={15} />
                Export Excel
              </button>
            )}
          </div>
        </div>

        {/* DataGrid Container */}
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
            loading={loading}
            getRowId={(r) => r.id}
            rowHeight={44}
            resizeThrottleMs={0}
            columnHeaderHeight={40}
            disableRowSelectionOnClick
            disableColumnMenu
            showColumnVerticalBorder
            showCellVerticalBorder
            sortModel={sortModel}
            onSortModelChange={onSortModelChange}
            initialState={{
              pagination: { paginationModel: { pageSize: 50 } },
            }}
            pageSizeOptions={[25, 50, 100, 200]}
            sx={{
              border: 0,
              borderRadius: 0,
              fontSize: 14,
              color: "var(--color-base-content)",
              "--DataGrid-rowBorderColor": border,
              "--DataGrid-containerBackground": headerBg,

              // ── Header Styling: Clean, unified, no rainbow patches ──
              "& .MuiDataGrid-columnHeaders": {
                backgroundColor: headerBg,
                borderBottom: `1px solid ${border}`,
              },
              "& .MuiDataGrid-columnHeader": {
                backgroundColor: headerBg,
                px: 2,
                borderRight: `1px solid ${border} !important`,
              },
              "& .MuiDataGrid-columnHeaderTitle": {
                fontSize: 12.5,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color:
                  "color-mix(in oklab, var(--color-base-content) 75%, transparent)",
              },

              // Borders & Sort Arrows Removal (เหมือนหน้า PO)
              "& .MuiDataGrid-withBorderColor": { borderColor: border },
              "& .MuiDataGrid-columnSeparator": { display: "none" },
              "& .MuiLinearProgress-root": { display: "none" },
              "& .MuiDataGrid-iconButtonContainer": { display: "none" },
              "& .MuiDataGrid-columnHeader--sortable": {
                cursor: "default",
              },

              // ── Cells / Rows ──
              "& .MuiDataGrid-cell": {
                px: 2,
                borderColor: border,
              },
              "& .MuiDataGrid-cell[data-field='status']": {
                px: 1,
                overflow: "visible",
                textOverflow: "clip",
              },
              "& .MuiDataGrid-cell[data-field='lot_status']": {
                justifyContent: "center",
                display: "flex",
                alignItems: "center",
              },
              "& .MuiDataGrid-cell[data-field='priority']": {
                p: "0 !important",
                display: "flex",
                alignItems: "stretch",
                justifyContent: "stretch",
              },
              "& .MuiDataGrid-row:hover": {
                backgroundColor:
                  "color-mix(in oklab, var(--color-base-content) 3.5%, transparent)",
              },
              "& .MuiDataGrid-virtualScroller": {
                opacity: "1 !important",
              },
              "& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within, & .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within":
                { outline: "none" },

              // ── Footer / Pagination ──
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
            }}
          />
        </div>
      </div>
    );
  }
);

PlanningSummaryTable.displayName = "PlanningSummaryTable";

export default PlanningSummaryTable;
