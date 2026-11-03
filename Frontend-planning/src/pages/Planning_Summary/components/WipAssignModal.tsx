import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Calendar,
  Pin,
  X,
  RotateCcw,
  Check,
  Info,
  Clock,
  Layers,
} from "lucide-react";
import type { PlanningSummaryRow } from "../types";
import { toDMY } from "../../PO_Balance/utils";

interface WipAssignModalProps {
  isOpen: boolean;
  row: PlanningSummaryRow | null;
  allRows: PlanningSummaryRow[];
  onClose: () => void;
  onAssign: (row: PlanningSummaryRow, targetDueDate: string) => Promise<void> | void;
  onUnassign: (row: PlanningSummaryRow) => Promise<void> | void;
}

export const WipAssignModal: React.FC<WipAssignModalProps> = ({
  isOpen,
  row,
  allRows,
  onClose,
  onAssign,
  onUnassign,
}) => {
  const [selectedDueDate, setSelectedDueDate] = useState<string>("");
  const [isCustomDate, setIsCustomDate] = useState<boolean>(false);
  const [customDate, setCustomDate] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Collect all Due Dates available for this product
  const productDueDates = useMemo(() => {
    if (!row) return [];
    const dateMap = new Map<
      string,
      {
        due_date: string;
        day_left?: number | null;
        total_needed: number;
        priority?: string | null;
      }
    >();

    for (const r of allRows) {
      if (r.prd_name === row.prd_name && r.due_date) {
        if (!dateMap.has(r.due_date)) {
          dateMap.set(r.due_date, {
            due_date: r.due_date,
            day_left: r.day_left,
            total_needed: Math.abs(Number(r.net_required_pcs) || 0),
            priority: r.priority,
          });
        }
      }
    }

    return Array.from(dateMap.values()).sort((a, b) =>
      a.due_date.localeCompare(b.due_date)
    );
  }, [row, allRows]);

  useEffect(() => {
    if (row) {
      if (row.assigned_due_date) {
        setSelectedDueDate(row.assigned_due_date);
        const existsInList = productDueDates.some(
          (d) => d.due_date === row.assigned_due_date
        );
        if (!existsInList) {
          setIsCustomDate(true);
          setCustomDate(row.assigned_due_date);
        } else {
          setIsCustomDate(false);
          setCustomDate("");
        }
      } else {
        const defaultDate = row.due_date || (productDueDates[0]?.due_date ?? "");
        setSelectedDueDate(defaultDate);
        setIsCustomDate(false);
        setCustomDate("");
      }
    }
  }, [row, productDueDates]);

  if (!isOpen || !row) return null;

  const currentTargetDate = isCustomDate ? customDate : selectedDueDate;
  const isAlreadyAssigned = Boolean(row.assigned_due_date);

  const handleConfirm = async () => {
    if (!currentTargetDate) return;
    setIsSubmitting(true);
    try {
      await onAssign(row, currentTargetDate);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUndo = async () => {
    setIsSubmitting(true);
    try {
      await onUnassign(row);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        />

        {/* Modal Dialog */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="relative w-full max-w-lg rounded-2xl border border-base-300 bg-base-100 shadow-2xl overflow-hidden z-10"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-base-200 bg-base-100">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-info/10 text-info">
                <Info size={20} />
              </div>
              <div>
                <h3 className="font-bold text-base text-base-content leading-snug">
                  Assign WIP to Due Date
                </h3>
                <p className="text-xs text-base-content/60">
                  Select a target Due Date to prioritize this WIP Lot
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="btn btn-sm btn-ghost btn-circle text-base-content/60 hover:text-base-content"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body Content */}
          <div className="p-6 flex flex-col gap-4 text-sm max-h-[75vh] overflow-y-auto">
            {/* Current Assignment Status Banner (if assigned) */}
            {isAlreadyAssigned && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs">
                <div className="flex items-center gap-2">
                  <Pin size={15} className="rotate-45 shrink-0" />
                  <span>
                    Currently inserted into Due Date:{" "}
                    <strong className="text-sm tabular-nums">
                      {toDMY(row.assigned_due_date)}
                    </strong>
                    {row.original_due_date && (
                      <span className="text-base-content/60 ml-1">
                        (Originally {toDMY(row.original_due_date)})
                      </span>
                    )}
                  </span>
                </div>
              </div>
            )}

            {/* Lot Information Card */}
            <div className="flex flex-col gap-2 p-3.5 rounded-xl border border-base-300 bg-base-200/40 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-base-content/60 font-medium">Product</span>
                <span className="font-bold text-primary text-[13px]">
                  {row.prd_name}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-base-content/60 font-medium">Lot No</span>
                <span className="font-mono font-bold text-base text-base-content">
                  {row.lot_no}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-base-content/60 font-medium">Net WIP Qty</span>
                <span className="font-bold text-base-content tabular-nums">
                  {Number(row.net_wip_qty || 0).toLocaleString()} pcs
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-base-content/60 font-medium">Current Due Date</span>
                <span className="font-bold text-base-content tabular-nums">
                  {toDMY(row.due_date)}
                </span>
              </div>
              {row.proc_disp && (
                <div className="flex items-center justify-between">
                  <span className="text-base-content/60 font-medium">Process</span>
                  <span className="font-medium text-base-content">
                    {row.proc_disp} {row.gate_name ? `(${row.gate_name})` : ""}
                  </span>
                </div>
              )}
            </div>

            {/* Target Due Date Selection */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-base-content uppercase tracking-wider flex items-center gap-1.5">
                <Calendar size={14} className="text-primary" />
                <span>Select Target Due Date</span>
              </label>

              {/* Mode Toggle */}
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setIsCustomDate(false)}
                  className={`btn btn-xs rounded-lg font-medium ${
                    !isCustomDate
                      ? "btn-primary"
                      : "btn-ghost border border-base-300 text-base-content/70"
                  }`}
                >
                  <Layers size={12} />
                  <span>Existing Due Dates ({productDueDates.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsCustomDate(true)}
                  className={`btn btn-xs rounded-lg font-medium ${
                    isCustomDate
                      ? "btn-primary"
                      : "btn-ghost border border-base-300 text-base-content/70"
                  }`}
                >
                  <Clock size={12} />
                  <span>Custom Date</span>
                </button>
              </div>

              {!isCustomDate ? (
                <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pr-1 mt-1">
                  {productDueDates.map((item) => {
                    const isSelected = selectedDueDate === item.due_date;
                    const isCurrent = item.due_date === row.due_date;
                    return (
                      <div
                        key={item.due_date}
                        onClick={() => setSelectedDueDate(item.due_date)}
                        className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                          isSelected
                            ? "border-primary bg-primary/10 shadow-xs"
                            : "border-base-300/80 hover:border-base-300 hover:bg-base-200/50"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="target_due_date"
                            checked={isSelected}
                            onChange={() => setSelectedDueDate(item.due_date)}
                            className="radio radio-primary radio-xs"
                          />
                          <span className="font-bold text-sm text-base-content tabular-nums">
                            {toDMY(item.due_date)}
                          </span>
                          {isCurrent && (
                            <span className="badge badge-ghost badge-xs text-[10px] py-1 font-semibold">
                              Current
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-base-content/70">
                          {item.day_left !== null && item.day_left !== undefined && (
                            <span className="tabular-nums">
                              Day left: {item.day_left}
                            </span>
                          )}
                          {item.priority && (
                            <span className="badge badge-outline badge-xs text-[10px]">
                              {item.priority}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col gap-1 mt-1">
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="input input-sm input-bordered w-full rounded-xl"
                  />
                  <p className="text-[11px] text-base-content/50">
                    Select a date from the calendar to assign this Lot.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-base-200 bg-base-100">
            <div>
              {isAlreadyAssigned && (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleUndo}
                  className="btn btn-sm btn-outline btn-warning gap-1.5 rounded-xl font-semibold"
                >
                  <RotateCcw size={14} />
                  <span>Undo Insert</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={onClose}
                className="btn btn-sm btn-ghost rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting || !currentTargetDate}
                onClick={handleConfirm}
                className="btn btn-sm btn-primary rounded-xl gap-1.5 font-bold shadow-xs px-4"
              >
                {isSubmitting ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <Check size={15} />
                )}
                <span>Confirm Insert</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
};
