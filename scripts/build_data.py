"""Builds data/bars.json from verified Google Places results (places.json) plus hand-curated deals (curated.json).
Run: python3 scripts/build_data.py scripts/places.json"""
import json, re, sys, math, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
places = json.load(open(sys.argv[1]))
cur = json.load(open(os.path.join(ROOT, "scripts", "curated.json")))

AREAS = {
 "Colaba": [18.915, 72.828], "Cuffe Parade": [18.912, 72.821], "Fort": [18.934, 72.834], "Churchgate": [18.935, 72.826],
 "Marine Lines": [18.945, 72.824], "Girgaon": [18.955, 72.815], "Kemps Corner": [18.962, 72.808], "Byculla": [18.979, 72.833],
 "Worli": [19.010, 72.818], "Lower Parel": [18.998, 72.828], "Dadar": [19.020, 72.842], "Sion": [19.040, 72.865],
 "Bandra West": [19.060, 72.833], "BKC": [19.064, 72.866], "Khar": [19.071, 72.836], "Santacruz": [19.081, 72.840],
 "Vile Parle": [19.100, 72.845], "Juhu": [19.100, 72.827], "Andheri West": [19.134, 72.832], "Versova": [19.135, 72.815],
 "Andheri East": [19.108, 72.880], "Powai": [19.118, 72.906], "Chembur": [19.050, 72.900], "Ghatkopar": [19.086, 72.909],
 "Goregaon": [19.165, 72.849], "Malad": [19.187, 72.838], "Kandivali": [19.205, 72.860], "Borivali": [19.230, 72.857],
 "Mulund": [19.172, 72.956], "Thane": [19.218, 72.978], "Vashi": [19.075, 72.999], "Sanpada": [19.063, 73.010],
 "CBD Belapur": [19.017, 73.039], "Kharghar": [19.047, 73.070]
}
KEYS = [  # address keyword → area, checked in order
 ("Cuffe Parade","Cuffe Parade"),("Colaba","Colaba"),("Apollo Bandar","Colaba"),("Kala Ghoda","Fort"),("Fort,","Fort"),
 ("Churchgate","Churchgate"),("Marine Lines","Marine Lines"),("Marine Line","Marine Lines"),("Dhobi Talao","Marine Lines"),
 ("Girgaon","Girgaon"),("Kemps Corner","Kemps Corner"),("Byculla","Byculla"),("Worli","Worli"),
 ("Lower Parel","Lower Parel"),("Kamala Mills","Lower Parel"),("Kamla Mills","Lower Parel"),("Dadar","Dadar"),("Sion","Sion"),
 ("Bandra Kurla","BKC"),("BKC","BKC"),("Bandra East","BKC"),("Khar","Khar"),("Bandra","Bandra West"),("Santacruz","Santacruz"),
 ("Vile Parle","Vile Parle"),("Juhu","Juhu"),("Versova","Versova"),("Lokhandwala","Andheri West"),("Oshiwara","Andheri West"),
 ("Andheri West","Andheri West"),("Andheri (W)","Andheri West"),("Saki","Andheri East"),("Marol","Andheri East"),
 ("Andheri East","Andheri East"),("Andheri - Kurla","Andheri East"),("Powai","Powai"),("Hiranandani Gardens","Powai"),
 ("Chembur","Chembur"),("Ghatkopar","Ghatkopar"),("Goregaon","Goregaon"),("Malad","Malad"),("Kandivali","Kandivali"),
 ("Borivali","Borivali"),("Mulund","Mulund"),("Thane","Thane"),("Vashi","Vashi"),("Sanpada","Sanpada"),("Palm Beach","Sanpada"),
 ("Belapur","CBD Belapur"),("Kharghar","Kharghar"),("Andheri","Andheri West")]
BRANDS = [(r"SOCIAL\b","SOCIAL"),(r"Irish House","The Irish House"),(r"^145\b","145"),(r"Bayroute","Bayroute"),
 (r"TAP Resto","TAP Resto Bar"),(r"BAR STOCK EXCHANGE","The Bar Stock Exchange"),(r"Mitron","Mitron"),(r"Rude Lounge","Rude Lounge"),
 (r"Road House Bluez","Road House Bluez"),(r"Hops Kitchen","Hops Kitchen & Bar"),(r"Woodside Inn","Woodside Inn"),
 (r"(?i)^therapy","Therapy"),(r"Lord of the Drinks","Lord of the Drinks"),(r"Quarter Pillar","Quarter Pillar"),
 (r"Shloka","Shloka Dining Bar"),(r"(?i)pop ?tate","Pop Tate's"),(r"Doolally Taproom","Doolally Taproom"),
 (r"British Brewing","British Brewing Company"),(r"(?i)bora bora","Bora Bora"),(r"Harry's","Harry's Bar + Cafe"),
 (r"Hoppipola","Hoppipola"),(r"Bira 91","Bira 91 Taproom"),(r"Independence Brewing","Independence Brewing Company"),
 (r"(?i)kalaghoda dive","Kalaghoda Dive"),(r"^Reunion","Reunion"),(r"Jughead","Jughead's"),(r"Lion Heart","Lion Heart Lounge"),
 (r"Goose and Gridiron","The Goose & Gridiron"),(r"Thirsty City","Thirsty City 127"),(r"Effingut","Effingut")]
