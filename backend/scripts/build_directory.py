"""Builds app/seed/models.json from the hand-written directory (app/seed/directory/*.txt)
and checks every model name against Wikidata (CC0).

Usage, from backend/:  python scripts/build_directory.py
Needs access to query.wikidata.org; the answer is cached in scripts/.wikidata-cache.json.
Line format: Brand;Country;Model:from-to:body|...  (to empty = still in production;
body: s sedan, h hatch, w wagon, l liftback, c crossover, m minivan, v van, p pickup, k coupe, r cabrio).
"Name (Other name)" records another market name; "Name (США)" / "(Європа)" / "(Китай)" a regional version.
"""
import glob, json, os, re, sys, unicodedata, urllib.parse, urllib.request
HERE = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.join(HERE, "..", "app", "seed", "directory")
CARS = os.path.join(HERE, "..", "app", "seed", "cars.json")
OUT = os.path.join(HERE, "..", "app", "seed", "models.json")
WD = os.path.join(HERE, ".wikidata-cache.json")
QUERY = """SELECT ?i ?l ?bl WHERE { VALUES ?cls { wd:Q3231690 wd:Q59773381 } ?i wdt:P31 ?cls .
  ?i rdfs:label ?l FILTER(LANG(?l)="en")
  OPTIONAL { ?i wdt:P1716|wdt:P176 ?b . ?b rdfs:label ?bl FILTER(LANG(?bl)="en") } }"""

if not os.path.exists(WD):
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode({"query": QUERY})
    req = urllib.request.Request(url, headers={"Accept": "application/sparql-results+json",
                                               "User-Agent": "AutoWise-catalog-builder/1.0"})
    with urllib.request.urlopen(req, timeout=300) as r:
        open(WD, "wb").write(r.read())
BODY = {"s": "sedan", "h": "hatch", "w": "wagon", "l": "liftback", "c": "crossover", "m": "minivan", "v": "van", "p": "pickup", "k": "coupe", "r": "cabrio"}
REGION = {"Європа", "США", "Китай"}
WD_BRAND = {"Skoda": ["škoda"], "Citroen": ["citroën", "citroen"], "Seat": ["seat"], "Moskvich": ["moskvitch", "moskvich"],
            "SsangYong": ["ssangyong", "kgm"], "Land Rover": ["land rover", "range rover", ""], "Mini": ["mini"], "Lada": ["lada", "vaz"],
            "ZAZ": ["zaz"], "GAZ": ["gaz"], "UAZ": ["uaz"], "Daewoo": ["daewoo"], "Mercedes-Benz": ["mercedes-benz", "mercedes"],
            "DS": ["ds"], "Ram": ["ram", "dodge ram"]}

def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9+#]+", " ", s).strip()

