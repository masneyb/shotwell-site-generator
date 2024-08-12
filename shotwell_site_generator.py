#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0
# Copyright (C) 2020-2023 Brian Masney <masneyb@onstation.org>
#
# Exports a static HTML view of your shotwell photo/video library.

import argparse
import json
import logging
import os
import shutil
import sqlite3
import subprocess
import sys
import media_fetcher
import media_thumbnailer
import media_writer_html
import media_writer_json

def _app_icon_by_size(size):
    return {"src": f"icons/app-icon-{size}.png", "sizes": size, "type": "image/png"}

def write_manifest_json(options):
    vals = {}
    vals["name"] = options.title
    vals["short_name"] = options.title
    vals["description"] = options.title
    vals["start_url"] = "index.html?fullscreen=1"
    vals["display"] = "fullscreen"
    vals["background_color"] = "#fff"
    vals["icons"] = [_app_icon_by_size("512x512"),
                     _app_icon_by_size("310x310"),
                     _app_icon_by_size("270x270"),
                     _app_icon_by_size("228x228"),
                     _app_icon_by_size("196x196"),
                     _app_icon_by_size("180x180"),
                     _app_icon_by_size("167x167"),
                     _app_icon_by_size("152x152"),
                     _app_icon_by_size("128x128"),
                     _app_icon_by_size("96x96"),
                     _app_icon_by_size("70x70"),
                     _app_icon_by_size("32x32"),
                     _app_icon_by_size("16x16")]

    with open(os.path.join(options.dest_directory, "manifest.json"), "w",
              encoding="UTF-8") as outfile:
        outfile.write(json.dumps(vals, indent="\t"))


def process_photos(options):
    conn = sqlite3.connect(options.input_database)
    conn.row_factory = sqlite3.Row

    icons = media_fetcher.Icons(__get_image_path(options, "panorama-icon.png"),
                                __get_image_path(options, "panorama-icon-small.png"),
                                __get_image_path(options, "panorama-icon-medium.png"),
                                __get_image_path(options, "play-icon.png"),
                                __get_image_path(options, "play-icon-small.png"),
                                __get_image_path(options, "play-icon-medium.png"),
                                __get_image_path(options, "motion-photo.png"),
                                __get_image_path(options, "motion-photo-small.png"),
                                __get_image_path(options, "motion-photo-medium.png"))

    thumbnailer = media_thumbnailer.Thumbnailer(options.thumbnail_size,
                                                options.small_thumbnail_size,
                                                options.medium_thumbnail_size,
                                                options.dest_directory,
                                                options.remove_stale_artifacts,
                                                options.imagemagick_command,
                                                options.ffmpeg_command,
                                                options.ffprobe_command,
                                                options.video_convert_command,
                                                options.exiv2_command,
                                                options.skip_metadata_text_if_exists,
                                                icons.play,
                                                icons.play_small,
                                                icons.play_medium)

    fetcher = media_fetcher.Database(conn, options.input_media_path, options.dest_directory,
                                     thumbnailer, set(options.tags_to_skip),
                                     options.video_convert_ext,
                                     options.add_path_to_overall_diskspace, icons)

    logging.info("Fetching all media")
    all_media = fetcher.get_all_media()

    if options.extra_header_link and options.extra_header_link_descr:
        extra_header = (options.extra_header_link_descr, options.extra_header_link)
    else:
        extra_header = None

    logging.info("Generating JSON file")
    json_writer = media_writer_json.Json(all_media, options.title,
                                         options.max_media_per_page, options.dest_directory,
                                         options.years_prior_are_approximate,
                                         extra_header, options.version_label)
    json_writer.write()

    logging.info("Copying other support files")
    write_redirect(os.path.join(os.path.join(options.dest_directory, "static-site"),
                                "index.html"),
                   "media/index.html")
    subprocess.run(["uglifyjs", "--source-map", "-o",
                    os.path.join(options.dest_directory, "search.min.js"),
                    __get_assets_path(options, "qrcode.js"),
                    __get_assets_path(options, "swiped-events.js"),
                    __get_assets_path(options, "search.js")], check=True)
    shutil.copyfile(__get_assets_path(options, "index.html"),
                    os.path.join(options.dest_directory, "index.html"))
    shutil.copyfile(__get_assets_path(options, "qrcode.js"),
                    os.path.join(options.dest_directory, "qrcode.js"))
    shutil.copyfile(__get_assets_path(options, "search.css"),
                    os.path.join(options.dest_directory, "search.css"))
    shutil.copyfile(__get_assets_path(options, "search-375px-width.css"),
                    os.path.join(options.dest_directory, "search-375px-width.css"))
    shutil.copyfile(__get_assets_path(options, "search-400px-width.css"),
                    os.path.join(options.dest_directory, "search-400px-width.css"))
    shutil.copyfile(__get_assets_path(options, "search.html"),
                    os.path.join(options.dest_directory, "search.html"))
    shutil.copyfile(__get_assets_path(options, "search.js"),
                    os.path.join(options.dest_directory, "search.js"))
    shutil.copyfile(__get_assets_path(options, "swiped-events.js"),
                    os.path.join(options.dest_directory, "swiped-events.js"))
    shutil.copyfile(__get_assets_path(options, "images/close-web-icon.png"),
                    os.path.join(options.dest_directory, "icons/close-web-icon.png"))
    shutil.copyfile(__get_assets_path(options, "images/fullscreen-web-icon.png"),
                    os.path.join(options.dest_directory, "icons/fullscreen-web-icon.png"))
    shutil.copyfile(__get_assets_path(options, "images/pause-web-icon.png"),
                    os.path.join(options.dest_directory, "icons/pause-web-icon.png"))
    shutil.copyfile(__get_assets_path(options, "images/play-web-icon.png"),
                    os.path.join(options.dest_directory, "icons/play-web-icon.png"))
    thumbnailer.remove_thumbnails()
    write_manifest_json(options)

    media_dir = os.path.join(options.dest_directory, "original")
    if not options.skip_original_symlink and not os.path.exists(media_dir):
        if os.path.islink(media_dir):
            os.unlink(media_dir)
        os.symlink(options.input_media_path, media_dir)

    photos = media_writer_html.Html(all_media,
                                    os.path.join(options.dest_directory, "static-site"),
                                    options.title, options.years_prior_are_approximate,
                                    options.max_media_per_page, options.expand_all_elements,
                                    extra_header, options.version_label,
                                    options.remove_stale_artifacts)

    logging.info("Generating all media HTML files")
    all_media_year_index = photos.write_all_media_index_file()

    logging.info("Generating year and event HTML files")
    photos.write_year_and_event_html_files(all_media_year_index)

    logging.info("Generating tag HTML files")
    photos.write_tag_html_files()

    photos.remove_stale_files()

    logging.info("Finished")

