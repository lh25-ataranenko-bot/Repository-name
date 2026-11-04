import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ScoreBars } from "@/components/ScoreBars";
import { Silhouette } from "@/components/Silhouette";
import { api, ApiError } from "@/lib/api";
import { SITE_URL } from "@/lib/site";
import { ASSIST, BODY, DRIVE, FUEL, STATUS, consUnit, isEV, nameOf, nf, usd, years } from "@/lib/format";
import type { Car } from "@/lib/types";
import { CarActions } from "./actions";

async function getCar(slug: string): Promise<Car> {
  try {
    return await api<Car>(`/api/cars/${encodeURIComponent(slug)}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = await getCar((await params).slug);
  return {
    title: `${nameOf(c)} (${c.generation})`,
    description: `Характеристики, надійність і вартість володіння ${nameOf(c)}.`,
    alternates: { canonical: `${SITE_URL}/cars/${c.slug}` },
  };
}

const ND = <span className="nd">Немає даних</span>;
const v = (x: number | null, u = "", d = 0) => (x != null ? `${nf(x, d)}${u ? " " + u : ""}` : ND);

function Section({ title, rows }: { title: string; rows: [string, React.ReactNode][] }) {
  return (
    <div>
      <h4 style={{ marginBottom: 6 }}>{title}</h4>
      <table><tbody>{rows.map(([k, val]) => <tr key={k}><th scope="row">{k}</th><td className="n">{val}</td></tr>)}</tbody></table>
    </div>
  );
}

export default async function CarPage({ params }: { params: Promise<{ slug: string }> }) {
  const c = await getCar((await params).slug);
  const st = STATUS[c.status] ?? STATUS.unverified;
  return (
    <div className="stack-lg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(c) }} />
      <div className="page-head" style={{ marginBottom: 0 }}>
        <p className="crumb">{c.brand} › {c.model} › {c.generation} › {c.name}</p>
        <h1>{nameOf(c)}</h1>
        <p>{years(c)} · {FUEL[c.fuel]} · {BODY[c.body]} · {DRIVE[c.drive]} привід</p>
      </div>
      <div className="split">
        <div className="stack">
          <Silhouette body={c.body} />
          <div className="row"><span className={`pill ${st[1]}`}>{st[0]}</span><span className="small muted">Джерело: {c.source ?? "—"} · оновлено {c.updated_at ?? "—"}</span></div>
          <CarActions slug={c.slug} />
        </div>
        <div className="stack">
          <div className="stats">
            <div className="stat"><span className="label">Ціна ({c.year_ref ?? "—"})</span><span className="big-num">{usd(c.price)}</span></div>
            <div className="stat"><span className="label">Вартість 100 км</span><span className="big-num">{usd(c.cost_per_100km)}</span></div>
            <div className="stat"><span className="label">Володіння 5 років</span><span className="big-num">{usd(c.tco_5y)}</span><span className="small muted">15 000 км на рік</span></div>
          </div>
          <ScoreBars series={[{ color: "var(--accent)", scores: c.scores }]} />
          <p className="small muted">Оцінки 0–100. Надійність і комфорт — експертні індекси, решта — відносно автомобілів у каталозі.</p>
        </div>
      </div>
      <div className="panel spec-grid">
        <Section title="Двигун і трансмісія" rows={[["Код двигуна", c.engine_code ?? ND], ["Об’єм", c.displacement != null ? `${nf(c.displacement)} см³` : isEV(c) ? "— (електро)" : ND], ["Потужність", v(c.hp, "к.с.")], ["Крутний момент", v(c.torque, "Н·м")], ["КПП", c.transmission ?? ND], ["Привід", DRIVE[c.drive]]]} />
        <Section title="Динаміка й економічність" rows={[["0–100 км/год", v(c.acc, "с", 1)], ["Макс. швидкість", v(c.vmax, "км/год")], ["Витрата (паспорт)", v(c.cons_pass, consUnit(c), 1)], ["Витрата (реальна)", v(c.cons_real, consUnit(c), 1)], [isEV(c) ? "Батарея (корисна)" : "Бак", isEV(c) ? v(c.battery, "кВт·год") : v(c.tank, "л")], ["Запас ходу (реальний)", v(c.range_km, "км")]]} />
        <Section title="Габарити" rows={[["Д × Ш × В", c.length ? `${nf(c.length)} × ${nf(c.width)} × ${nf(c.height)} мм` : ND], ["Колісна база", v(c.wheelbase, "мм")], ["Кліренс", v(c.clearance, "мм")], ["Багажник", v(c.trunk, "л")]]} />
        <Section title="Безпека й ринок" rows={[["Euro NCAP", c.ncap != null ? `${"★".repeat(c.ncap)}${"☆".repeat(5 - c.ncap)} (${c.ncap_year})` : ND], ["Подушки безпеки", v(c.airbags)], ["ТО на рік", c.maint_per_year != null ? usd(c.maint_per_year) : ND], ["Знецінення на рік", c.depreciation != null ? `${nf(c.depreciation * 100, 1)} %` : ND], ["Ліквідність", c.liquidity ?? ND]]} />
      </div>
      {c.assists.length > 0 && (
        <div><h3 style={{ marginBottom: 8 }}>Асистенти водія</h3><div className="chips">{c.assists.map((a) => <span className="chip" key={a}>{ASSIST[a] ?? a}</span>)}</div></div>
      )}
      <div className="stack">
        <h3>Типові несправності цієї модифікації</h3>
        {c.issues.length ? (
          <>
            <div className="tbl-wrap"><table>
              <thead><tr><th>Вузол</th><th>Частота</th><th className="n">Орієнтовно</th></tr></thead>
              <tbody>{c.issues.map((i) => <tr key={i.part}><td>{i.part}</td><td><span className={`pill ${i.frequency === "часто" ? "warn" : i.frequency === "іноді" ? "plain" : "good"}`}>{i.frequency}</span></td><td className="n">{i.cost ? usd(i.cost) : "—"}</td></tr>)}</tbody>
            </table></div>
            <p className="small muted">Рівень упевненості в оцінці надійності: <b>{c.reliability_confidence ?? "—"}</b>. Вартість ремонту орієнтовна, для незалежного СТО.</p>
          </>
        ) : <p>{ND}</p>}
      </div>
    </div>
  );
}

const FUEL_SCHEMA: Record<string, string> = { petrol: "Gasoline", diesel: "Diesel", hybrid: "Hybrid", electric: "Electric" };
const DRIVE_SCHEMA: Record<string, string> = { FWD: "FrontWheelDriveConfiguration", RWD: "RearWheelDriveConfiguration", AWD: "AllWheelDriveConfiguration" };

/** schema.org/Car for search engines. Only known values are included. */
function jsonLd(c: Car): string {
  const qv = (value: number | null, unitCode: string) => (value == null ? undefined : { "@type": "QuantitativeValue", value, unitCode });
  const data = {
    "@context": "https://schema.org",
    "@type": "Car",
    name: nameOf(c),
    brand: { "@type": "Brand", name: c.brand },
    model: `${c.model} ${c.generation}`,
    vehicleConfiguration: c.name,
    url: `${SITE_URL}/cars/${c.slug}`,
    bodyType: BODY[c.body],
    fuelType: FUEL_SCHEMA[c.fuel],
    driveWheelConfiguration: DRIVE_SCHEMA[c.drive] ? `https://schema.org/${DRIVE_SCHEMA[c.drive]}` : undefined,
    vehicleTransmission: c.transmission ?? undefined,
    productionDate: c.year_from ? String(c.year_from) : undefined,
    vehicleEngine: c.hp != null || c.displacement != null
      ? { "@type": "EngineSpecification", enginePower: qv(c.hp, "BHP"), engineDisplacement: qv(c.displacement, "CMQ"), torque: qv(c.torque, "NU") }
      : undefined,
    accelerationTime: qv(c.acc, "SEC"),
    speed: qv(c.vmax, "KMH"),
    cargoVolume: qv(c.trunk, "LTR"),
    wheelbase: qv(c.wheelbase, "MMT"),
    offers: c.price != null ? { "@type": "AggregateOffer", priceCurrency: "USD", lowPrice: c.price, highPrice: c.price } : undefined,
  };
  // "<" is escaped so the payload can never close the script tag.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
