import {
  DataGrid,
  GridColDef,
  GridColumnGroupingModel,
  GridColumnMenuContainer,
  GridColumnMenuProps,
  GridSortDirection,
  GridSortModel,
  gridSortModelSelector,
  useGridApiContext,
  useGridSelector,
} from "@mui/x-data-grid";
import { useRef } from "react";
import { Divider, ListItemIcon, ListItemText, MenuItem } from "@mui/material";
import { ArrowDown, ArrowUp, ChevronsUpDown, ClipboardList, X } from "lucide-react";
import type { PlanningRow, PlanningStatus } from "../types";
import { toDMY } from "../utils";

interface POBalanceTableProps {
  rows: PlanningRow[];
  loading: boolean;
  sortModel: GridSortModel;
  onSortModelChange: (model: GridSortModel) => void;
}

const num = (value: number) =>
  value == null ? "" : Number(value).toLocaleString("en-US", { maximumFractionDigits: 0 });

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
  transform?: (value: number) => number,
): GridColDef<PlanningRow> => ({
  field,
  headerName,
  type: "number",
  flex: 1,
  minWidth: 110,
  align: "center",
  headerAlign: "center",
  ...(transform && { valueGetter: (value: number) => (value == null ? value : transform(value)) }),
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


// net_required_pcs ได้รับค่าติดลบมาจาก database แล้ว ไม่ต้องแปลงค่า
export const netDisplay = (v: number) => v;

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
    // value ยังเป็น YYYY-MM-DD เพื่อให้เรียงลำดับถูก — แปลงแค่ตอนแสดง
    renderCell: ({ value }) => <span className="tabular-nums text-base-content/70">{toDMY(value)}</span>,
  },
  numberCol("po_bal", "PO Bal"),
  // ── Inventory group ──────────────────────────
  invCol("unmovement", "Unmovement", "inv-first"),
  invCol("rem_unmovement", "Rem Unmove"),
  invCol("f_g", "F/G"),
  invCol("rem_fg", "Rem F/G", "inv-last"),
  // ─────────────────────────────────────────────
  numberCol("net_required_pcs", "Net Required", true),
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

const invBgGroup = "color-mix(in oklab, var(--color-base-content) 7%, var(--color-base-200))";

// ไอคอนเปิดเมนู sort ที่หัวคอลัมน์ (แทนลูกศร/จุดสามจุดของ DataGrid)
const SortMenuIcon = () => <ChevronsUpDown size={14} />;

// ขนาดเมนูให้เท่า dropdown Status (select-sm) ใน FilterBar
const sortMenuSx = {
  py: 0.5,
  minWidth: 140,
  "& .MuiMenuItem-root": { minHeight: 30, px: 1.5, py: 0.5, fontSize: 13 },
  "& .MuiListItemIcon-root": { minWidth: 22, color: "inherit" },
  "& .MuiListItemText-primary": { fontSize: 13 },
  "& .MuiDivider-root": { my: 0.5 },
};

// เมนู sort: Ascending / Descending (+ Clear sort เมื่อคอลัมน์นี้ sort อยู่) — กดตัวที่เลือกอยู่ซ้ำก็ยกเลิกได้
const SortMenu = ({ hideMenu, colDef, ...other }: GridColumnMenuProps) => {
  const apiRef = useGridApiContext();
  const sortModel = useGridSelector(apiRef, gridSortModelSelector);
  const current = sortModel.find((s) => s.field === colDef.field)?.sort ?? null;

  const sortBy = (direction: GridSortDirection) => (e: React.MouseEvent) => {
    apiRef.current.sortColumn(colDef.field, current === direction ? null : direction);
    hideMenu(e);
  };

  return (
    <GridColumnMenuContainer hideMenu={hideMenu} colDef={colDef} {...other} sx={sortMenuSx}>
      <MenuItem dense selected={current === "asc"} onClick={sortBy("asc")}>
        <ListItemIcon>
          <ArrowUp size={14} />
        </ListItemIcon>
        <ListItemText>Ascending</ListItemText>
      </MenuItem>
      <MenuItem dense selected={current === "desc"} onClick={sortBy("desc")}>
        <ListItemIcon>
          <ArrowDown size={14} />
        </ListItemIcon>
        <ListItemText>Descending</ListItemText>
      </MenuItem>
      {current && <Divider />}
      {current && (
        <MenuItem dense onClick={sortBy(null)}>
          <ListItemIcon>
            <X size={14} />
          </ListItemIcon>
          <ListItemText>Clear sort</ListItemText>
        </MenuItem>
      )}
    </GridColumnMenuContainer>
  );
};

const POBalanceTable = ({ rows, loading, sortModel, onSortModelChange }: POBalanceTableProps) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const lastAnchor = useRef<HTMLElement | null>(null);

  // ให้เมนู sort ขึ้นใต้หัวคอลัมน์ ชิดขอบซ้ายของคอลัมน์ (ค่าเดิมของ DataGrid ยึดปุ่ม <> แล้วชิดขวา เลยดูเบี้ยว)
  // ปุ่ม <> ของคอลัมน์ที่เปิดเมนูอยู่จะมีคลาส menuOpen → หาหัวคอลัมน์จากตรงนั้น
  // (จำตัวล่าสุดไว้ ตอนเมนูกำลังปิดคลาสหายไปแล้วแต่ popper ยังต้องใช้ตำแหน่ง)
  const menuAnchor = () => {
    const header = wrapRef.current
      ?.querySelector(".MuiDataGrid-menuOpen")
      ?.closest<HTMLElement>(".MuiDataGrid-columnHeader");
    if (header) lastAnchor.current = header;
    return lastAnchor.current as HTMLElement;
  };

  return (
    <div className="card bg-base-100 border border-base-300 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-base-300">
        <div className="flex items-center gap-2.5">
          <ClipboardList size={18} className="text-base-content/60" />
          <h2 className="font-semibold text-base-content">PO BALANCE</h2>
        </div>
        <span className="text-xs text-base-content/60 tabular-nums">
          {rows.length.toLocaleString("en-US")} rows
        </span>
      </div>

      <div
        ref={wrapRef}
        className="datagrid-outer"
        style={{ height: "calc(100vh - 260px)", minHeight: 520, position: "relative" }}
        // DataGrid sort เมื่อคลิกหัวคอลัมน์เสมอ (ปิดแยกไม่ได้) → ตัดคลิกที่หัวคอลัมน์ทิ้ง ยกเว้นปุ่ม <>
        onClickCapture={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest(".MuiDataGrid-columnHeader") && !target.closest(".MuiDataGrid-menuIcon")) {
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
          sortModel={sortModel}
          onSortModelChange={onSortModelChange}
          slots={{ columnMenu: SortMenu, columnMenuIcon: SortMenuIcon }}
          slotProps={{ basePopper: { material: { anchorEl: menuAnchor, placement: "bottom-start" } } }}
          showColumnVerticalBorder
          showCellVerticalBorder
          initialState={{ pagination: { paginationModel: { pageSize: 50 } } }}
          pageSizeOptions={[25, 50, 100]}
          sx={{
            border: 0,
            borderRadius: 0,
            fontSize: 13,
            color: "var(--color-base-content)",
            "--DataGrid-rowBorderColor": border,
            "--DataGrid-containerBackground": "var(--color-base-200)",

            // ── Header ──────────────────────────────
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

            // คอลัมน์ที่ไม่มีกลุ่ม (Product, Due Date, PO Bal, Net Required, Status)
            // DataGrid วางชื่อไว้แถวล่าง → ดันขึ้นครึ่งหนึ่งของแถวกลุ่ม ให้อยู่กลางหัวตารางทั้ง 2 แถว
            "& .MuiDataGrid-columnHeader:not(.inv-header):not(.MuiDataGrid-columnHeader--filledGroup):not(.MuiDataGrid-columnHeader--emptyGroup)":
              {
                overflow: "visible",
                // ดันทั้งชื่อคอลัมน์และปุ่ม <> ขึ้นพร้อมกัน
                "& .MuiDataGrid-columnHeaderDraggableContainer": {
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
            "& .MuiDataGrid-columnHeader.inv-group .MuiDataGrid-columnHeaderTitleContainer": {
              borderBottom: `1px solid ${border}`,
            },
            // เส้นคั่นแนวตั้งระหว่างคอลัมน์ (หัวตาราง + ข้อมูล)
            "& .MuiDataGrid-withBorderColor": { borderColor: border },

            "& .MuiDataGrid-columnSeparator": { display: "none" },
            // ไม่แสดงลูกศร sort ของ DataGrid — ใช้ปุ่ม <> อย่างเดียว
            "& .MuiDataGrid-iconButtonContainer": { display: "none" },
            // ปุ่ม <> เปิดเมนู sort — แสดงตลอด ไม่ต้อง hover และวางชิดชื่อคอลัมน์
            "& .MuiDataGrid-columnHeader--sortable": {
              cursor: "default",
              "& .MuiDataGrid-columnHeaderTitleContainer": { flex: "0 1 auto" },
              "& .MuiDataGrid-menuIcon": {
                visibility: "visible",
                width: "auto",
                marginLeft: "2px",
                marginRight: 0,
              },
            },
            "& .MuiDataGrid-columnHeader--sortable.MuiDataGrid-columnHeader--alignCenter .MuiDataGrid-columnHeaderDraggableContainer":
              { justifyContent: "center" },
            "& .MuiDataGrid-menuIconButton": {
              color: "var(--color-base-content)",
              opacity: 0.6,
              padding: "2px",
            },
            "& .MuiDataGrid-columnHeader--sorted .MuiDataGrid-menuIconButton, & .MuiDataGrid-menuOpen .MuiDataGrid-menuIconButton":
              { color: "var(--color-primary)", opacity: 1 },

            // ── Cells / rows ─────────────────────────
            "& .MuiDataGrid-cell": { px: 2, borderColor: border },
            "& .MuiDataGrid-row:hover": {
              backgroundColor: "color-mix(in oklab, var(--color-base-content) 4%, transparent)",
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
                fontSize: 12,
                color: "color-mix(in oklab, var(--color-base-content) 65%, transparent)",
              },
            "& .MuiDataGrid-overlay": { backgroundColor: "transparent" },
            "& .MuiDataGrid-virtualScroller": { willChange: "transform" },
          }}
        />
      </div>
    </div>
  );
};

export default POBalanceTable;
