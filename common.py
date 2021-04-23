#!/usr/bin/env python3

# Common functions that are used by the media fetcher and writer.
#
# Copyright (C) 2020 Brian Masney <masneyb@onstation.org>
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import hashlib

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
