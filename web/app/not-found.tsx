import Link from "next/link";

export default function NotFound() {
  return <div className="empty"><b>Сторінку не знайдено</b><span>Можливо, модифікацію прибрали з каталогу.</span><Link className="btn" href="/catalog">До каталогу</Link></div>;
}
