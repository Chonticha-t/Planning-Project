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

const ProductCombobox = ({
  value,
  options,
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
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Filter Product..."
          className="input input-sm input-bordered w-full pr-8 pl-8 text-xs focus:outline-primary/50"
        />
        <Search
          size={14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-base-content/40 pointer-events-none"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              select("");
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-base-content/40 hover:text-base-content transition"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {open && matches.length > 0 && (
        <ul
          ref={listRef}
          className="absolute left-0 right-0 top-full mt-1 max-h-48 overflow-auto rounded-lg border border-base-200 bg-base-100 py-1 shadow-xl z-50 text-xs"
        >
          {matches.map((item, idx) => (
            <li
              key={item}
              onMouseEnter={() => setActive(idx)}
              onClick={() => select(item)}
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

