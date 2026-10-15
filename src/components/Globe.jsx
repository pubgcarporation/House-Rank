import { useEffect, useRef, useState } from "react";
import ReactGlobe from "react-globe.gl";
import { CanvasTexture, MeshBasicMaterial, SRGBColorSpace } from "three";
import { feature, mesh } from "topojson-client";
import world from "world-atlas/countries-50m.json";
import "flag-icons/css/flag-icons.min.css";
import { fetchPlaces } from "@/lib/api";
import { fmt } from "@/lib/tiers";

const W = 4096;
const H = W / 2;
const SHOWN = 12;
const HOT = "#e0612f";

const land = feature(world, world.objects.countries);
const borders = mesh(world, world.objects.countries, (a, b) => a !== b);

const canvas = Object.assign(document.createElement("canvas"), { width: W, height: H });
const texture = new CanvasTexture(canvas);
texture.colorSpace = SRGBColorSpace;
texture.anisotropy = 8;
const MAP = new MeshBasicMaterial({ map: texture });

const px = ([lng, lat]) => [((lng + 180) / 360) * W, ((90 - lat) / 180) * H];

// make longitudes continuous so rings crossing the antimeridian don't span the whole map
function unwrap(ring) {
  let shift = 0;
  return ring.map(([lng, lat], i) => {
    const d = i ? lng - ring[i - 1][0] : 0;
    if (d > 180) shift -= 360;
    else if (d < -180) shift += 360;
    return [lng + shift, lat];
  });
}

function trace(ctx, lines) {
  ctx.beginPath();
  for (const line of lines) {
    let prev = null;
    for (const p of line) {
      const [x, y] = px(p);
      const seam = prev && (Math.abs(p[0] - prev[0]) > 180 || (Math.abs(p[0]) > 179.9 && Math.abs(prev[0]) > 179.9));
      if (!prev || seam) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      prev = p;
    }
  }
}

function paint(states = []) {
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#e8eef6";
  ctx.fillRect(0, 0, W, H);
  ctx.lineJoin = "round";

  ctx.fillStyle = "#c9d3e1";
  for (const { geometry: g } of land.features) {
    ctx.beginPath();
    for (const poly of g.type === "Polygon" ? [g.coordinates] : g.coordinates) {
      for (const ring of poly) {
        const pts = unwrap(ring).map(px);
        for (const shift of [-W, 0, W]) {
          pts.forEach(([x, y], i) => (i ? ctx.lineTo(x + shift, y) : ctx.moveTo(x + shift, y)));
          ctx.closePath();
        }
      }
    }
    ctx.fill("evenodd");
  }

  ctx.strokeStyle = "#b3bfd1";
  ctx.lineWidth = 1.4;
  trace(ctx, states);
  ctx.stroke();

  ctx.strokeStyle = "#7f8ea6";
  ctx.lineWidth = 1.8;
  trace(ctx, borders.coordinates);
  ctx.stroke();
  texture.needsUpdate = true;
}
paint();

const FADE = "linear-gradient(to bottom, transparent, #000 18%, #000 82%, transparent)";

const dotColor = () => "#2f578c";
const dotRadius = (d) => Math.min(1.6, 0.22 + Math.sqrt(d.n) * 0.045);
const ringColor = () => HOT;
const plural = (n) => `${fmt(n)} member${n > 1 ? "s" : ""}`;

