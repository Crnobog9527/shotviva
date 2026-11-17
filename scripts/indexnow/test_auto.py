import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import URLError

import auto


class AutoIndexNowTests(unittest.TestCase):
    def test_visible_changes_count_but_script_changes_do_not(self):
        original = b'<title>Title</title><script>build 1</script><p>Food</p><img src="a" alt="dish">'
        self.assertEqual(auto.page_hash(original), auto.page_hash(original.replace(b'build 1', b'build 2')))
        self.assertNotEqual(auto.page_hash(original), auto.page_hash(original.replace(b'Food', b'Drink')))
        self.assertNotEqual(auto.page_hash(original), auto.page_hash(original.replace(b'alt="dish"', b'alt="plate"')))

    def test_only_production_urls_are_accepted(self):
        self.assertTrue(auto.production_url('https://shotviva.com/pricing'))
        for url in ('https://shotviva.com.evil.test/', 'http://shotviva.com/', 'https://shotviva.com/?token=x'):
            self.assertFalse(auto.production_url(url))

    def test_noindex_pages_are_not_used_as_a_snapshot(self):
        with self.assertRaises(ValueError):
            auto.page_hash(b'<meta name="robots" content="noindex, follow"><p>Not public</p>')

    def test_transient_read_failure_retries_but_submission_does_not(self):
        with patch.object(auto, 'urlopen', side_effect=URLError('temporary')) as request, patch.object(auto.time, 'sleep'):
            with self.assertRaises(URLError):
                auto.read_url('https://shotviva.com/')
            self.assertEqual(request.call_count, 3)
            request.reset_mock()
            with self.assertRaises(URLError):
                auto.read_url('https://api.indexnow.org/indexnow', b'{}')
            self.assertEqual(request.call_count, 1)

    def test_snapshot_advances_only_after_successful_submission(self):
        page = 'https://shotviva.com/'
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory) / 'state.json'
            state.write_text(json.dumps({page: auto.page_hash(b'<p>old</p>')}))
            key = auto.KEY_PATH.read_text().strip()
            calls = []

            def request(url, data=None):
                calls.append((url, data))
                if url.endswith('/indexnow-key.txt'):
                    return 200, key.encode()
                if url == page:
                    return 200, b'<p>new</p>'
                raise OSError('IndexNow unavailable')

            with patch.object(auto, 'STATE_PATH', state), patch.object(auto, 'sitemap_urls', return_value=[page]), patch.object(auto, 'read_url', side_effect=request):
                with self.assertRaises(OSError):
                    auto.main()
            self.assertEqual(json.loads(state.read_text())[page], auto.page_hash(b'<p>old</p>'))

            def success(url, data=None):
                if url == 'https://api.indexnow.org/indexnow':
                    self.assertEqual(json.loads(data)['urlList'], [page])
                    return 202, b''
                return request(url, data)

            with patch.object(auto, 'STATE_PATH', state), patch.object(auto, 'sitemap_urls', return_value=[page]), patch.object(auto, 'read_url', side_effect=success):
                auto.main()
                auto.main()
            self.assertEqual(json.loads(state.read_text())[page], auto.page_hash(b'<p>new</p>'))


if __name__ == '__main__':
    unittest.main()
