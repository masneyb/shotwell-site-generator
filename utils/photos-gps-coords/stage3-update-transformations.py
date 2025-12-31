#!/usr/bin/env python3

import sys
import sqlite3

def copy_transformations(src_db_path, dst_db_path):
    # Read from first database
    src_conn = sqlite3.connect(src_db_path)
    try:
        src_cur = src_conn.cursor()
        src_cur.execute(
            "SELECT id, transformations FROM PhotoTable WHERE transformations != ''"
        )
        rows = src_cur.fetchall()  # list of (id, transformations)
    finally:
        src_conn.close()

    # Build a mapping from id -> transformations
    transformations_by_id = {row[0]: row[1] for row in rows}

    # Open second database and update
    dst_conn = sqlite3.connect(dst_db_path)
    try:
        dst_cur = dst_conn.cursor()

        # For each id, update only if current transformations is ''
        for photo_id, transformations in transformations_by_id.items():
            dst_cur.execute(
                """
                UPDATE PhotoTable
                SET transformations = ?
                WHERE id = ?
                  AND transformations = ''
                """,
                (transformations, photo_id),
            )

        dst_conn.commit()
    finally:
        dst_conn.close()


def main():
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} source.db destination.db")
        sys.exit(1)

    src_db = sys.argv[1]
    dst_db = sys.argv[2]

    copy_transformations(src_db, dst_db)


if __name__ == "__main__":
    main()
