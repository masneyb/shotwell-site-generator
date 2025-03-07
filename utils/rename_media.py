#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2024 Brian Masney <masneyb@onstation.org>
#
# Rearranges media on the filesystem to match the way it's organized in Shotwell.

import argparse
import logging
import os
import pathlib
import re
import sqlite3
import subprocess
import sys

def fetch_events_from_media_table(conn, table_name, events):
    qry = "SELECT EventTable.id, EventTable.name, EventTable.comment, " + \
          f"strftime('%Y', DATE(MIN({table_name}.exposure_time), 'unixepoch', 'localtime')) AS min_date, " + \
          f"strftime('%Y', DATE(MAX({table_name}.exposure_time), 'unixepoch', 'localtime')) AS max_date  " + \
          f"FROM {table_name}, EventTable " + \
          f"WHERE EventTable.id={table_name}.event_id " + \
          "GROUP BY EventTable.id, EventTable.name, EventTable.comment"
    for row in conn.cursor().execute(qry):
        if row['id'] in events:
            events[row['id']]['min_date'] = min(events[row['id']]['min_date'], row['min_date'])
            events[row['id']]['max_date'] = max(events[row['id']]['max_date'], row['max_date'])
        else:
            new_row = {}
            new_row['id'] = row['id']
            new_row['name'] = row['name']
            new_row['comment'] = row['comment']
            new_row['min_date'] = row['min_date']
            new_row['max_date'] = row['max_date']
            events[row['id']] = new_row

def fetch_all_events(conn):
    events = {}
    fetch_events_from_media_table(conn, "PhotoTable", events)
    fetch_events_from_media_table(conn, "VideoTable", events)

    for (_, row) in events.items():
        if row['min_date'] == row['max_date']:
            year_str = row['min_date']
        else:
            year_str = row['min_date'] + "-" + row['max_date']

        name = row['name'].replace(' ', '_')
        name = re.sub(r'[^\w\d_]+', '', name).replace('__', '_')
        name = "Untitled" if not name else name
        row['path'] = f"{year_str}/{name}"

    return events

def process_media_table(options, conn, table_name, events):
    seen_paths = set([])
    if table_name == 'BackingPhotoTable':
        qry = "select BackingPhotoTable.id, BackingPhotoTable.filepath as filename, " + \
              "PhotoTable.event_id " + \
              "from BackingPhotoTable, PhotoTable " + \
              "where BackingPhotoTable.id=PhotoTable.develop_embedded_id"
    else:
        qry = f"select id, filename, event_id from {table_name}"

    for row in conn.cursor().execute(qry):
        if row['event_id'] == -1:
            logging.error("You have some media in the trash. Please clean the trash first.")
            sys.exit(1)

        event_path = events[row['event_id']]['path']
        new_path = os.path.join(options.input_media_path, event_path,
                                os.path.basename(row['filename']))

        if new_path in seen_paths:
            logging.error("Path %s has already been seen. Cowardly refusing to overwrite image",
                          new_path)
            sys.exit(1)

        seen_paths.add(new_path)
        if row['filename'] == new_path:
            continue

        logging.info("Rename %s to %s", row['filename'], new_path)

        if not options.write:
            continue

        write_cursor = conn.cursor()
        write_cursor.execute(f"update {table_name} set filename=? where id=?",
                             (new_path, row['id']))
        conn.commit()
        write_cursor.close()

        basedir = os.path.dirname(new_path)
        if not os.path.isdir(basedir):
            os.makedirs(basedir)
        subprocess.run(['mv', row['filename'], new_path], check=True)

def write_event_metadata(options, events):
    for row in events.values():
        if not row['comment']:
            continue

        pathlib.Path(os.path.join(options.input_media_path, row['path'], 'comment.txt')) \
            .write_text(row['comment'], encoding='UTF-8')

def do_fetch_media(options):
    conn = sqlite3.connect(options.input_database)
    conn.row_factory = sqlite3.Row
    events = fetch_all_events(conn)
    process_media_table(options, conn, "BackingPhotoTable", events)
    process_media_table(options, conn, "PhotoTable", events)
    process_media_table(options, conn, "VideoTable", events)
    write_event_metadata(options, events)

if __name__ == "__main__":
    ARGPARSER = argparse.ArgumentParser()
    ARGPARSER.add_argument("--input-database", required=True)
    ARGPARSER.add_argument("--input-media-path", required=True)
    ARGPARSER.add_argument("--write", action="store_true", default=False)
    ARGPARSER.add_argument("--debug", action="store_true", default=False)
    ARGS = ARGPARSER.parse_args(sys.argv[1:])
    logging.basicConfig(format="%(asctime)s %(message)s",
                        level=logging.DEBUG if ARGS.debug else logging.INFO)
    do_fetch_media(ARGS)
