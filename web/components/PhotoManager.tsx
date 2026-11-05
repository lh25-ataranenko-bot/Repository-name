"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { CarPhoto } from "@/lib/types";

const LICENSES: [string, string][] = [
  ["own", "Власне фото"], ["permission", "З дозволу правовласника"],
  ["cc-by-4.0", "CC BY 4.0"], ["cc-by-sa-4.0", "CC BY-SA 4.0"], ["cc0", "CC0 (суспільне надбання)"],
];

/** Editors add photos only with an author and a licence; open licences also need the source link. */
export function PhotoManager({ slug }: { slug: string }) {
  const { toast } = useStore();
  const [photos, setPhotos] = useState<CarPhoto[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [author, setAuthor] = useState("");
  const [license, setLicense] = useState("own");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => { api<CarPhoto[]>(`/api/cars/${slug}/photos`).then(setPhotos).catch(() => null); }, [slug]);
  useEffect(load, [load]);
  const needsSource = license.startsWith("cc");

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return setError("Оберіть файл JPEG, PNG або WebP.");
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("author", author);
    fd.append("license", license);
    if (source) fd.append("source_url", source);
    try {
      await api(`/api/admin/cars/${slug}/photos`, { method: "POST", body: fd });
      toast("Фото додано");
      setFile(null);
      (document.getElementById("ph-file") as HTMLInputElement).value = "";
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel stack">
      <h3>Фото</h3>
      <p className="small muted">Лише фото, на які є права. Під кожним фото на сайті показуються автор і ліцензія. Метадані (зокрема GPS) видаляються, великі фото зменшуються до 1600 px.</p>
      {photos.length > 0 && (
        <div className="photo-strip">
          {photos.map((p) => (
            <figure key={p.id}>
              <img src={p.url} alt="" width={p.width} height={p.height} />
              <figcaption className="small">{p.author} · {p.license_label}{p.is_primary && <> · <b>головне</b></>}</figcaption>
              <div className="row">
                {!p.is_primary && <button className="btn-sm" onClick={async () => { await api(`/api/admin/photos/${p.id}/primary`, { method: "POST" }); load(); }}>Зробити головним</button>}
                <button className="btn-sm btn-ghost" onClick={async () => { await api(`/api/admin/photos/${p.id}`, { method: "DELETE" }); toast("Фото видалено"); load(); }}>Видалити</button>
              </div>
            </figure>
          ))}
        </div>
      )}
      <form className="fields" style={{ alignItems: "end" }} onSubmit={upload}>
        <div className="field"><label htmlFor="ph-file">Файл</label><input id="ph-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
        <div className="field"><label htmlFor="ph-author">Автор фото</label><input id="ph-author" required minLength={2} value={author} onChange={(e) => setAuthor(e.target.value)} /></div>
        <div className="field"><label htmlFor="ph-license">Ліцензія</label><select id="ph-license" value={license} onChange={(e) => setLicense(e.target.value)}>{LICENSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="field"><label htmlFor="ph-src">Посилання на джерело{needsSource ? " (обов’язково)" : ""}</label><input id="ph-src" type="url" required={needsSource} placeholder="https://" value={source} onChange={(e) => setSource(e.target.value)} /></div>
        <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Завантаження…" : "Додати фото"}</button>
      </form>
      {error && <p className="err">{error}</p>}
    </section>
  );
}
