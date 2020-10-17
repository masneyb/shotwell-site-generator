#!/usr/bin/env python3

# Exports a static HTML view of your shotwell photo/video library.
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

    thumbnailer = media_thumbnailer.Imagemagick(options.thumbnail_size,
                                                options.dest_directory,
                                                options.remove_stale_thumbnails)

    fetcher = media_fetcher.Database(conn, options.input_media_path,
                                     options.input_thumbs_directory, options.dest_directory,
                                     thumbnailer, set(options.tags_to_skip),
                                     __get_image_path(options, "panorama-icon.png"),
                                     __get_image_path(options, "play-icon.png"),
                                     __get_image_path(options, "raw-icon.png"))
    all_media = fetcher.get_all_media()

    photos = media_writer_html.Html(all_media, options.dest_directory, options.title,
                                    options.years_prior_are_approximate,
                                    options.max_media_per_page, options.expand_all_elements,
                                    options.version_label)

    all_media_year_index = photos.write_all_media_index_file()
    photos.write_year_and_event_html_files(all_media_year_index)
    photos.write_tag_html_files()

    json_writer = media_writer_json.Json(all_media, options.title,
                                         options.max_media_per_page, options.dest_directory,
                                         options.years_prior_are_approximate,
                                         options.version_label)
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
    ARGPARSER.add_argument("--remove-stale-thumbnails", action="store_true", default=False)
    ARGPARSER.add_argument("--skip-original-symlink", action="store_true", default=False)
    ARGPARSER.add_argument("--version-label")
    process_photos(ARGPARSER.parse_args(sys.argv[1:]))
