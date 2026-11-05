import { api } from "@/lib/api";
import type { CarPhoto } from "@/lib/types";
import { Silhouette } from "./Silhouette";

/** Photos with author and licence under each one; the body silhouette when there are none. */
export async function Gallery({ slug, body, alt }: { slug: string; body: string; alt: string }) {
  const photos = await api<CarPhoto[]>(`/api/cars/${slug}/photos`).catch(() => [] as CarPhoto[]);
  if (!photos.length) return <Silhouette body={body} />;
  const [main, ...rest] = photos;
  const credit = (p: CarPhoto) => (
    <figcaption className="small muted">
      Фото: {p.source_url ? <a href={p.source_url} target="_blank" rel="noopener noreferrer">{p.author}</a> : p.author} · {p.license_label}
    </figcaption>
  );
  return (
    <div className="stack" style={{ gap: 8 }}>
      <figure className="photo-main"><img src={main.url} alt={alt} width={main.width} height={main.height} />{credit(main)}</figure>
      {rest.length > 0 && (
        <div className="photo-strip">
          {rest.map((p) => <figure key={p.id}><img src={p.url} alt={alt} width={p.width} height={p.height} loading="lazy" />{credit(p)}</figure>)}
        </div>
      )}
    </div>
  );
}
