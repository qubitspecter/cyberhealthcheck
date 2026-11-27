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
DATE_TAGS = ('pubDate', 'published', 'updated', 'date')
LINK_CLASS = 'link-body-emphasis link-underline-opacity-0 link-underline-opacity-100-hover fw-medium'


def local(tag):
    return tag.rsplit('}', 1)[-1]


def parse_date(s):
    for parse in (parsedate_to_datetime, lambda x: datetime.fromisoformat(x.replace('Z', '+00:00'))):
        try:
            d = parse(s)
            return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return EPOCH


def read(name, path):
    try:
        root = ET.parse(path).getroot()
    except (ET.ParseError, OSError) as e:
        print(f'skipping {name}: {e}', file=sys.stderr)
        return []

    items = []
    for node in root.iter():
        if local(node.tag) not in ('item', 'entry'):
            continue
        item = {'name': name, 'title': None, 'link': None, 'date': None}
        for c in node:  # first value found for each field wins
            key, text = local(c.tag), (c.text or '').strip()
            if key == 'link' and item['link'] is None and c.get('rel', 'alternate') == 'alternate':
                item['link'] = c.get('href') or text
            elif key == 'title' and item['title'] is None:
                item['title'] = text
            elif key in DATE_TAGS and item['date'] is None:
                item['date'] = parse_date(text)
        if (item['link'] or '').lower().startswith(('http://', 'https://')):
            item['title'] = item['title'] or 'Untitled'
            item['date'] = item['date'] or EPOCH
            items.append(item)
    return sorted(items, key=lambda i: i['date'], reverse=True)[:PER_FEED]


def row(i):
    d = i['date']
    meta = html.escape(i['name'])
    if d != EPOCH:
        meta += f' · <time datetime="{d:%Y-%m-%d}">{d.day} {d:%b}</time>'
    return (f'<li class="list-group-item px-0">'
            f'<small class="d-block text-body-secondary">{meta}</small>'
            f'<a class="{LINK_CLASS}" href="{html.escape(i["link"], quote=True)}" '
            f'target="_blank" rel="noopener noreferrer">{html.escape(i["title"])}</a></li>')


def render(chunk):
    return '<ul class="list-group list-group-flush">' + ''.join(map(row, chunk)) + '</ul>'


items = sorted((i for name, path in FEEDS.items() for i in read(name, path)),
               key=lambda i: i['date'], reverse=True)
if not items:
    sys.exit('No items found, leaving the page unchanged')


def fill(m):
    n = int(m['n'])
    return m['start'] + render(items[n * PER_BLOCK:(n + 1) * PER_BLOCK]) + m['end']


page = PAGE.read_text(encoding='utf-8')
page = re.sub(r'(?P<start><!-- feed(?P<n>\d+):start -->).*?(?P<end><!-- feed(?P=n):end -->)',
              fill, page, flags=re.S)
PAGE.write_text(page, encoding='utf-8')
