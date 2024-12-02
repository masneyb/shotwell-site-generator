#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2020-2024 Brian Masney <masneyb@onstation.org>

# Passes a chunk of photos to PhotoCollage to allow creating a photo book.
# See README.md for more details.

import subprocess
import sys
import argparse
import logging

def process_lines(lines, num_photos, photocollage_bin):
    last_batches = []
    while lines:
        subparts = lines[0:num_photos]
        cmd = [photocollage_bin, *subparts]
        logging.info("Opening photocollage with %d photos; %d remaining; running %s",
                     num_photos, len(lines) - num_photos, cmd)
        subprocess.run(cmd, check=False)

        while True:
            action = input("Enter new number of photos for batch (%s / %s);\n" %
                           (num_photos, len(lines) - num_photos) + \
                           "    (c)ontinue to next batch, (l)ast batch, or (q)uit: ")
            if action == "c":
                last_batches.append(lines)
                lines = lines[num_photos:]
                break

            if action == "q":
                sys.exit(0)

            if action == "l":
                if last_batches:
                    lines = last_batches.pop()
                else:
                    logging.warning("Nothing to pop")
                break

            if not action.isdigit():
                logging.error("Invalid input")
                continue

            num_photos = int(action)
            break

def process_files(filename, num_photos, photocollage_bin):
    lines = []
    with open(filename) as infile:
        for line in infile.readlines():
            lines.append(line.rstrip())

    process_lines(lines, num_photos, photocollage_bin)

if __name__ == '__main__':
    logging.basicConfig(format='%(asctime)s %(message)s', level=logging.INFO)
    ARGPARSER = argparse.ArgumentParser()
    ARGPARSER.add_argument('--infile', required=True)
    ARGPARSER.add_argument('--batch-size', type=int, default=10)
    ARGPARSER.add_argument('--photocollage-bin', default="photocollage")
    ARGS = ARGPARSER.parse_args(sys.argv[1:])
    process_files(ARGS.infile, ARGS.batch_size, ARGS.photocollage_bin)
