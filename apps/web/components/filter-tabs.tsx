'use client';

import { useEffect, useRef, useState } from 'react';

export interface FilterTab<T extends string> {
  key: T;
  label: string;
}

// Horizontally scrollable pill tabs: scrollbar hidden, right-edge fade when
// more tabs exist, and a "More" overflow menu for the less-used filters.
export default function FilterTabs<T extends string>({
  tabs,
  active,
  onChange,
  primaryCount = 4,
}: {
  tabs: FilterTab<T>[];
  active: T;
  onChange: (key: T) => void;
  primaryCount?: number;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const primary = tabs.slice(0, primaryCount);
  const overflow = tabs.slice(primaryCount);
  const activeInOverflow = overflow.some((t) => t.key === active);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setFade(el.scrollWidth - el.clientWidth - el.scrollLeft > 8);
    update();
    el.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [tabs.length]);

  return (
    <div className="relative flex items-center border-b border-line px-2 py-1.5">
      <div
        ref={scrollRef}
        className={`scrollbar-hide flex flex-1 gap-1 overflow-x-auto ${fade ? 'fade-right' : ''}`}
        role="tablist"
      >
        {primary.map((t) => (
          <Pill key={t.key} active={active === t.key} onClick={() => onChange(t.key)}>
            {t.label}
          </Pill>
        ))}
        {/* On wide screens the overflow tabs still scroll into view; the More
            menu is the mobile/compact affordance. */}
        {overflow.map((t) => (
          <Pill
            key={t.key}
            active={active === t.key}
            onClick={() => onChange(t.key)}
            className="hidden lg:inline-flex"
          >
            {t.label}
          </Pill>
        ))}
      </div>

      {overflow.length > 0 && (
        <div className="relative lg:hidden">
          <button
            onClick={() => setShowMore((v) => !v)}
            className={`ml-1 shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${
              activeInOverflow ? 'bg-accent/10 text-accent' : 'text-soft hover:text-ink'
            }`}
            aria-haspopup="menu"
            aria-expanded={showMore}
          >
            More ▾
          </button>
          {showMore && (
            <>
              <button
                className="fixed inset-0 z-20 cursor-default"
                aria-hidden
                tabIndex={-1}
                onClick={() => setShowMore(false)}
              />
              <div className="absolute right-0 z-30 mt-1 w-40 rounded-md border border-line bg-surface py-1 shadow-lg">
                {overflow.map((t) => (
                  <button
                    key={t.key}
                    role="menuitem"
                    onClick={() => {
                      onChange(t.key);
                      setShowMore(false);
                    }}
                    className={`block w-full px-3 py-1.5 text-left text-xs ${
                      active === t.key ? 'font-medium text-accent' : 'text-soft hover:bg-raised'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
  className = '',
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
        active ? 'bg-accent/10 text-accent' : 'text-soft hover:bg-raised hover:text-ink'
      } ${className}`}
    >
      {children}
    </button>
  );
}
