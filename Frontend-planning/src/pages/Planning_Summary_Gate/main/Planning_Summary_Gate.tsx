import React, { useCallback } from "react";
import usePlanningSummaryGate from "../hooks/usePlanningSummaryGate";
import { GateFilterBar } from "../components/GateFilterBar";
import { GateFlowCards } from "../components/GateFlowCards";
import { GateMatrixTable } from "../components/GateMatrixTable";
import { GateMustOutChart } from "../components/GateMustOutChart";
import { GateActionTable } from "../components/GateActionTable";

const Planning_Summary_Gate: React.FC = () => {
  const {
    loading,
    lastUpdated,
    filters,
    gateFlowList,
    matrixRows,
    chartData,
    filteredTableRows,
    tableStats,
    setCategory,
    setPlanWindow,
    toggleSkipHolidays,
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
    <div className="flex flex-col gap-3 w-full">
      {/* 1. Global Filter & Control Bar */}
      <GateFilterBar
        category={filters.category}
        onCategoryChange={setCategory}
        planWindow={filters.planWindow}
        onPlanWindowChange={setPlanWindow}
        skipHolidays={filters.skipHolidays}
        onToggleSkipHolidays={toggleSkipHolidays}
        search={filters.search}
        onSearchChange={setSearch}
        lastUpdated={lastUpdated}
        loading={loading}
        onRefresh={refreshData}
      />

      {/* 2. Section 1: Gate WIP Overview */}
      <GateFlowCards
        gateFlowList={gateFlowList}
        selectedGate={filters.selectedGate}
        onSelectGate={selectGate}
      />

      {/* 3. Section 2: Gate Must-Out Schedule */}
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
        gateName={filters.selectedGate}
        rows={filteredTableRows}
        actionTab={filters.actionTab}
        onTabChange={setActionTab}
        stats={tableStats}
      />
    </div>
  );
};

export default Planning_Summary_Gate;
