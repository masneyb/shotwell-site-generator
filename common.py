#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0
# Copyright (C) 2020-2022 Brian Masney <masneyb@onstation.org>
#
# Common functions that are used by the media fetcher and writer.

import hashlib
import logging
import os

def add_date_to_stats(stats, date):
    if date is None:
        return

    if stats["min_date"] is None:
        stats["min_date"] = date
    else:
        stats["min_date"] = min(stats["min_date"], date)

    if stats["max_date"] is None:
        stats["max_date"] = date
    else:
        stats["max_date"] = max(stats["max_date"], date)

def cleanup_event_title(event):
    return event["title"] if event["title"] else "Unnamed %s" % (event["id"])

def get_dir_hash(basename):
    return hashlib.sha1(basename.encode('UTF-8')).hexdigest()[0:2]

def remove_stale_artifacts(path, generated_artifacts, do_remove):
    for root, _, filenames in os.walk(path):
        for filename in filenames:
            path = os.path.join(root, filename)
            if path in generated_artifacts:
                continue

            if do_remove:
                logging.info("Removing stale file %s", path)
                os.unlink(path)
            else:
                logging.warning("File %s is no longer used.", path)
