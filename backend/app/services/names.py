"""Finding a brand or model from what a person types: Latin or Cyrillic, Ukrainian or Russian spelling,
small typos, or Latin typed with the Cyrillic keyboard layout ("ьфявф" = "mazda").

Every name and every query is reduced to a phonetic key: Cyrillic is transliterated, then spellings that
sound alike are merged (c/k, y/i, w/v, ph/f, double letters, spaces). "Камри", "Камрі" and "Camry" all
become "kamri". Brands whose local name sounds different ("Пежо" for Peugeot, "Хендай" for Hyundai)
are listed in BRAND_ALIASES.
"""

import re
import unicodedata
from typing import Any

CYR = {
    "а": "a", "б": "b", "в": "v", "г": "g", "ґ": "g", "д": "d", "е": "e", "ё": "e", "є": "e", "ж": "zh",
    "з": "z", "и": "i", "і": "i", "ї": "i", "й": "i", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o",
    "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh",
    "щ": "sh", "ъ": "", "ы": "i", "ь": "", "э": "e", "ю": "iu", "я": "ia", "'": "", "’": "", "ʼ": "",
}
# Latin typed on the Ukrainian/Russian keyboard (ЙЦУКЕН) and the other way round.
_LAT = "qwertyuiop[]asdfghjkl;'zxcvbnm,."
_UKR = "йцукенгшщзхїфівапролджєячсмитьбю"
_RUS = "йцукенгшщзхъфывапролджэячсмитьбю"
TO_LATIN_LAYOUT = {**{c: l for c, l in zip(_UKR, _LAT)}, **{c: l for c, l in zip(_RUS, _LAT)}}
TO_CYR_LAYOUT = {l: c for l, c in zip(_LAT, _UKR)}

