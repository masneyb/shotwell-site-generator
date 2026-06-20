#!/usr/bin/env python3
#
# Creates a fully self-contained copy of a generated static site that only
# contains the media listed in an exported media.csv file. This is handy for
# sharing a subset of your library with friends and family.
#
# Example:
#   ./export_subset_site.py --media-csv ~/Downloads/media.csv \
#       --site-directory /path/to/full/site --dest-directory /path/to/shared/site

import argparse
import csv
import datetime
import json
import logging
import os
import shutil
import sys
from media_writer_common import CommonWriter

# Top level support files that are copied verbatim from the source site (if present).
SUPPORT_FILES = ["index.html", "map.html", "map.css", "search.css", "search.js",
                 "search.min.js", "search.min.js.map", "manifest.json"]


def media_space(is_video):
    # Photos and videos live in separate Shotwell tables, each with its own id
    # counter, so a numeric id can appear once as a photo and once as a video.
    # The id space is needed alongside the id to identify a media item uniquely.
    return "video" if is_video else "photo"


def read_csv_media_ids(csv_path):
    # The "media_id" column in the exported CSV corresponds to the "id" field in
    # the JSON file. The "type" column tells the photo / video id spaces apart.
    media_ids = set()
    with open(csv_path, "r", encoding="UTF-8-sig", newline="") as fhandle:
        reader = csv.DictReader(fhandle)
        for row in reader:
            media_id = (row.get("media_id") or "").strip()
            if media_id:
                media_ids.add((media_id, media_space(row.get("type") == "video")))

    return media_ids


def select_media(all_media, media_ids):
    selected = []
    for media in all_media:
        is_video = str(media.get("media_id", "")).startswith("video")
        if (str(media.get("id")), media_space(is_video)) in media_ids:
            selected.append(media)

    return selected


def exposure_timestamp(media):
    value = media.get("exposure_time")
    if not value:
        return None
    return datetime.datetime.fromisoformat(value).timestamp()


def exposure_year(media):
    value = media.get("exposure_time")
    if not value:
        return None
    return str(datetime.datetime.fromisoformat(value).year)


