import { fmt, tierOf } from "@/lib/tiers";

const STANDS = [
  { place: 2, h: "h-16", stand: "bg-[#d4d7de]", medal: "bg-[#8d939e] text-white" },
  { place: 1, h: "h-28", stand: "bg-[#e4c44a]", medal: "bg-[#c9a227] text-white" },
  { place: 3, h: "h-12", stand: "bg-[#d9a05a]", medal: "bg-[#c4843a] text-white" },
];

function Face({ m, big }) {
  const sz = big ? "size-[4.25rem] max-md:size-12" : "size-12 max-md:size-10";
  if (m.pictureUrl) {
    return <img src={m.pictureUrl} alt="" className={`${sz} rounded-full object-cover`} />;
  }
  return (
    <span className={`grid ${sz} place-items-center rounded-full bg-line text-lg`}>
      {(m.name || "?")[0]}
    </span>
  );
}

export default function Podium({ members }) {
  const top = [members[1], members[0], members[2]];
  if (top.some((m) => !m)) return null;

  return (
    <div className="mb-12 flex items-end justify-center gap-8 max-md:gap-3">
      {top.map((m, i) => {
        const s = STANDS[i];
        const t = tierOf(m);
        return (
          <div key={m.id} className="flex w-40 min-w-0 flex-col items-center max-md:w-[30%]">
            <Face m={m} big={s.place === 1} />
            <strong className="mt-2.5 w-full truncate text-center text-sm font-semibold">{m.name}</strong>
            <span className="text-xs tabular-nums" style={{ color: t.color }}>{fmt(m.points)}</span>
            <div className="relative mt-5 w-[4.5rem] max-md:w-12">
              <span className={`absolute left-1/2 top-0 z-10 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-xs font-semibold ${s.medal}`}>
                {s.place}
              </span>
              <div className={`w-full rounded-t-md ${s.h} ${s.stand}`} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