rows = []
for f in sorted(glob.glob(os.path.join(DIR, "*.txt"))):
    for line in open(f, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#"): continue
        brand, country, models = line.split(";", 2)
        balias = ""
        if m := re.match(r"(.+?) \((.+)\)$", brand): brand, balias = m.group(1), m.group(2)
        for item in models.split("|"):
            name, yrs, body = item.rsplit(":", 2)
            a, b = yrs.split("-")
            alias, variant = "", ""
            if m := re.match(r"(.+?) \((.+)\)$", name):
                name, extra = m.group(1), m.group(2)
                if extra in REGION: variant = extra
                else: alias = extra
            rows.append(dict(brand=brand, brand_alias=balias, country=country, name=name, alias=alias, variant=variant,
                             year_from=int(a), year_to=int(b) if b else None, body=BODY[body]))

# merge repeated names (a model revived later, or regional versions) into one model with a note
models = {}
for r in rows:
    k = (r["brand"], r["name"])
    span = f"{r['year_from']}–{r['year_to'] or 'досі'}"
    part = f"{r['variant']}: {span}" if r["variant"] else span
    if k not in models:
        models[k] = {**r, "parts": [part], "bodies": [r["body"]]}
        continue
    m = models[k]
    if part in m["parts"]: continue
    m["parts"].append(part); m["bodies"].append(r["body"])
    m["year_from"] = min(m["year_from"], r["year_from"])
    m["year_to"] = None if m["year_to"] is None or r["year_to"] is None else max(m["year_to"], r["year_to"])
    m["alias"] = m["alias"] or r["alias"]

# only models produced at some point since 1990
models = {k: m for k, m in models.items() if m["year_to"] is None or m["year_to"] >= 1990}

# Wikidata index: normalized label -> (qid, uk label, brand label)
wd = json.load(open(WD))["results"]["bindings"]
index = {}
for b in wd:
    lab = norm(b["l"]["value"]); q = b["i"]["value"].rsplit("/", 1)[1]
    index.setdefault(lab, set()).add(q)
    index.setdefault(lab.replace(" ", ""), set()).add(q)  # "Mazda 2" = "Mazda2"
    if "bl" in b:  # label without the brand, under the item's own brand: "DS 3" for DS
        bl = norm(b["bl"]["value"])
        if not lab.startswith(bl + " "):  # label without the brand, e.g. "Model S" by Tesla
            index.setdefault(norm(bl + " " + lab), set()).add(q)
            index.setdefault(norm(bl + " " + lab).replace(" ", ""), set()).add(q)
        if lab.startswith(bl + " "):
            index.setdefault(norm(bl + " " + lab[len(bl) + 1:]).replace(" ", ""), set()).add(q)

def brand_keys(brand, alias):
    keys = WD_BRAND.get(brand, [brand.lower()])
    if alias: keys = keys + [alias.lower()]
    return [norm(k) for k in keys]

unmatched = []
for (brand, name), m in models.items():
    cands = [name] + ([m["alias"]] if m["alias"] else []) + [p.strip() for p in m["alias"].split("/") if p.strip()]
    found = None
    for bk in brand_keys(brand, m["brand_alias"]):
        for c in cands:
            key = norm(f"{bk} {c}") if bk else norm(c)
            if key not in index and key.replace(" ", "") in index:
                key = key.replace(" ", "")
            if key in index:
                found = sorted(index[key], key=lambda q: int(q[1:]))[0]; break
            # labels with a generation suffix, e.g. "Toyota Camry (XV70)"
            pref = [l for l in index if l.startswith(key + " ")]
            if pref:
                found = sorted(index[min(pref, key=len)], key=lambda q: int(q[1:]))[0]; break
        if found: break
    m["wikidata"] = found
    if not found: unmatched.append(f"{brand} {name}")

# every model already in the catalogue must exist in the directory under the same name
cars = json.load(open(CARS))
have = set(models)
for c in cars:
    k = (c["brand"], c["model"])
    if k not in have:
        models[k] = dict(brand=c["brand"], brand_alias="", country="", name=c["model"], alias="", variant="",
                         year_from=c["year_from"], year_to=c["year_to"], body=c["body"], parts=[], bodies=[c["body"]], wikidata=None)
        have.add(k); print("added from catalogue:", k)
    else:
        m = models[k]
        m["year_from"] = min(m["year_from"], c["year_from"] or 9999)

countries = {}
for m in models.values():
    if m["country"]: countries[m["brand"]] = m["country"]
out = {"source": "Довідник AutoWise: марки й моделі, що випускалися з 1990 року. Роки орієнтовні; назви звірені з Wikidata (CC0).",
       "brands": [{"name": b, "country": countries.get(b, ""), "alias": next((m["brand_alias"] for m in models.values() if m["brand"] == b and m["brand_alias"]), "")}
                  for b in sorted({k[0] for k in models}, key=str.casefold)],
       "models": [{"brand": m["brand"], "name": m["name"], "alias": m["alias"] or None, "year_from": m["year_from"], "year_to": m["year_to"],
                   "body": max(m["bodies"], key=m["bodies"].count),  # ties: the first period wins
                   "years_note": ", ".join(m["parts"]) if len(m["parts"]) > 1 else None, "wikidata": m["wikidata"]}
                  for m in sorted(models.values(), key=lambda m: (m["brand"].casefold(), m["name"].casefold()))]}
json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("brands", len(out["brands"]), "models", len(out["models"]), "matched", sum(1 for m in out["models"] if m["wikidata"]))
print("UNMATCHED", len(unmatched)); print("; ".join(unmatched))
