import { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "@/context/AuthContext";
import { getApiBaseUrl } from "@/utils/apiConfig";
import type { LotItem } from "../../Capacity_Leveling/types";

export interface RoutingStep {
  seq: number;
  processId: string | null;
  process: string | null;
  gate: string | null;
  stepInGate: number | null;
  totalInGate: number | null;
  updatedAt: string | null;
}
export interface LotRouting {
  key: string;
  status: string;
  observed?: { process: string | null; updatedAt: string | null } | null;
  current: { seq: number; process: string | null; gate: string | null; stepInGate: number | null; totalInGate: number | null; updatedAt: string | null } | null;
  steps: RoutingStep[];
}
export const ROUTING_MESSAGES: Record<string, string> = {
  no_displayed_routing: "No processes are available in the displayed routing scope.",
  outside_displayed_routing: "The current WIP position is before the displayed routing. No displayed process is highlighted.",
  no_routing: "No routing master found for this product.",
  no_lot: "This requirement has no production lot. Current position is unavailable.",
  no_wip: "No current WIP record found. Completion cannot be inferred.",
  ambiguous: "This process has multiple possible routing positions. Current position cannot be confirmed.",
  product_mismatch: "The current WIP product differs from the saved plan. Review the lot identity.",
  process_not_found: "The WIP process does not match this product's routing.",
  inconsistent_position: "WIP sequence and routing process disagree. Current position cannot be confirmed.",
};
const textOrNull = (value: unknown) => value === null || typeof value === "string";
const integerOrNull = (value: unknown) => value === null || Number.isInteger(value);

/** Fetch at most the visible page, in one read-only batch. Never replace a failed read with saved WIP. */
export function useLotRouting(lots: LotItem[]) {
  const { user, openLoginModal } = useAuth();
  const items = lots.map(lot => {
    const products = [...new Set((lot.allocations ?? []).map(row => row.prd_name))];
    const product = products.length === 1 ? products[0] : products.length > 1 ? null : lot.product;
    return product && lot.id.length <= 2048 ? { key: lot.id, product, lot: lot.kind === "lot" ? lot.label : null } : null;
  }).filter((item): item is NonNullable<typeof item> => item !== null);
  const requestKey = JSON.stringify(items);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ key: string; data: LotRouting[]; checkedAt?: string; error?: string }>({ key: "", data: [] });
  const identity = `${user?.username ?? ""}|${requestKey}|${retry}`;
  useEffect(() => {
    if (!user || JSON.parse(requestKey).length === 0) return;
    const controller = new AbortController();
    (async () => {
      try {
        const response = await axios.post<{ data: { results: LotRouting[]; checkedAt: string } }>(
          `${getApiBaseUrl()}/capacity_leveling/routing/lookup`, { items: JSON.parse(requestKey) },
          { signal: controller.signal, timeout: 20000 },
        );
        const value = response.data?.data;
        const expected = new Set<string>(JSON.parse(requestKey).map((item: { key: string }) => item.key));
        const received = new Set<string>();
        if (typeof value?.checkedAt !== "string" || !Array.isArray(value?.results) || value.results.length !== expected.size
          || !value.results.every(result => {
            if (!result || !expected.has(result.key) || received.has(result.key)) return false;
            received.add(result.key);
            return (result.status === "matched" || Object.prototype.hasOwnProperty.call(ROUTING_MESSAGES, result.status))
              && (result.observed == null || textOrNull(result.observed.process) && textOrNull(result.observed.updatedAt))
              && (result.current === null || Number.isInteger(result.current.seq) && textOrNull(result.current.process)
                && textOrNull(result.current.gate) && textOrNull(result.current.updatedAt)
                && integerOrNull(result.current.stepInGate) && integerOrNull(result.current.totalInGate))
              && (result.status !== "matched" || result.current !== null)
              && Array.isArray(result.steps) && result.steps.every(step => step && Number.isInteger(step.seq)
                && textOrNull(step.process) && textOrNull(step.processId) && textOrNull(step.gate)
                && textOrNull(step.updatedAt) && integerOrNull(step.stepInGate) && integerOrNull(step.totalInGate));
          })) throw new Error("Invalid routing response");
        if (!controller.signal.aborted) setState({ key: identity, data: value.results, checkedAt: value.checkedAt });
      } catch (error) {
        if (!controller.signal.aborted) setState({ key: identity, data: [], error: axios.isAxiosError(error) && [401, 403].includes(error.response?.status ?? 0)
          ? "Sign in with a Planner or Admin account to read current routing." : "Unable to load routing and current WIP. Please retry." });
      }
    })();
    return () => controller.abort();
    // The serialized identities prevent refetching on unrelated table renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, requestKey, user?.username]);
  const current = state.key === identity ? state : null;
  return {
    routes: new Map((current?.data ?? []).map(result => [result.key, result])),
    loading: Boolean(user && items.length && !current),
    error: current?.error, checkedAt: current?.checkedAt,
    needsLogin: !user, login: openLoginModal, retry: () => setRetry(value => value + 1),
  };
}
