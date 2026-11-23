import axios from "axios";
import { getApiBaseUrl } from "@/utils/apiConfig";
import type { InGateQueueOrder, OrderHistoryEntry } from "../types";
import type { SaveOrderItemInput } from "../inGateOrder";

const BASE = () => `${getApiBaseUrl()}/in_gate`;

export interface InGateOrdersResponse {
  orders: InGateQueueOrder[];
  schemaReady: boolean;
}

export interface InGateOrderHistoryResponse {
  gate: string;
  date: string;
  entries: OrderHistoryEntry[];
  schemaReady: boolean;
}

export interface SaveInGateOrderPayload {
  gate: string;
  date: string;
  planId: string;
  planVersion: number;
  baseRevision: number;
  cardIdsBefore: string[];
  cardIds: string[];
  inactiveCardIds?: string[];
  items: SaveOrderItemInput[];
  pushedOutLots?: string[];
  nowFitLots?: string[];
  reason?: string;
}

export interface SaveInGateOrderResult {
  order: InGateQueueOrder;
  historyEntry: OrderHistoryEntry;
}

export async function fetchInGateOrders(signal?: AbortSignal): Promise<InGateOrdersResponse> {
  const { data } = await axios.get<{ data: InGateOrdersResponse }>(`${BASE()}/order`, {
    signal,
    timeout: 15000,
  });
  const value = data?.data;
  if (!value || !Array.isArray(value.orders)) {
    throw new Error("Invalid Planning In Gate orders response.");
  }
  return value;
}

export async function fetchInGateOrderHistory(
  gate: string,
  date: string,
  signal?: AbortSignal,
): Promise<InGateOrderHistoryResponse> {
  const { data } = await axios.get<{ data: InGateOrderHistoryResponse }>(`${BASE()}/order/history`, {
    params: { gate, date },
    signal,
    timeout: 15000,
  });
  const value = data?.data;
  if (!value || !Array.isArray(value.entries)) {
    throw new Error("Invalid Planning In Gate order history response.");
  }
  return value;
}

export async function saveInGateOrder(payload: SaveInGateOrderPayload): Promise<SaveInGateOrderResult> {
  const { data } = await axios.put<{ data: SaveInGateOrderResult }>(`${BASE()}/order`, payload, {
    timeout: 20000,
  });
  const value = data?.data;
  if (!value?.order || !value?.historyEntry) {
    throw new Error("Invalid save order response.");
  }
  return value;
}