export default function Globe({ onPick }) {
  const box = useRef(null);
  const globe = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [spot, setSpot] = useState(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    fetchPlaces().then(setData).catch(() => setFailed(true));
    fetch("/states.json").then((r) => r.json()).then(paint).catch(() => {});
  }, []);

  useEffect(() => {
    const measure = () =>
      setSize({
        w: document.documentElement.clientWidth,
        h: Math.round(Math.min(box.current.clientWidth * (window.innerWidth < 640 ? 1.2 : 1), window.innerHeight * 0.75)),
      });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    const g = globe.current;
    if (!g || !data) return;
    g.renderer().setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    g.pointOfView({ altitude: window.innerWidth < 640 ? 1.8 : 2.2 });
    const c = g.controls();
    c.minDistance = 130;
    c.maxDistance = 500;
    c.zoomSpeed = 0.6;
    c.autoRotate = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    c.autoRotateSpeed = 0.45;
  }, [data, size.w]);

  const pick = ({ lat, lng }) => {
    const alt = globe.current.pointOfView().altitude;
    const near = (p) => Math.hypot(p.lat - lat, (p.lng - lng) * Math.cos((lat * Math.PI) / 180));
    let best = null;
    for (const p of data.places) if (!best || near(p) < near(best)) best = p;
    if (!best || near(best) > Math.max(1.2, alt * 1.4)) return setSpot(null);
    setSpot(best);
    globe.current.pointOfView({ lat: best.lat, lng: best.lng, altitude: Math.min(alt, 1.4) }, 700);
  };

  const countries = data?.countries || [];
  const rows = all ? countries : countries.slice(0, SHOWN);
  const max = countries[0]?.n || 1;

  return (
    <>
      <div ref={box} className="relative w-full" style={{ height: size.h || 320 }}>
        <div
          onPointerDown={() => globe.current && (globe.current.controls().autoRotate = false)}
          onWheelCapture={(e) => !e.ctrlKey && e.nativeEvent.stopPropagation()}
          className="absolute left-1/2 top-0 flex h-full -translate-x-1/2 justify-center"
          style={{ width: size.w || "100%", maskImage: FADE, WebkitMaskImage: FADE }}
        >
          {failed && <p className="self-center text-sm text-mute">Couldn’t load the map.</p>}
          {!data && !failed && <p className="self-center text-sm text-mute">Loading map…</p>}
          {data && size.w > 0 && (
            <ReactGlobe
              ref={globe}
              width={size.w}
              height={size.h}
              backgroundColor="rgba(0,0,0,0)"
              globeMaterial={MAP}
              atmosphereColor="#8fb0d9"
              atmosphereAltitude={0.14}
              pointsData={data.places}
              pointLat="lat"
              pointLng="lng"
              pointAltitude={0.003}
              pointRadius={dotRadius}
              pointColor={dotColor}
              pointsMerge
              ringsData={spot ? [spot] : []}
              ringColor={ringColor}
              ringMaxRadius={2.2}
              ringPropagationSpeed={1.6}
              ringRepeatPeriod={1000}
              onGlobeClick={pick}
            />
          )}
        </div>
      </div>

      <p className="mt-4 min-h-6 text-balance text-center text-sm text-mute">
        {spot ? (
          <>
            <b className="font-semibold text-ink">{spot.label}</b> · {plural(spot.n)} ·{" "}
            <button type="button" onClick={() => onPick(spot.label)} className="cursor-pointer text-acc underline underline-offset-2">
              View members
            </button>
          </>
        ) : data ? (
          "Drag to rotate, pinch or Ctrl + scroll to zoom, tap a dot."
        ) : null}
      </p>

      {countries.length > 0 && (
        <section className="mt-12">
          <div className="grid grid-cols-[28px_28px_minmax(0,1fr)_auto] gap-3 border-b border-line pb-2 text-[11px] uppercase tracking-[0.08em] text-mute">
            <span>#</span>
            <span className="col-span-2">Country</span>
            <span className="text-right">Members</span>
          </div>
          <ol>
            {rows.map((c, i) => (
              <li key={c.country} className="grid grid-cols-[28px_28px_minmax(0,1fr)_auto] items-center gap-3 border-b border-line py-3">
                <span className="text-[13px] tabular-nums text-mute">{i + 1}</span>
                {c.code ? <span className={`fi fi-${c.code} rounded-[3px] text-[20px]`} /> : <span />}
                <div className="min-w-0">
                  <span className="block truncate text-[15px]">{c.country}</span>
                  <span className="mt-1.5 block h-[3px] rounded-full bg-acc/50" style={{ width: `${Math.max(2, (c.n / max) * 100)}%` }} />
                </div>
                <b className="text-[15px] font-semibold tabular-nums">{fmt(c.n)}</b>
              </li>
            ))}
          </ol>
          {countries.length > SHOWN && (
            <button type="button" onClick={() => setAll((v) => !v)} className="mt-4 cursor-pointer text-sm text-acc underline underline-offset-2">
              {all ? "Show fewer" : `Show all ${countries.length}`}
            </button>
          )}
        </section>
      )}
    </>
  );
}
