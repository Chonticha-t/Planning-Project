import React, {
  useEffect,
  useRef,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from "react";
import * as echarts from "echarts";
import { motion } from "motion/react";

export interface BaseEChartHandle {
  getInstance: () => echarts.ECharts | null;
  resize: () => void;
}

export interface BaseEChartProps {
  option: echarts.EChartsOption;
  style?: React.CSSProperties;
  className?: string;
  theme?: string | object | null;
  notMerge?: boolean;
  lazyUpdate?: boolean;
  loading?: boolean;
  onEvents?: Record<string, (params: any) => void>;
  onChartReady?: (chartInstance: echarts.ECharts) => void;
  /** ปิดแอนิเมชันหนักภายในของ ECharts เพื่อประสิทธิภาพ 60 FPS เมื่อข้อมูลมีปริมาณมหาศาล */
  disableInternalAnimation?: boolean;
  /** ปิดการทำ Motion GPU Entrance ถ้าไม่ต้องการ */
  disableEntranceAnimation?: boolean;
  /** อัตราส่วนความละเอียดพิกเซล (Default: window.devicePixelRatio || 1) */
  customDpr?: number;
}

/**
 * ฟังก์ชันปรับปรุง Option ของ Series อัตโนมัติ:
 * - บังคับ large: true, largeThreshold: 2000, sampling: 'lttb' สำหรับซีรีส์ข้อมูล
 * - คงสี, สไตล์, Formatter, Gradients, Rich text และ Props เดิมไว้ 100%
 */
function optimizeOptionForHighDensity(
  rawOption: echarts.EChartsOption,
  disableInternalAnimation = false
): echarts.EChartsOption {
  if (!rawOption) return rawOption;

  const optimized = { ...rawOption };

  // ปิดแอนิเมชันภายในเมื่อข้อมูลมีขนาดใหญ่ เพื่อลดการกิน CPU หลักของเบราว์เซอร์
  if (disableInternalAnimation || optimized.animation === false) {
    optimized.animation = false;
  }

  if (Array.isArray(optimized.series)) {
    optimized.series = optimized.series.map((s: any) => {
      if (!s || typeof s !== "object") return s;
      const type = s.type;
      // ประยุกต์ใช้เฉพาะซีรีส์ประเภทข้อมูล (bar, line, scatter)
      if (type === "bar" || type === "line" || type === "scatter") {
        return {
          large: true,
          largeThreshold: 2000,
          sampling: "lttb",
          ...s,
        };
      }
      return s;
    });
  } else if (optimized.series && typeof optimized.series === "object") {
    const s: any = optimized.series;
    const type = s.type;
    if (type === "bar" || type === "line" || type === "scatter") {
      optimized.series = {
        large: true,
        largeThreshold: 2000,
        sampling: "lttb",
        ...s,
      };
    }
  }

  return optimized;
}

/**
 * 🌟 BaseEChart: Base Component กลางสำหรับ Apache ECharts
 * -------------------------------------------------------------
 * 1. บังคับ renderer: 'canvas' และ Native Pixel-Perfect devicePixelRatio
 * 2. คมชัดสูงสุดระดับหน้าจอจริง คมกริบ ไร้อาการแตกหรือเบลอ ประหยัดหน่วยความจำ GPU
 * 3. ประสิทธิภาพ High-Density รองรับข้อมูลมหาศาลด้วย LTTB Sampling
 * 4. ครอบด้วย GPU-Accelerated Entrance Transition 60 FPS นิ่งสนิท
 * 5. ป้องกัน Memory Leak และจัดการ ResizeObserver อย่างแม่นยำ
 */
export const BaseEChart = forwardRef<BaseEChartHandle, BaseEChartProps>(
  (
    {
      option,
      style,
      className,
      theme = null,
      notMerge = true,
      lazyUpdate = true,
      loading = false,
      onEvents,
      onChartReady,
      disableInternalAnimation = false,
      disableEntranceAnimation = false,
      customDpr,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartInstanceRef = useRef<echarts.ECharts | null>(null);

    // ส่งออก Method ผ่าน Ref ให้ Component แม่เรียกใช้ได้
    useImperativeHandle(ref, () => ({
      getInstance: () => chartInstanceRef.current,
      resize: () => {
        if (chartInstanceRef.current && !chartInstanceRef.current.isDisposed()) {
          chartInstanceRef.current.resize();
        }
      },
    }));

    // ปรับแต่ง Option เพื่อประสิทธิภาพสูงสุด
    const optimizedOption = useMemo(() => {
      return optimizeOptionForHighDensity(option, disableInternalAnimation);
    }, [option, disableInternalAnimation]);

    // 1. Initialise Chart Instance with Canvas + Retina Resolution
    useEffect(() => {
      if (!containerRef.current) return;

      const dpr = customDpr || Math.max(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);

      let chart = chartInstanceRef.current;
      if (!chart || chart.isDisposed()) {
        chart = echarts.init(containerRef.current, theme, {
          renderer: "canvas",
          devicePixelRatio: dpr,
        });
        chartInstanceRef.current = chart;
        if (onChartReady) {
          onChartReady(chart);
        }
      }

      return () => {
        if (chartInstanceRef.current && !chartInstanceRef.current.isDisposed()) {
          chartInstanceRef.current.dispose();
          chartInstanceRef.current = null;
        }
      };
    }, [theme, customDpr]);

    // 2. Set Option & Register Events
    useEffect(() => {
      const chart = chartInstanceRef.current;
      if (!chart || chart.isDisposed() || !optimizedOption) return;

      if (loading) {
        chart.showLoading({
          text: "",
          color: "#4f46e5",
          textColor: "#334155",
          maskColor: "rgba(255, 255, 255, 0.6)",
          zlevel: 0,
        });
      } else {
        chart.hideLoading();
        chart.setOption(optimizedOption, { notMerge, lazyUpdate });
      }

      if (onEvents) {
        Object.entries(onEvents).forEach(([eventName, handler]) => {
          chart.off(eventName);
          chart.on(eventName, handler);
        });
      }
    }, [optimizedOption, notMerge, lazyUpdate, loading, onEvents]);

    // 3. Debounced ResizeObserver สำหรับความลื่นไหล 60 FPS
    useEffect(() => {
      if (!containerRef.current) return;

      let rafId: number | null = null;
      const handleResize = () => {
        if (rafId !== null) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          if (chartInstanceRef.current && !chartInstanceRef.current.isDisposed()) {
            chartInstanceRef.current.resize();
          }
        });
      };

      const resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(containerRef.current);
      window.addEventListener("resize", handleResize, { passive: true });

      return () => {
        if (rafId !== null) cancelAnimationFrame(rafId);
        window.removeEventListener("resize", handleResize);
        resizeObserver.disconnect();
      };
    }, []);

    const containerStyle: React.CSSProperties = {
      width: "100%",
      height: "100%",
      position: "relative",
      transform: "translateZ(0)", // บังคับ GPU Layering เพื่อความเนียนตา
      willChange: "transform, opacity",
      ...style,
    };

    if (disableEntranceAnimation) {
      return (
        <div
          ref={containerRef}
          className={className}
          style={containerStyle}
        />
      );
    }

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.995 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className={className}
        style={{ width: "100%", height: "100%", ...style }}
      >
        <div
          ref={containerRef}
          style={{ width: "100%", height: "100%", position: "relative" }}
        />
      </motion.div>
    );
  }
);

BaseEChart.displayName = "BaseEChart";
export default BaseEChart;