class SubsetBuilder:
    def __init__(self, date_helper):
        self.date_helper = date_helper

    def compute_stats(self, media_list):
        stats = {"num_photos": 0, "num_videos": 0, "filesize": 0}
        min_ts = None
        max_ts = None
        for media in media_list:
            if str(media.get("media_id", "")).startswith("video"):
                stats["num_videos"] += 1
            else:
                stats["num_photos"] += 1

            stats["filesize"] += media.get("artifact_filesize", 0) or 0

            timestamp = exposure_timestamp(media)
            if timestamp is not None:
                min_ts = timestamp if min_ts is None else min(min_ts, timestamp)
                max_ts = timestamp if max_ts is None else max(max_ts, timestamp)

        if min_ts is not None:
            stats["date_range"] = self.date_helper._get_date_range(min_ts, max_ts)
            stats["min_date"] = datetime.datetime.fromtimestamp(min_ts).isoformat()
            stats["max_date"] = datetime.datetime.fromtimestamp(max_ts).isoformat()
        else:
            stats["date_range"] = None
            stats["min_date"] = None
            stats["max_date"] = None

        return stats

    def build_events(self, src_events, media_by_event):
        events = []
        for event in src_events:
            event_media = media_by_event.get(event["id"], [])
            if not event_media:
                continue

            item = {key: event[key] for key in ("title", "comment", "id", "date")
                    if key in event}
            item["thumbnail"] = event["thumbnail"]
            item["link"] = event["link"]
            item.update(self.compute_stats(event_media))

            year_blocks = self.build_year_blocks(event, event_media)
            if year_blocks:
                item["years"] = year_blocks

            events.append(item)

        return events

    def build_year_blocks(self, event, event_media):
        media_by_year = {}
        for media in event_media:
            year = exposure_year(media)
            media_by_year.setdefault(year, []).append(media)

        # Mirror the generator: only emit year blocks when the event spans more
        # than one year.
        if len(media_by_year) <= 1:
            return None

        original_blocks = {str(block["year"]): block for block in event.get("years", [])}

        blocks = []
        for year in sorted(media_by_year.keys()):
            block = {"year": year}
            original = original_blocks.get(str(year))
            if original and "thumbnail" in original:
                block["thumbnail"] = original["thumbnail"]
            block.update(self.compute_stats(media_by_year[year]))
            blocks.append(block)

        return blocks

    def build_tags(self, src_tags, selected_media):
        tag_by_id = {tag["id"]: tag for tag in src_tags}

        # A media item's "tags" only lists its leaf tags; the parent tags are
        # stripped when the full site is generated. Walk each leaf tag up its
        # parent chain so that ancestor tags reappear with counts that include
        # their descendants, preserving the nested tag hierarchy of the full site.
        media_by_tag = {}
        for media in selected_media:
            seen = set()
            for leaf_tag_id in media.get("tags", []):
                current = leaf_tag_id
                while current is not None and current in tag_by_id and current not in seen:
                    seen.add(current)
                    media_by_tag.setdefault(current, []).append(media)
                    current = tag_by_id[current].get("parent_tag_id")

        tags = []
        for tag in src_tags:
            if tag["id"] not in media_by_tag:
                continue

            item = {key: tag[key] for key in ("title", "full_title", "id") if key in tag}
            item["thumbnail"] = tag["thumbnail"]
            item["link"] = tag["link"]
            item.update(self.compute_stats(media_by_tag[tag["id"]]))
            # Every ancestor of a surviving tag also survives, so the original
            # parent reference is always valid.
            item["parent_tag_id"] = tag.get("parent_tag_id")
            tags.append(item)

        return tags

    def build_years(self, src_years, selected_media, events, media_by_event):
        media_by_year = {}
        for media in selected_media:
            year = exposure_year(media)
            media_by_year.setdefault(year, []).append(media)

        events_per_year = {}
        for event in events:
            years_in_event = {exposure_year(media)
                              for media in media_by_event.get(event["id"], [])}
            for year in years_in_event:
                events_per_year[year] = events_per_year.get(year, 0) + 1

        years = []
        for year in src_years:
            year_id = str(year["id"])
            if year_id not in media_by_year:
                continue

            item = {"id": year["id"], "title": year["title"], "link": year["link"],
                    "thumbnail": year["thumbnail"]}
            item["num_events"] = events_per_year.get(year_id, 0)
            item.update(self.compute_stats(media_by_year[year_id]))
            years.append(item)

        return years


def collect_referenced_files(output):
    files = set()

    def add(path):
        if path:
            files.add(path)

    for media in output.get("media", []):
        add(media.get("link"))
        add(media.get("metadata_text"))
        for size in ("small", "medium", "large", "reg"):
            add(media.get("thumbnail", {}).get(size))
        for variant_path in media.get("variants", {}).values():
            add(variant_path)
        for key in ("mp4", "small_gif", "medium_gif", "large_gif", "reg_gif"):
            add(media.get("motion_photo", {}).get(key))

    for collection in ("events", "tags", "years"):
        for entity in output.get(collection, []):
            for size in ("small", "medium", "large"):
                add(entity.get("thumbnail", {}).get(size))
            for block in entity.get("years", []):
                for size in ("small", "medium", "large"):
                    add(block.get("thumbnail", {}).get(size))

    return files


def copy_files(site_dir, dest_dir, files):
    copied = 0
    missing = []
    for rel_path in sorted(files):
        src_path = os.path.join(site_dir, rel_path)
        dst_path = os.path.join(dest_dir, rel_path)

        if not os.path.exists(src_path):
            missing.append(rel_path)
            continue

        os.makedirs(os.path.dirname(dst_path), exist_ok=True)
        # copy2 follows symlinks, so the "original" symlink farm is materialized
        # into real files in the destination.
        shutil.copy2(src_path, dst_path)
        copied += 1

    return copied, missing


def copy_support_files(site_dir, dest_dir):
    for name in SUPPORT_FILES:
        src_path = os.path.join(site_dir, name)
        if os.path.exists(src_path):
            shutil.copy2(src_path, os.path.join(dest_dir, name))
        else:
            logging.warning("Support file %s not found in source site", name)

    icons_src = os.path.join(site_dir, "icons")
    if os.path.isdir(icons_src):
        shutil.copytree(icons_src, os.path.join(dest_dir, "icons"), dirs_exist_ok=True)
    else:
        logging.warning("icons/ directory not found in source site")