# Local names that do not sound like the brand. Keys are brand names as in the catalogue.
BRAND_ALIASES: dict[str, list[str]] = {
    "Volkswagen": ["фольксваген", "фольцваген", "фольксвагін", "фольц", "фв", "вв", "vw", "volkswagon"],
    "Mercedes-Benz": ["мерседес", "мерседес бенц", "мерс", "мерен", "mercedes", "benz"],
    "BMW": ["бмв", "бэха", "беха", "бумер"],
    "Hyundai": ["хюндай", "хундай", "хендай", "хьюндай", "хьюндэ", "хюндаі", "hundai", "hyndai"],
    "Peugeot": ["пежо", "пежот", "pegeot", "pejo"],
    "Renault": ["рено", "reno"],
    "Citroen": ["сітроен", "ситроен", "сітроєн", "citroën"],
    "Chevrolet": ["шевроле", "шевролет", "шеві", "шеви", "chevy"],
    "Mitsubishi": ["міцубісі", "мицубиси", "митсубиси", "міцубіші", "мітсубісі", "mitsu"],
    "Toyota": ["тойота", "тайота", "тоета"],
    "Nissan": ["ніссан", "ниссан", "нісан"],
    "Skoda": ["шкода", "skoda", "škoda"],
    "Lexus": ["лексус"],
    "Opel": ["опель"],
    "Ford": ["форд"],
    "Audi": ["ауді", "ауди"],
    "Kia": ["кіа", "киа"],
    "Mazda": ["мазда"],
    "Honda": ["хонда"],
    "Subaru": ["субару"],
    "Suzuki": ["сузукі", "сузуки"],
    "Volvo": ["вольво"],
    "Tesla": ["тесла"],
    "Jeep": ["джип", "джіп"],
    "Land Rover": ["ленд ровер", "ленд ровер", "лендровер", "land rover", "range rover", "рендж ровер"],
    "Porsche": ["порше", "порш"],
    "Ferrari": ["феррарі", "феррари", "ферарі", "ферари"],
    "Lamborghini": ["ламборгіні", "ламборгини", "ламба"],
    "Maserati": ["мазераті", "мазерати"],
    "Bentley": ["бентлі", "бентли"],
    "Rolls-Royce": ["роллс ройс", "ролс ройс", "rolls royce"],
    "Aston Martin": ["астон мартін", "астон мартин"],
    "Alfa Romeo": ["альфа ромео"],
    "Cadillac": ["каділак", "кадиллак", "кадилак"],
    "Chrysler": ["крайслер"],
    "Dodge": ["додж"],
    "Lincoln": ["лінкольн", "линкольн"],
    "Infiniti": ["інфініті", "инфинити"],
    "Acura": ["акура"],
    "Genesis": ["дженезис", "генезис"],
    "Jaguar": ["ягуар"],
    "Mini": ["міні", "мини"],
    "Smart": ["смарт"],
    "Seat": ["сеат", "сіат"],
    "Cupra": ["купра"],
    "Dacia": ["дачія", "дачия", "дача"],
    "Fiat": ["фіат", "фиат"],
    "Lancia": ["лянча", "ланча", "лансіа"],
    "Daewoo": ["деу", "дэу", "дэо", "део", "даеву"],
    "Daihatsu": ["дайхацу", "дайхатсу"],
    "ZAZ": ["заз", "запорожець", "запорожец"],
    "Lada": ["лада", "ваз", "жигулі", "жигули"],
    "GAZ": ["газ", "волга"],
    "UAZ": ["уаз"],
    "Moskvich": ["москвич"],
    "SsangYong": ["санг йонг", "сангйонг", "ссанг йонг", "ссангйонг", "кгм", "kgm"],
    "Chery": ["чері", "чери"],
    "Geely": ["джилі", "джили", "гелі"],
    "BYD": ["бід", "бид", "біуайді", "бі уай ді"],
    "Haval": ["хавал", "хавейл"],
    "Great Wall": ["грейт вол", "грейт волл"],
    "MG": ["мг", "ем джі", "эм джи"],
    "Zeekr": ["зікр", "зикр", "зекр"],
    "Polestar": ["полестар", "полстар"],
    "Changan": ["чанган", "чанъань"],
    "JAC": ["джак", "жак"],
    "Hongqi": ["хончі", "хунцы", "хонгкі"],
    "Lynk & Co": ["лінк енд ко", "линк"],
    "Leapmotor": ["ліпмотор", "липмотор"],
    "Xpeng": ["сяопен", "икспенг", "іксп"],
    "Nio": ["ніо", "нио"],
    "Li Auto": ["лі авто", "ли авто", "lixiang"],
    "Voyah": ["воя", "вояж"],
    "Omoda": ["омода"],
    "Jetour": ["джетур"],
    "Dongfeng": ["донгфенг", "дунфен"],
    "Isuzu": ["ісузу", "исузу"],
    "Iveco": ["івеко", "ивеко"],
    "Rover": ["ровер"],
    "Saab": ["сааб"],
    "Hummer": ["хаммер", "хамер"],
    "Buick": ["бьюік", "бьюик"],
    "GMC": ["джі ем сі", "джиэмси"],
    "Ram": ["рам"],
    "McLaren": ["макларен"],
    "Lotus": ["лотус"],
    "Proton": ["протон"],
    "Tata": ["тата"],
    "Mahindra": ["махіндра", "махиндра"],
    "Pontiac": ["понтіак", "понтиак"],
    "Mercury": ["меркурі", "меркьюри"],
    "Saturn": ["сатурн"],
    "Scion": ["сайон"],
}
# Model nicknames whose sound differs from the name.
MODEL_ALIASES: dict[tuple[str, str], list[str]] = {
    ("Volkswagen", "Golf"): ["гольф"], ("Volkswagen", "Passat"): ["пасат"], ("Volkswagen", "Touareg"): ["туарег"],
    ("Toyota", "Land Cruiser"): ["крузак", "ленд крузер", "лендкрузер"], ("Toyota", "Land Cruiser Prado"): ["прадо"],
    ("Mitsubishi", "Pajero"): ["паджеро", "паджеро"], ("Mitsubishi", "Lancer"): ["лансер"],
    ("Hyundai", "Santa Fe"): ["санта фе", "сантафе"], ("Kia", "Sportage"): ["спортейдж", "спортаж"],
    ("Kia", "Ceed"): ["сід", "сид"], ("Nissan", "Qashqai"): ["кашкай"], ("Nissan", "X-Trail"): ["ікс трейл", "икстрейл", "хтрейл"],
    ("Skoda", "Octavia"): ["октавія", "октавия", "октавка"], ("Renault", "Megane"): ["меган"], ("Renault", "Duster"): ["дастер"],
    ("Ford", "Focus"): ["фокус"], ("Ford", "Mondeo"): ["мондео"], ("Mazda", "CX-5"): ["сх5", "сх 5"],
    ("ZAZ", "Таврія"): ["tavria", "tavriia", "таврия"], ("ZAZ", "Славута"): ["slavuta"], ("ZAZ", "Сенс"): ["sens"],
    ("Daewoo", "Lanos"): ["ланос"], ("Daewoo", "Matiz"): ["матіз", "матиз"], ("Chevrolet", "Aveo"): ["авео"],
    ("Lada", "Niva"): ["нива", "нива"], ("Chevrolet", "Niva"): ["шніва", "шнива"],
}