SKIP = re.compile(r"T1 Arrival|Harry.s Bar \+ Cafe, Powai|Shalimar Hotel|^THE$|Indiabulls|White Owl Ventures|Blue Tokai|I CAFE|Flamiingo", re.I)

def km(a,b):
    r=math.pi/180; dl=(b[0]-a[0])*r; dg=(b[1]-a[1])*r
    x=math.sin(dl/2)**2+math.cos(a[0]*r)*math.cos(b[0]*r)*math.sin(dg/2)**2
    return 12742*math.asin(math.sqrt(x))
def area_of(addr, ll):
    addr=re.sub(r"[A-Za-z]+ ?[-–] ?[A-Za-z]+ (Link )?R(oa)?d","",addr)
    for k,a in KEYS:
        if k.lower() in addr.lower(): return a
    return min(AREAS, key=lambda a: km(AREAS[a], ll))
DAYIDX={"Sunday":0,"Monday":1,"Tuesday":2,"Wednesday":3,"Thursday":4,"Friday":5,"Saturday":6}
def t24(s, ap_hint=None):
    s=s.strip(); m=re.match(r"(\d{1,2})(?::(\d\d))?\s*(AM|PM)?",s,re.I)
    h=int(m.group(1)); mm=int(m.group(2) or 0); ap=(m.group(3) or ap_hint or "").upper()
    if ap=="PM" and h!=12: h+=12
    if ap=="AM" and h==12: h=0
    return f"{h:02d}:{mm:02d}", ap
def parse_hours(lines):
    out={}
    for ln in lines:
        ln=ln.replace(" "," ").replace(" "," ")
        day,_,rest=ln.partition(":"); d=DAYIDX.get(day.strip())
        if d is None: continue
        rest=rest.strip()
        if rest.lower().startswith("closed"): out[d]=[]; continue
        if "24 hours" in rest.lower(): out[d]=[["06:00","06:00"]]; continue
        rngs=[]
        for part in rest.split(","):
            a,_,b=part.partition("–")
            if not b: continue
            bb,ap=t24(b); aa,_=t24(a, None if re.search(r"AM|PM",a,re.I) else ap)
            rngs.append([aa,bb])
        out[d]=rngs
    return out
def brand_of(name):
    for rx,b in BRANDS:
        if re.search(rx,name): return b
    return re.sub(r"\s+[-|–]\s+.*$|\s*\(.*$|,.*$","",name).strip() or name
def slug(s): return re.sub(r"[^a-z0-9]+","-",s.lower()).strip("-")
JUNK=re.compile(r"^(shop|unit|no\b|no\.|plot|level|ground|first|second|third|fourth|fifth|\d|[a-z]-?\d|cluster|g\d|c wing|b wing|a wing|wing|located|floor|mumbai|maharashtra|india|w$|e$)",re.I)
def label(name, brand, addr):
    rest=re.sub(re.escape(brand.split()[0]),"",name,flags=re.I)
    rest=re.sub(r"(?i)\b(the|social|taproom|bar|cafe|kitchen|&|\+|-|,|\|)\b|[-|,]"," ",rest).strip()
    parts=[x.strip() for x in addr.split(",") if x.strip() and not JUNK.match(x.strip()) and not re.search(r"\d{6}",x)]
    fix=lambda x: " ".join(w.title() if w.isupper() and len(w)>3 else w for w in x.split())
    lab=", ".join(fix(p) for p in parts[:2])
    return lab[:56]

bars={}
def add_outlet(brand, o):
    b=bars.setdefault(brand,{"id":slug(brand),"name":brand,"deals":[],"outlets":[]})
    if any(km(x["ll"],o["ll"])<0.05 for x in b["outlets"]): return
    b["outlets"].append(o)

for pid,p in places.items():
    if SKIP.search(p["name"]+" "+p["addr"]): continue
    brand=brand_of(p["name"])
    hours=parse_hours(p["hours"])
    curated_brand = brand in cur["deals"] or brand in cur.get("keep_unconfirmed",[])
    if not curated_brand and (not hours or not p.get("isbar", True)): continue
    add_outlet(brand, {"area":area_of(p["addr"],p["ll"]),"label":label(p["name"],brand,p["addr"]),"ll":p["ll"],
        "status":"open" if hours else "unconfirmed","hours":hours, "pid":pid})
for o in cur.get("extra_outlets",[]):
    add_outlet(o.pop("brand"), o)
for brand,deals in cur["deals"].items():
    if brand in bars: bars[brand]["deals"]=deals
    else: print("WARN curated brand not found:",brand)
for b in bars.values():
    b["outlets"].sort(key=lambda o:o["area"])
    for o in b["outlets"]: o.pop("pid",None)
out={"updated":cur["updated"],"areas":AREAS,"bars":sorted(bars.values(),key=lambda b:b["name"].lower())}
json.dump(out,open(os.path.join(ROOT,"data","bars.json"),"w"),ensure_ascii=False,separators=(",",":"))
n_out=sum(len(b["outlets"]) for b in bars.values())
print(f"{len(bars)} bars, {n_out} outlets, {sum(1 for b in bars.values() if b['deals'])} with deals")
for b in bars.values():
    for d in b["deals"]:
        for a in d.get("only",[]):
            if not any(o["area"]==a for o in b["outlets"]): print("WARN only-area missing",b["name"],a,[o["area"] for o in b["outlets"]])
