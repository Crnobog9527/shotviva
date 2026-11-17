#!/usr/bin/env python3
"""Notify IndexNow of changes observed on indexable production pages."""
import hashlib
import json
import os
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from xml.etree import ElementTree

ORIGIN = 'https://shotviva.com'
KEY_PATH = Path(__file__).resolve().parents[2] / 'public/indexnow-key.txt'
STATE_PATH = Path(os.environ.get('INDEXNOW_STATE', '.indexnow-state/pages.json'))
NS = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
AGENT = 'Mozilla/5.0 (compatible; ShotvivaIndexMonitor/1.0; +https://shotviva.com/)'


def read_url(url, data=None):
    request = Request(url, data=data, headers={'User-Agent': AGENT, **({'Content-Type': 'application/json'} if data else {})})
    with urlopen(request, timeout=30) as response:
        if response.geturl() != url:
            raise ValueError(f'Unexpected redirect for {url}')
        if 'noindex' in response.headers.get('X-Robots-Tag', '').lower():
            raise ValueError(f'Noindex response for {url}')
        return response.status, response.read()


def production_url(url):
    parsed = urlparse(url)
    return parsed.scheme == 'https' and parsed.netloc == 'shotviva.com' and not parsed.query and not parsed.fragment


def sitemap_urls():
    _, data = read_url(ORIGIN + '/sitemap.xml')
    maps = [item.text for item in ElementTree.fromstring(data).findall('s:sitemap/s:loc', NS)]
    if not maps or any(not item or not production_url(item) for item in maps):
        raise ValueError('Invalid production sitemap index')
    urls = []
    for sitemap in maps:
        _, data = read_url(sitemap)
        urls.extend(item.text for item in ElementTree.fromstring(data).findall('s:url/s:loc', NS))
    if not urls or any(not item or not production_url(item) for item in urls):
        raise ValueError('Invalid production sitemap URLs')
    return sorted(set(urls))


class Content(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.hidden = 0
        self.parts = []
        self.noindex = False

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'svg', 'noscript'):
            self.hidden += 1
        if self.hidden:
            return
        attrs = dict(attrs)
        if tag == 'meta' and attrs.get('name', '').lower() in ('description', 'robots'):
            if attrs.get('name', '').lower() == 'robots' and 'noindex' in attrs.get('content', '').lower():
                self.noindex = True
            self.parts.append((tag, attrs.get('name'), attrs.get('content', '')))
        elif tag == 'link' and attrs.get('rel', '').lower() == 'canonical':
            self.parts.append((tag, 'canonical', attrs.get('href', '')))
        elif tag == 'img':
            self.parts.append((tag, attrs.get('src', ''), attrs.get('alt', '')))
        elif tag == 'a':
            self.parts.append((tag, attrs.get('href', '').split('?')[0].split('#')[0]))

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'svg', 'noscript') and self.hidden:
            self.hidden -= 1

    def handle_data(self, text):
        if not self.hidden and text.strip():
            self.parts.append(('text', ' '.join(text.split())))


def page_hash(html):
    content = Content()
    content.feed(html.decode('utf-8'))
    if content.noindex or not content.parts:
        raise ValueError('Page is noindex or has no visible content')
    return hashlib.sha256(json.dumps(content.parts, ensure_ascii=False).encode()).hexdigest()


def main():
    key = KEY_PATH.read_text().strip()
    _, hosted_key = read_url(ORIGIN + '/indexnow-key.txt')
    if hosted_key.decode().strip() != key:
        raise ValueError('Production IndexNow key does not match')
    previous = json.loads(STATE_PATH.read_text()) if STATE_PATH.exists() else {}
    current = {url: page_hash(read_url(url)[1]) for url in sitemap_urls()}
    changed = [url for url, digest in current.items() if previous.get(url) != digest]
    if changed:
        payload = json.dumps({'host': 'shotviva.com', 'key': key, 'keyLocation': ORIGIN + '/indexnow-key.txt', 'urlList': changed}).encode()
        status, _ = read_url('https://api.indexnow.org/indexnow', payload)
        if status not in (200, 202):
            raise ValueError(f'IndexNow returned {status}')
        print(f'IndexNow HTTP {status}; submitted {len(changed)} changed URL(s):')
        print('\n'.join(changed))
    else:
        print('No public page content changes detected')
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(json.dumps(current, sort_keys=True))


if __name__ == '__main__':
    main()