def _phonetic(s: str) -> str:
    s = s.lower().replace("&", " and ")
    s = "".join(CYR.get(ch, ch) for ch in s)
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9]+", "", s)
    for a, b in (("sch", "sh"), ("ph", "f"), ("ck", "k"), ("qu", "kv"), ("q", "k"), ("w", "v"), ("x", "ks"),
                 ("ee", "i"), ("oo", "u"), ("ou", "u"), ("y", "i"), ("j", "dzh"), ("kh", "h"), ("ts", "c"), ("tz", "c")):
        s = s.replace(a, b)
    s = re.sub(r"c(?=[eiy])", "s", s).replace("c", "k")
    s = re.sub(r"([a-z])\1+", r"\1", s)  # double letters
    s = s.replace("ii", "i").replace("ia", "a").replace("iu", "u").replace("ie", "e")  # "Октавия" ~ "Octavia"
    return s


def key(s: str) -> str:
    return _phonetic(s or "")


def _swap_layout(q: str) -> str | None:
    low = q.lower()
    if any(ch in TO_LATIN_LAYOUT for ch in low) and not re.search(r"[a-z]", low):
        return "".join(TO_LATIN_LAYOUT.get(ch, ch) for ch in low)
    if re.search(r"[a-z]", low) and not re.search(r"[а-яіїєґ]", low):
        return "".join(TO_CYR_LAYOUT.get(ch, ch) for ch in low)
    return None


_CODE_LETTERS = {"х": "x", "Х": "X", "с": "c", "С": "C", "р": "r", "Р": "R"}


def _codes_to_latin(q: str) -> str:
    """Model codes typed in Cyrillic: "Х5", "СХ-5", "РХ" mean X5, CX-5, RX (the letters look alike)."""
    def fix(word: str) -> str:
        bare = re.sub(r"[^\w]", "", word)
        if bare and any(ch.isdigit() for ch in bare):  # letters said aloud: "ку7" = Q7, "ікс5" = X5, "ем5" = M5
            word = re.sub(r"(?i)^(ку|кю)(?=[\d-])", "Q", word)
            word = re.sub(r"(?i)^(ікс|икс)(?=[\d-])", "X", word)
            word = re.sub(r"(?i)^ем(?=[\d-])", "M", word)
        if bare and (any(ch.isdigit() for ch in bare) or len(bare) <= 3):
            return "".join(_CODE_LETTERS.get(ch, ch) for ch in word)
        return word
    return " ".join(fix(w) for w in q.split())


def _distance(a: str, b: str, limit: int) -> int:
    """Levenshtein distance, stopping early once it exceeds limit."""
    if abs(len(a) - len(b)) > limit:
        return limit + 1
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        if min(cur) > limit:
            return limit + 1
        prev = cur
    return prev[-1]


def _score(q: str, k: str) -> int:
    """0 = no match. Exact > prefix > inside > close spelling."""
    if not q or not k:
        return 0
    if q == k:
        return 100
    if k.startswith(q):
        return 90 - min(20, len(k) - len(q))
    if len(q) >= 3 and q in k:
        return 60
    if len(q) >= 4:
        allow = 1 if len(q) < 7 else 2
        d = min(_distance(q, k, allow), _distance(q, k[:len(q)], allow) + 1)
        if d <= allow:
            return 50 - 10 * d
    return 0


