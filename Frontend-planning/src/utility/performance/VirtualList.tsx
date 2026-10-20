import React, { useRef, useState, useMemo, ReactNode } from "react";

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  height: number | string;
  renderItem: (item: T, index: number) => ReactNode;
  buffer?: number;
  className?: string;
  keyExtractor: (item: T, index: number) => string | number;
}

/**
 * 🚀 High-Performance Virtualized List (60fps Scroll)
 * แสดงผล DOM เฉพาะแถวที่มองเห็นในหน้าจอ ป้องกันเบราว์เซอร์แลค/ค้างแม้มีข้อมูลหมื่นแถว
 */
export function VirtualList<T>({
  items,
  itemHeight,
  height,
  renderItem,
  buffer = 5,
  className = "",
  keyExtractor,
}: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const containerHeight = typeof height === "number" ? height : 500;
  const totalCount = items.length;
  const totalHeight = totalCount * itemHeight;

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - buffer);
  const visibleCount = Math.ceil(containerHeight / itemHeight) + buffer * 2;
  const endIndex = Math.min(totalCount, startIndex + visibleCount);

  const visibleItems = useMemo(() => {
    return items.slice(startIndex, endIndex).map((item, i) => ({
      item,
      index: startIndex + i,
      top: (startIndex + i) * itemHeight,
    }));
  }, [items, startIndex, endIndex, itemHeight]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={`overflow-y-auto overflow-x-hidden relative ${className}`}
      style={{ height, willChange: "scroll-position" }}
    >
      <div style={{ height: totalHeight, width: "100%", position: "relative" }}>
        {visibleItems.map(({ item, index, top }) => (
          <div
            key={keyExtractor(item, index)}
            style={{
              position: "absolute",
              top,
              left: 0,
              right: 0,
              height: itemHeight,
              willChange: "transform",
            }}
          >
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    </div>
  );
}
