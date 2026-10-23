import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import {
  CircleDollarSign,
  X,
  Calendar as CalendarIcon,
  ChevronDown,
  ArrowLeftRight,
  ShieldCheck,
  Check,
  Pencil,
  RefreshCw,
  Database,
  AlertCircle,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import { AnimatePresence, motion } from "motion/react";
import { PO_BALANCE_EXCHANGE_RATE_API } from "../hooks/api";
import { useConfirm } from "@/components/ConfirmDialog";

export interface ExchangeRateData {
  jpy: number;
  usd: number;
  updatedAt?: string;
}

interface ExchangeRateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (rates: ExchangeRateData) => void;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Allow only digits with at most one decimal point
const sanitizeRate = (value: string) => {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const [intPart, ...rest] = cleaned.split(".");
  return rest.length ? `${intPart}.${rest.join("")}` : intPart;
};

const currentYear = new Date().getFullYear();
// Years starting from current year onwards (no past years)
const YEARS = Array.from({ length: 15 }, (_, i) => (currentYear + i).toString());

// Vector Flag Components (sharp on all OS and themes)
const ThaiFlag = () => (
  <svg
    viewBox="0 0 32 24"
    className="w-6 h-4.5 rounded-[3px] shadow-xs shrink-0 border border-base-300 overflow-hidden"
    aria-label="Thailand Flag"
  >
    <rect width="32" height="24" fill="#A51931" />
    <rect y="4" width="32" height="16" fill="#F4F5F8" />
    <rect y="8" width="32" height="8" fill="#2D2A4A" />
  </svg>
);

const JapanFlag = () => (
  <svg
    viewBox="0 0 32 24"
    className="w-6 h-4.5 rounded-[3px] shadow-xs shrink-0 border border-base-300 overflow-hidden"
    aria-label="Japan Flag"
  >
    <rect width="32" height="24" fill="#FFFFFF" />
    <circle cx="16" cy="12" r="6" fill="#BC002D" />
  </svg>
);

const USAFlag = () => (
  <svg
    viewBox="0 0 32 24"
    className="w-6 h-4.5 rounded-[3px] shadow-xs shrink-0 border border-base-300 overflow-hidden"
    aria-label="USA Flag"
  >
    <rect width="32" height="24" fill="#B22234" />
    <path
      d="M0 2.4h32M0 6h32M0 9.6h32M0 13.2h32M0 16.8h32M0 20.4h32"
      stroke="#FFFFFF"
      strokeWidth="1.85"
    />
    <rect width="14" height="12" fill="#3C3B6E" />
    <circle cx="3" cy="2.5" r="0.7" fill="#FFFFFF" />
    <circle cx="7" cy="2.5" r="0.7" fill="#FFFFFF" />
    <circle cx="11" cy="2.5" r="0.7" fill="#FFFFFF" />
    <circle cx="5" cy="5" r="0.7" fill="#FFFFFF" />
    <circle cx="9" cy="5" r="0.7" fill="#FFFFFF" />
    <circle cx="3" cy="7.5" r="0.7" fill="#FFFFFF" />
    <circle cx="7" cy="7.5" r="0.7" fill="#FFFFFF" />
    <circle cx="11" cy="7.5" r="0.7" fill="#FFFFFF" />
    <circle cx="5" cy="9.5" r="0.7" fill="#FFFFFF" />
    <circle cx="9" cy="9.5" r="0.7" fill="#FFFFFF" />
  </svg>
);

export const ExchangeRateModal: React.FC<ExchangeRateModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const [selectedMonth, setSelectedMonth] = useState(() => MONTHS[new Date().getMonth()] || "October");
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear().toString());
  const [monthOpen, setMonthOpen] = useState(false);
  const [yearOpen, setYearOpen] = useState(false);

  // Edit & Data state
  const [isEditing, setIsEditing] = useState(false);
  const [jpyRate, setJpyRate] = useState<string>("");
  const [usdRate, setUsdRate] = useState<string>("");
  const [savedJpyRate, setSavedJpyRate] = useState<string>("");
  const [savedUsdRate, setSavedUsdRate] = useState<string>("");

  // DB Sync state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isFromDb, setIsFromDb] = useState(false);
  const [savedMonthsInYear, setSavedMonthsInYear] = useState<string[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const monthRef = useRef<HTMLDivElement>(null);
  const yearRef = useRef<HTMLDivElement>(null);
  const confirm = useConfirm();

  // Close dropdowns on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (monthRef.current && !monthRef.current.contains(e.target as Node)) {
        setMonthOpen(false);
      }
      if (yearRef.current && !yearRef.current.contains(e.target as Node)) {
        setYearOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Auto scroll to selected month/year when dropdown opens
  useEffect(() => {
    if (monthOpen && monthRef.current) {
      setTimeout(() => {
        const el = monthRef.current?.querySelector('[data-selected="true"]');
        el?.scrollIntoView({ block: "center" });
      }, 0);
    }
  }, [monthOpen]);

  useEffect(() => {
    if (yearOpen && yearRef.current) {
      setTimeout(() => {
        const el = yearRef.current?.querySelector('[data-selected="true"]');
        el?.scrollIntoView({ block: "center" });
      }, 0);
    }
  }, [yearOpen]);

  // Close modal on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isEditing && isFromDb) {
          handleCancelEdit();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isEditing, isFromDb, onClose]);

  // Fetch rate from Database when modal opens or period changes
  useEffect(() => {
    if (!isOpen) {
      setIsEditing(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    const fetchRate = async () => {
      try {
        const response = await axios.get(PO_BALANCE_EXCHANGE_RATE_API, {
          params: {
            year: selectedYear,
            month: selectedMonth,
          },
          timeout: 8000,
        });

        if (!isMounted) return;

        if (Array.isArray(response.data?.saved_months)) {
          setSavedMonthsInYear(response.data.saved_months);
        }

        const record = response.data?.data;
        if (response.data?.status === "OK" && record?.rates && (record.rates.JPY || record.rates.USD)) {
          // Period exists in DB -> View Mode (locked)
          const jpy = record.rates.JPY != null ? record.rates.JPY.toString() : "";
          const usd = record.rates.USD != null ? record.rates.USD.toString() : "";

          setJpyRate(jpy);
          setUsdRate(usd);
          setSavedJpyRate(jpy);
          setSavedUsdRate(usd);
          setIsFromDb(true);
          setLastUpdatedAt(record.updated_at || null);
          setIsEditing(false);
        } else {
          // Period does NOT exist in DB yet -> Ready-to-input mode with empty fields (0.00 placeholder)
          setJpyRate("");
          setUsdRate("");
          setSavedJpyRate("");
          setSavedUsdRate("");
          setIsFromDb(false);
          setLastUpdatedAt(null);
          setIsEditing(true);
        }
      } catch (err) {
        console.warn("Could not fetch exchange rates from DB:", err);
        if (!isMounted) return;
        setJpyRate("");
        setUsdRate("");
        setSavedJpyRate("");
        setSavedUsdRate("");
        setIsFromDb(false);
        setLastUpdatedAt(null);
        setIsEditing(true);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchRate();

    return () => {
      isMounted = false;
    };
  }, [isOpen, selectedMonth, selectedYear]);

  const handleStartEdit = () => {
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setJpyRate(savedJpyRate);
    setUsdRate(savedUsdRate);
    setIsEditing(false);
  };

  const handleSave = async () => {
    const numJpy = parseFloat(jpyRate);
    const numUsd = parseFloat(usdRate);

    // If user cleared both fields or set both to 0 while editing an existing record, treat as Reset/Delete
    const isBothEmpty = (!jpyRate.trim() || numJpy === 0) && (!usdRate.trim() || numUsd === 0);
    if (isFromDb && isBothEmpty) {
      handleDelete();
      return;
    }

    if (isNaN(numJpy) || isNaN(numUsd) || numJpy <= 0 || numUsd <= 0) {
      toast.error("Please enter valid positive rates for both JPY and USD.");
      return;
    }

    const ok = await confirm({
      variant: "save",
      title: "Save exchange rates?",
      description: (
        <>
          <p>
            Please confirm the rates for{" "}
            <span className="font-semibold text-base-content">
              {selectedMonth} {selectedYear}
            </span>
            .
          </p>
          <div className="mt-3 rounded-xl border border-base-300 bg-base-200/40 divide-y divide-base-300">
            {[
              { pair: "THB → JPY", value: `¥${numJpy.toLocaleString("en-US", { minimumFractionDigits: 2 })}` },
              { pair: "THB → USD", value: `$${numUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })}` },
            ].map((r) => (
              <div key={r.pair} className="flex items-center justify-between px-3.5 py-2">
                <span className="text-[12px] font-medium text-base-content/60">
                  <span className="text-sm font-bold text-base-content">1</span> {r.pair}
                </span>
                <span className="font-bold text-base-content tabular-nums">{r.value}</span>
              </div>
            ))}
          </div>
        </>
      ),
    });
    if (!ok) return;

    setSaving(true);

    try {
      const payload = {
        year: parseInt(selectedYear, 10),
        month_name: selectedMonth,
        rates: {
          JPY: numJpy,
          USD: numUsd,
        },
      };

      const res = await axios.post(PO_BALANCE_EXCHANGE_RATE_API, payload, {
        timeout: 10000,
      });

      if (res.data?.status !== "OK") {
        throw new Error(res.data?.message || "Failed to save into database.");
      }

      const jpyStr = numJpy.toString();
      const usdStr = numUsd.toString();

      setJpyRate(jpyStr);
      setUsdRate(usdStr);
      setSavedJpyRate(jpyStr);
      setSavedUsdRate(usdStr);
      setIsFromDb(true);
      setSavedMonthsInYear((prev) =>
        prev.includes(selectedMonth) ? prev : [...prev, selectedMonth]
      );
      setLastUpdatedAt(new Date().toLocaleString("en-GB"));
      setIsEditing(false); // Lock into View Mode after saving

      toast.success(`Saved exchange rates for ${selectedMonth} ${selectedYear}.`);
      onSaved?.({ jpy: numJpy, usd: numUsd, updatedAt: new Date().toISOString() });
      onClose();
    } catch (e: any) {
      console.error("Save error:", e);
      const msg = e.response?.data?.message || e.message || "Failed to save exchange rates.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      variant: "delete",
      title: "Delete exchange rates?",
      description: (
        <>
          <p>
            Are you sure you want to delete exchange rates for{" "}
            <span className="font-semibold text-base-content">
              {selectedMonth} {selectedYear}
            </span>
            ?
          </p>
          <p className="mt-2 text-xs text-base-content/60">
            This period will be reset to{" "}
            <span className="font-semibold text-warning">Not Set</span>, and calculations will fall back to the previous available exchange rate.
          </p>
        </>
      ),
      confirmText: "Delete",
    });
    if (!ok) return;

    setDeleting(true);
    try {
      const res = await axios.delete(PO_BALANCE_EXCHANGE_RATE_API, {
        params: {
          year: parseInt(selectedYear, 10),
          month: selectedMonth,
        },
        timeout: 10000,
      });

      if (res.data?.status !== "OK") {
        throw new Error(res.data?.message || "Failed to delete from database.");
      }

      setJpyRate("");
      setUsdRate("");
      setSavedJpyRate("");
      setSavedUsdRate("");
      setIsFromDb(false);
      setSavedMonthsInYear((prev) => prev.filter((m) => m !== selectedMonth));
      setLastUpdatedAt(null);
      setIsEditing(true);

      toast.success(`Deleted exchange rates for ${selectedMonth} ${selectedYear}.`);
      onSaved?.({ jpy: 0, usd: 0, updatedAt: new Date().toISOString() });
    } catch (e: any) {
      console.error("Delete error:", e);
      const msg = e.response?.data?.message || e.message || "Failed to delete exchange rates.";
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  // Real-time reciprocal calculations for user clarity (1 JPY = ? THB, 1 USD = ? THB)
  const numJpy = parseFloat(jpyRate);
  const thbPerJpy = !isNaN(numJpy) && numJpy > 0 ? (1 / numJpy).toFixed(4) : null;

  const numUsd = parseFloat(usdRate);
  const thbPerUsd = !isNaN(numUsd) && numUsd > 0 ? (1 / numUsd).toFixed(2) : null;

  // Input is active if it's a new month (!isFromDb) OR user clicked Edit on an existing month
  const isInputActive = !isFromDb || isEditing;

  return (
    <AnimatePresence>
    {isOpen && (
    <motion.div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <motion.div
        className="bg-base-100 text-base-content rounded-2xl sm:rounded-[22px] shadow-2xl w-full max-w-[480px] p-6 sm:p-7 border border-base-300 flex flex-col"
        initial={{ opacity: 0, scale: 0.95, y: -40 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -40 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="exchange-rate-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <CircleDollarSign size={26} className="text-primary shrink-0" strokeWidth={2.2} />
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="exchange-rate-title"
                  className="text-[18px] sm:text-[19px] font-bold text-base-content tracking-tight leading-tight"
                >
                  Exchange Rate
                </h2>
                {loading ? (
                  <span className="badge badge-ghost badge-sm text-[11px] font-medium py-0.5">
                    Checking...
                  </span>
                ) : isFromDb && !isEditing ? (
                  <span className="badge bg-success/15 text-success border-success/30 badge-sm text-[11px] font-semibold py-0.5 flex items-center gap-1">
                    <Database size={10} />
                    <span>Saved</span>
                  </span>
                ) : isFromDb && isEditing ? (
                  <span className="badge badge-primary badge-sm text-[11px] font-semibold py-0.5">
                    Editing
                  </span>
                ) : (
                  <span className="badge bg-warning/15 text-warning border-warning/30 badge-sm text-[11px] font-semibold py-0.5 flex items-center gap-1">
                    <AlertCircle size={10} />
                    <span>Not Set</span>
                  </span>
                )}
              </div>
              <p className="text-[12px] text-base-content/60 mt-1">
                {loading
                  ? "Loading exchange rate from database..."
                  : !isFromDb
                  ? `No record for ${selectedMonth} ${selectedYear}.`
                  : isEditing
                  ? `Editing exchange rates for ${selectedMonth} ${selectedYear}.`
                  : `Saved exchange rates for ${selectedMonth} ${selectedYear}.`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-circle btn-sm btn-ghost hover:bg-base-200 text-base-content/70 hover:text-base-content shrink-0"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Record Period */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-bold text-base-content/50 tracking-wider uppercase">
              RECORD PERIOD
            </span>
            {isFromDb && isEditing && (
              <span className="text-[11px] text-primary/80 font-medium">
                (Cancel edit to switch period)
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {/* Month Dropdown (always selectable unless editing an existing DB record) */}
            <div ref={monthRef} className="relative">
              <button
                type="button"
                disabled={(isFromDb && isEditing) || loading || saving}
                onClick={() => {
                  setMonthOpen((prev) => !prev);
                  setYearOpen(false);
                }}
                className={`w-full bg-base-200/60 hover:bg-base-200 border ${
                  monthOpen ? "border-primary ring-2 ring-primary/20" : "border-base-300"
                } ${
                  isFromDb && isEditing ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
                } rounded-xl px-3.5 py-3 flex items-center justify-between text-base-content text-[13px] font-medium transition-all`}
              >
                <div className="flex items-center gap-2 truncate">
                  <CalendarIcon size={16} className="text-base-content/70 shrink-0" />
                  <span className="truncate">{selectedMonth}</span>
                </div>
                <ChevronDown
                  size={15}
                  className={`text-base-content/50 shrink-0 transition-transform duration-200 ${
                    monthOpen ? "rotate-180 text-primary" : ""
                  }`}
                />
              </button>

              {monthOpen && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-30 max-h-56 overflow-y-auto rounded-xl border border-base-300 bg-base-100 p-1.5 shadow-xl">
                  {MONTHS.map((m) => {
                    const isSelected = m === selectedMonth;
                    const hasSavedData = savedMonthsInYear.includes(m);
                    return (
                      <button
                        key={m}
                        type="button"
                        data-selected={isSelected}
                        onClick={() => {
                          setSelectedMonth(m);
                          setMonthOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[13px] transition-colors cursor-pointer text-left ${
                          isSelected
                            ? "bg-primary/10 text-primary font-semibold"
                            : "text-base-content hover:bg-base-200 font-normal"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span>{m}</span>
                          {hasSavedData && (
                            <span
                              className="w-1.5 h-1.5 rounded-full bg-success inline-block"
                              title="Saved in DB"
                            />
                          )}
                        </span>
                        {isSelected && <Check size={14} className="text-primary" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Year Dropdown */}
            <div ref={yearRef} className="relative">
              <button
                type="button"
                disabled={(isFromDb && isEditing) || loading || saving}
                onClick={() => {
                  setYearOpen((prev) => !prev);
                  setMonthOpen(false);
                }}
                className={`w-full bg-base-200/60 hover:bg-base-200 border ${
                  yearOpen ? "border-primary ring-2 ring-primary/20" : "border-base-300"
                } ${
                  isFromDb && isEditing ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
                } rounded-xl px-3.5 py-3 flex items-center justify-between text-base-content text-[13px] font-medium transition-all`}
              >
                <div className="flex items-center gap-2 truncate">
                  <CalendarIcon size={16} className="text-base-content/70 shrink-0" />
                  <span className="truncate">{selectedYear}</span>
                </div>
                <ChevronDown
                  size={15}
                  className={`text-base-content/50 shrink-0 transition-transform duration-200 ${
                    yearOpen ? "rotate-180 text-primary" : ""
                  }`}
                />
              </button>

              {yearOpen && (
                <div className="absolute left-0 right-0 top-full mt-1.5 z-30 max-h-56 overflow-y-auto rounded-xl border border-base-300 bg-base-100 p-1.5 shadow-xl">
                  {YEARS.map((y) => {
                    const isSelected = y === selectedYear;
                    return (
                      <button
                        key={y}
                        type="button"
                        data-selected={isSelected}
                        onClick={() => {
                          setSelectedYear(y);
                          setYearOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-[13px] transition-colors cursor-pointer text-left ${
                          isSelected
                            ? "bg-primary/10 text-primary font-semibold"
                            : "text-base-content hover:bg-base-200 font-normal"
                        }`}
                      >
                        <span>{y}</span>
                        {isSelected && <Check size={14} className="text-primary" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Currency Exchange Rates */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-bold text-base-content/50 tracking-wider uppercase">
              CURRENCY EXCHANGE RATES
            </span>
            <span className="text-[11px] text-base-content/50 font-medium">Base: 1 THB</span>
          </div>

          <div className="space-y-3">
            {/* THB to JPY */}
            <div className="rounded-xl border border-base-300 bg-base-200/30 hover:border-base-content/20 px-4 py-3.5 sm:py-4 flex items-center justify-between gap-2.5 shadow-2xs transition-colors">
              <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
                {/* 1 THB */}
                <div className="flex items-center gap-2 shrink-0">
                  <ThaiFlag />
                  <div className="flex flex-col">
                    <span className="text-[14px] font-bold text-base-content leading-tight whitespace-nowrap">
                      1 THB
                    </span>
                    <span className="text-[10.5px] text-base-content/50 whitespace-nowrap">
                      Thai Baht
                    </span>
                  </div>
                </div>

                {/* Arrow */}
                <ArrowLeftRight size={14} className="text-primary mx-1 sm:mx-1.5 shrink-0" />

                {/* JPY */}
                <div className="flex items-center gap-2 shrink-0">
                  <JapanFlag />
                  <div className="flex flex-col">
                    <span className="text-[14px] font-bold text-base-content leading-tight whitespace-nowrap">
                      JPY
                    </span>
                    <span className="text-[10.5px] text-base-content/50 whitespace-nowrap">
                      Japan (Yen)
                    </span>
                  </div>
                </div>
              </div>

              {/* Input vs View for JPY */}
              <div className="flex flex-col items-end shrink-0">
                {loading ? (
                  <div className="bg-base-200/50 border border-base-300 rounded-xl px-3 py-1.5 sm:py-2 flex items-center justify-between w-28 sm:w-32 shrink-0">
                    <span className="text-primary font-semibold text-xs sm:text-sm mr-1.5 select-none">¥</span>
                    <RefreshCw size={14} className="animate-spin text-base-content/40 ml-auto" />
                  </div>
                ) : isInputActive ? (
                  <div className="bg-base-200/80 border border-primary/60 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 rounded-xl px-3 py-1.5 sm:py-2 flex items-center justify-between w-28 sm:w-32 transition-all shrink-0 animate-in fade-in duration-150">
                    <span className="text-primary font-semibold text-xs sm:text-sm mr-1.5 select-none">¥</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoFocus
                      value={jpyRate}
                      onChange={(e) => setJpyRate(sanitizeRate(e.target.value))}
                      placeholder="0.00"
                      disabled={saving || deleting}
                      className="w-full text-right font-bold text-[16px] text-base-content placeholder:text-base-content/30 bg-transparent focus:outline-none"
                    />
                  </div>
                ) : (
                  <div className="bg-base-200/50 border border-base-300 rounded-xl px-3 py-1.5 sm:py-2 flex items-center justify-between w-28 sm:w-32 transition-all shrink-0">
                    <span className="text-primary font-semibold text-xs sm:text-sm mr-1.5 select-none">¥</span>
                    <span className="w-full text-right font-bold text-[16px] text-base-content select-text">
                      {jpyRate}
                    </span>
                  </div>
                )}
                {thbPerJpy && (
                  <span className="text-[10.5px] text-base-content/50 font-medium mt-1 select-none">
                    ≈ {thbPerJpy} THB / 1 JPY
                  </span>
                )}
              </div>
            </div>

            {/* THB to USD */}
            <div className="rounded-xl border border-base-300 bg-base-200/30 hover:border-base-content/20 px-4 py-3.5 sm:py-4 flex items-center justify-between gap-2.5 shadow-2xs transition-colors">
              <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
                {/* 1 THB */}
                <div className="flex items-center gap-2 shrink-0">
                  <ThaiFlag />
                  <div className="flex flex-col">
                    <span className="text-[14px] font-bold text-base-content leading-tight whitespace-nowrap">
                      1 THB
                    </span>
                    <span className="text-[10.5px] text-base-content/50 whitespace-nowrap">
                      Thai Baht
                    </span>
                  </div>
                </div>

                {/* Arrow */}
                <ArrowLeftRight size={14} className="text-primary mx-1 sm:mx-1.5 shrink-0" />

                {/* USD */}
                <div className="flex items-center gap-2 shrink-0">
                  <USAFlag />
                  <div className="flex flex-col">
                    <span className="text-[14px] font-bold text-base-content leading-tight whitespace-nowrap">
                      USD
                    </span>
                    <span className="text-[10.5px] text-base-content/50 whitespace-nowrap leading-tight">
                      United States<br />(Dollar)
                    </span>
                  </div>
                </div>
              </div>

              {/* Input vs View for USD */}
              <div className="flex flex-col items-end shrink-0">
                {loading ? (
                  <div className="bg-base-200/50 border border-base-300 rounded-xl px-3 py-1.5 sm:py-2 flex items-center justify-between w-28 sm:w-32 shrink-0">
                    <span className="text-primary font-semibold text-xs sm:text-sm mr-1.5 select-none">$</span>
                    <RefreshCw size={14} className="animate-spin text-base-content/40 ml-auto" />
                  </div>
                ) : isInputActive ? (
                  <div className="bg-base-200/80 border border-primary/60 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 rounded-xl px-3 py-1.5 sm:py-2 flex items-center justify-between w-28 sm:w-32 transition-all shrink-0 animate-in fade-in duration-150">
                    <span className="text-primary font-semibold text-xs sm:text-sm mr-1.5 select-none">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={usdRate}
                      onChange={(e) => setUsdRate(sanitizeRate(e.target.value))}
                      placeholder="0.00"
                      disabled={saving || deleting}
                      className="w-full text-right font-bold text-[16px] text-base-content placeholder:text-base-content/30 bg-transparent focus:outline-none"
                    />
                  </div>
                ) : (
                  <div className="bg-base-200/50 border border-base-300 rounded-xl px-3 py-1.5 sm:py-2 flex items-center justify-between w-28 sm:w-32 transition-all shrink-0">
                    <span className="text-primary font-semibold text-xs sm:text-sm mr-1.5 select-none">$</span>
                    <span className="w-full text-right font-bold text-[16px] text-base-content select-text">
                      {usdRate}
                    </span>
                  </div>
                )}
                {thbPerUsd && (
                  <span
                    className={`text-[10.5px] font-medium mt-1 select-none ${
                      numUsd > 1 ? "text-warning font-semibold" : "text-base-content/50"
                    }`}
                  >
                    ≈ {thbPerUsd} THB / 1 USD
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Action Buttons */}
        {!isFromDb ? (
          // New Month (Not in DB yet): Cancel + Save directly
          <div className="flex items-center gap-3 mb-4">
            <button
              type="button"
              disabled={saving || deleting}
              onClick={onClose}
              className="btn btn-outline border-base-300 hover:bg-base-200 hover:border-base-300 hover:text-base-content text-base-content flex-1 rounded-full text-[13px] font-semibold min-h-[44px] h-[44px] transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || loading || deleting}
              onClick={handleSave}
              className="btn btn-primary flex-1 rounded-full text-primary-content text-[13px] font-semibold min-h-[44px] h-[44px] transition-all shadow-sm cursor-pointer gap-1.5"
            >
              {saving ? <RefreshCw size={15} className="animate-spin" /> : <Check size={16} />}
              <span>{saving ? "Saving..." : "Save"}</span>
            </button>
          </div>
        ) : isEditing ? (
          // Existing Month in DB + Editing: Cancel + Save
          <div className="flex items-center gap-3 mb-4">
            <button
              type="button"
              disabled={saving || deleting}
              onClick={handleCancelEdit}
              className="btn btn-outline border-base-300 hover:bg-base-200 hover:border-base-300 hover:text-base-content text-base-content flex-1 rounded-full text-[13px] font-semibold min-h-[44px] h-[44px] transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || deleting}
              onClick={handleSave}
              className="btn btn-primary flex-1 rounded-full text-primary-content text-[13px] font-semibold min-h-[44px] h-[44px] transition-all shadow-sm cursor-pointer gap-1.5"
            >
              {saving ? <RefreshCw size={15} className="animate-spin" /> : <Check size={16} />}
              <span>{saving ? "Saving..." : "Save"}</span>
            </button>
          </div>
        ) : (
          // Existing Month in DB + View Mode: Close + Edit (Clean 2 buttons, identical to original)
          <div className="flex items-center gap-3 mb-4">
            <button
              type="button"
              disabled={deleting}
              onClick={onClose}
              className="btn btn-outline border-base-300 hover:bg-base-200 hover:border-base-300 hover:text-base-content text-base-content flex-1 rounded-full text-[13px] font-semibold min-h-[44px] h-[44px] transition-all cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleStartEdit}
              className="btn btn-primary flex-1 rounded-full text-primary-content text-[13px] font-semibold min-h-[44px] h-[44px] transition-all shadow-sm cursor-pointer gap-1.5"
            >
              <Pencil size={15} />
              <span>Edit</span>
            </button>
          </div>
        )}

        {/* Audit / Security footer with Delete right next to it */}
        {lastUpdatedAt && (
          <div className="flex items-center justify-center gap-2.5 text-[11px] text-base-content/50 font-normal">
            <div className="flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-primary shrink-0" />
              <span>Last saved to DB: {lastUpdatedAt}</span>
            </div>
            {isFromDb && (
              <>
                <span className="text-base-content/30 select-none">•</span>
                <button
                  type="button"
                  disabled={saving || deleting}
                  onClick={handleDelete}
                  className="text-error hover:text-error/80 hover:underline flex items-center gap-1 font-semibold cursor-pointer transition-colors"
                  title="Delete exchange rates for this month"
                >
                  {deleting ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  <span>Delete</span>
                </button>
              </>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
    )}
    </AnimatePresence>
  );
};

export default ExchangeRateModal;
