import { useCallback } from "react";
import { fetchInGateOrders } from "./inGateOrderApi";
import { useInGateRead } from "./useInGateRead";

const errorMessage = () => "Unable to load Planning In Gate queue orders.";

export function useInGateOrders(enabled = true) {
  const read = useCallback((signal: AbortSignal) => fetchInGateOrders(signal), []);
  const { data, ...state } = useInGateRead("in-gate-orders", enabled, read, errorMessage);
  return {
    ...state,
    orders: data?.orders ?? [],
    schemaReady: data?.schemaReady ?? true,
  };
}
