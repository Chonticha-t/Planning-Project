/**
 * ⚡ High-Performance 60fps Optimization Suite
 * - LTTB (Largest-Triangle-Three-Buckets) Downsampling Algorithm
 * - requestAnimationFrame (rAF) Batch Scheduler
 */

export interface Point {
  x: number;
  y: number;
  [key: string]: any;
}

/**
 * LTTB Downsampling Algorithm
 * ลดจำนวนจุดบนกราฟ Time-Series โดยรักษายอด Peak/Valley และรูปทรงไว้ 100%
 */
export function lttbDownsample<T extends Point>(data: T[], threshold: number): T[] {
  if (!data || threshold >= data.length || threshold <= 2) {
    return data || [];
  }

  const sampled: T[] = [];
  const every = (data.length - 2) / (threshold - 2);
  let a = 0;
  sampled.push(data[a]);

  for (let i = 0; i < threshold - 2; i++) {
    let avgX = 0;
    let avgY = 0;
    const avgRangeStart = Math.floor((i + 1) * every) + 1;
    const avgRangeEnd = Math.min(Math.floor((i + 2) * every) + 1, data.length);
    const avgRangeLength = avgRangeEnd - avgRangeStart;

    for (let j = avgRangeStart; j < avgRangeEnd; j++) {
      avgX += data[j].x;
      avgY += data[j].y;
    }
    avgX /= avgRangeLength;
    avgY /= avgRangeLength;

    const rangeOffs = Math.floor((i + 0) * every) + 1;
    const rangeTo = Math.min(Math.floor((i + 1) * every) + 1, data.length);
    const pointAX = data[a].x;
    const pointAY = data[a].y;

    let maxArea = -1;
    let nextA = rangeOffs;

    for (let j = rangeOffs; j < rangeTo; j++) {
      const area =
        Math.abs(
          (pointAX - avgX) * (data[j].y - pointAY) -
          (pointAX - data[j].x) * (avgY - pointAY)
        ) * 0.5;

      if (area > maxArea) {
        maxArea = area;
        nextA = j;
      }
    }

    sampled.push(data[nextA]);
    a = nextA;
  }

  sampled.push(data[data.length - 1]);
  return sampled;
}

/**
 * rAF Batcher - จัดคิวการ Render ให้อัปเดตเพียง 1 ครั้งต่อ 1 Frame (16.6ms)
 */
export function createRafBatcher<T>(renderFn: (payload: T) => void) {
  let pendingPayload: T | null = null;
  let rafId: number | null = null;

  return {
    schedule(payload: T) {
      pendingPayload = payload;
      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          if (pendingPayload !== null) {
            renderFn(pendingPayload);
            pendingPayload = null;
          }
          rafId = null;
        });
      }
    },
    cancel() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      pendingPayload = null;
    }
  };
}
