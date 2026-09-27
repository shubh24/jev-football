"""Restore the licensed audio files used by this local game."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

root = Path(__file__).resolve().parents[1] / 'src/match/sounds'
manifest = json.loads((root / 'manifest.json').read_text())


def download(item):
    path = root / item['file']
    if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() == item['sha256']:
        return f"Ready: {item['title']}"
    with urlopen(item['url'], timeout=30) as response:
        data = response.read()
    if hashlib.sha256(data).hexdigest() != item['sha256']:
        raise ValueError(f"Source file changed: {item['title']}")
    path.write_bytes(data)
    return f"Downloaded: {item['title']}"


if __name__ == '__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for result in pool.map(download, manifest['files']):
            print(result)
