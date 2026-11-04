import React, { useMemo, useState, useRef, useEffect } from "react";
import dayjs from "dayjs";
import {
  Search,
  RotateCw,
  Calendar,
  ChevronDown,
  X,
  Check,
} from "lucide-react";
import type { PrdCategory, PlanWindow } from "../types";

interface GateFilterBarProps {
  todayStr: string;
  category: PrdCategory;
  onCategoryChange: (cat: PrdCategory) => void;
  planWindow: PlanWindow;
  onPlanWindowChange: (pw: PlanWindow) => void;
  products?: string[];
  selectedProduct?: string;
  onProductChange?: (prd: string) => void;
  search: string;
  onSearchChange: (val: string) => void;
  lastUpdated?: string;
  loading?: boolean;
  onRefresh: () => void;
}

export const GateFilterBar: React.FC<GateFilterBarProps> = ({
  todayStr,
  category,
  onCategoryChange,
  planWindow,
  onPlanWindowChange,
  products = [],
  selectedProduct = "",
  onProductChange,
  search,
  onSearchChange,
  lastUpdated,
  loading,
  onRefresh,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownQuery, setDropdownQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredProducts = useMemo(() => {
    const q = dropdownQuery.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.toLowerCase().includes(q));
  }, [products, dropdownQuery]);

  const dateRangeDisplay = useMemo(() => {
    const start = dayjs(todayStr);
    const days = planWindow === "2w" ? 14 : 28;
    const end = start.add(days, "day");
    return `${start.format("DD/MM")} - ${end.format("DD/MM/YYYY")}`;
  }, [planWindow, todayStr]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-base-100 border border-base-300 shadow-xs">
      {/* Left controls: Category, Plan window, Date range, Product Dropdown, Search */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Category Pill Switcher */}
        <div className="join bg-base-200/80 p-0.5 rounded-xl border border-base-300">
          {(["ALL", "FPC", "SMT"] as PrdCategory[]).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => onCategoryChange(cat)}
              className={`btn btn-xs rounded-lg px-3 font-bold transition-all ${
                category === cat
                  ? "btn-primary shadow-xs"
                  : "btn-ghost text-base-content/70 hover:bg-base-300/50"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Plan Ahead (2 weeks / 1 month) */}
        <div className="flex items-center gap-1.5 text-xs text-base-content/70 pl-1">
          <span className="font-semibold">Plan ahead</span>
          <div className="join bg-base-200/80 p-0.5 rounded-xl border border-base-300">
            <button
              type="button"
              onClick={() => onPlanWindowChange("2w")}
              className={`btn btn-xs rounded-lg px-2.5 font-semibold transition-all ${
                planWindow === "2w"
                  ? "bg-primary text-primary-content shadow-xs"
                  : "btn-ghost text-base-content/70 hover:bg-base-300/50"
              }`}
            >
              2 weeks
            </button>
            <button
              type="button"
              onClick={() => onPlanWindowChange("1m")}
              className={`btn btn-xs rounded-lg px-2.5 font-semibold transition-all ${
                planWindow === "1m"
                  ? "bg-primary text-primary-content shadow-xs"
                  : "btn-ghost text-base-content/70 hover:bg-base-300/50"
              }`}
            >
              1 month
            </button>
          </div>
        </div>

        {/* Date Window Display */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-base-200/60 border border-base-300 text-xs font-semibold text-base-content/80 tabular-nums">
          <Calendar size={13} className="text-primary opacity-80" />
          <span>{dateRangeDisplay}</span>
        </div>

        {/* Product Dropdown Filter */}
        {onProductChange && (
          <div ref={dropdownRef} className="relative">
            <div className="inline-flex items-center">
              <button
                type="button"
                onClick={() => {
                  setDropdownOpen((prev) => !prev);
                  setDropdownQuery("");
                }}
                className={`inline-flex items-center justify-between gap-2 h-7 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer min-w-[170px] max-w-[240px] ${
                  selectedProduct
                    ? "bg-[#eef2ff] border-indigo-300 text-[#4f46e5]"
                    : "bg-base-200/40 border-base-300 text-base-content/80 hover:bg-base-200/70"
                }`}
              >
                <span className="truncate">
                  {selectedProduct ? selectedProduct : `All Products (${products.length})`}
                </span>
                <ChevronDown
                  size={13}
                  className={`shrink-0 opacity-60 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
                />
              </button>
              {selectedProduct && (
                <button
                  type="button"
                  onClick={() => onProductChange("")}
                  className="ml-1 p-1 rounded-lg text-base-content/50 hover:text-base-content hover:bg-base-200 transition-colors cursor-pointer"
                  title="Clear product filter"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {dropdownOpen && (
              <div className="absolute left-0 z-50 mt-1.5 w-64 rounded-xl border border-base-300 bg-base-100 shadow-xl overflow-hidden">
                <div className="p-2 border-b border-base-200 bg-base-200/30">
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40" />
                    <input
                      type="text"
                      placeholder="Filter product list..."
                      value={dropdownQuery}
                      onChange={(e) => setDropdownQuery(e.target.value)}
                      autoFocus
                      className="input input-xs input-bordered w-full pl-7 rounded-lg h-7 text-xs bg-base-100"
                    />
                  </div>
                </div>
                <ul className="max-h-60 overflow-y-auto py-1 text-xs">
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        onProductChange("");
                        setDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-base-200 transition-colors cursor-pointer ${
                        !selectedProduct ? "font-bold text-[#4f46e5] bg-[#eef2ff]/60" : "text-base-content/80 font-medium"
                      }`}
                    >
                      <span>All Products ({products.length})</span>
                      {!selectedProduct && <Check size={13} className="text-[#4f46e5]" />}
                    </button>
                  </li>
                  {filteredProducts.length === 0 ? (
                    <li className="px-3 py-3 text-center text-base-content/40">
                      No matching product
                    </li>
                  ) : (
                    filteredProducts.map((prd) => {
                      const isActive = selectedProduct === prd;
                      return (
                        <li key={prd}>
                          <button
                            type="button"
                            onClick={() => {
                              onProductChange(prd);
                              setDropdownOpen(false);
                            }}
                            className={`w-full flex items-center justify-between px-3 py-1.5 text-left hover:bg-base-200 transition-colors cursor-pointer ${
                              isActive ? "font-bold text-[#4f46e5] bg-[#eef2ff]/60" : "text-base-content font-medium"
                            }`}
                          >
                            <span className="truncate">{prd}</span>
                            {isActive && <Check size={13} className="text-[#4f46e5] shrink-0" />}
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Search Input (Product / Lot No / PO) */}
        <div className="relative min-w-[210px] sm:min-w-[250px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" />
          <input
            type="text"
            placeholder="Search Product / Lot No / PO"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="input input-xs input-bordered w-full pl-8 pr-7 rounded-xl h-7 text-xs bg-base-200/40 focus:bg-base-100"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content cursor-pointer"
              title="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Right controls: updated timestamp, refresh */}
      <div className="flex items-center gap-2.5 text-xs">
        {lastUpdated && (
          <span className="text-base-content/60 tabular-nums font-medium text-[11.5px] hidden sm:inline">
            Updated {lastUpdated}
          </span>
        )}

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="btn btn-xs btn-ghost btn-circle text-base-content/70 hover:text-base-content"
          title="Refresh data"
        >
          <RotateCw size={13} className={loading ? "animate-spin text-primary" : ""} />
        </button>
      </div>
    </div>
  );
};
