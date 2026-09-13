import { PAGE } from "@/lib/api";
import { fmt, staffBadge, tierOf } from "@/lib/tiers";

const row =
  "grid grid-cols-[40px_44px_minmax(0,1.3fr)_minmax(0,1fr)_110px] items-center gap-4 max-md:grid-cols-[28px_36px_minmax(0,1fr)_auto] max-md:gap-2.5";

function Badge({ color }) {
  return (
    <svg width="11" height="13" viewBox="0 0 12 14" className="shrink-0">
      <path d="M6 0.6 11.2 7 6 13.4 0.8 7Z" fill={color} />
    </svg>
  );
}

function nums(cur, last) {
  const out = [];
  for (let i = 1; i <= last; i++) {
    const show =
      i === 1 ||
      i === last ||
      Math.abs(i - cur) <= 1 ||
      (cur <= 3 && i <= 4) ||
      (cur >= last - 2 && i >= last - 3);
    if (!show) continue;
    if (out.length && i - out[out.length - 1] > 1) out.push(0);
    out.push(i);
  }
  return out;
}

function Pager({ page, total, onPage }) {
  const last = Math.max(1, Math.ceil(total / PAGE));
  const from = total ? (page - 1) * PAGE + 1 : 0;
  const to = Math.min(page * PAGE, total);
  if (!total) return null;
  const btn = "grid size-8 place-items-center rounded-full text-[13px] tabular-nums";
  return (
    <nav className="mt-10 flex items-center justify-between gap-4">
      <span className="shrink-0 text-[13px] tabular-nums text-mute">
        {from}–{to} of {fmt(total)}
      </span>
      {last > 1 && (
        <div className="flex items-center gap-0.5 whitespace-nowrap">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            className={`${btn} cursor-pointer text-mute disabled:cursor-default disabled:opacity-25 hover:enabled:text-ink`}
          >
            ‹
          </button>
          {nums(page, last).map((n, i) =>
            n === 0 ? (
              <span key={`e${i}`} className="px-1 text-mute">…</span>
            ) : (
              <button
                key={n}
                type="button"
                onClick={() => onPage(n)}
                className={`${btn} cursor-pointer ${
                  n === page ? "bg-ink text-white" : "text-mute hover:text-ink"
                }`}
              >
                {n}
              </button>
            )
          )}
          <button
            type="button"
            disabled={page >= last}
            onClick={() => onPage(page + 1)}
            className={`${btn} cursor-pointer text-mute disabled:cursor-default disabled:opacity-25 hover:enabled:text-ink`}
          >
            ›
          </button>
        </div>
      )}
    </nav>
  );
}

export default function MemberList({ members, page, total, onPage }) {
  return (
    <>
      <div className={`${row} border-b border-line pb-2 text-[11px] uppercase tracking-[0.08em] text-mute`}>
        <span>#</span>
        <span className="col-start-3">Member</span>
        <span className="max-md:hidden">Location</span>
        <span className="text-right">Points</span>
      </div>
      <ol>
        {members.map((m) => {
          const t = tierOf(m);
          const staff = staffBadge(m);
          return (
            <li key={m.id} className={`${row} border-b border-line py-3.5`}>
              <span className={`text-[13px] tabular-nums ${m.rank <= 3 ? "font-semibold text-ink" : "text-mute"}`}>
                {m.rank}
              </span>
              {m.pictureUrl ? (
                <img src={m.pictureUrl} alt="" className="size-10 rounded-full object-cover max-md:size-9" />
              ) : (
                <span className="grid size-10 place-items-center rounded-full bg-line text-sm max-md:size-9">
                  {(m.name || "?")[0]}
                </span>
              )}
              <div className="min-w-0">
                <strong className="flex min-w-0 items-center gap-1.5 text-[15px] font-semibold">
                  <span className="truncate">{m.name}</span>
                  {staff?.pictureUrl && (
                    <img src={staff.pictureUrl} alt="" title={staff.name} className="size-4 shrink-0 object-contain" />
                  )}
                  {t.n > 0 && <Badge color={t.color} />}
                </strong>
                <em className="mt-0.5 block truncate text-[13px] not-italic text-mute">
                  {m.headline || m.position || "—"}
                </em>
                <span className="mt-0.5 block truncate text-[11px] text-mute/80">{m.id}</span>
              </div>
              <span className="truncate text-[13px] text-mute max-md:hidden">{m.location || "—"}</span>
              <div className="text-right">
                <b className="block text-[15px] font-semibold tabular-nums">{fmt(m.points)}</b>
                <small className="text-[11px]" style={{ color: staff ? "#1e1d29" : t.color }}>{staff?.name || t.label}</small>
              </div>
            </li>
          );
        })}
      </ol>
      <Pager page={page} total={total} onPage={onPage} />
    </>
  );
}
