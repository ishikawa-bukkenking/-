import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def make_listings_csv(path: Path, seed: int = 1) -> Path:
    """ダミーの物件データ(実在の数値ではない)。"""
    rnd = random.Random(seed)
    rows = ["type,price_man,land_area_m2,building_area_m2,exclusive_area_m2,age_years,zone"]
    for _ in range(60):
        a = rnd.randint(80, 220)
        rows.append(f"土地,{round(a*rnd.uniform(2.5, 6))},{a},,,,{rnd.choice(['第一種低層住居専用地域','第一種住居地域','市街化調整区域'])}")
    for _ in range(80):
        rows.append(f"中古戸建て,{rnd.randint(800,3500)},{rnd.randint(120,300)},{rnd.randint(80,140)},,{rnd.randint(5,45)},")
    for _ in range(12):
        rows.append(f"中古マンション,{rnd.randint(500,3000)},,,{rnd.randint(45,95)},{rnd.randint(5,40)},")
    for _ in range(40):
        rows.append(f"新築戸建て,{rnd.randint(2200,4500)},{rnd.randint(100,200)},{rnd.randint(85,115)},,0,")
    path.write_text("\n".join(rows), encoding="utf-8")
    return path
