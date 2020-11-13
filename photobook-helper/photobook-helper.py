#!/usr/bin/env python3

# PhotoCollage: https://github.com/adrienverge/PhotoCollage.git
#     git remote add ojob https://github.com/ojob/PhotoCollage.git
#     git fetch ojob
#     git merge ojob/choose-export-quality

# photocollage/gtkgui.py
#    Around line 669, add
#      ("12.625in x 10.875in  landscape (300ppi)", (3788, 3262)),

# https://github.com/masneyb/PhotoCollage has these changes

# photocollage/run.sh
#
#     #!/usr/bin/env bash
#     PYTHONPATH=/home/masneyb/PhotoCollage /home/masneyb/PhotoCollage/bin/photocollage $@

# Download media.csv from photo site for event of interest

# Process file list
#     cat media.csv | csv-to-filelist.sh > files.txt

# ~/src/shotwell-site-generator/photobook-helper/photobook-helper.py --infile files.txt --photocollage-bin ~/PhotoCollage/run.sh

# convert page* -background black -units PixelsPerInch -density 300x300 book.pdf

# convert -background black -gravity center -fill white -font FreeSans-Bold -size 800x800 -pointsize 96 caption:'This is the title' -pointsize 48 caption:'This is the subtitle' -append caption.gif

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
