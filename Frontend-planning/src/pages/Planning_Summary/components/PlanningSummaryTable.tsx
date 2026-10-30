import { memo, useMemo, useCallback } from "react";
import {
  DataGrid,
  GridColDef,
  GridSortModel,
} from "@mui/x-data-grid";
import {
  LayoutDashboard,
  FileSpreadsheet,
  Info,
  AlertCircle,
  AlertTriangle,
  FastForward,
  RotateCcw,
} from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";
import { useAuth } from "@/context/AuthContext";
import { type PlanningSummaryRow } from "../types";
import { toDMY } from "../../PO_Balance/utils";

interface PlanningSummaryTableProps {
  rows: PlanningSummaryRow[];
  loading?: boolean;
  sortModel: GridSortModel;
  onSortModelChange: (model: GridSortModel) => void;
  onExport?: () => void;
  onSkipDue?: (row: PlanningSummaryRow) => Promise<void> | void;
  onUnskipDue?: (row: PlanningSummaryRow) => Promise<void> | void;
}

const num = (value: number | null | undefined, decimals = 0) =>
  value == null
    ? ""
    : Number(value).toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

// แปลง "YYYY-MM-DD HH:MI:SS" -> "DD/MM/YYYY HH:MI" สำหรับแสดงผลคอลัมน์ Scan WIP FFPC
export const formatScanWip = (value: string | null | undefined) => {
  if (!value) return "";
  const str = String(value).trim();
  if (!str) return "";
  const datePart = toDMY(str.slice(0, 10));
  const timePart = str.slice(11, 16); // HH:MI
  if (timePart && timePart !== "00:00") {
    return `${datePart} ${timePart}`;
  }
  return datePart;
};

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

// ── Gate Process Badge ──
const GateBadge = ({ gate }: { gate?: string | null }) => {
  if (!gate || gate.trim() === "") return null;
  const g = gate.trim();

  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold tracking-wide uppercase bg-base-200 text-base-content/70 border border-base-300 leading-none shrink-0">
      {g}
    </span>
  );
};

