import React from "react";
import useForecast from "../hooks/useForecast";
import { ForecastFilterBar } from "../components/ForecastFilterBar";
import { ForecastSummaryCards } from "../components/ForecastSummaryCards";
import { ForecastChart } from "../components/ForecastChart";
import { ForecastCustomerMix } from "../components/ForecastCustomerMix";
import { ForecastTable } from "../components/ForecastTable";

const Forecast: React.FC = () => {
  const {
    // States & Setters
    processFilter,
    setProcessFilter,
    selectedCustomer,
    setSelectedCustomer,
    unit,
    setUnit,
    searchQuery,
    setSearchQuery,
    chartGroupMode,
    tableGroupMode,
    hoveredWeek,
    setHoveredWeek,
    expandedCustomers,
    setExpandedCustomers,
    handleGroupModeChange,
    toggleCustomerExpand,

    // API & Status
    loading,
    error,
    weeks,
    lastUpdated,
    fetchForecast,

    // Aggregates & Lists
    availableCustomers,
    customerRows,
    productRows,
    chartSeriesRows,
    tableRows,
    productsByCustomer,
    hasExpandedCustomer,
    weekTotals,
    grandTotal,
    kpiStats,
    customerMixRows,

    // Labels
    unitLabelLower,
    unitTitleLabel,
    prdTypeDisplay,
    weekRangeLabel,
  } = useForecast();

  return (
    <div className="relative flex flex-col gap-3.5 w-full pb-6 select-none">
      {/* 1. Top Filter & Control Card */}
      <ForecastFilterBar
        processFilter={processFilter}
        onProcessFilterChange={setProcessFilter}
        selectedCustomer={selectedCustomer}
        onCustomerChange={setSelectedCustomer}
        availableCustomers={availableCustomers}
        weekRangeLabel={weekRangeLabel}
        unit={unit}
        onUnitChange={setUnit}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        loading={loading}
        error={error}
        onRefresh={fetchForecast}
      />

      {/* 2. Summary KPI Section */}
      <ForecastSummaryCards
        kpiStats={kpiStats}
        lastUpdated={lastUpdated}
        unit={unit}
        unitLabelLower={unitLabelLower}
        weekRangeLabel={weekRangeLabel}
        prdTypeDisplay={prdTypeDisplay}
      />

      {/* 3. Middle Row: Forecast By Week Chart (Left) + Customer Mix (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3.5">
        <ForecastChart
          processFilter={processFilter}
          unit={unit}
          unitTitleLabel={unitTitleLabel}
          unitLabelLower={unitLabelLower}
          chartGroupMode={chartGroupMode}
          onGroupModeChange={handleGroupModeChange}
          chartSeriesRows={chartSeriesRows}
          weeks={weeks}
          weekTotals={weekTotals}
          hoveredWeek={hoveredWeek}
          onHoverWeek={setHoveredWeek}
          loading={loading}
        />

        <ForecastCustomerMix
          weeks={weeks}
          unit={unit}
          unitTitleLabel={unitTitleLabel}
          unitLabelLower={unitLabelLower}
          processFilter={processFilter}
          customerMixRows={customerMixRows}
          grandTotal={grandTotal}
          loading={loading}
          onSelectCustomer={(custName) => {
            handleGroupModeChange("Customer");
            toggleCustomerExpand(custName);
          }}
        />
      </div>

      {/* 4. Bottom Card: FORECAST TABLE */}
      <ForecastTable
        tableGroupMode={tableGroupMode}
        onGroupModeChange={handleGroupModeChange}
        hasExpandedCustomer={hasExpandedCustomer}
        onCollapseAll={() => setExpandedCustomers(new Set())}
        weeks={weeks}
        tableRows={tableRows}
        customerRows={customerRows}
        productRows={productRows}
        productsByCustomer={productsByCustomer}
        expandedCustomers={expandedCustomers}
        onToggleCustomerExpand={toggleCustomerExpand}
        weekTotals={weekTotals}
        grandTotal={grandTotal}
        unit={unit}
        unitTitleLabel={unitTitleLabel}
        weekRangeLabel={weekRangeLabel}
        prdTypeDisplay={prdTypeDisplay}
        loading={loading}
      />
    </div>
  );
};

export default Forecast;
