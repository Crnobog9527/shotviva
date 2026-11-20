#!/usr/bin/env python3
"""Notify IndexNow of changes observed on indexable production pages."""
import hashlib
import json
import os
import time
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from xml.etree import ElementTree

ORIGIN = 'https://shotviva.com'
KEY_PATH = Path(__file__).resolve().parents[2] / 'public/indexnow-key.txt'
STATE_PATH = Path(os.environ.get('INDEXNOW_STATE', '.indexnow-state/pages.json'))
NS = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
AGENT = 'Mozilla/5.0 (compatible; ShotvivaIndexBot/1.0; +https://shotviva.com/)'


def read_url(url, data=None):
    request = Request(url, data=data, headers={'User-Agent': AGENT, **({'Content-Type': 'application/json'} if data else {})})
    for attempt in range(3):
        try:
            with urlopen(request, timeout=30) as response:
                if response.geturl() != url:
                    raise ValueError(f'Unexpected redirect for {url}')
                if 'noindex' in response.headers.get('X-Robots-Tag', '').lower():
                    raise ValueError(f'Noindex response for {url}')
                return response.status, response.read()
        except (HTTPError, URLError, TimeoutError, ConnectionError) as error:
            transient = not isinstance(error, HTTPError) or error.code in (429, 500, 502, 503, 504)
            if data is not None or not transient or attempt == 2:
                raise
            time.sleep(attempt + 1)
    raise RuntimeError('Unreachable')


def production_url(url):
    parsed = urlparse(url)
    return parsed.scheme == 'https' and parsed.netloc == 'shotviva.com' and not parsed.query and not parsed.fragment


def sitemap_urls():
    _, data = read_url(ORIGIN + '/sitemap.xml')
    maps = [item.text for item in ElementTree.fromstring(data).findall('s:sitemap/s:loc', NS)]
    if not maps or any(not item or not production_url(item) for item in maps):
        raise ValueError('Invalid production sitemap index')
    urls = {}
    for sitemap in maps:
        _, data = read_url(sitemap)
        for entry in ElementTree.fromstring(data).findall('s:url', NS):
            url = entry.findtext('s:loc', namespaces=NS)
            if not url or not production_url(url) or url in urls:
                raise ValueError('Invalid or duplicate production sitemap URL')
            urls[url] = entry.findtext('s:lastmod', default='', namespaces=NS)
    if not urls:
        raise ValueError('Invalid production sitemap URLs')
    return dict(sorted(urls.items()))


class Content(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.hidden = 0
        self.parts = []
        self.noindex = False
        self.semantic_tags = []
        self.generator_depth = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if self.generator_depth or 'mk-generator' in (attrs.get('class') or '').split():
            if tag not in ('area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'):
                self.generator_depth += 1
            return
        if tag in ('script', 'style', 'svg', 'noscript'):
            self.hidden += 1
        if self.hidden:
            return
        if tag in ('title', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p'):
            self.semantic_tags.append(tag)
        if tag == 'meta' and (attrs.get('name') or '').lower() in ('description', 'robots'):
            if attrs.get('name', '').lower() == 'robots' and 'noindex' in (attrs.get('content') or '').lower():
                self.noindex = True
            self.parts.append((tag, attrs.get('name'), attrs.get('content') or ''))
        elif tag == 'link' and (attrs.get('rel') or '').lower() == 'canonical':
            self.parts.append((tag, 'canonical', attrs.get('href') or ''))
        elif tag == 'img':
            self.parts.append((tag, attrs.get('src') or '', attrs.get('alt') or ''))
        elif tag == 'a':
            self.parts.append((tag, (attrs.get('href') or '').split('?')[0].split('#')[0]))

    def handle_endtag(self, tag):
        if self.generator_depth:
            self.generator_depth -= 1
            return
        if tag in ('script', 'style', 'svg', 'noscript') and self.hidden:
            self.hidden -= 1
        if not self.hidden and self.semantic_tags and tag == self.semantic_tags[-1]:
            self.semantic_tags.pop()

    def handle_startendtag(self, tag, attrs):
        if self.generator_depth:
            return
        super().handle_startendtag(tag, attrs)

    def handle_data(self, text):
        if not self.hidden and not self.generator_depth and text.strip():
            self.parts.append(('text', self.semantic_tags[-1] if self.semantic_tags else '', ' '.join(text.split())))


def page_hash(html, lastmod=''):
    content = Content()
    content.feed(html.decode('utf-8'))
    if content.noindex or not content.parts:
        raise ValueError('Page is noindex or has no visible content')
    # Template cards can shuffle between requests; preserve their contents, not their order.
    return hashlib.sha256(json.dumps([lastmod, sorted(content.parts)], ensure_ascii=False).encode()).hexdigest()


def main():
    key = KEY_PATH.read_text().strip()
    _, hosted_key = read_url(ORIGIN + '/indexnow-key.txt')
    if hosted_key.decode().strip() != key:
        raise ValueError('Production IndexNow key does not match')
    previous = json.loads(STATE_PATH.read_text()) if STATE_PATH.exists() else {}
    current = {url: page_hash(read_url(url)[1], lastmod) for url, lastmod in sitemap_urls().items()}
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
