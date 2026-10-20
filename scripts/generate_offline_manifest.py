#!/usr/bin/env python3
"""Generate data/offline-manifest.json for the Vita Plan offline sheet music cache.

The manifest is the single source of truth for incremental offline updates.
Each entry uses the Git blob SHA (content identifier) and the file size.

Default source: `git ls-tree -r -l HEAD` (exactly what a committed tree has).
For an uncommitted working tree, pass --working-tree.

Only these paths are included:
  index.html, assets/css/style.css, assets/js/script.js, assets/js/offline.js,
  data/songs.json, favicon.ico, img/**
Everything else (admin, docs, README, .github, scripts, sql, key, random, sw.js,
data/offline-manifest.json itself, ...) is excluded.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

SHELL_FILES = [
    'index.html',
    'assets/css/style.css',
    'assets/js/script.js',
    'assets/js/offline.js',
    'data/songs.json',
    'favicon.ico',
]
MANIFEST_NAME = 'data/offline-manifest.json'


def is_allowed(path: str) -> bool:
    if path in SHELL_FILES:
        return True
    return path.startswith('img/') and len(path) > len('img/')


def git_blob_sha(data: bytes) -> str:
    header = ('blob %d\0' % len(data)).encode('ascii')
    return hashlib.sha1(header + data).hexdigest()


def manifest_version(files: dict) -> str:
    """Stable version derived from the sorted path/hash/size content list."""
    chunks = []
    for path in sorted(files, key=lambda p: p.encode('utf-8')):
        entry = files[path]
        chunks.append('%s\t%s\t%d\n' % (path, entry['hash'], entry['size']))
    return hashlib.sha256(''.join(chunks).encode('utf-8')).hexdigest()[:16]


def collect_working_tree(root: Path) -> dict:
    files = {}
    candidates = []
    for name in SHELL_FILES:
        candidates.append(name)
    img_root = root / 'img'
    if img_root.is_dir():
        for path in img_root.rglob('*'):
            if path.is_file():
                candidates.append(path.relative_to(root).as_posix())
    for rel in candidates:
        full = root / rel
        if not full.is_file() or not is_allowed(rel):
            continue
        data = full.read_bytes()
        files[rel] = {'hash': git_blob_sha(data), 'size': len(data)}
    return files


def collect_git_tree(root: Path, tree: str) -> dict:
    cmd = ['git', '-c', 'core.quotepath=false', 'ls-tree', '-r', '-l', tree]
    try:
        out = subprocess.check_output(cmd, cwd=str(root), text=True)
    except subprocess.CalledProcessError as exc:
        raise SystemExit('git ls-tree failed (%s): %s' % (tree, exc))
    files = {}
    for line in out.splitlines():
        if '\t' not in line:
            continue
        meta, path = line.split('\t', 1)
        parts = meta.split()
        if len(parts) < 4:
            continue
        _mode, obj_type, sha, size = parts[0], parts[1], parts[2], parts[3]
        if obj_type != 'blob' or not is_allowed(path):
            continue
        files[path] = {'hash': sha.lower(), 'size': int(size)}
    return files


def build_manifest(root: Path, working_tree: bool, tree: str) -> dict:
    files = collect_working_tree(root) if working_tree else collect_git_tree(root, tree)
    missing = [name for name in SHELL_FILES if name not in files]
    if missing:
        raise SystemExit('missing required offline files: %s' % ', '.join(missing))
    ordered = {path: files[path] for path in sorted(files, key=lambda p: p.encode('utf-8'))}
    return {'version': manifest_version(ordered), 'files': ordered}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', default='.', help='repository root (default: .)')
    parser.add_argument('--tree', default=None,
                        help='force a git tree-ish (e.g. HEAD), even if the worktree is dirty')
    parser.add_argument('--working-tree', action='store_true',
                        help='hash files on disk instead of a committed git tree')
    parser.add_argument('--output', default=None,
                        help='output path (default: <root>/data/offline-manifest.json)')
    parser.add_argument('--check', action='store_true',
                        help='verify the existing manifest instead of writing it')
    args = parser.parse_args()

    root = Path(args.root).resolve()
    if not root.is_dir():
        raise SystemExit('root is not a directory: %s' % root)

    use_working_tree = args.working_tree
    if args.tree is not None:
        use_working_tree = False
    elif not use_working_tree:
        # CI runs on a clean checkout and therefore uses the committed HEAD tree.
        # A developer with local edits gets the working tree, so the documented
        # pre-commit command updates the manifest for the files being committed.
        try:
            dirty = subprocess.check_output(
                ['git', 'status', '--porcelain', '--', '.'],
                cwd=str(root), text=True).strip()
            use_working_tree = bool(dirty)
        except Exception:
            use_working_tree = True
        if use_working_tree:
            print('note: uncommitted changes detected; hashing the working tree. '
                  'Use --tree HEAD to force the committed tree.', file=sys.stderr)

    manifest = build_manifest(root, use_working_tree, args.tree or 'HEAD')
    output = Path(args.output) if args.output else root / MANIFEST_NAME
    text = json.dumps(manifest, ensure_ascii=False, indent=2) + '\n'

    if args.check:
        if not output.is_file():
            print('manifest missing: %s' % output, file=sys.stderr)
            return 1
        try:
            existing = json.loads(output.read_text(encoding='utf-8'))
        except Exception as exc:
            print('manifest is invalid JSON: %s (%s)' % (output, exc), file=sys.stderr)
            return 1
        # Compare content, not formatting. The admin publisher may emit escaped
        # Unicode while this script writes UTF-8; both are equivalent manifests.
        if existing != manifest:
            print('manifest is out of date: %s' % output, file=sys.stderr)
            return 1
        print('manifest OK: %s (%d files, version %s)'
              % (output, len(manifest['files']), manifest['version']))
        return 0

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(text, encoding='utf-8')
    print('wrote %s (%d files, version %s)'
          % (output, len(manifest['files']), manifest['version']))
    return 0


if __name__ == '__main__':
    sys.exit(main())
