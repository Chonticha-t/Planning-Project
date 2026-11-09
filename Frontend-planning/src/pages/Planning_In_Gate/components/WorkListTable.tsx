import React, { useMemo, useState } from "react";
import { ArrowUp, ArrowDown, ArrowUpToLine, GripVertical, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { InGateLot, OrderBy } from "../types";
import { moveItem, splitByCapacity } from "../utils";


interface WorkListTableProps {
  planOrder: InGateLot[]; // committed (draft) order
  capacityMin: number;
  orderBy: OrderBy;
  search: string;
  onMove: (lotId: string, toIndex: number) => void;
}

export const WorkListTable: React.FC<WorkListTableProps> = ({
  planOrder,
  capacityMin,
  orderBy,
  search,
  onMove,
}) => {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const q = search.trim().toLowerCase();
  const canReorder = orderBy === "plan" && !q;

  // Order shown while dragging (dragged lot sits at the hover position as a drop slot)
  const previewOrder = useMemo(() => {
    if (!dragId || overIndex === null) return planOrder;
    return moveItem(planOrder, planOrder.findIndex((l) => l.id === dragId), overIndex);
  }, [planOrder, dragId, overIndex]);

  const { fit, over } = useMemo(
    () => splitByCapacity(previewOrder, capacityMin),
    [previewOrder, capacityMin]
  );
  const overIds = useMemo(() => new Set(over.map((l) => l.id)), [over]);
  const position = useMemo(
    () => new Map(previewOrder.map((l, i) => [l.id, i + 1])),
    [previewOrder]
  );

  // Rows for the non-reorder views (search / other sort)
  const listRows = useMemo(() => {
    if (canReorder) return [];
    const rows = q
      ? previewOrder.filter(
          (l) => l.id.toLowerCase().includes(q) || l.product.toLowerCase().includes(q)
        )
      : previewOrder.slice();
    if (orderBy === "mustOut") rows.sort((a, b) => a.mustOut.localeCompare(b.mustOut));
    else if (orderBy === "lot") rows.sort((a, b) => a.id.localeCompare(b.id));
    else if (orderBy === "qty") rows.sort((a, b) => b.qty - a.qty);
    return rows;
  }, [canReorder, q, previewOrder, orderBy]);

  const resetDrag = () => {
    setDragId(null);
    setOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (dragId && overIndex !== null) onMove(dragId, overIndex);
    resetDrag();
  };

  const renderRow = (lot: InGateLot) => {
    const pos = position.get(lot.id) ?? 0;
    const idx = pos - 1;
    const isOver = overIds.has(lot.id);
    const highlight = !isOver && (lot.status === "top" || lot.status === "carried");

    if (canReorder && lot.id === dragId) {
      return (
        <tr
          key={lot.id}
          onDragOver={(e) => e.preventDefault()}
          onDragEnd={resetDrag}
          className="h-14"
        >
          <td colSpan={10} className="p-0">
            <div className="mx-0 flex h-14 items-center justify-center border-2 border-dashed border-indigo-300 bg-[#eef2ff]/60 font-bold text-[#4f46e5]">
              Drop {lot.id} here → becomes #{pos}
            </div>
          </td>
        </tr>
      );
    }

    const btn =
      "inline-flex h-7 w-7 items-center justify-center rounded-md border border-base-300 bg-base-100 text-base-content/70 hover:bg-base-200 hover:text-base-content disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer";

    return (
      <tr
        key={lot.id}
        draggable={canReorder}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", lot.id);
          // let the browser snapshot the row before it turns into the drop slot
          requestAnimationFrame(() => {
            setDragId(lot.id);
            setOverIndex(idx);
          });
        }}
        onDragEnd={resetDrag}
        onDragOver={(e) => {
          if (!dragId) return;
          e.preventDefault();
          if (overIndex !== idx) setOverIndex(idx);
        }}
        className={`h-14 border-b border-base-200 transition-colors ${
          isOver
            ? "bg-rose-50/70"
            : highlight
              ? "bg-[#eef2ff]/50 shadow-[inset_4px_0_0_#4f46e5]"
              : "hover:bg-base-200/40"
        }`}
      >
        <td className="w-10 pl-4 text-base-content/30">
          {canReorder && <GripVertical size={16} className="cursor-grab" />}
        </td>
        <td
          className={`w-14 text-center font-bold tabular-nums ${
            highlight ? "text-[#4f46e5]" : "text-base-content/50"
          }`}
        >
          {pos}
        </td>
        <td className="whitespace-nowrap">{lot.product}</td>
        <td className="font-bold whitespace-nowrap">
          {lot.id}
        </td>
        <td className="text-right tabular-nums">{lot.sheet.toLocaleString()}</td>
        <td className="text-right font-bold tabular-nums">{lot.qty.toLocaleString()}</td>
        <td className={`text-center tabular-nums ${lot.outputPcs ? "font-semibold text-emerald-700" : "text-base-content/30"}`}>
          {lot.outputPcs ? lot.outputPcs.toLocaleString() : "–"}
        </td>
        <td className={`text-center tabular-nums ${lot.outputSheet ? "font-semibold text-emerald-700" : "text-base-content/30"}`}>
          {lot.outputSheet ? lot.outputSheet.toLocaleString() : "–"}
        </td>
        <td />
        <td className="pr-4">
          <div className="flex items-center gap-1">
            <button
              type="button"
              title="Move up"
              disabled={!canReorder || idx === 0}
              onClick={() => onMove(lot.id, idx - 1)}
              className={btn}
            >
              <ArrowUp size={13} />
            </button>
            <button
              type="button"
              title="Move down"
              disabled={!canReorder || idx === previewOrder.length - 1}
              onClick={() => onMove(lot.id, idx + 1)}
              className={btn}
            >
              <ArrowDown size={13} />
            </button>
            <button
              type="button"
              title="Move to top"
              disabled={!canReorder || idx === 0}
              onClick={() => onMove(lot.id, 0)}
              className={btn}
            >
              <ArrowUpToLine size={13} />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  const capacityLine = (
    <tr key="__capacity_line" className="bg-rose-50">
      <td colSpan={10} className="py-2 text-center text-[13px] font-bold text-rose-700 border-y border-rose-200">
        <AlertTriangle size={13} className="mr-1 inline -mt-0.5" />
        Today&apos;s capacity is full · lots below move to tomorrow (or open OT)
      </td>
    </tr>
  );

  let body: React.ReactNode[];
  if (canReorder) {
    // Show every lot (no collapsing)
    body = fit.map(renderRow);
    if (over.length > 0) {
      body.push(capacityLine, ...over.map(renderRow));
    } else {
      body.push(
        <tr key="__fits">
          <td colSpan={10} className="py-2 text-center text-[13px] font-bold text-emerald-700 bg-emerald-50">
            <CheckCircle2 size={13} className="mr-1 inline -mt-0.5" />
            All lots fit today&apos;s capacity
          </td>
        </tr>
      );
    }
  } else {
    body = listRows.map(renderRow);
    if (listRows.length === 0) {
      body.push(
        <tr key="__empty">
          <td colSpan={10} className="py-10 text-center text-base-content/50">
            No lots match “{search}”
          </td>
        </tr>
      );
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] table-fixed text-sm text-base-content">
        {/* Fixed column widths; the blank column absorbs leftover width so data stays close together */}
        <colgroup>
          <col className="w-10" />
          <col className="w-14" />
          <col className="w-28" />
          <col className="w-44" />
          <col className="w-24" />
          <col className="w-24" />
          <col className="w-36" />
          <col className="w-40" />
          <col />
          <col className="w-32" />
        </colgroup>
        <thead>
          <tr className="h-12 whitespace-nowrap border-y border-base-200 text-left text-xs font-bold tracking-wider text-base-content/50 uppercase">
            <th />
            <th className="text-center">Pri</th>
            <th>Product</th>
            <th>Lot No</th>
            <th className="text-right">Sheet</th>
            <th className="text-right">Pcs</th>
            <th className="text-center">Output (pcs)</th>
            <th className="text-center">Output (sheet)</th>
            <th />
            <th className="pr-4">Order</th>
          </tr>
        </thead>
        <tbody onDrop={handleDrop} onDragOver={(e) => dragId && e.preventDefault()}>
          {body}
        </tbody>
      </table>
    </div>
  );
};