// ── Clean Lot Status Badge ──
const LotStatusBadge = ({
  status,
  row,
  onOpenPendingModal,
}: {
  status: string;
  row?: PlanningSummaryRow;
  onOpenPendingModal?: (row: PlanningSummaryRow) => void;
}) => {
  if (!status || status.trim() === "") return <span className="text-base-content/25">-</span>;
  const upper = status.toUpperCase().trim();

  if (upper === "PENDING" && onOpenPendingModal && row) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenPendingModal(row);
        }}
        className="lot-badge-pending inline-flex items-center justify-center gap-1 h-[22px] px-2.5 rounded-md text-[11px] tracking-wider uppercase font-bold leading-none whitespace-nowrap shrink-0 shadow-xs hover:ring-2 hover:ring-amber-500/40 active:scale-95 transition-all cursor-pointer"
        title="Click to view Pending Details"
      >
        <span>{upper}</span>
        <Info size={11} className="opacity-70 shrink-0" />
      </button>
    );
  }

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
    sortModel,
    onSortModelChange,
    onExport,
    onSkipDue,
    onUnskipDue,
  }: PlanningSummaryTableProps) => {
    const confirm = useConfirm();
    const { requireAdmin } = useAuth();

    const handleOpenPendingModal = useCallback(
      async (row: PlanningSummaryRow) => {
        let requestedUndo = false;

        const shouldSkip = await confirm({
          variant: "info",
          size: "md",
          title: "Pending Details",
          description: (
            <div className="flex flex-col gap-3 pt-1 text-sm">
              <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl border border-base-300 text-xs">
                <span className="font-semibold text-base-content">
                  Product: <span className="font-bold text-primary">{row.prd_name}</span>
                </span>
                <span className="text-base-content/40">•</span>
                <span className="font-semibold text-base-content">
                  Lot No: <span className="font-mono font-bold">{row.lot_no || "-"}</span>
                </span>
                {(row.proc_disp || row.gate_name) && (
                  <>
                    <span className="text-base-content/40">•</span>
                    <span className="inline-flex items-center gap-1.5 font-semibold text-base-content">
                      <span>Process:</span>
                      {row.proc_disp && (
                        <span className="font-bold">{row.proc_disp}</span>
                      )}
                      <GateBadge gate={row.gate_name} />
                    </span>
                  </>
                )}
                {row.due_date && (
                  <>
                    <span className="text-base-content/40">•</span>
                    <span className="font-semibold text-base-content">
                      Due Date: <span className="font-bold tabular-nums">{toDMY(row.due_date)}</span>
                    </span>
                  </>
                )}
              </div>

              <div className="flex flex-col gap-1.5 p-3 rounded-xl border border-amber-500/40">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                  <AlertCircle size={14} />
                  <span>Pending Reason</span>
                </div>
                <p className="text-[13px] text-base-content/90 font-medium whitespace-pre-wrap leading-relaxed">
                  {row.pending_reason && row.pending_reason.trim() !== ""
                    ? row.pending_reason
                    : "No pending reason specified"}
                </p>
              </div>

              <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/40">
                <div className="flex items-center gap-1.5 text-xs font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider">
                  <AlertTriangle size={14} />
                  <span>Lot Problem</span>
                </div>
                <p className="text-[13px] text-base-content/90 font-medium whitespace-pre-wrap leading-relaxed">
                  {row.lot_problem && row.lot_problem.trim() !== ""
                    ? row.lot_problem
                    : "No lot problem specified"}
                </p>
              </div>

              {row.skipped_due_date && (
                <div className="flex items-center gap-1.5 px-1 pt-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                  <FastForward size={14} className="shrink-0" />
                  <span>
                    Skipped from Due Date:{" "}
                    <span className="font-bold tabular-nums">
                      {toDMY(row.skipped_due_date)}
                    </span>
                  </span>
                </div>
              )}
            </div>
          ),
          leftAction:
            row.skipped_due_date && onUnskipDue ? (
              <button
                type="button"
                onClick={() => {
                  requestedUndo = true;
                  window.dispatchEvent(
                    new KeyboardEvent("keydown", { key: "Escape" })
                  );
                }}
                className="btn btn-sm !bg-amber-500 hover:!bg-amber-600 !border-amber-500 !text-white rounded-full px-4 font-semibold gap-1.5 shadow-xs"
              >
                <RotateCcw size={13} />
                <span>Undo Skip</span>
              </button>
            ) : undefined,
          cancelText: "Close",
          confirmText: "Skip Due",
          hideCancel: false,
        });

        if (requestedUndo && onUnskipDue) {
          const isAuthorized = await requireAdmin();
          if (!isAuthorized) return;

          await new Promise((r) => setTimeout(r, 160));
          const isUndoConfirmed = await confirm({
            variant: "save",
            size: "sm",
            title: "Confirm Undo Skip?",
            description: (
              <div className="flex flex-col gap-2.5 pt-1 text-sm">
                <p className="text-base-content/70 text-[13px]">
                  Restore this lot back to its original Due Date queue?
                </p>
                <div className="flex flex-col gap-1.5 p-3 rounded-xl border border-base-300 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-base-content/60 font-medium">Product</span>
                    <span className="font-bold text-primary">{row.prd_name}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-base-content/60 font-medium">Lot No</span>
                    <span className="font-mono font-bold text-[15px] text-base-content">{row.lot_no}</span>
                  </div>
                  {row.skipped_due_date && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-base-content/60 font-medium">Restore To</span>
                      <span className="font-bold text-[14px] text-base-content tabular-nums">
                        {toDMY(row.skipped_due_date)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ),
            cancelText: "Cancel",
            confirmText: "Confirm",
            hideCancel: false,
          });

          if (isUndoConfirmed) {
            await onUnskipDue(row);
          }
          return;
        }

        if (shouldSkip && onSkipDue) {
          const isAuthorized = await requireAdmin();
          if (!isAuthorized) return;

          await new Promise((r) => setTimeout(r, 160));
          const isConfirmed = await confirm({
            variant: "save",
            size: "sm",
            title: "Confirm Skip Due?",
            description: (
              <div className="flex flex-col gap-2.5 pt-1 text-sm">
                <p className="text-base-content/70 text-[13px]">
                  Move this pending lot to the next nearest Due Date?
                </p>
                <div className="flex flex-col gap-1.5 p-3 rounded-xl border border-base-300 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-base-content/60 font-medium">Product</span>
                    <span className="font-bold text-primary">{row.prd_name}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-base-content/60 font-medium">Lot No</span>
                    <span className="font-mono font-bold text-[15px] text-base-content">{row.lot_no}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-base-content/60 font-medium">Skip Due Date</span>
                    <span className="font-bold text-[14px] text-base-content tabular-nums">
                      {toDMY(row.due_date)}
                    </span>
                  </div>
                </div>
              </div>
            ),
            cancelText: "Cancel",
            confirmText: "Confirm",
            hideCancel: false,
          });

          if (isConfirmed) {
            await onSkipDue(row);
          }
        }
      },
      [confirm, onSkipDue, onUnskipDue, requireAdmin]
    );

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
          headerName: "Target Ship P1",
          headerAlign: "center",
          align: "center",
          minWidth: 140,
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
          field: "day_left",
          headerName: "Day Left",
          headerAlign: "center",
          align: "center",
          type: "number",
          minWidth: 105,
          flex: 0.8,
          renderCell: ({ value }) => {
            if (value === null || value === undefined || value === "") {
              return <span className="text-base-content/25">-</span>;
            }
            const days = Number(value);
            const isNegative = days < 0;
            return (
              <span
                className={`tabular-nums text-[14px] ${
                  isNegative
                    ? "font-bold text-red-600 dark:text-red-400"
                    : "font-medium text-base-content/85"
                }`}
              >
                {num(days)}
              </span>
            );
          },
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
          field: "cal_net_required",
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
          headerName: "Process ",
          headerAlign: "center",
          minWidth: 195,
          flex: 1.2,
          renderCell: ({ row, value }) => {
            const proc = value ? String(value).trim() : "";
            const gate = row.gate_name ? String(row.gate_name).trim() : "";
            if (!proc && !gate) {
              return <span className="text-base-content/25">-</span>;
            }
            return (
              <div className="flex items-center gap-2 h-full overflow-hidden">
                {proc && (
                  <span className="font-semibold text-[13.5px] text-base-content truncate">
                    {proc}
                  </span>
                )}
                <GateBadge gate={gate} />
              </div>
            );
          },
        },
        {
          field: "scan_in",
          headerName: "Scan WIP FFPC",
          headerAlign: "center",
          align: "center",
          minWidth: 160,
          flex: 1,
          renderCell: ({ value }) =>
            value ? (
              <span className="font-medium tabular-nums text-base-content/85 text-[13.5px] whitespace-nowrap">
                {formatScanWip(value)}
              </span>
            ) : (
              <span className="text-base-content/25">-</span>
            ),
        },
        {
          field: "lot_status",
          headerName: "Lot Status",
          headerAlign: "center",
          align: "center",
          minWidth: 130,
          flex: 0.9,
          renderCell: ({ row, value }) => (
            <LotStatusBadge
              status={value}
              row={row}
              onOpenPendingModal={handleOpenPendingModal}
            />
          ),
        },
      ],
      [handleOpenPendingModal]
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
            loading={false}
            slots={{ loadingOverlay: () => null }}
            getRowId={(r) => r.id}
            getRowClassName={({ row }) =>
              row.skipped_due_date ? "skipped-due-row" : ""
            }
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
              "& .MuiDataGrid-row.skipped-due-row": {
                backgroundColor: "color-mix(in oklab, #f59e0b 14%, transparent)",
              },
              "& .MuiDataGrid-row.skipped-due-row:hover": {
                backgroundColor: "color-mix(in oklab, #f59e0b 22%, transparent)",
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
              "& .MuiDataGrid-overlay": {
                backgroundColor: "transparent",
              },
              "& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within, & .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within":
                { outline: "none" },

              // ── Horizontal Scrollbar: วางด้านล่างสุดเต็มขนาด ไม่หลบข้างใน และไม่ทับแถวข้อมูล ──
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
