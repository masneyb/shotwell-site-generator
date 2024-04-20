#!/usr/bin/env bash

find . -name media.csv | sed "s/\/media.csv//" | xargs -iblah echo "~/src/shotwell-site-generator/photobook-helper/csv-to-filelist.sh < blah/media.csv > blah/files.txt" | sh -vx
