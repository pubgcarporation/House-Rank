import { useEffect, useState } from "react";
import { TIERS } from "@/lib/tiers";
import { PAGE, fetchMembers } from "@/lib/api";
import Filters from "@/components/Filters";
import Podium from "@/components/Podium";
import MemberList from "@/components/MemberList";

export default function App() {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [tier, setTier] = useState("all");
  const [page, setPage] = useState(1);
  const [members, setMembers] = useState([]);
  const [top, setTop] = useState([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setDq(q);
      setPage(1);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let live = true;
    fetchMembers({ q: dq, tier, offset: (page - 1) * PAGE, limit: PAGE }).then((d) => {
      if (!live) return;
      setMembers(d.members);
      setTop(d.top || []);
      setTotal(d.total);
    });
    return () => { live = false; };
  }, [dq, tier, page]);

  const go = (n) => {
    setPage(n);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="mx-auto max-w-[1080px] px-6 pb-24 pt-10 max-md:px-4">
      <Filters
        q={q}
        setQ={setQ}
        tier={tier}
        setTier={(t) => { setTier(t); setPage(1); }}
        tiers={TIERS}
      />
      {top.length === 3 && <Podium members={top} />}
      <MemberList members={members} page={page} total={total} onPage={go} />
    </div>
  );
}
