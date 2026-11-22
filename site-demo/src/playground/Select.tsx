import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  /** Secondary text shown muted to the right of the label. */
  hint?: string;
  group?: string;
  disabled?: boolean;
}

interface Props<T extends string> {
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  title?: string;
  /** Show a filter box (useful for long lists). */
  searchable?: boolean;
  size?: "md" | "sm";
  className?: string;
  /** Minimum popover width in px (defaults to the trigger width). */
  minPopWidth?: number;
}

/**
 * An accessible listbox in the site's own style: keyboard navigation (arrows, Home/End, type-ahead, Enter, Esc),
 * optional grouping and filter, and a popover rendered in a portal so no panel can clip it.
 */
export default function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  icon,
  disabled,
  title,
  searchable,
  size = "md",
  className = "",
  minPopWidth,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxH: number; up: boolean } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", t: 0 });
  const uid = useId();

  const current = options.find((o) => o.value === value);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => `${o.label} ${o.group ?? ""}`.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const place = useCallback(() => {
    const el = trigger.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 6;
    const below = window.innerHeight - r.bottom - gap - 10;
    const above = r.top - gap - 10;
    const up = below < 220 && above > below;
    const width = Math.max(r.width, minPopWidth ?? 0);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    setPos({ left, width, up, top: up ? r.top - gap : r.bottom + gap, maxH: Math.max(140, Math.min(360, up ? above : below)) });
  }, [minPopWidth]);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    setQuery("");
    if (refocus) trigger.current?.focus();
  }, []);

  const openMenu = () => {
    if (disabled) return;
    const i = options.findIndex((o) => o.value === value);
    setActive(Math.max(0, i));
    place();
    setOpen(true);
  };

  const choose = (opt: SelectOption<T> | undefined) => {
    if (!opt || opt.disabled) return;
    onChange(opt.value);
    close();
  };

  // Keep the popover glued to the trigger and dismiss on outside interaction.
  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !trigger.current?.contains(t)) close(false);
    };
    const onScroll = (e: Event) => {
      if (!pop.current?.contains(e.target as Node)) place();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, place, close]);

  // Focus the filter (or the list) when it opens, and keep the active row visible.
  useEffect(() => {
    if (open && pos) (pop.current?.querySelector<HTMLElement>(searchable ? "input" : "[role=listbox]"))?.focus({ preventScroll: true });
  }, [open, !!pos, searchable]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    pop.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open, shown]);

  useEffect(() => setActive(0), [query]);

  const move = (delta: number) => {
    const n = shown.length;
    if (!n) return;
    let i = active;
    for (let k = 0; k < n; k++) {
      i = (i + delta + n) % n;
      if (!shown[i].disabled) break;
    }
    setActive(i);
  };

  const onListKey = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Home":
        if (!searchable) {
          e.preventDefault();
          setActive(0);
        }
        break;
      case "End":
        if (!searchable) {
          e.preventDefault();
          setActive(Math.max(0, shown.length - 1));
        }
        break;
      case "Enter":
        e.preventDefault();
        choose(shown[active]);
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        close();
        break;
      case "Tab":
        close(false);
        break;
      default:
        if (!searchable && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const now = Date.now();
          typed.current.text = now - typed.current.t > 700 ? e.key : typed.current.text + e.key;
          typed.current.t = now;
          const text = typed.current.text.toLowerCase();
          const i = shown.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(text));
          if (i >= 0) setActive(i);
        }
    }
  };

  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      openMenu();
    }
  };

  let lastGroup: string | undefined;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`sel sel-${size} ${open ? "open" : ""} ${className}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${uid}-list`}
        aria-label={label}
        disabled={disabled}
        title={title}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onTriggerKey}
      >
        {icon}
        <span className="selValue">{current?.label ?? "—"}</span>
        <ChevronDown size={size === "sm" ? 13 : 15} aria-hidden="true" className="selChevron" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={pop}
            className={`selPop ${pos.up ? "up" : ""}`}
            style={{ left: pos.left, minWidth: pos.width, maxHeight: pos.maxH, [pos.up ? "bottom" : "top"]: pos.up ? window.innerHeight - pos.top : pos.top }}
            data-pg-select=""
          >
            {searchable && (
              <div className="selSearch">
                <Search size={14} aria-hidden="true" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onListKey}
                  placeholder="Filter…"
                  aria-label={`Filter ${label}`}
                  aria-controls={`${uid}-list`}
                  aria-activedescendant={shown[active] ? `${uid}-o${active}` : undefined}
                  spellCheck={false}
                />
              </div>
            )}
            <div id={`${uid}-list`} role="listbox" aria-label={label} tabIndex={-1} onKeyDown={onListKey} className="selList">
              {shown.length === 0 && <div className="selEmpty">No matches</div>}
              {shown.map((o, i) => {
                const header = o.group && o.group !== lastGroup ? o.group : null;
                lastGroup = o.group;
                return (
                  <div key={o.value}>
                    {header && (
                      <div className="selGroup" role="presentation">
                        {header}
                      </div>
                    )}
                    <div
                      id={`${uid}-o${i}`}
                      data-i={i}
                      role="option"
                      aria-selected={o.value === value}
                      aria-disabled={o.disabled || undefined}
                      className={`selOpt ${i === active ? "active" : ""} ${o.value === value ? "chosen" : ""}`}
                      onMouseMove={() => i !== active && setActive(i)}
                      onClick={() => choose(o)}
                    >
                      <span className="selCheck">{o.value === value && <Check size={14} aria-hidden="true" />}</span>
                      <span className="selLabel">{o.label}</span>
                      {o.hint && <span className="selHint">{o.hint}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
