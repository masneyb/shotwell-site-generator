#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# Copyright (C) 2020-2021 Brian Masney <masneyb@onstation.org>

import logging
import os
import pathlib
import subprocess
import common

COMPOSITE_FRAME_SIZE = 4

class Thumbnailer:
    # pylint: disable=too-many-instance-attributes

    def __init__(self, thumbnail_size, dest_directory, remove_stale_artifacts,
                 imagemagick_command, ffmpeg_command, video_convert_command, exif_text_command,
                 skip_exif_text_if_exists):
        # pylint: disable=too-many-arguments
        self.thumbnail_size = thumbnail_size
        self.dest_thumbs_directory = os.path.join(dest_directory, "thumbnails")
        self.transformed_origs_directory = os.path.join(dest_directory, "transformed")
        self.motion_photo_directory = os.path.join(dest_directory, "motion_photo")
        self.exif_directory = os.path.join(dest_directory, "exif")
        self.remove_stale_artifacts = remove_stale_artifacts
        self.imagemagick_command = imagemagick_command
        self.ffmpeg_command = ffmpeg_command
        self.video_convert_command = video_convert_command
        self.exif_text_command = exif_text_command
        self.skip_exif_text_if_exists = skip_exif_text_if_exists
        self.generated_artifacts = set([])

    def _do_run_command(self, cmd):
        logging.debug("Executing %s", " ".join(cmd))
        subprocess.run(cmd, check=False)

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

        self.generated_artifacts.add(dest_filename)
        self.generated_artifacts.add(tn_idx_file)

        if self.__is_thumbnail_up_to_date(dest_filename, tn_idx_file, tn_idx_contents):
            return

        if not source_media:
            logging.warning("Creating empty thumbnail %s due to no media in %s",
                            dest_filename, title)
            cmd = [self.imagemagick_command, "-size", self.thumbnail_size, "xc:lightgray",
                   dest_filename]
            self._do_run_command(cmd)
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
        self._do_run_command(cmd)

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
        self.generated_artifacts.add(transformed_image)

        base_dir = os.path.dirname(transformed_image)
        if not os.path.isdir(base_dir):
            os.makedirs(base_dir)

        idx_file = transformed_image + ".idx"
        self.generated_artifacts.add(idx_file)
        idx_contents = " ".join(cmd)

        if self.__is_thumbnail_up_to_date(transformed_image, idx_file, idx_contents):
            return transformed_image

        if thumbnail and os.path.exists(thumbnail):
            # This will be recreated later based on the transformed image
            os.unlink(thumbnail)

        logging.info("Transforming original image: %s", " ".join(cmd))
        self._do_run_command(cmd)

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

    def create_rounded_and_square_thumbnail(self, source_image, is_video, rotate,
                                            resized_image, overlay_icon):
        # pylint: disable=too-many-arguments
        if not os.path.isfile(source_image):
            logging.warning("Cannot find filename %s", source_image)
            return

        self.generated_artifacts.add(resized_image)
        if os.path.isfile(resized_image):
            return

        base_dir = os.path.dirname(resized_image)
        if not os.path.isdir(base_dir):
            os.makedirs(base_dir)

        logging.info("Generating thumbnail for %s", source_image)

        if is_video:
            source_image += "[1]"

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
        self._do_run_command(resize_cmd)

    def _get_motion_photo_offset(self, exiv2_metadata):
        # Support the two types of Motion Photos from the Pixel phones:
        # v1 (MVIMG_*) and v2 (PXL_*.MP.jpg)
        mp_tags = [("Xmp.GCamera.MicroVideo", "1", "Xmp.GCamera.MicroVideoOffset"),
                   ("Xmp.Container.Directory[2]/Container:Item/Item:Semantic", "MotionPhoto",
                    "Xmp.Container.Directory[2]/Container:Item/Item:Length")]
        for mp_tag in mp_tags:
            if mp_tag[0] not in exiv2_metadata or exiv2_metadata[mp_tag[0]].value != mp_tag[1]:
                continue

            return int(exiv2_metadata[mp_tag[2]].value)

        return None

    def extract_motion_photo(self, exiv2_metadata, src_filename, media_id):
        offset = self._get_motion_photo_offset(exiv2_metadata)
        if not offset:
            return None

        (mp4_dest_filename, mp4_short_path) = \
            self.__get_hashed_file_path(self.motion_photo_directory, media_id, "mp4")
        self.generated_artifacts.add(mp4_dest_filename)

        if not os.path.exists(mp4_dest_filename):
            logging.info("Extracting motion photo from %s", src_filename)
            with open(src_filename, 'rb') as src, open(mp4_dest_filename, 'wb') as dest:
                src.seek(-1 * offset, os.SEEK_END)
                for content in src:
                    dest.write(content)

        (gif_dest_filename, gif_short_path) = \
            self.__get_hashed_file_path(self.motion_photo_directory, media_id, "gif")
        self.generated_artifacts.add(gif_dest_filename)

        if not os.path.exists(gif_dest_filename):
            logging.info("Creating animated GIF for %s", src_filename)
            (width, height) = self.thumbnail_size.split("x")
            cmd = [self.ffmpeg_command, "-hide_banner", "-loglevel", "error",
                   "-i", mp4_dest_filename,
                   "-f", "lavfi", "-i", f"color=white:size={self.thumbnail_size},format=rgba",
                   "-filter_complex",
                   (f"[0]scale='if(gt(iw,ih),-1,{height})':'if(gt(iw,ih),{width},-1)'[scale];"
                    f"[scale]crop={width}:{height}[crop];"
                    "[crop]geq=lum='p(X,Y)':"
                    "a='if(gt(abs(W/2-X),W/2-15)*gt(abs(H/2-Y),H/2-15),"
                    "if(lte(hypot(15-(W/2-abs(W/2-X)),15-(H/2-abs(H/2-Y))),15),255,0),255)'"
                    "[rounded];"
                    f"color=white@0.0:size={self.thumbnail_size},format=rgba[bg];"
                    "[bg][rounded]overlay=x=0:y=0:shortest=1"),
                   gif_dest_filename]
            self._do_run_command(cmd)

        return (f"motion_photo/{mp4_short_path}", f"motion_photo/{gif_short_path}")

    def write_exif_txt(self, img_filename, media_id):
        if not self.exif_text_command:
            return None

        (exif_filename, short_path) = self.__get_hashed_file_path(self.exif_directory, media_id,
                                                                  "txt")
        short_path = f"exif/{short_path}"
        self.generated_artifacts.add(exif_filename)

        if self.skip_exif_text_if_exists and os.path.exists(exif_filename):
            return short_path

        cmd = []
        for part in self.exif_text_command.split(' '):
            part = part.replace('{infile}', img_filename)
            cmd.append(part)

        logging.debug("Executing %s", cmd)
        ret = subprocess.run(cmd, check=False, capture_output=True)
        if ret.returncode != 0:
            return None

        with open(exif_filename, "wb") as file:
            file.write(ret.stdout)

        return short_path

    def __get_hashed_file_path(self, dest_directory, media_id, file_ext):
        dirhash = common.get_dir_hash(media_id)
        basedir = os.path.join(dest_directory, dirhash)
        if not os.path.isdir(basedir):
            os.makedirs(basedir)

        return (os.path.join(basedir, f'{media_id}.{file_ext}'),
                f"{dirhash}/{media_id}.{file_ext}")

    def remove_thumbnails(self):
        common.remove_stale_artifacts(self.dest_thumbs_directory, self.generated_artifacts,
                                      self.remove_stale_artifacts)
        common.remove_stale_artifacts(self.transformed_origs_directory, self.generated_artifacts,
                                      self.remove_stale_artifacts)
        common.remove_stale_artifacts(self.exif_directory, self.generated_artifacts,
                                      self.remove_stale_artifacts)
        common.remove_stale_artifacts(self.motion_photo_directory, self.generated_artifacts,
                                      self.remove_stale_artifacts)
