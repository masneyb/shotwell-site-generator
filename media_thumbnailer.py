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

import logging
import os
import pathlib
import subprocess

COMPOSITE_FRAME_SIZE = 4

class Imagemagick:
    def __init__(self, thumbnail_size, dest_thumbs_directory, remove_stale_thumbnails):
        self.thumbnail_size = thumbnail_size
        self.dest_thumbs_directory = dest_thumbs_directory
        self.remove_stale_thumbnails = remove_stale_thumbnails
        self.generated_thumbnails = set([])

    def create_composite_media_thumbnail(self, title, source_media, dest_filename):
        base_dir = os.path.dirname(dest_filename)
        if not os.path.isdir(base_dir):
            os.makedirs(base_dir)

        source_media = sorted(source_media,
                              key=lambda media: (media["rating"] + media["extra_rating"],
                                                 media["exposure_time"]),
                              reverse=True)

        # Write a separate index file for each thumbnail to determine if the thumbnail needs
        # regenerated.
        tn_idx_file = "%s.idx" % (dest_filename)
        tn_idx_contents = ','.join([media["media_id"] for media in source_media])

        self.generated_thumbnails.add(dest_filename)
        self.generated_thumbnails.add(tn_idx_file)

        if self.__is_thumbnail_up_to_date(dest_filename, tn_idx_file, tn_idx_contents):
            return

        if not source_media:
            logging.warning("Creating empty thumbnail %s due to no media in %s",
                            dest_filename, title)
            cmd = ["convert", "-size", self.thumbnail_size, "xc:lightgray", dest_filename]
            subprocess.run(cmd, check=False)
            pathlib.Path(tn_idx_file).write_text(tn_idx_contents)
            return

        logging.info("Generating composite thumbnail for %s: %s", title, dest_filename)

        max_photos, tile_size, geometry = self.__get_montage_tile_props(len(source_media))
        source_media = source_media[0:max_photos]

        file_ops = []
        for media in source_media:
            file_ops += ["(", media["shotwell_thumbnail_path"],
                         "-thumbnail", "%s^" % (geometry), "-gravity", "center",
                         "-extent", geometry, ")"]

        cmd = ["montage", *file_ops, "-geometry", "%s+0+0" % (geometry),
               "-background", "white", "-tile", tile_size, "-frame", str(COMPOSITE_FRAME_SIZE),
               dest_filename]
        subprocess.run(cmd, check=False)

        pathlib.Path(tn_idx_file).write_text(tn_idx_contents)

    def __is_thumbnail_up_to_date(self, thumbnail, tn_idx_file, tn_idx_contents):
        if not os.path.isfile(thumbnail):
            return False

        if not os.path.isfile(tn_idx_file):
            return False

        contents = pathlib.Path(tn_idx_file).read_text()
        return contents == tn_idx_contents

    def __get_montage_tile_props(self, num_avail_photos):
        # Array contains the number of columns and rows that are available in the tile.
        avail_sizes = [(1, 1), (2, 1), (2, 2), (3, 3), (4, 4)]
        idx = len(avail_sizes) - 1
        for i, avail_size in enumerate(avail_sizes):
            num_photos = avail_size[0] * avail_size[1]
            if num_avail_photos == num_photos:
                idx = i
                break
            if num_avail_photos < num_photos:
                idx = i - 1
                break

        num_photos = avail_sizes[idx][0] * avail_sizes[idx][1]
        width, height = self.thumbnail_size.split("x")
        geometry = "%dx%d" % \
            ((int(width) - (avail_sizes[idx][0] * COMPOSITE_FRAME_SIZE * 2)) / avail_sizes[idx][0],
             (int(height) - (avail_sizes[idx][1] * COMPOSITE_FRAME_SIZE * 2)) / avail_sizes[idx][1])
        tile_size = "%dx%d" % (avail_sizes[idx][0], avail_sizes[idx][1])

        return num_photos, tile_size, geometry

    def create_rounded_and_square_thumbnail(self, source_image, rotate, resized_image,
                                            overlay_icon):
        if not os.path.isfile(source_image):
            logging.warning("Cannot find filename %s", source_image)
            return

        self.generated_thumbnails.add(resized_image)
        if os.path.isfile(resized_image):
            return

        base_dir = os.path.dirname(resized_image)
        if not os.path.isdir(base_dir):
            os.makedirs(base_dir)

        logging.info("Generating thumbnail for %s", source_image)

        # Crop the thumbnail and add rounded corners to it using Imagemagick
        resize_cmd = ["convert", source_image, "-rotate", str(rotate), "-strip",
                      "-thumbnail", "%s^" % (self.thumbnail_size),
                      "-gravity", "center", "-extent", self.thumbnail_size]

        if overlay_icon:
            resize_cmd += [overlay_icon, "-gravity", "southeast", "-composite"]

        resize_cmd += ["(", "+clone", "-alpha", "extract",
                       "-draw", "fill black polygon 0,0 0,15 15,0 fill white circle 15,15 15,0",
                       "(", "+clone", "-flip", ")",
                       "-compose", "Multiply", "-composite", "(", "+clone", "-flop", ")",
                       "-compose", "Multiply", "-composite", ")", "-alpha", "off",
                       "-compose", "CopyOpacity", "-composite", resized_image]
        subprocess.run(resize_cmd, check=False)

    def remove_thumbnails(self):
        for root, _, filenames in os.walk(self.dest_thumbs_directory):
            for filename in filenames:
                path = os.path.join(root, filename)
                if path in self.generated_thumbnails:
                    continue

                if self.remove_stale_thumbnails:
                    logging.info("Removing stale thumbnail %s", path)
                    os.unlink(path)
                else:
                    logging.warning("Thumbnail %s is no longer used.", path)

class Noop:
    def create_composite_media_thumbnail(self, title, source_media, dest_filename):
        pass

    def create_rounded_and_square_thumbnail(self, source_image, rotate, resized_image,
                                            overlay_icon):
        pass

    def remove_thumbnails(self):
        pass
