import { useEffect, useRef, useState } from "react";

export default function Menu({ active }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    const close = (e) => {
      if (box.current && !box.current.contains(e.target)) setOpen(false);
    };
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  return (
    <div ref={box} className="relative -mr-2">
      <button
        type="button"
        aria-label="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="grid size-10 cursor-pointer place-items-center rounded-full text-ink hover:bg-black/5"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
          <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-2 top-full z-20 mt-1 min-w-[160px] overflow-hidden rounded-2xl bg-white py-1 shadow-[0_8px_24px_rgba(30,29,41,0.12)]">
          <a
            href="#globe"
            role="menuitem"
            aria-current={active ? "page" : undefined}
            onClick={() => setOpen(false)}
            className={`block px-3.5 py-2.5 text-sm hover:bg-[#eef1f6] ${active ? "font-semibold text-ink" : "text-ink"}`}
          >
            Globe
          </a>
        </div>
      )}
    </div>
  );
}
