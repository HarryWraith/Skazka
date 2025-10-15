#!/usr/bin/env python3
import argparse, os, sys
from collections import Counter
from html.parser import HTMLParser

class ClassCounter(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.counter = Counter()

    def _collect(self, attrs):
        for (k, v) in attrs:
            if k.lower() == "class" and isinstance(v, str):
                # Split on any whitespace; ignore empty fragments
                for cls in v.split():
                    self.counter[cls] += 1

    def handle_starttag(self, tag, attrs):
        self._collect(attrs)

    def handle_startendtag(self, tag, attrs):
        self._collect(attrs)

def iter_html_files(root, exts=(".html", ".htm", ".xhtml")):
    for dirpath, _, filenames in os.walk(root):
        for name in filenames:
            if name.lower().endswith(exts):
                yield os.path.join(dirpath, name)

def main():
    p = argparse.ArgumentParser(description="List CSS classes used in HTML files with counts.")
    p.add_argument("path", nargs="?", default=".", help="Folder to scan (default: current directory)")
    p.add_argument("--min", type=int, default=1, help="Only show classes used at least this many times")
    p.add_argument("--csv", metavar="OUT.csv", help="Also write results to a CSV file")
    p.add_argument("--top", type=int, default=0, help="Show only the top N classes")
    args = p.parse_args()

    parser = ClassCounter()
    files_scanned = 0

    for fp in iter_html_files(args.path):
        try:
            with open(fp, "r", encoding="utf-8", errors="ignore") as f:
                parser.feed(f.read())
            files_scanned += 1
        except Exception as e:
            print(f"Warning: could not read {fp}: {e}", file=sys.stderr)

    # Filter, sort
    items = [(cls, cnt) for cls, cnt in parser.counter.items() if cnt >= args.min]
    items.sort(key=lambda x: (-x[1], x[0]))

    if args.top and args.top > 0:
        items = items[:args.top]

    # Pretty print
    width = max((len(cls) for cls, _ in items), default=0)
    print(f"Scanned {files_scanned} file(s). Found {len(items)} class name(s).")
    for cls, cnt in items:
        print(f"{cls.ljust(width)}  {cnt}")

    # Optional CSV
    if args.csv:
        import csv
        with open(args.csv, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["class", "count"])
            w.writerows(items)
        print(f"Wrote CSV: {args.csv}")

if __name__ == "__main__":
    main()
