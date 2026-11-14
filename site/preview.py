#!/usr/bin/env python3
"""Give the built page SolidCraft 3000's own title and link-preview tags (they come from SolidCraft's page)."""
import re, sys
page = sys.argv[1]
URL = "https://raykholo.github.io/solidcraft3000/"
TITLE = "SolidCraft 3000: now 100% in the cloud"
DESC = "A parody of cloud CAD: endless maintenance, an update stuck at 99%, surprise sync conflicts. The real SolidCraft runs underneath, in your browser."
IMG = URL + "og.png"
ALT = "SolidCraft 3000, now 100% in the cloud: a parody running the real SolidCraft"
tags = {
    ("name", "description"): DESC,
    ("property", "og:site_name"): "SolidCraft 3000",
    ("property", "og:title"): TITLE,
    ("property", "og:description"): DESC,
    ("property", "og:url"): URL,
    ("property", "og:image"): IMG,
    ("property", "og:image:alt"): ALT,
    ("name", "twitter:title"): TITLE,
    ("name", "twitter:description"): DESC,
    ("name", "twitter:image"): IMG,
    ("name", "twitter:image:alt"): ALT,
}
s = open(page, encoding="utf-8").read()
s, n = re.subn(r"<title>[^<]*</title>", f"<title>SolidCraft 3000</title>", s, count=1)
for (attr, key), value in tags.items():
    pat = re.compile(r'<meta\s+%s="%s"\s+content="[^"]*"\s*/?>' % (attr, re.escape(key)))
    tag = f'<meta {attr}="{key}" content="{value}">'
    s, n = pat.subn(tag, s, count=1)
    if not n:
        s = s.replace("</head>", f"  {tag}\n</head>", 1)
s = re.sub(r'<link\s+rel="canonical"\s+href="[^"]*"\s*/?>', f'<link rel="canonical" href="{URL}">', s)
open(page, "w", encoding="utf-8").write(s)
