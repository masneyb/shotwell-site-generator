#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2020-2024 Brian Masney <masneyb@onstation.org>

find . -name media.csv | sed "s/\/media.csv//" | xargs -iblah echo "~/src/shotwell-site-generator/photobook-helper/csv-to-filelist.sh < blah/media.csv > blah/files.txt" | sh -vx
