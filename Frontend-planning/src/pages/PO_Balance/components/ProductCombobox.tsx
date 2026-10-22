import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";

interface ProductComboboxProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  onSelect: (value: string) => void;
  onEnter: () => void;
}

const MAX_ITEMS = 100;

// ช่องค้นหา product แบบพิมพ์แล้วมีรายชื่อให้เลือก
const ProductCombobox = ({ value, options, onChange, onSelect, onEnter }: ProductComboboxProps) => {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    const list = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
    return list.slice(0, MAX_ITEMS);
  }, [value, options]);

  // ปิด dropdown เมื่อคลิกข้างนอก
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // เลื่อน list ให้เห็นรายการที่เลือกด้วยคีย์บอร์ด
  useEffect(() => {
    if (active < 0) return;
    (listRef.current?.children[active] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  // เลือกจากรายการ / กดล้าง -> ค้นหาทันที
  const select = (name: string) => {
    onSelect(name);
    setOpen(false);
    setActive(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && active >= 0 && matches[active]) {
        select(matches[active]);
      } else {
        setOpen(false);
        onEnter();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative w-full">
      {/* ปิด outline หนาของ daisyUI ตอน focus เหลือแค่เส้นขอบสี primary บาง ๆ */}
      <label className="input input-sm text-[13px] w-full focus-within:outline-none focus-within:border-primary">
        <Search size={14} className="opacity-50" />
        <input
          type="text"
          className="text-[13px]"
          placeholder="Search product name"
          value={value}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={handleKeyDown}
        />
        {value && (
          <button type="button" className="opacity-50 hover:opacity-100" onClick={() => select("")}>
            <X size={14} />
          </button>
        )}
      </label>

      {open && matches.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-box border border-base-300 bg-base-100 py-1 shadow-lg"
        >
          {matches.map((name, i) => (
            <li
              key={name}
              onMouseDown={(e) => {
                e.preventDefault();
                select(name);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-1.5 text-sm font-medium ${
                i === active ? "bg-primary text-primary-content" : "hover:bg-base-200"
              }`}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ProductCombobox;
