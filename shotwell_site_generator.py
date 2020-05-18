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
import media_writer

def process_photos(options):
    dest_thumbs_directory = os.path.join(options.dest_directory, "thumbnails")

    conn = sqlite3.connect(options.input_database)
    conn.row_factory = sqlite3.Row

    all_media_ratings = get_ratings(options.ratings_to_skip)
    for rating in all_media_ratings:
        logging.info("Processing photo ratings %d", rating)

        if rating == 0:
            thumbnailer = media_thumbnailer.Imagemagick(options.thumbnail_size,
                                                        dest_thumbs_directory)
        else:
            thumbnailer = media_thumbnailer.Noop()

        fetcher = media_fetcher.Database(conn, options.input_media_path,
                                         options.input_thumbs_directory, dest_thumbs_directory,
                                         thumbnailer, set(options.tags_to_skip),
                                         options.panorama_icon, options.play_icon, options.raw_icon)
        all_media = fetcher.get_all_media(rating)

        photos = media_writer.Html(all_media, options.dest_directory, rating, all_media_ratings,
                                   options.title, options.years_prior_are_approximate,
                                   options.main_page_extra_link, options.main_page_extra_link_descr,
                                   options.max_media_per_page, options.expand_all_elements)

        all_media_year_index = photos.write_all_media_index_file()
        photos.write_year_and_event_html_files(all_media_year_index)
        photos.write_tag_html_files()

        write_redirect(os.path.join(options.dest_directory, str(rating), "index.html"),
                       "%s/index.html" % (options.default_view))

    write_redirect(os.path.join(options.dest_directory, "index.html"),
                   "0/%s/index.html" % (options.default_view))

    shutil.copyfile(options.css, os.path.join(options.dest_directory, "library.css"))

    media_symlink = os.path.join(options.dest_directory, "original")
    if os.path.islink(media_symlink):
        os.unlink(media_symlink)
    os.symlink(options.input_media_path, media_symlink)

def get_ratings(ratings_to_skip):
    if "0" in ratings_to_skip:
        logging.warning("Tag and year thumbnails will not be generated since rating 0 is skipped.")

    all_media_ratings = {0: "0+ stars", 1: "1+ star", 2: "2+ stars",
                         3: "3+ stars", 4: "4+ stars", 5: "5 stars"}
    for rating in ratings_to_skip:
        del all_media_ratings[int(rating)]

    return all_media_ratings

def write_redirect(filename, redirect_to):
    with open(filename, "w", encoding="UTF-8") as output:
        output.write("<html>")
        output.write("<head><meta http-equiv='refresh' content='0;url=%s'/></head>" % (redirect_to))
        output.write("</html>")

if __name__ == "__main__":
    logging.basicConfig(format="%(asctime)s %(message)s", level=logging.INFO)
    ARGPARSER = argparse.ArgumentParser()
    ARGPARSER.add_argument("--input-database", required=True)
    ARGPARSER.add_argument("--input-media-path", required=True)
    ARGPARSER.add_argument("--dest-directory", required=True)
    ARGPARSER.add_argument("--input-thumbs-directory", required=True)
    ARGPARSER.add_argument("--title", required=True)
    ARGPARSER.add_argument("--css", required=True)
    ARGPARSER.add_argument("--panorama-icon")
    ARGPARSER.add_argument("--play-icon")
    ARGPARSER.add_argument("--raw-icon")
    ARGPARSER.add_argument("--thumbnail-size", default="360x360")
    ARGPARSER.add_argument("--years-prior-are-approximate", default="2000")
    ARGPARSER.add_argument("--main-page-extra-link")
    ARGPARSER.add_argument("--main-page-extra-link-descr")
    ARGPARSER.add_argument("--max-media-per-page", type=int, default=50)
    ARGPARSER.add_argument("--default-view", default="media")
    ARGPARSER.add_argument("--ratings-to-skip", nargs="+", default=[])
    ARGPARSER.add_argument("--tags-to-skip", nargs="+", default=[])
    ARGPARSER.add_argument("--expand-all-elements", action="store_true", default=False)
    process_photos(ARGPARSER.parse_args(sys.argv[1:]))
