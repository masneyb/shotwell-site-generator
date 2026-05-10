#!/usr/bin/env python3

import csv
import sys

def main():
    file_prefix = sys.argv[1] if len(sys.argv) > 1 else ""

    rows = list(csv.reader(sys.stdin))
    lines = []

    for row in rows:
        if len(row) < 4:
            continue

        line = row[3].replace('"', '')

        if line == "link":
            continue
        if line.endswith(".mp4") or line.endswith(".MP4") or line.endswith(".html"):
            continue

        lines.append(line)

    for line in reversed(lines):
        print(f"{file_prefix}/{line}")

if __name__ == "__main__":
    main()