def write_redirect(filename, redirect_to):
    base_dir = os.path.dirname(filename)
    if not os.path.isdir(base_dir):
        os.makedirs(base_dir)

    with open(filename, "w", encoding="UTF-8") as output:
        output.write("<html>")
        output.write("<head><meta http-equiv='refresh' content='0;url=%s'/></head>" % (redirect_to))
        output.write("</html>")

def __get_image_path(options, name):
    return os.path.join(options.src_assets_directory, "images", name)

def __get_assets_path(options, name):
    return os.path.join(options.src_assets_directory, name)

if __name__ == "__main__":
    ARGPARSER = argparse.ArgumentParser()
    ARGPARSER.add_argument("--input-database", required=True)
    ARGPARSER.add_argument("--input-media-path", required=True)
    ARGPARSER.add_argument("--dest-directory", required=True)
    ARGPARSER.add_argument("--src-assets-directory", required=True)
    ARGPARSER.add_argument("--title", required=True)
    ARGPARSER.add_argument("--thumbnail-size", default="388x388")
    ARGPARSER.add_argument("--small-thumbnail-size", default="94x94")
    ARGPARSER.add_argument("--medium-thumbnail-size", default="192x192")
    ARGPARSER.add_argument("--years-prior-are-approximate", default="2000")
    ARGPARSER.add_argument("--max-media-per-page", type=int, default=24)
    ARGPARSER.add_argument("--tags-to-skip", nargs="+", default=[])
    ARGPARSER.add_argument("--expand-all-elements", action="store_true", default=False)
    ARGPARSER.add_argument("--remove-stale-artifacts", action="store_true", default=False)
    ARGPARSER.add_argument("--skip-original-symlink", action="store_true", default=False)
    ARGPARSER.add_argument("--imagemagick-command", default="magick")
    ARGPARSER.add_argument("--ffmpeg-command", default="ffmpeg")
    ARGPARSER.add_argument("--ffprobe-command", default="ffprobe")
    ARGPARSER.add_argument("--video-convert-command",
                           help="Standardize all videos to a common format. Example: ffmpeg " + \
                                "-y -hide_banner -loglevel warning -i {infile} -map_metadata 0 " + \
                                "-c:v libx264 -preset slow -pix_fmt yuv420p -c:a aac -b:a 128k " + \
                                "-movflags use_metadata_tags {outfile}")
    ARGPARSER.add_argument("--video-convert-ext", help="example: mp4")
    ARGPARSER.add_argument("--exiv2-command", default="exiv2")
    ARGPARSER.add_argument("--skip-metadata-text-if-exists", action="store_true", default=False)
    ARGPARSER.add_argument("--version-label")
    ARGPARSER.add_argument("--extra-header-link",
                           help="Optional extra URL to append to the header")
    ARGPARSER.add_argument("--extra-header-link-descr",
                           help="Label for the URL in --extra-header-link")
    ARGPARSER.add_argument("--add-path-to-overall-diskspace", nargs="+", default=[])
    ARGPARSER.add_argument("--debug", action="store_true", default=False)
    ARGS = ARGPARSER.parse_args(sys.argv[1:])
    logging.basicConfig(format="%(asctime)s %(message)s",
                        level=logging.DEBUG if ARGS.debug else logging.INFO)
    process_photos(ARGS)
