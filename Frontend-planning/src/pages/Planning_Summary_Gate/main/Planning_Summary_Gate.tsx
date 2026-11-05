import React, { useCallback } from "react";
import usePlanningSummaryGate from "../hooks/usePlanningSummaryGate";
import { GateFilterBar } from "../components/GateFilterBar";
import { GateFlowCards } from "../components/GateFlowCards";
import { GateMatrixTable } from "../components/GateMatrixTable";
import { GateMustOutChart } from "../components/GateMustOutChart";
import { GateActionTable } from "../components/GateActionTable";
import "../gateTheme.css";

const Planning_Summary_Gate: React.FC = () => {
  const {
    loading,
    error,
    rows,
    lastUpdated,
    filters,
    todayStr,
    availableProducts,
    gateFlowList,
    matrixRows,
    chartData,
    filteredTableRows,
    tableStats,
    statusFilter,
    setStatusFilter,
    currentProcessFilter,
    setCurrentProcessFilter,
    availableCurrentProcesses,
    setCategory,
    setPlanWindow,
    setSelectedProduct,
    setSearch,
    selectGate,
    selectDate,
    setActionTab,
    refreshData,
  } = usePlanningSummaryGate();

  const handleSelectCell = useCallback(
    (gName: string, dateStr: string | null) => {
      selectGate(gName);
      selectDate(dateStr);
    },
    [selectGate, selectDate]
  );

  return (
    <div className="planning-summary-gate flex flex-col gap-3 w-full">
      {/* 1. Global Filter & Control Bar */}
      <GateFilterBar
        todayStr={todayStr}
        category={filters.category}
        onCategoryChange={setCategory}
        planWindow={filters.planWindow}
        onPlanWindowChange={setPlanWindow}
        products={availableProducts}
        selectedProduct={filters.selectedProduct}
        onProductChange={setSelectedProduct}
        search={filters.search}
        onSearchChange={setSearch}
        lastUpdated={lastUpdated}
        loading={loading}
        onRefresh={refreshData}
      />

      {loading ? (
        <div role="status" className="p-4 text-sm text-base-content/70">Loading planning gate data...</div>
      ) : error ? (
        <div role="alert" className="alert alert-error text-sm">{error}</div>
      ) : rows.length === 0 ? (
        <div role="status" className="p-4 text-sm text-base-content/70">No planning gate data found for the selected category.</div>
      ) : (
        <>
          {/* 2. Section 1: Gate WIP Overview */}
          <GateFlowCards
            gateFlowList={gateFlowList}
            selectedGate={filters.selectedGate}
            onSelectGate={selectGate}
          />

          {/* 3. Section 2: Gate Arrival Schedule */}
          <GateMatrixTable
            matrixRows={matrixRows}
            selectedGate={filters.selectedGate}
            selectedDate={filters.selectedDate}
            onSelectCell={handleSelectCell}
          />

          {/* 4. Section 2 (Bottom): Stacked Bar Chart for Selected Gate */}
          <GateMustOutChart
            gateName={filters.selectedGate}
            chartData={chartData}
            selectedDate={filters.selectedDate}
            onSelectDate={selectDate}
          />

          {/* 5. Section 3: Action & Task Table */}
          <GateActionTable
            todayStr={todayStr}
            gateName={filters.selectedGate}
            rows={filteredTableRows}
            allRows={rows}
            actionTab={filters.actionTab}
            onTabChange={setActionTab}
            stats={tableStats}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            currentProcessFilter={currentProcessFilter}
            onCurrentProcessFilterChange={setCurrentProcessFilter}
            availableCurrentProcesses={availableCurrentProcesses}
          />
        </>
      )}
    </div>
  );
};

export default Planning_Summary_Gate;
