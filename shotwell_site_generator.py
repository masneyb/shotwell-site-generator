#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# Copyright (C) 2020-2021 Brian Masney <masneyb@onstation.org>
#
# Exports a static HTML view of your shotwell photo/video library.

import argparse
import logging
import os
import shutil
import sqlite3
import sys
import media_fetcher
import media_thumbnailer
import media_writer_html
import media_writer_json

def process_photos(options):
    conn = sqlite3.connect(options.input_database)
    conn.row_factory = sqlite3.Row

    thumbnailer = media_thumbnailer.Thumbnailer(options.thumbnail_size,
                                                options.dest_directory,
                                                options.remove_stale_artifacts,
                                                options.imagemagick_command,
                                                options.ffmpeg_command,
                                                options.video_convert_command,
                                                options.exif_text_command,
                                                options.skip_exif_text_if_exists)

    fetcher = media_fetcher.Database(conn, options.input_media_path,
                                     options.input_thumbs_directory, options.dest_directory,
                                     thumbnailer, set(options.tags_to_skip),
                                     options.video_convert_ext,
                                     options.add_path_to_overall_diskspace,
                                     __get_image_path(options, "panorama-icon.png"),
                                     __get_image_path(options, "play-icon.png"),
                                     __get_image_path(options, "raw-icon.png"),
                                     __get_image_path(options, "motion-photo.png"))
    all_media = fetcher.get_all_media()

    if options.extra_header_link and options.extra_header_link_descr:
        extra_header = (options.extra_header_link_descr, options.extra_header_link)
    else:
        extra_header = None

    photos = media_writer_html.Html(all_media, options.dest_directory, options.title,
                                    options.years_prior_are_approximate,
                                    options.max_media_per_page, options.expand_all_elements,
                                    extra_header, options.version_label,
                                    options.remove_stale_artifacts)

    all_media_year_index = photos.write_all_media_index_file()
    photos.write_year_and_event_html_files(all_media_year_index)
    photos.write_tag_html_files()
    photos.remove_stale_files()

    json_writer = media_writer_json.Json(all_media, options.title,
                                         options.max_media_per_page, options.dest_directory,
                                         options.years_prior_are_approximate,
                                         extra_header, options.version_label)
    json_writer.write()

    write_redirect(os.path.join(options.dest_directory, "index.html"),
                   "%s/index.html" % (options.default_view))

    thumbnailer.remove_thumbnails()

    shutil.copyfile(__get_assets_path(options, "library.css"),
                    os.path.join(options.dest_directory, "library.css"))
    shutil.copyfile(__get_assets_path(options, "screensaver.html"),
                    os.path.join(options.dest_directory, "screensaver.html"))
    shutil.copyfile(__get_assets_path(options, "search.html"),
                    os.path.join(options.dest_directory, "search.html"))
    shutil.copyfile(__get_assets_path(options, "search.js"),
                    os.path.join(options.dest_directory, "search.js"))

    saved_searches_dest = os.path.join(options.dest_directory, "saved_searches.js")
    if not os.path.exists(saved_searches_dest):
        # An example saved_searches.js file is provided. Only overwrite the destination if it
        # does not exist.
        shutil.copyfile(__get_assets_path(options, "saved_searches.js"), saved_searches_dest)

    if not options.skip_original_symlink:
        media_symlink = os.path.join(options.dest_directory, "original")
        if os.path.islink(media_symlink):
            os.unlink(media_symlink)
        os.symlink(options.input_media_path, media_symlink)

def write_redirect(filename, redirect_to):
    with open(filename, "w", encoding="UTF-8") as output:
        output.write("<html>")
        output.write("<head><meta http-equiv='refresh' content='0;url=%s'/></head>" % (redirect_to))
        output.write("</html>")

def __get_image_path(options, name):
    return os.path.join(options.src_assets_directory, "images", name)

def __get_assets_path(options, name):
    return os.path.join(options.src_assets_directory, name)

if __name__ == "__main__":
    logging.basicConfig(format="%(asctime)s %(message)s", level=logging.INFO)
    ARGPARSER = argparse.ArgumentParser()
    ARGPARSER.add_argument("--input-database", required=True)
    ARGPARSER.add_argument("--input-media-path", required=True)
    ARGPARSER.add_argument("--input-thumbs-directory", required=True)
    ARGPARSER.add_argument("--dest-directory", required=True)
    ARGPARSER.add_argument("--src-assets-directory", required=True)
    ARGPARSER.add_argument("--title", required=True)
    ARGPARSER.add_argument("--thumbnail-size", default="390x390")
    ARGPARSER.add_argument("--years-prior-are-approximate", default="2000")
    ARGPARSER.add_argument("--max-media-per-page", type=int, default=24)
    ARGPARSER.add_argument("--default-view", default="media")
    ARGPARSER.add_argument("--tags-to-skip", nargs="+", default=[])
    ARGPARSER.add_argument("--expand-all-elements", action="store_true", default=False)
    ARGPARSER.add_argument("--remove-stale-artifacts", action="store_true", default=False)
    ARGPARSER.add_argument("--skip-original-symlink", action="store_true", default=False)
    ARGPARSER.add_argument("--imagemagick-command", default="convert")
    ARGPARSER.add_argument("--ffmpeg-command", default="ffmpeg")
    ARGPARSER.add_argument("--video-convert-command",
                           help="Standardize all videos to a common format. Example: ffmpeg " + \
                                "-y -hide_banner -loglevel warning -i {infile} -c:v libx264 " + \
                                "-preset slow -pix_fmt yuv420p -c:a aac -b:a 128k {outfile}")
    ARGPARSER.add_argument("--video-convert-ext", help="example: mp4")
    ARGPARSER.add_argument("--exif-text-command", help="exiv2 -pa {infile}")
    ARGPARSER.add_argument("--skip-exif-text-if-exists", action="store_true", default=False)
    ARGPARSER.add_argument("--version-label")
    ARGPARSER.add_argument("--extra-header-link",
                           help="Optional extra URL to append to the header")
    ARGPARSER.add_argument("--extra-header-link-descr",
                           help="Label for the URL in --extra-header-link")
    ARGPARSER.add_argument("--add-path-to-overall-diskspace", nargs="+", default=[])
    process_photos(ARGPARSER.parse_args(sys.argv[1:]))
