import { lazy, Suspense, useEffect, useState } from "react";
import { TIERS } from "@/lib/tiers";
import { PAGE, fetchMembers } from "@/lib/api";
import Filters from "@/components/Filters";
import Menu from "@/components/Menu";
import Podium from "@/components/Podium";
import MemberList from "@/components/MemberList";

const Globe = lazy(() => import("@/components/Globe"));

const isGlobe = () => location.hash === "#globe";

export default function App() {
  const [globe, setGlobe] = useState(isGlobe);
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [tier, setTier] = useState("all");
  const [page, setPage] = useState(1);
  const [members, setMembers] = useState(null);
  const [top, setTop] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const sync = () => {
      setGlobe(isGlobe());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  useEffect(() => {
    document.title = globe ? "Globe · House Rank" : "House Rank";
  }, [globe]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDq(q);
      setPage(1);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let live = true;
    setError(false);
    fetchMembers({ q: dq, tier, offset: (page - 1) * PAGE, limit: PAGE })
      .then((d) => {
        if (!live) return;
        setMembers(d.members);
        setTop(d.top || []);
        setTotal(d.total);
      })
      .catch(() => live && setError(true));
    return () => { live = false; };
  }, [dq, tier, page, attempt]);

  const go = (n) => {
    setPage(n);
    window.scrollTo({ top: 0 });
  };

  const showMembers = (place) => {
    setQ(place);
    location.hash = "#rank";
  };

  const filtered = Boolean(dq) || tier !== "all";

  return (
    <div className="mx-auto max-w-[1080px] px-6 pb-24 pt-6 max-md:px-4">
      <header className="mb-6 flex items-center justify-between">
        <a href="#rank" className="text-lg font-semibold tracking-tight">House Rank</a>
        <Menu active={globe} />
      </header>

      {globe ? (
        <Suspense fallback={<p className="py-24 text-center text-sm text-mute">Loading map…</p>}>
          <Globe onPick={showMembers} />
        </Suspense>
      ) : (
        <>
          <Filters
            q={q}
            setQ={setQ}
            tier={tier}
            setTier={(t) => { setTier(t); setPage(1); }}
            tiers={TIERS}
          />
          {!filtered && page === 1 && top.length === 3 && <Podium members={top} />}
          <MemberList
            members={members}
            page={page}
            total={total}
            onPage={go}
            error={error}
            onRetry={() => setAttempt((n) => n + 1)}
            q={dq}
          />
        </>
      )}
    </div>
  );
}
