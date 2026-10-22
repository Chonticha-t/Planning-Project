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
} from "lucide-react";
import toast from "react-hot-toast";
import { PO_BALANCE_EXCHANGE_RATE_API } from "../hooks/api";

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

const currentYear = new Date().getFullYear();
// Years starting from current year onwards (no past years)
const YEARS = Array.from({ length: 15 }, (_, i) => (currentYear + i).toString());

const DEFAULT_RATES: Record<string, ExchangeRateData> = {
  default: { jpy: 4.25, usd: 0.028 },
};

const STORAGE_KEY = "planning_monthly_exchange_rates";

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

  // Edit Mode state
  const [isEditing, setIsEditing] = useState(false);
  const [jpyRate, setJpyRate] = useState<string>("4.25");
  const [usdRate, setUsdRate] = useState<string>("0.028");
  const [savedJpyRate, setSavedJpyRate] = useState<string>("4.25");
  const [savedUsdRate, setSavedUsdRate] = useState<string>("0.028");

  // DB Sync state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isFromDb, setIsFromDb] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  const monthRef = useRef<HTMLDivElement>(null);
  const yearRef = useRef<HTMLDivElement>(null);

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
        if (isEditing) {
          handleCancelEdit();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isEditing, onClose]);

  // Fetch rate from Database (with localStorage fallback)
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

        if (response.data?.status === "OK" && response.data?.data?.rates) {
          const rates = response.data.data.rates;
          const jpy = (rates.JPY ?? 4.25).toString();
          const usd = (rates.USD ?? 0.028).toString();

          setJpyRate(jpy);
          setUsdRate(usd);
          setSavedJpyRate(jpy);
          setSavedUsdRate(usd);
          setIsFromDb(true);
          setLastUpdatedAt(response.data.data.updated_at || null);
          setIsEditing(false);
          return;
        }
      } catch (err) {
        console.warn("Could not fetch exchange rates from DB, checking local storage:", err);
      }

      if (!isMounted) return;

      // Fallback to localStorage or default
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        const parsed: Record<string, ExchangeRateData> = stored ? JSON.parse(stored) : {};
        const periodKey = `${selectedYear}-${selectedMonth}`;
        const data = parsed[periodKey] || DEFAULT_RATES[periodKey] || DEFAULT_RATES.default;
        const jpy = data.jpy.toString();
        const usd = data.usd.toString();
        setJpyRate(jpy);
        setUsdRate(usd);
        setSavedJpyRate(jpy);
        setSavedUsdRate(usd);
        setIsFromDb(false);
        setLastUpdatedAt(data.updatedAt || null);
      } catch {
        setJpyRate("4.25");
        setUsdRate("0.028");
        setSavedJpyRate("4.25");
        setSavedUsdRate("0.028");
        setIsFromDb(false);
        setLastUpdatedAt(null);
      } finally {
        setIsEditing(false);
        setLoading(false);
      }
    };

    fetchRate().finally(() => {
      if (isMounted) setLoading(false);
    });

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

    if (isNaN(numJpy) || isNaN(numUsd) || numJpy <= 0 || numUsd <= 0) {
      toast.error("Please enter valid positive numbers for exchange rates.");
      return;
    }

    setSaving(true);

    try {
      // 1. Save directly to Database
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

      // 2. Also keep localStorage synchronized as backup
      const periodKey = `${selectedYear}-${selectedMonth}`;
      const timestamp = new Date().toISOString();
      const localPayload: ExchangeRateData = {
        jpy: numJpy,
        usd: numUsd,
        updatedAt: timestamp,
      };

      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        const parsed: Record<string, ExchangeRateData> = stored ? JSON.parse(stored) : {};
        parsed[periodKey] = localPayload;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      } catch (err) {
        console.warn("Could not save to localStorage:", err);
      }

      setSavedJpyRate(numJpy.toString());
      setSavedUsdRate(numUsd.toString());
      setIsFromDb(true);
      setLastUpdatedAt(new Date().toLocaleString("en-GB"));
      setIsEditing(false);

      toast.success(`Saved exchange rates for ${selectedMonth} ${selectedYear} into database!`);
      onSaved?.(localPayload);
    } catch (e: any) {
      console.error("Save error:", e);
      const msg = e.response?.data?.message || e.message || "Failed to save exchange rates into database.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          if (isEditing) handleCancelEdit();
          onClose();
        }
      }}
    >
      <div
        className="bg-base-100 text-base-content rounded-2xl sm:rounded-[22px] shadow-2xl w-full max-w-[480px] p-5 sm:p-6 border border-base-300 flex flex-col animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exchange-rate-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
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
                {isEditing ? (
                  <span className="badge badge-primary badge-sm text-[11px] font-medium py-0.5">
                    Editing
                  </span>
                ) : isFromDb ? (
                  <span className="badge badge-success/15 text-success border-success/30 badge-sm text-[11px] font-medium py-0.5 flex items-center gap-1">
                    <Database size={10} />
                    <span>In DB</span>
                  </span>
                ) : (
                  <span className="badge badge-ghost badge-sm text-[11px] font-medium py-0.5">
                    Default
                  </span>
                )}
              </div>
              <p className="text-[12px] text-base-content/60 mt-0.5">
                {isEditing
                  ? `Enter the exchange rates for ${selectedMonth} ${selectedYear}.`
                  : "View current exchange rates for each currency."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (isEditing) handleCancelEdit();
              onClose();
            }}
            className="btn btn-circle btn-sm btn-ghost hover:bg-base-200 text-base-content/70 hover:text-base-content shrink-0"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Record Period */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-base-content/50 tracking-wider uppercase">
              RECORD PERIOD
            </span>
            {isEditing && (
              <span className="text-[11px] text-primary/80 font-medium">
                (Save or Cancel to change period)
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {/* Month Dropdown */}
            <div ref={monthRef} className="relative">
              <button
                type="button"
                disabled={isEditing || loading}
                onClick={() => {
                  setMonthOpen((prev) => !prev);
                  setYearOpen(false);
                }}
                className={`w-full bg-base-200/60 hover:bg-base-200 border ${
                  monthOpen ? "border-primary ring-2 ring-primary/20" : "border-base-300"
                } ${
                  isEditing ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
                } rounded-xl px-3.5 py-2.5 flex items-center justify-between text-base-content text-[13px] font-medium transition-all`}
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
                <div className="absolute left-0 right-0 top-full mt-1.5 z-30 max-h-52 overflow-y-auto rounded-xl border border-base-300 bg-base-100 p-1.5 shadow-xl">
                  {MONTHS.map((m) => {
                    const isSelected = m === selectedMonth;
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
                        <span>{m}</span>
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
                disabled={isEditing || loading}
                onClick={() => {
                  setYearOpen((prev) => !prev);
                  setMonthOpen(false);
                }}
                className={`w-full bg-base-200/60 hover:bg-base-200 border ${
                  yearOpen ? "border-primary ring-2 ring-primary/20" : "border-base-300"
                } ${
                  isEditing ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
                } rounded-xl px-3.5 py-2.5 flex items-center justify-between text-base-content text-[13px] font-medium transition-all`}
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
                <div className="absolute left-0 right-0 top-full mt-1.5 z-30 max-h-52 overflow-y-auto rounded-xl border border-base-300 bg-base-100 p-1.5 shadow-xl">
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
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-bold text-base-content/50 tracking-wider uppercase">
              CURRENCY EXCHANGE RATES
            </span>
            <span className="text-[11px] text-base-content/50 font-medium">Base: 1 THB</span>
          </div>

          <div className="space-y-2.5">
            {/* THB to JPY */}
            <div className="rounded-xl border border-base-300 bg-base-200/30 hover:border-base-content/20 px-3.5 py-2.5 sm:py-3 flex items-center justify-between gap-2.5 shadow-2xs transition-colors">
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

              {/* View Mode vs Edit Mode for JPY */}
              {isEditing ? (
                <div className="bg-base-200/80 border border-primary/60 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 rounded-xl px-3 py-1.5 sm:py-2 flex items-center justify-between w-28 sm:w-32 transition-all shrink-0 animate-in fade-in duration-150">
                  <span className="text-primary font-semibold text-xs sm:text-sm mr-1.5 select-none">¥</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoFocus
                    value={jpyRate}
                    onChange={(e) => setJpyRate(e.target.value)}
                    placeholder="0.00"
                    disabled={saving}
                    className="w-full text-right font-bold text-[16px] text-base-content bg-transparent focus:outline-none"
                  />
                </div>
              ) : (
                <div className="bg-base-200/50 border border-base-300 rounded-xl px-3 py-1.5 sm:py-2 flex items-center justify-between w-28 sm:w-32 transition-all shrink-0">
                  <span className="text-primary font-semibold text-xs sm:text-sm mr-1.5 select-none">¥</span>
                  {loading ? (
                    <RefreshCw size={14} className="animate-spin text-base-content/40 ml-auto" />
                  ) : (
                    <span className="w-full text-right font-bold text-[16px] text-base-content select-text">
                      {jpyRate}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* THB to USD */}
            <div className="rounded-xl border border-base-300 bg-base-200/30 hover:border-base-content/20 px-3.5 py-2.5 sm:py-3 flex items-center justify-between gap-2.5 shadow-2xs transition-colors">
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
                    <span className="text-[10.5px] text-base-content/50 whitespace-nowrap">
                      United States (Dollar)
                    </span>
                  </div>
                </div>
              </div>

              {/* View Mode vs Edit Mode for USD */}
              {isEditing ? (
                <div className="bg-base-200/80 border border-primary/60 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 rounded-xl px-3 py-1.5 sm:py-2 flex items-center justify-between w-28 sm:w-32 transition-all shrink-0 animate-in fade-in duration-150">
                  <span className="text-primary font-semibold text-xs sm:text-sm mr-1.5 select-none">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={usdRate}
                    onChange={(e) => setUsdRate(e.target.value)}
                    placeholder="0.00"
                    disabled={saving}
                    className="w-full text-right font-bold text-[16px] text-base-content bg-transparent focus:outline-none"
                  />
                </div>
              ) : (
                <div className="bg-base-200/50 border border-base-300 rounded-xl px-3 py-1.5 sm:py-2 flex items-center justify-between w-28 sm:w-32 transition-all shrink-0">
                  <span className="text-primary font-semibold text-xs sm:text-sm mr-1.5 select-none">$</span>
                  {loading ? (
                    <RefreshCw size={14} className="animate-spin text-base-content/40 ml-auto" />
                  ) : (
                    <span className="w-full text-right font-bold text-[16px] text-base-content select-text">
                      {usdRate}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Buttons: View Mode (Close / Edit) vs Edit Mode (Cancel / Save) */}
        {isEditing ? (
          <div className="flex items-center gap-3 mb-3.5">
            <button
              type="button"
              disabled={saving}
              onClick={handleCancelEdit}
              className="btn btn-outline border-base-300 hover:bg-base-200 hover:border-base-300 hover:text-base-content text-base-content flex-1 rounded-full text-[13px] font-semibold min-h-[38px] h-[38px] transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="btn btn-primary flex-1 rounded-full text-primary-content text-[13px] font-semibold min-h-[38px] h-[38px] transition-all shadow-sm cursor-pointer gap-1.5"
            >
              {saving ? <RefreshCw size={15} className="animate-spin" /> : <Check size={16} />}
              <span>{saving ? "Saving to DB..." : "Save"}</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 mb-3.5">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-outline border-base-300 hover:bg-base-200 hover:border-base-300 hover:text-base-content text-base-content flex-1 rounded-full text-[13px] font-semibold min-h-[38px] h-[38px] transition-all cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleStartEdit}
              className="btn btn-primary flex-1 rounded-full text-primary-content text-[13px] font-semibold min-h-[38px] h-[38px] transition-all shadow-sm cursor-pointer gap-1.5"
            >
              <Pencil size={15} />
              <span>Edit</span>
            </button>
          </div>
        )}

        {/* Audit / Security footer */}
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-base-content/50 font-normal">
          <ShieldCheck size={14} className="text-primary shrink-0" />
          <span>
            {lastUpdatedAt ? `Last saved to DB: ${lastUpdatedAt}` : "Secure encrypted storage with PostgreSQL audit trail"}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ExchangeRateModal;
