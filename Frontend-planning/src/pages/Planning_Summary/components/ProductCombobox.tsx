import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";

interface ProductComboboxProps {
  value: string;
  options: string[];
  placeholder?: string;
  onChange: (value: string) => void;
  onSelect: (value: string) => void;
  onEnter: () => void;
}

const MAX_ITEMS = 100;

const ProductCombobox = ({
  value,
  options,
  placeholder = "Filter Product or Lot...",
  onChange,
  onSelect,
  onEnter,
}: ProductComboboxProps) => {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    const list = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
    return list.slice(0, MAX_ITEMS);
  }, [value, options]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (active < 0) return;
    (
      listRef.current?.children[active] as HTMLElement | undefined
    )?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const select = (name: string) => {
    onSelect(name);
    setOpen(false);
    setActive(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((prev) => (prev + 1 < matches.length ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && active >= 0 && matches[active]) {
        select(matches[active]);
      } else {
        setOpen(false);
        onEnter();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <div ref={wrapRef} className="relative w-full">
      <label className="input input-sm rounded-lg text-[13px] w-full border border-base-content/20 bg-base-100 hover:border-base-content/30 focus-within:border-primary focus-within:outline-none transition-colors flex items-center gap-2">
        <Search size={14} className="opacity-50 shrink-0" />
        <input
          type="text"
          className="text-[13px] grow bg-transparent outline-none placeholder:text-base-content/40"
          placeholder={placeholder}
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
          <button
            type="button"
            className="opacity-50 hover:opacity-100 cursor-pointer"
            onClick={() => {
              onChange("");
              select("");
            }}
          >
            <X size={14} />
          </button>
        )}
      </label>

      {open && matches.length > 0 && (
        <ul
          ref={listRef}
          className="absolute left-0 right-0 top-full mt-1 max-h-48 overflow-auto rounded-lg border border-base-200 bg-base-100 py-1 shadow-xl z-50 text-xs"
        >
          {matches.map((item, idx) => (
            <li
              key={item}
              onMouseEnter={() => setActive(idx)}
              onMouseDown={(e) => {
                e.preventDefault();
                select(item);
              }}
              className={`cursor-pointer px-3 py-1.5 transition ${
                idx === active
                  ? "bg-primary text-primary-content"
                  : "hover:bg-base-200 text-base-content"
              }`}
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ProductCombobox;
