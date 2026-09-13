import { useEffect, useRef, useState } from "react";

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 text-mute">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export default function Filters({ q, setQ, tier, setTier, tiers }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const opts = [
    { id: "all", label: "All", color: "#1e1d29" },
    { id: "0", label: "Member", color: "#656B76" },
    ...[...tiers]
      .filter((t) => t.n <= 2)
      .reverse()
      .map((t) => ({ id: String(t.n), label: t.label, color: t.color })),
  ];
  const cur = opts.find((o) => o.id === tier) || opts[0];

  useEffect(() => {
    const close = (e) => {
      if (box.current && !box.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className="mb-10 flex items-center gap-2">
      <label className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full bg-white px-4">
        <SearchIcon />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, city, id"
          className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-mute"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} className="cursor-pointer text-lg leading-none text-mute hover:text-ink">
            ×
          </button>
        )}
      </label>
      <div ref={box} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex h-11 cursor-pointer items-center gap-1.5 rounded-full px-4 text-sm text-white"
          style={{ background: cur.color }}
        >
          {cur.label}
          <svg width="10" height="6" viewBox="0 0 10 6" className={open ? "rotate-180" : ""}>
            <path d="M1 1.2 5 4.8 9 1.2" stroke="currentColor" strokeWidth="1.4" fill="none" />
          </svg>
        </button>
        {open && (
          <div className="absolute right-0 top-full z-20 mt-1.5 min-w-[180px] bg-white py-1 whitespace-nowrap">
            {opts.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => { setTier(o.id); setOpen(false); }}
                className={`block w-full cursor-pointer px-3.5 py-2 text-left text-sm ${
                  o.id === tier ? "text-white" : "text-ink hover:bg-[#eef1f6]"
                }`}
                style={o.id === tier ? { background: o.color } : undefined}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