def write_media_files(dest_dir, output):
    with open(os.path.join(dest_dir, "media.json"), "w", encoding="UTF-8") as outfile:
        outfile.write(json.dumps(output, indent="\t"))

    # The site reads the media from this embedded JavaScript file to work around
    # browser mitigations for CVE-2019-11730 so that it works for file:// URIs.
    with open(os.path.join(dest_dir, "media.js"), "w", encoding="UTF-8") as outfile:
        outfile.write("const _allMedia = ")
        outfile.write(json.dumps(output, indent=None))
        outfile.write(";\n")
        outfile.write("function getAllMediaViaJsFile() {\n")
        outfile.write("  return _allMedia;\n")
        outfile.write("}\n")


def build_output(source, selected_media, builder, title):
    media_by_event = {}
    for media in selected_media:
        if "event_id" in media:
            media_by_event.setdefault(media["event_id"], []).append(media)

    output = {"title": title}
    for key in ("version_label", "generated_at"):
        if key in source:
            output[key] = source[key]

    output["media"] = selected_media

    if "events" in source:
        output["events"] = builder.build_events(source["events"], media_by_event)
    if "tags" in source:
        output["tags"] = builder.build_tags(source["tags"], selected_media)
    if "years" in source:
        events = output.get("events", [])
        output["years"] = builder.build_years(source["years"], selected_media, events,
                                              media_by_event)

    # The shared subset never carries over the source site's extra header link.
    output["extra_header"] = ""

    return output


def process(options):
    media_ids = read_csv_media_ids(options.media_csv)
    logging.info("Read %d media id(s) from %s", len(media_ids), options.media_csv)

    with open(os.path.join(options.site_directory, "media.json"), "r",
              encoding="UTF-8") as fhandle:
        source = json.load(fhandle)

    all_media = source.get("media", [])
    selected_media = select_media(all_media, media_ids)
    logging.info("Matched %d of %d media item(s) in the site against the CSV file",
                 len(selected_media), len(all_media))

    matched_ids = {(str(media.get("id")),
                    media_space(str(media.get("media_id", "")).startswith("video")))
                   for media in selected_media}
    unmatched = media_ids - matched_ids
    if unmatched:
        logging.warning("%d CSV media id(s) did not match anything in the site, e.g. %s",
                        len(unmatched),
                        ", ".join("%s (%s)" % entry for entry in sorted(unmatched)[:5]))

    if not selected_media:
        logging.error("No media matched. Nothing to do.")
        return 1

    builder = SubsetBuilder(CommonWriter(None, None, None,
                                         options.years_prior_are_approximate, None, None))
    output = build_output(source, selected_media, builder, options.title)

    os.makedirs(options.dest_directory, exist_ok=True)

    logging.info("Copying media, thumbnails and assets")
    files = collect_referenced_files(output)
    copied, missing = copy_files(options.site_directory, options.dest_directory, files)
    logging.info("Copied %d asset file(s)", copied)
    if missing:
        logging.warning("%d referenced file(s) were missing in the source site, e.g. %s",
                        len(missing), ", ".join(missing[:5]))

    logging.info("Copying support files")
    copy_support_files(options.site_directory, options.dest_directory)

    logging.info("Writing media.json and media.js")
    write_media_files(options.dest_directory, output)

    logging.info("Finished. Self-contained site written to %s", options.dest_directory)
    return 0


if __name__ == "__main__":
    ARGPARSER = argparse.ArgumentParser(
        description="Export a self-contained subset of a generated site containing "
                    "only the media listed in an exported media.csv file.")
    ARGPARSER.add_argument("--media-csv", required=True,
                           help="Path to the exported media.csv file")
    ARGPARSER.add_argument("--site-directory", required=True,
                           help="Path to the base directory of the full generated site")
    ARGPARSER.add_argument("--dest-directory", required=True,
                           help="Destination directory for the new self-contained site")
    ARGPARSER.add_argument("--title", required=True,
                           help="Title shown at the top of the generated media.json")
    ARGPARSER.add_argument("--years-prior-are-approximate", default="2000")
    ARGPARSER.add_argument("--debug", action="store_true", default=False)
    ARGS = ARGPARSER.parse_args(sys.argv[1:])
    logging.basicConfig(format="%(asctime)s %(message)s",
                        level=logging.DEBUG if ARGS.debug else logging.INFO)
    sys.exit(process(ARGS))
