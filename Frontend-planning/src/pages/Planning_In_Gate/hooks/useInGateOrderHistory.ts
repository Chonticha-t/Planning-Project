import { useCallback } from "react";
import { fetchInGateOrderHistory } from "./inGateOrderApi";
import { useInGateRead } from "./useInGateRead";

const errorMessage = () => "Unable to load Planning In Gate order history.";

export function useInGateOrderHistory(
  gate: string,
  date: string,
  enabled: boolean,
  refreshToken = 0,
) {
  const scope = `${gate}|${date}|${refreshToken}`;
  const read = useCallback(
    (signal: AbortSignal) => fetchInGateOrderHistory(gate, date, signal),
    [gate, date],
  );
  const { data, ...state } = useInGateRead(
    scope,
    enabled && Boolean(gate && date),
    read,
    errorMessage,
  );
  return {
    ...state,
    entries: data?.entries ?? [],
    schemaReady: data?.schemaReady ?? true,
  };
}
