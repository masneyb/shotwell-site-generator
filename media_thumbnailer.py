#!/usr/bin/env python3

# Creates regular and composite thumbnails.
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
    def __init__(self, thumbnail_size, dest_directory, remove_stale_thumbnails,
                 imagemagick_command, video_convert_command):
        # pylint: disable=too-many-arguments
        self.thumbnail_size = thumbnail_size
        self.dest_thumbs_directory = os.path.join(dest_directory, "thumbnails")
        self.transformed_origs_directory = os.path.join(dest_directory, "transformed")
        self.remove_stale_thumbnails = remove_stale_thumbnails
        self.imagemagick_command = imagemagick_command
        self.video_convert_command = video_convert_command
        self.generated_thumbnails = set([])

    def create_composite_media_thumbnail(self, title, source_media, dest_filename):
        base_dir = os.path.dirname(dest_filename)
        if not os.path.isdir(base_dir):
            os.makedirs(base_dir)

        max_photos, tile_size, geometry = self.__get_montage_tile_props(len(source_media))
        source_media = self.__get_composite_thumbnail_media(source_media, max_photos)

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
            cmd = [self.imagemagick_command, "-size", self.thumbnail_size, "xc:lightgray",
                   dest_filename]
            subprocess.run(cmd, check=False)
            pathlib.Path(tn_idx_file).write_text(tn_idx_contents)
            return

        logging.info("Generating composite thumbnail for %s: %s", title, dest_filename)

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

    def __get_composite_thumbnail_media(self, source_media, max_photos):
        # Group the media by rating (largest to smallest). For each rating, if there is more
        # media available than available slots, then grab every nth media to get a more
        # representative sample over time for the composite thumbnail.

        source_media_by_rating = {}
        for media in source_media:
            rating = media["rating"] + media["extra_rating"]
            if rating not in source_media_by_rating:
                source_media_by_rating[rating] = []

            source_media_by_rating[rating].append(media)

        all_ratings = list(source_media_by_rating.keys())
        all_ratings.sort(reverse=True)

        ret = []
        remaining_spots = max_photos
        for rating in all_ratings:
            source_media_by_rating[rating].sort(key=lambda media: media["exposure_time"],
                                                reverse=True)

            num_media = len(source_media_by_rating[rating])
            if num_media <= remaining_spots:
                media_to_add = source_media_by_rating[rating]
            else:
                media_to_add = source_media_by_rating[rating][::int(num_media / remaining_spots)]
                media_to_add = media_to_add[0:remaining_spots]

            ret += media_to_add
            remaining_spots -= len(media_to_add)
            if remaining_spots == 0:
                break

        return ret

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

    def transform_video(self, original_video, transformed_video):
        if not self.video_convert_command:
            return original_video

        cmd = []
        for part in self.video_convert_command.split(' '):
            part = part.replace('{infile}', original_video).replace('{outfile}', transformed_video)
            cmd.append(part)

        return self.__run_cmd(cmd, transformed_video, None)

    def transform_original_image(self, original_image, transformed_image, transformations,
                                 thumbnail):
        # Use imagemagick to perform transformations on the original image that are defined in
        # Shotwell.

        cmd = self.__get_imagemagick_transformation_cmd(original_image, transformed_image,
                                                        transformations)
        if not cmd:
            return original_image

        return self.__run_cmd(cmd, transformed_image, thumbnail)

    def __run_cmd(self, cmd, transformed_image, thumbnail):
        self.generated_thumbnails.add(transformed_image)

        base_dir = os.path.dirname(transformed_image)
        if not os.path.isdir(base_dir):
            os.makedirs(base_dir)

        idx_file = transformed_image + ".idx"
        self.generated_thumbnails.add(idx_file)
        idx_contents = " ".join(cmd)

        if self.__is_thumbnail_up_to_date(transformed_image, idx_file, idx_contents):
            return transformed_image

        if thumbnail and os.path.exists(thumbnail):
            # This will be recreated later based on the transformed image
            os.unlink(thumbnail)

        logging.info("Transforming original image: %s", " ".join(cmd))
        subprocess.run(cmd, check=False)

        pathlib.Path(idx_file).write_text(idx_contents)

        return transformed_image

    def __get_imagemagick_transformation_cmd(self, original_image, transformed_image,
                                             transformations):
        if not transformations:
            return None

        args = []
        if "straighten.angle" in transformations:
            args += ["-distort", "SRT", transformations["straighten.angle"]]

        if "crop.left" in transformations:
            width = int(transformations["crop.right"]) - int(transformations["crop.left"])
            height = int(transformations["crop.bottom"]) - int(transformations["crop.top"])
            args += ["-crop", "%dx%d+%s+%s" % (width, height, transformations["crop.left"],
                                               transformations["crop.top"])]

        if "adjustments.expansion" in transformations:
            # Has format: { 0, 130 }
            parts = transformations["adjustments.expansion"].replace(",", "").split(" ")
            black = (float(parts[1]) / 255.0) * 100.0
            white = (float(parts[2]) / 255.0) * 100.0
            args += ["-level", "%.1f%%,%.1f%%" % (black, white)]

        # FIXME - some other transformations that are used in my library need to be implemented:
        # adjustments.shadows, adjustments.exposure, and adjustments.saturation. There are others
        # that are supported by shotwell that are not referenced here.

        return [self.imagemagick_command, original_image, *args, transformed_image]

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
        resize_cmd = [self.imagemagick_command, source_image, "-rotate", str(rotate), "-strip",
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

    def remove_thumbnails_in_path(self, path):
        for root, _, filenames in os.walk(path):
            for filename in filenames:
                path = os.path.join(root, filename)
                if path in self.generated_thumbnails:
                    continue

                if self.remove_stale_thumbnails:
                    logging.info("Removing stale thumbnail %s", path)
                    os.unlink(path)
                else:
                    logging.warning("Thumbnail %s is no longer used.", path)

    def remove_thumbnails(self):
        self.remove_thumbnails_in_path(self.dest_thumbs_directory)
        self.remove_thumbnails_in_path(self.transformed_origs_directory)
