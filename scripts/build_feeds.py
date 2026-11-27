#!/usr/bin/env python3
import html, re, sys
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

FEEDS = {
    'MITRE ATT&CK blog':    'feeds/mitre-blog.xml',
    'ACSC advisories':      'feeds/acsc-advisories.xml',
    'ACSC news':            'feeds/acsc-news.xml',
    'ACSC alerts':          'feeds/acsc-alerts.xml',
    'CISA advisories':      'feeds/cisa.xml',
    'Krebs on Security':    'feeds/krebs.xml',
    'Schneier on Security': 'feeds/schneier.xml',
}
PER_FEED, PER_BLOCK = 3, 6
PAGE = Path('index.html')
EPOCH = datetime.min.replace(tzinfo=timezone.utc)

def local(tag):
    return tag.rsplit('}', 1)[-1]

def when(s):
    for parse in (parsedate_to_datetime, lambda x: datetime.fromisoformat(x.replace('Z', '+00:00'))):
        try:
            d = parse(s)
            return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
        except Exception:
            pass
    return EPOCH

def read(name, path):
    try:
        root = ET.parse(path).getroot()
    except Exception as e:
        print(f'skipping {name}: {e}', file=sys.stderr)
        return []
    out = []
    for n in root.iter():
        if local(n.tag) not in ('item', 'entry'):
            continue
        f = {'name': name, 'title': 'Untitled', 'link': '', 'date': EPOCH}
        seen = set()
        for c in n:
            k, v = local(c.tag), (c.text or '').strip()
            if k == 'link' and 'link' not in seen and c.get('rel', 'alternate') == 'alternate':
                f['link'], _ = c.get('href') or v, seen.add('link')
            elif k == 'title' and 'title' not in seen:
                f['title'], _ = v or 'Untitled', seen.add('title')
            elif k in ('pubDate', 'published', 'updated', 'date') and 'date' not in seen:
                f['date'], _ = when(v), seen.add('date')
        if f['link'].lower().startswith(('http://', 'https://')):
            out.append(f)
    return sorted(out, key=lambda i: i['date'], reverse=True)[:PER_FEED]

def render(chunk):
    li = ''.join(
        f'<li><a href="{html.escape(i["link"], quote=True)}" target="_blank" '
        f'rel="noopener noreferrer">{html.escape(i["name"])}: {html.escape(i["title"])}</a></li>'
        for i in chunk)
    return f'<ul>{li}</ul>'

items = sorted((i for n, p in FEEDS.items() for i in read(n, p)),
               key=lambda i: i['date'], reverse=True)
if not items:
    sys.exit('No items found, leaving the page unchanged')

page, n = PAGE.read_text(encoding='utf-8'), 0
while f'<!-- feed{n}:start -->' in page:
    block = render(items[n * PER_BLOCK:(n + 1) * PER_BLOCK])
    page = re.sub(rf'(<!-- feed{n}:start -->).*?(<!-- feed{n}:end -->)',
                  lambda m: m.group(1) + block + m.group(2), page, flags=re.S)
    n += 1
PAGE.write_text(page, encoding='utf-8')
