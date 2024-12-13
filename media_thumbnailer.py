#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2020-2024 Brian Masney <masneyb@onstation.org>

import enum
import json
import logging
import os
import pathlib
import re
import subprocess
import common

COMPOSITE_FRAME_SIZE = 4

class ThumbnailType(enum.Enum):
    SMALL_SQ = 1
    MEDIUM_SQ = 2
    LARGE = 3
    REGULAR = 4

class Thumbnailer:
    def __init__(self, thumbnail_size, small_thumbnail_size, medium_thumbnail_size, dest_directory,
                 remove_stale_artifacts, imagemagick_command, ffmpeg_command, ffprobe_command,
                 video_convert_command, exiv2_command, skip_metadata_text_if_exists, play_icon,
                 play_icon_small, play_icon_medium):
        self.thumbnail_size = thumbnail_size
        self.small_thumbnail_size = small_thumbnail_size
        self.medium_thumbnail_size = medium_thumbnail_size
        self.dest_thumbs_directory = os.path.join(dest_directory, "thumbnails")
        self.transformed_origs_directory = os.path.join(dest_directory, "transformed")
        self.motion_photo_directory = os.path.join(dest_directory, "motion_photo")
        self.metadata_directory = os.path.join(dest_directory, "metadata")
        self.remove_stale_artifacts = remove_stale_artifacts
        self.imagemagick_command = imagemagick_command
        self.ffmpeg_command = ffmpeg_command
        self.ffprobe_command = ffprobe_command
        self.video_convert_command = video_convert_command
        self.exiv2_command = exiv2_command
        self.skip_metadata_text_if_exists = skip_metadata_text_if_exists
        self.play_icon = play_icon
        self.play_icon_small = play_icon_small
        self.play_icon_medium = play_icon_medium
        self.generated_artifacts = set([])

    def _do_run_command(self, cmd, capture_output):
        logging.debug("Executing %s", " ".join(cmd))
        return subprocess.run(cmd, check=False, capture_output=capture_output)

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
            self._do_run_command(cmd, False)
            pathlib.Path(tn_idx_file).write_text(tn_idx_contents, encoding="UTF-8")
            return

        logging.info("Generating composite thumbnail for %s: %s", title, dest_filename)

        file_ops = []
        for media in source_media:
            file_ops += ["(",
                         os.path.join(self.dest_thumbs_directory, media["medium_thumbnail_path"]),
                         "-thumbnail", "%s^" % (geometry), "-gravity", "center",
                         "-extent", geometry, ")"]

        cmd = ["montage", *file_ops, "-geometry", "%s+0+0" % (geometry),
               "-background", "white", "-tile", tile_size, "-frame", str(COMPOSITE_FRAME_SIZE),
               dest_filename]
        self._do_run_command(cmd, False)

        pathlib.Path(tn_idx_file).write_text(tn_idx_contents, encoding="UTF-8")

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
            source_media_by_rating[rating].sort(key=lambda media: media["exposure_time"])

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

        contents = pathlib.Path(tn_idx_file).read_text(encoding="UTF-8")
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

        return self.__run_cmd(cmd, transformed_video)

    def create_multiple_resolutions(self, original_video, original_width, original_height,
                                    base_filename):
        ret = []
        for (name, width, height) in [("480p", 640, 480), ("720p", 1280, 720), \
                                      ("1080p", 1920, 1080)]:
            if width > original_width or height > original_height:
                continue

            filename = f"{base_filename}_{name}.mp4"
            cmd = [self.ffmpeg_command, "-y", "-hide_banner", "-loglevel", "warning",
                   "-i", original_video, "-vf", f"scale={width}:{height},fps=fps=30",
                   "-map_metadata", "0", "-c:v", "libx264", "-preset", "slow",
                   "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
                   "-movflags", "use_metadata_tags", filename]

            self.__run_cmd(cmd, filename)
            ret.append((name, filename))

        return ret

    def transform_original_image(self, original_image, transformed_image, transformations):
        # Use imagemagick to perform transformations on the original image that are defined in
        # Shotwell.

        cmd = self.__get_imagemagick_transformation_cmd(original_image, transformed_image,
                                                        transformations)
        if not cmd:
            return (original_image, False)

        return (self.__run_cmd(cmd, transformed_image), True)

    def __run_cmd(self, cmd, transformed_image):
        self.generated_artifacts.add(transformed_image)

        base_dir = os.path.dirname(transformed_image)
        if not os.path.isdir(base_dir):
            os.makedirs(base_dir)

        idx_file = transformed_image + ".idx"
        self.generated_artifacts.add(idx_file)
        idx_contents = " ".join(cmd)

        if self.__is_thumbnail_up_to_date(transformed_image, idx_file, idx_contents):
            return transformed_image

        logging.info("Transforming original image: %s", " ".join(cmd))
        self._do_run_command(cmd, False)

        pathlib.Path(idx_file).write_text(idx_contents, encoding="UTF-8")

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

    def create_thumbnail(self, source_image, is_video, rotate, resized_image, overlay_icon,
                         thumbnail_type, orig_width, orig_height):
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

        if thumbnail_type == ThumbnailType.LARGE:
            tn_size = f'{self.thumbnail_size}^'
        elif thumbnail_type == ThumbnailType.SMALL_SQ:
            tn_size = f'{self.small_thumbnail_size}^'
        elif thumbnail_type == ThumbnailType.MEDIUM_SQ:
            tn_size = f'{self.medium_thumbnail_size}^'
        elif orig_width:
            # Note that we can pass x:height to have imagemagick automatically scale the image.
            # I'm not doing that since ffmpeg and imagemagick round differently so the
            # generated image and animated GIF for the regular thumbnails can be off by a
            # pixel or two.
            new_height = self.thumbnail_size.split('x')[1]
            new_width = self._scale_number(orig_width, orig_height, int(new_height))
            tn_size = f"{new_width}x{new_height}"
        else:
            tn_size = 'x' + (self.thumbnail_size.split('x')[1])

        resize_cmd = [self.imagemagick_command, source_image, "-strip", "-rotate", str(rotate),
                      "-thumbnail", tn_size]

        if thumbnail_type == ThumbnailType.LARGE:
            resize_cmd += ["-gravity", "center", "-extent", self.thumbnail_size]
        elif thumbnail_type == ThumbnailType.SMALL_SQ:
            resize_cmd += ["-gravity", "center", "-extent", self.small_thumbnail_size]
        elif thumbnail_type == ThumbnailType.MEDIUM_SQ:
            resize_cmd += ["-gravity", "center", "-extent", self.medium_thumbnail_size]

        if overlay_icon:
            resize_cmd += [overlay_icon, "-gravity", "southeast", "-composite"]

        resize_cmd += [resized_image]

        self._do_run_command(resize_cmd, False)

    def _get_motion_photo_offset(self, photo_metadata):
        # Support the two types of Motion Photos from the Pixel phones:
        # v1 (MVIMG_*) and v2 (PXL_*.MP.jpg)
        mp_tags = [("Xmp.GCamera.MicroVideo", "1", "Xmp.GCamera.MicroVideoOffset"),
                   ("Xmp.Container.Directory[3]/Container:Item/Item:Semantic", "MotionPhoto",
                    "Xmp.Container.Directory[3]/Container:Item/Item:Length"),
                   ("Xmp.Container.Directory[2]/Container:Item/Item:Semantic", "MotionPhoto",
                    "Xmp.Container.Directory[2]/Container:Item/Item:Length"),
                   ("Xmp.Container_1_.Directory[2]/Container_1_:Item/Item_1_:Semantic",
                    "MotionPhoto",
                    "Xmp.Container_1_.Directory[2]/Container_1_:Item/Item_1_:Length")]
        for mp_tag in mp_tags:
            if mp_tag[0] not in photo_metadata or photo_metadata[mp_tag[0]] != mp_tag[1]:
                continue

            return int(photo_metadata[mp_tag[2]])

        return None

    def _get_video_resolution(self, filename):
        cmd = [self.ffprobe_command, "-v", "error", "-select_streams", "v:0", "-show_entries",
               "stream=width,height:side_data=rotation", "-of", "csv=s=x:p=0", filename]
        result = self._do_run_command(cmd, True)
        if result.returncode != 0:
            logging.error("Error running %s: %s", cmd, result.returncode)
            return None

        if not result.stdout:
            return None

        parts = result.stdout.decode("UTF-8").strip().split("\n")[-1].split("x")
        (width, height) = (int(parts[0]), int(parts[1]))
        rotate = int(parts[2]) if len(parts) > 2 else 0
        if rotate in (90, -90):
            (width, height) = (height, width)

        return (width, height)

    def _get_num_video_frames(self, filename):
        cmd = [self.ffprobe_command, "-v", "error", "-select_streams", "v:0", "-count_packets",
               "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", filename]
        result = self._do_run_command(cmd, True)
        if result.returncode != 0:
            logging.error("Error running %s: %s", cmd, result.returncode)
            return None

        if not result.stdout:
            return None

        return int(result.stdout.decode("UTF-8").replace(',', '').replace('\n', ''))

    def _scale_number(self, part, orig_fullsize, new_fullsize):
        return int((new_fullsize * part) / orig_fullsize)

    def _get_ffmpeg_animated_gif_cmd(self, src_filename, is_video, thumbnail_type,
                                     rotate, transformations, orig_img_width, orig_img_height,
                                     gif_dest_filename):
        max_frames = 100
        if is_video:
            num_frames = self._get_num_video_frames(src_filename)
            if not num_frames:
                return None

            if num_frames <= max_frames:
                num_frames = None
        else:
            num_frames = None

        if thumbnail_type == ThumbnailType.SMALL_SQ:
            (width, height) = [int(x) for x in self.small_thumbnail_size.split("x")]
        elif thumbnail_type == ThumbnailType.MEDIUM_SQ:
            (width, height) = [int(x) for x in self.medium_thumbnail_size.split("x")]
        else:
            (width, height) = [int(x) for x in self.thumbnail_size.split("x")]

        cmd = [self.ffmpeg_command, "-hide_banner", "-loglevel", "error"]
        if rotate != 0:
            cmd += ["-noautorotate"]

        cmd += ["-i", src_filename]

        if num_frames:
            if thumbnail_type == ThumbnailType.SMALL_SQ:
                cmd += ["-i", self.play_icon_small]
            elif thumbnail_type == ThumbnailType.MEDIUM_SQ:
                cmd += ["-i", self.play_icon_medium]
            else:
                cmd += ["-i", self.play_icon]

        complex_filter = "[0]"
        if num_frames:
            # Valid input range in frames. Videos longer than 900 frames will be trimmed by
            # skipping frames via the select_frames variable below.
            irng = (100, 900)

            # Adjusted pts range based on the input range
            prng = (10, 50)

            select_frames = int(num_frames / max_frames)

            # This controls the speed the speed of the animated GIF. PTS stands for
            # Presentation TimeStamps.
            if num_frames > irng[1]:
                # If the video is longer that the maximum number of frames, then set the pts to a
                # slower value.
                pts = prng[0]
            else:
                # Scale the inverted input range to the pts range and generate the pts value so
                # that shorter videos are sped up faster.
                pts = int((prng[1] - (prng[1] - prng[0]) *
                           ((num_frames - irng[0]) / (irng[1] - irng[0]))) + prng[0])

            complex_filter += (f"select=not(mod(n-1\\,{select_frames}))[skip];"
                               f"[skip]setpts=N/({pts}*TB)[fps];[fps]")

        # FIXME - some other transformations that are used in my library need to be implemented:
        # adjustments.shadows, adjustments.exposure, and adjustments.saturation. There are others
        # that are supported by shotwell that are not referenced here.
        #
        # straighten.angle and adjustments.expansion are implemented below in
        # __get_imagemagick_transformation_cmd() and also need to be implemented here.

        if transformations and "crop.left" in transformations:
            # For the motion photos, the video resolution is different than the image
            # resolution. The crop pixel counts are relative to the image resolution,
            # so scale the numbers accordingly for the video.
            (video_width, video_height) = self._get_video_resolution(src_filename)
            logging.debug("%s video resolution is %dx%d", src_filename, video_width, video_height)
            crop_l = self._scale_number(int(transformations["crop.left"]), orig_img_width,
                                        video_width)
            crop_t = self._scale_number(int(transformations["crop.top"]), orig_img_height,
                                        video_height)
            crop_w = self._scale_number(int(transformations["crop.right"]), orig_img_width,
                                        video_width) - crop_l
            crop_h = self._scale_number(int(transformations["crop.bottom"]), orig_img_height,
                                        video_height) - crop_t
            complex_filter += (f"crop={crop_w}:{crop_h}:{crop_l}:{crop_t}[crop];[crop]")

            orig_img_width = int(transformations["crop.right"]) - int(transformations["crop.left"])
            orig_img_height = int(transformations["crop.bottom"]) - int(transformations["crop.top"])

        if rotate == 90:
            complex_filter += "transpose=1[rotate];[rotate]"
        elif rotate == 180:
            complex_filter += "transpose=1,transpose=1[rotate];[rotate]"
        elif rotate == -90:
            complex_filter += "transpose=2[rotate];[rotate]"

        if thumbnail_type in (ThumbnailType.SMALL_SQ, ThumbnailType.MEDIUM_SQ, ThumbnailType.LARGE):
            complex_filter += (f"scale='if(gt(iw,ih),-1,{height})':'if(gt(iw,ih),{width},-1)'"
                               f"[scale];[scale]crop={width}:{height}")
        elif orig_img_width:
            # Note that we can pass -1:height to have ffmpeg automatically scale the image.
            # I'm not doing that since ffmpeg and imagemagick round differently so the
            # generated image and animated GIF for the regular thumbnails can be off by a
            # pixel or two.
            new_width = self._scale_number(orig_img_width, orig_img_height, height)
            complex_filter += f"scale='{new_width}:{height}'"
        else:
            complex_filter += f"scale='-1:{height}'"

        if num_frames:
            if thumbnail_type == ThumbnailType.SMALL_SQ:
                complex_filter += "[combined];[combined][1]overlay=x=main_w-16:y=main_h-16"
            elif thumbnail_type == ThumbnailType.MEDIUM_SQ:
                complex_filter += "[combined];[combined][1]overlay=x=main_w-30:y=main_h-30"
            else:
                complex_filter += "[combined];[combined][1]overlay=x=main_w-60:y=main_h-60"

        cmd += ["-f", "lavfi", "-i", f"color=white:size={width}x{height},format=rgba",
                "-filter_complex", complex_filter, gif_dest_filename]

        return cmd

    def _extract_motion_photo(self, src_filename, media_id, photo_metadata):
        offset = self._get_motion_photo_offset(photo_metadata)
        if not offset:
            return (None, None)

        (mp4_dest_filename, mp4_short_path) = \
            self.__get_hashed_file_path(os.path.join(self.motion_photo_directory, "original"),
                                        media_id, "mp4")
        self.generated_artifacts.add(mp4_dest_filename)
        mp4_short_path = f"original/{mp4_short_path}"

        if not os.path.exists(mp4_dest_filename):
            logging.info("Extracting motion photo from %s", src_filename)
            with open(src_filename, "rb") as src, open(mp4_dest_filename, "wb") as dest:
                src.seek(-1 * offset, os.SEEK_END)
                for content in src:
                    dest.write(content)

        return (mp4_dest_filename, mp4_short_path)

    def create_animated_gif(self, src_filename, media_id, rotate, photo_metadata, transformations,
                            orig_img_width, orig_img_height, thumbnail_type):
        if thumbnail_type == ThumbnailType.SMALL_SQ:
            path_part = "small"
        elif thumbnail_type == ThumbnailType.MEDIUM_SQ:
            path_part = "medium"
        elif thumbnail_type == ThumbnailType.LARGE:
            path_part = "large"
        else:
            path_part = "regular"

        if photo_metadata is not None:
            (src_filename, mp4_short_path) = self._extract_motion_photo(src_filename, media_id,
                                                                        photo_metadata)
            if not mp4_short_path:
                return None

            mp4_short_path = f"motion_photo/{mp4_short_path}"
        else:
            mp4_short_path = None

        (gif_dest_filename, gif_short_path) = \
            self.__get_hashed_file_path(os.path.join(self.motion_photo_directory, path_part),
                                        media_id, "gif")
        self.generated_artifacts.add(gif_dest_filename)

        if not os.path.exists(gif_dest_filename):
            cmd = self._get_ffmpeg_animated_gif_cmd(src_filename,
                                                    photo_metadata is None,
                                                    thumbnail_type, rotate, transformations,
                                                    orig_img_width, orig_img_height,
                                                    gif_dest_filename)
            if not cmd:
                return None

            logging.info("Creating animated GIF for %s", src_filename)
            self._do_run_command(cmd, False)

        return (mp4_short_path, f"motion_photo/{path_part}/{gif_short_path}")

    def _read_exif_txt(self, file_contents):
        ret = {}
        for line in file_contents:
            parts = re.split(r'\s+', line.strip())
            if len(parts) == 3:
                ret[parts[0]] = ''
            elif len(parts) == 4:
                ret[parts[0]] = parts[3]

        return ret

    def write_exif_txt(self, img_filename, media_id):
        (exif_filename, short_path) = self.__get_hashed_file_path(self.metadata_directory, media_id,
                                                                  "txt")
        short_path = f"metadata/{short_path}"
        self.generated_artifacts.add(exif_filename)

        if self.skip_metadata_text_if_exists and os.path.exists(exif_filename):
            with open(exif_filename, "r", encoding="UTF-8") as infile:
                return (short_path, self._read_exif_txt(infile))

        cmd = [self.exiv2_command, "-pa", img_filename]

        logging.debug("Executing %s", cmd)
        ret = subprocess.run(cmd, check=False, capture_output=True)
        if ret.returncode != 0:
            logging.warning("Error executing %s: %d", cmd, ret.returncode)

        decoded_text = ret.stdout.decode("UTF-8", 'ignore')
        with open(exif_filename, "w", encoding="UTF-8") as file:
            file.write(decoded_text)

        return (short_path, self._read_exif_txt(decoded_text.split('\n')))

    def __read_video_metadata(self, tags):
        ret = {}

        if "streams" in tags:
            for stream in tags["streams"]:
                if "duration" in stream:
                    ret["clip_duration"] = float(stream["duration"])

                if "avg_frame_rate" in stream:
                    parts = stream["avg_frame_rate"].split("/")
                    if parts[1] == "0":
                        ret["fps"] = parts[0]
                    else:
                        ret["fps"] = round(float(parts[0]) / float(parts[1]))

                if "width" in stream and "height" in stream:
                    ret["width"] = stream["width"]
                    ret["height"] = stream["height"]
                    break

        if "format" in tags and "tags" in tags["format"]:
            ret.update(tags["format"]["tags"])

        return ret

    def write_video_json(self, video_filename, media_id):
        (metadata_filename, short_path) = self.__get_hashed_file_path(self.metadata_directory,
                                                                      media_id, "json")
        short_path = f"metadata/{short_path}"
        self.generated_artifacts.add(metadata_filename)

        if self.skip_metadata_text_if_exists and os.path.exists(metadata_filename):
            with open(metadata_filename, "r", encoding="UTF-8") as infile:
                return (short_path, self.__read_video_metadata(json.load(infile)))

        cmd = [self.ffprobe_command, "-v", "quiet", "-print_format", "json", "-show_streams",
               "-show_entries", "stream_tags:format_tags", video_filename]

        logging.debug("Executing %s", cmd)
        ret = subprocess.run(cmd, check=False, capture_output=True)
        if ret.returncode != 0:
            logging.warning("Error executing %s: %d", cmd, ret.returncode)

        decoded_text = ret.stdout.decode("UTF-8", 'ignore')
        with open(metadata_filename, "w", encoding="UTF-8") as file:
            file.write(decoded_text)

        return (short_path, self.__read_video_metadata(json.loads(decoded_text)))

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
        common.remove_stale_artifacts(self.metadata_directory, self.generated_artifacts,
                                      self.remove_stale_artifacts)
        common.remove_stale_artifacts(self.motion_photo_directory, self.generated_artifacts,
                                      self.remove_stale_artifacts)
