import React, { useState, useEffect, useMemo, useRef } from "react";
import { CalendarDays, CheckSquare, Download, Filter, Layers, Search, X } from "lucide-react";

export interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  availableProcesses: string[];
  availableCustomerGroups?: string[];
  defaultStartDate: string;
  defaultEndDate: string;
  defaultProcesses: string[];
  defaultCustomerGroup?: string;
  onConfirmExport: (
    startDate: string,
    endDate: string,
    processes: string[],
    unit: string,
    customerGroup?: string
  ) => void;
  isLoading?: boolean;
  errorMessage?: string;
}

const formatDateForDisplay = (date: string) => {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return date;
  return `${match[3]}/${match[2]}/${match[1]}`;
};

const DatePickerField = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") {
      input.showPicker();
    } else {
      input.click();
    }
  };

  return (
    <button
      type="button"
      onClick={openPicker}
      className="input input-sm input-bordered w-full font-medium bg-base-100 flex items-center justify-between text-left"
    >
      <span className={value ? "text-base-content" : "text-base-content/40"}>
        {value ? formatDateForDisplay(value) : "DD/MM/YYYY"}
      </span>
      <CalendarDays className="w-3.5 h-3.5 text-base-content/50 shrink-0" />
      <input
        ref={inputRef}
        type="date"
        className="absolute pointer-events-none opacity-0 w-0 h-0"
        value={value}
        onChange={e => onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
      />
    </button>
  );
};

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  title,
  availableProcesses,
  availableCustomerGroups = [],
  defaultStartDate,
  defaultEndDate,
  defaultProcesses,
  defaultCustomerGroup = "All Customers",
  onConfirmExport,
  isLoading = false,
  errorMessage
}) => {
  const processOptions = useMemo(() => {
    return Array.from(new Set(availableProcesses.filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [availableProcesses]);

  const customerGroupOptions = useMemo(() => {
    return Array.from(new Set(availableCustomerGroups.filter(Boolean)));
  }, [availableCustomerGroups]);

  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [selectedProcesses, setSelectedProcesses] = useState<string[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string>("All");
  const [selectedCustomerGroup, setSelectedCustomerGroup] = useState(defaultCustomerGroup);
  const [processSearch, setProcessSearch] = useState("");

  const filteredProcessOptions = useMemo(() => {
    const query = processSearch.trim().toLowerCase();
    if (!query) return processOptions;
    return processOptions.filter(proc => proc.toLowerCase().includes(query));
  }, [processOptions, processSearch]);

  useEffect(() => {
    if (isOpen) {
      setStartDate(defaultStartDate);
      setEndDate(defaultEndDate);
      setSelectedProcesses(defaultProcesses.length > 0 ? defaultProcesses : processOptions);
      setSelectedUnit("All");
      setSelectedCustomerGroup(defaultCustomerGroup);
      setProcessSearch("");
    }
  }, [isOpen, defaultStartDate, defaultEndDate, defaultProcesses, processOptions, defaultCustomerGroup]);

  if (!isOpen) return null;

  const toggleProcess = (proc: string) => {
    if (selectedProcesses.includes(proc)) {
      setSelectedProcesses(selectedProcesses.filter(p => p !== proc));
    } else {
      setSelectedProcesses([...selectedProcesses, proc]);
    }
  };

  const handleSelectAllProcesses = () => {
    setSelectedProcesses(processOptions);
  };

  const handleClearProcesses = () => {
    setSelectedProcesses([]);
  };

  const handleSelectVisibleProcesses = () => {
    setSelectedProcesses(prev => Array.from(new Set([...prev, ...filteredProcessOptions])));
  };

  const handleClearVisibleProcesses = () => {
    const visible = new Set(filteredProcessOptions);
    setSelectedProcesses(prev => prev.filter(proc => !visible.has(proc)));
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-base-100 rounded-lg shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-start gap-4 p-5 border-b border-base-200">
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Download className="w-5 h-5 text-primary" />
              {title}
            </h3>
            <p className="text-xs text-base-content/60 mt-1">Choose the date range, columns, and filters for the Excel file.</p>
          </div>
          <button onClick={onClose} className="btn btn-sm btn-circle btn-ghost">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
          <section className="rounded-lg border border-base-200 bg-base-100 p-4">
            <label className="text-sm font-semibold text-base-content/80 mb-3 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary" />
              Date Range
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2">
              <DatePickerField value={startDate} onChange={setStartDate} />
              <span className="text-base-content/50 font-bold text-center">to</span>
              <DatePickerField value={endDate} onChange={setEndDate} />
            </div>
          </section>

          <section className="rounded-lg border border-base-200 bg-base-100 p-4">
            <label className="text-sm font-semibold text-base-content/80 mb-3 flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              Export Columns
            </label>
            <select
              className="select select-sm select-bordered w-full font-medium"
              value={selectedUnit}
              onChange={e => setSelectedUnit(e.target.value)}
            >
              <option value="All">All Units (Lot, Sheet, Piece)</option>
              <option value="Lot">Lot Qty Only</option>
              <option value="Sheet">Sheet Qty Only</option>
              <option value="Piece">Piece Qty Only</option>
            </select>
          </section>

          {customerGroupOptions.length > 0 && (
            <section className="rounded-lg border border-base-200 bg-base-100 p-4 md:col-span-2">
              <label className="text-sm font-semibold text-base-content/80 mb-3 flex items-center gap-2">
                <Filter className="w-4 h-4 text-primary" />
                Customer Group
              </label>
              <select
                className="select select-sm select-bordered w-full font-medium"
                value={selectedCustomerGroup}
                onChange={e => setSelectedCustomerGroup(e.target.value)}
              >
                {customerGroupOptions.map(group => (
                  <option key={group} value={group}>{group}</option>
                ))}
              </select>
            </section>
          )}

          {errorMessage && (
            <div className="md:col-span-2 rounded-lg border border-error/20 bg-error/10 px-4 py-3 text-sm text-error">
              {errorMessage}
            </div>
          )}

          <section className="rounded-lg border border-base-200 bg-base-100 p-4 md:col-span-2">
            <div className="flex flex-col gap-3 mb-3">
              <div className="flex justify-between items-center gap-3">
                <label className="text-sm font-semibold text-base-content/80 flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-primary" />
                  Processes
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
                <label className="input input-sm input-bordered flex items-center gap-2 bg-base-100">
                  <Search className="w-4 h-4 text-base-content/40" />
                  <input
                    type="text"
                    className="grow"
                    placeholder="Search process..."
                    value={processSearch}
                    onChange={e => setProcessSearch(e.target.value)}
                  />
                  {processSearch && (
                    <button
                      type="button"
                      onClick={() => setProcessSearch("")}
                      className="text-base-content/40 hover:text-base-content"
                      aria-label="Clear process search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </label>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleSelectVisibleProcesses}
                    disabled={filteredProcessOptions.length === 0}
                    className="btn btn-xs btn-outline btn-primary"
                  >
                    All Process
                  </button>
                  <button
                    type="button"
                    onClick={handleClearVisibleProcesses}
                    disabled={filteredProcessOptions.length === 0}
                    className="btn btn-xs btn-ghost text-error"
                  >
                    Clear All
                  </button>
                </div>
              </div>
            </div>

            <div className="border border-base-200 rounded-lg overflow-y-auto max-h-64 p-2 bg-base-200/20 scrollbar-thin">
              {processOptions.length > 0 ? (
                filteredProcessOptions.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1">
                    {filteredProcessOptions.map(proc => (
                      <label key={proc} className="flex items-center gap-2.5 p-2 hover:bg-base-200 rounded cursor-pointer transition-colors min-w-0">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm checkbox-primary"
                          checked={selectedProcesses.includes(proc)}
                          onChange={() => toggleProcess(proc)}
                        />
                        <span className="text-sm font-medium truncate" title={proc}>{proc}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-base-content/60 text-center p-5">
                    No process matches "{processSearch}".
                  </div>
                )
              ) : (
                <div className="text-sm text-base-content/60 text-center p-5">
                  Process list is not loaded. Export will include all processes for the selected date range.
                </div>
              )}
            </div>
            <div className="mt-2 flex flex-col sm:flex-row justify-between gap-1 text-xs font-semibold text-base-content/60">
              <span>
                {processOptions.length > 0 && processSearch
                  ? `${filteredProcessOptions.length} matching processes`
                  : " "}
              </span>
              <span>
                {processOptions.length > 0 ? `${selectedProcesses.length} of ${processOptions.length} selected` : "All processes"}
              </span>
            </div>
          </section>
        </div>

        <div className="p-4 border-t border-base-200 bg-base-200/50 flex justify-end gap-3">
          <button onClick={onClose} className="btn btn-sm btn-ghost font-bold">Cancel</button>
          <button
            onClick={() => {
              onConfirmExport(startDate, endDate, selectedProcesses, selectedUnit, selectedCustomerGroup);
            }}
            disabled={isLoading || (processOptions.length > 0 && selectedProcesses.length === 0) || !startDate || !endDate}
            className="btn btn-sm btn-primary shadow-sm font-bold"
          >
            {isLoading ? <span className="loading loading-spinner loading-xs"></span> : <Download size={14} />}
            {isLoading ? "Exporting..." : "Confirm Export"}
          </button>
        </div>
      </div>
    </div>
  );
};