class NameIndex:
    """Brands and models with their keys; built once per catalogue version."""

    def __init__(self, models: list[dict[str, Any]]):
        self.brands: dict[str, set[str]] = {}
        self.items: list[dict[str, Any]] = []
        for m in models:
            b = m["brand"]
            if b not in self.brands:
                aliases = BRAND_ALIASES.get(b, []) + ([m["brand_alias"]] if m.get("brand_alias") else [])
                self.brands[b] = {key(b), *(key(a) for a in aliases)}
            mk = {key(m["model"]), *(key(a) for a in MODEL_ALIASES.get((b, m["model"]), []))}
            for alias in (m.get("alias") or "").split("/"):
                if alias.strip():
                    mk.add(key(alias))
            self.items.append({**m, "_model_keys": mk})

    def _brand_score(self, q: str, brand: str) -> int:
        return max(_score(q, k) for k in self.brands[brand])

    def suggest(self, query: str, limit: int = 10, brand: str | None = None, layout: bool = True) -> list[dict[str, Any]]:
        """Brands and models for a typed text. With brand set, only that brand's models.
        layout=False skips the wrong-keyboard-layout guess (it misfires on ordinary words in a sentence)."""
        variants = [query]
        swapped = _swap_layout(query) if layout else None
        if swapped:
            variants.append(swapped)
        coded = _codes_to_latin(query)
        if coded != query:
            variants.append(coded)
        found: dict[tuple[str, str | None], int] = {}
        for text in variants:
            words = text.split()
            q = key(text)
            if not q:
                continue
            if brand is None:
                for b in self.brands:
                    s = self._brand_score(q, b)
                    if s:
                        found[(b, None)] = max(found.get((b, None), 0), s + 5)
            # "тойота камри" / "камри тойота": some words name the brand, the others the model
            splits = []
            for cut in range(1, len(words)):
                head, tail = key(" ".join(words[:cut])), key(" ".join(words[cut:]))
                for bq, mq, bonus in ((head, tail, 10), (tail, head, 5)):
                    if len(bq) < 3 and not any(bq in keys for keys in self.brands.values()):
                        continue  # "до" is not the start of "Dodge"
                    brands = {b: sc for b in self.brands if (sc := self._brand_score(bq, b)) >= 50}
                    if brands:
                        splits.append((brands, mq, bonus))
            for it in self.items:
                if brand is not None and it["brand"] != brand:
                    continue
                best = max(_score(q, mk) for mk in it["_model_keys"])
                for brands, mq, bonus in splits:
                    bs = brands.get(it["brand"])
                    if bs:
                        ms = max(_score(mq, mk) for mk in it["_model_keys"])
                        if ms:
                            best = max(best, min(100, (bs + ms) // 2 + bonus))
                if best:
                    k = (it["brand"], it["model"])
                    found[k] = max(found.get(k, 0), best + (3 if it.get("modifications") else 0))
        ranked = sorted(found.items(), key=lambda kv: (-kv[1], kv[0][0].casefold(), (kv[0][1] or "").casefold()))
        by_key = {(it["brand"], it["model"]): it for it in self.items}
        out = []
        for (b, m), s in ranked[:limit]:
            if m is None:
                out.append({"type": "brand", "brand": b, "label": b, "score": s,
                            "models": sum(1 for it in self.items if it["brand"] == b)})
            else:
                it = by_key[(b, m)]
                out.append({"type": "model", "brand": b, "model": m, "label": f"{b} {m}", "score": s,
                            "alias": it.get("alias"), "years": it.get("years"), "modifications": it.get("modifications", 0)})
        return out


    def find_in_text(self, text: str) -> dict[str, str] | None:
        """A brand or brand + model named inside a free-text request ("тойота камри до 20 тисяч").
        Only confident matches: a whole word or two that equal or start a name."""
        words = [w for w in re.findall(r"[\w'’ʼ-]+", text.lower()) if not re.search(r"\d{3,}", w)]
        best: tuple[int, dict[str, str]] | None = None
        for size in (2, 1):
            for i in range(len(words) - size + 1):
                part = words[i:i + size]
                if all(w.isdigit() for w in part):
                    continue
                # short words ("до", "тис", "з") name nothing in a sentence, unless they are exactly a brand
                # ("бмв", "кіа") or a model code with a digit ("х5", "ку7")
                exact_brand = any(key(w) in keys for w in part for keys in self.brands.values())
                if all(len(w) < 4 for w in part) and not exact_brand and not any(re.search(r"\d", w) for w in part):
                    continue
                chunk = " ".join(part)
                for hit in self.suggest(chunk, 1, layout=False):
                    if size == 1 and len(part[0]) < 4 and not (hit["type"] == "brand" and hit["score"] >= 100):
                        continue
                    need = 95 if size == 1 else 90
                    rank = (hit["type"] == "model", size, hit["score"])  # a model beats a bare brand
                    if hit["score"] >= need and (best is None or rank > best[0]):
                        found = {"brand": hit["brand"]}
                        if hit["type"] == "model":
                            found["model"] = hit["model"]
                        best = (rank, found)
        return best[1] if best else None

    def strong(self, query: str, limit: int = 12) -> list[dict[str, Any]]:
        """Suggestions close to the best one: drops weak look-alikes ("Capri" for "камри")."""
        hits = self.suggest(query, limit)
        return [h for h in hits if h["score"] >= hits[0]["score"] - 12] if hits else []
