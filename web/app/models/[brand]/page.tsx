import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { ModelTile, type BrandRow, type ModelRow } from "../page";

type Params = Promise<{ brand: string }>;
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const b = decodeURIComponent((await params).brand);
  return { title: `${b}: усі моделі`, description: `Усі моделі ${b} з 1990 року: роки випуску, покоління, модифікації й ціни.` };
}

export default async function Brand({ params }: { params: Params }) {
  const name = decodeURIComponent((await params).brand);
  const [brands, rows] = await Promise.all([api<BrandRow[]>("/api/brands"), api<ModelRow[]>(`/api/models?brand=${encodeURIComponent(name)}`)]);
  const b = brands.find((x) => x.brand === name);
  if (!b || !rows.length) notFound();
  const now = rows.filter((r) => r.in_production), past = rows.filter((r) => !r.in_production);
  return (
    <div className="stack-lg">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <p className="crumb"><Link href="/models">Марки й моделі</Link> › {b.brand}</p>
        <h1>{b.brand}</h1>
        <p>{b.country ?? ""}{b.alias ? ` · також ${b.alias}` : ""} · моделей з 1990 року: {b.models} · з характеристиками в каталозі: {b.models_with_specs} · модифікацій: {b.modifications}</p>
      </div>
      {[["Випускаються зараз", now], ["Зняті з виробництва", past]].map(([title, list]) => (list as ModelRow[]).length > 0 && (
        <section key={title as string} className="stack">
          <h2>{title as string} · {(list as ModelRow[]).length}</h2>
          <div className="model-grid">{(list as ModelRow[]).map((r) => <ModelTile key={r.model} r={r} />)}</div>
        </section>
      ))}
      <p className="small muted">Роки випуску — для всієї модельної лінійки й орієнтовні; назви звірено з Wikidata. Помітили помилку — напишіть нам.</p>
    </div>
  );
}
