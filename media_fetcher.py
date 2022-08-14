#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# Copyright (C) 2020-2022 Brian Masney <masneyb@onstation.org>
#
# Reads photos, videos, events, and tags from a Shotwell sqlite database.

import csv
import datetime
import logging
import os
import pyexiv2
from PIL import Image
from common import add_date_to_stats, cleanup_event_title, get_dir_hash
from media_thumbnailer import ThumbnailType

class Icons:
    # pylint: disable=too-many-instance-attributes,too-many-arguments,too-few-public-methods
    def __init__(self, panorama, panorama_small, panorama_medium,
                 play, play_small, play_medium,
                 raw, raw_small, raw_medium,
                 motion_photo, motion_photo_small, motion_photo_medium):
        self.panorama = panorama
        self.panorama_small = panorama_small
        self.panorama_medium = panorama_medium
        self.play = play
        self.play_small = play_small
        self.play_medium = play_medium
        self.raw = raw
        self.raw_small = raw_small
        self.raw_medium = raw_medium
        self.motion_photo = motion_photo
        self.motion_photo_small = motion_photo_small
        self.motion_photo_medium = motion_photo_medium

class Database:
    # pylint: disable=too-few-public-methods,too-many-instance-attributes
    def __init__(self, conn, input_media_path, dest_directory,
                 thumbnailer, tags_to_skip, video_convert_ext, add_paths_to_overall_diskspace,
                 icons):
        # pylint: disable=too-many-arguments
        self.conn = conn
        self.input_media_path = input_media_path
        self.dest_directory = dest_directory
        self.dest_thumbs_directory = os.path.join(dest_directory, "thumbnails")
        self.transformed_origs_directory = os.path.join(dest_directory, "transformed")
        self.tags_to_skip = tags_to_skip
        self.thumbnailer = thumbnailer
        self.video_convert_ext = video_convert_ext
        self.add_paths_to_overall_diskspace = add_paths_to_overall_diskspace
        self.icons = icons
        self.camera_transformations = self.__get_camera_transformations()
        Image.MAX_IMAGE_PIXELS = None

        # Register the Pixel Motion Photo namespace. Make up a fake URL.
        pyexiv2.xmp.register_namespace('MotionPhotoItem/', 'Item')

    def get_all_media(self):
        all_media = {"events_by_year": {}, "all_stats": self.__create_new_stats(),
                     "events_by_id": {}, "media_by_id": {}, "tags_by_id": {},
                     "tags": []}

        self.__fetch_media(all_media)
        self.__fetch_events(all_media)

        for event in all_media["events_by_id"].values():
            if event["date"] is None:
                logging.warning("Ignoring event id %d with no media.", event["id"])
                continue

            event["media"].sort(key=lambda media: media["exposure_time"])

            for year in event["years"].keys():
                if year not in all_media["events_by_year"]:
                    all_media["events_by_year"][year] = {}
                    all_media["events_by_year"][year]["media_id"] = str(year)
                    all_media["events_by_year"][year]["title"] = str(year)
                    all_media["events_by_year"][year]["comment"] = None
                    all_media["events_by_year"][year]["events"] = []
                    all_media["events_by_year"][year]["stats"] = self.__create_new_stats()
                    all_media["events_by_year"][year]["tags"] = []

                all_media["events_by_year"][year]["events"].append(event)
                all_media["events_by_year"][year]["stats"]["num_events"] += 1

                for media in event["media"]:
                    if media["year"] == year:
                        self.__add_media_to_stats(all_media["events_by_year"][year]["stats"], media)

            self.__sum_stats(all_media["all_stats"], event["stats"])

        self.__fetch_tags(all_media)

        thumbnail_basedir = os.path.join(self.dest_thumbs_directory, "year")
        if not os.path.isdir(thumbnail_basedir):
            os.makedirs(thumbnail_basedir)

        for year, year_block in all_media["events_by_year"].items():
            year_block["thumbnail_path"] = "year/large/%s" % ("%s.png" % (year))
            fspath = self.__get_thumbnail_fs_path(year_block["thumbnail_path"])
            candidate_photos = self.__get_year_candidate_composite_photos(all_media,
                                                                          year,
                                                                          year_block["events"])
            self.thumbnailer.create_composite_media_thumbnail("year %s" % (year),
                                                              candidate_photos, fspath)

            year_block["small_thumbnail_path"] = "year/small/%s" % ("%s.png" % (year))
            small_fspath = self.__get_thumbnail_fs_path(year_block["small_thumbnail_path"])
            self.thumbnailer.create_thumbnail(fspath, False, 0, small_fspath, None,
                                              ThumbnailType.SMALL_SQ)

            year_block["medium_thumbnail_path"] = "year/medium/%s" % ("%s.png" % (year))
            medium_fspath = self.__get_thumbnail_fs_path(year_block["medium_thumbnail_path"])
            self.thumbnailer.create_thumbnail(fspath, False, 0, medium_fspath, None,
                                              ThumbnailType.MEDIUM_SQ)

            year_block["events"].sort(key=lambda event: event["stats"]["min_date"], reverse=True)


        all_media["all_stats"]["total_filesize"] += self.__get_extra_paths_space_utilization()

        return all_media

    def __get_extra_paths_space_utilization(self):
        size = 0
        paths = []
        paths += self.add_paths_to_overall_diskspace
        paths.append(os.path.join(self.dest_thumbs_directory, "event"))
        paths.append(os.path.join(self.dest_thumbs_directory, "tag"))
        paths.append(os.path.join(self.dest_thumbs_directory, "year"))

        # HTML files aren't generated yet; use the previous copy and call it close enough
        paths.append(os.path.join(self.dest_directory, "event"))
        paths.append(os.path.join(self.dest_directory, "media"))
        paths.append(os.path.join(self.dest_directory, "tag"))
        paths.append(os.path.join(self.dest_directory, "year"))

        for path in paths:
            for root, _, filenames in os.walk(path):
                for filename in filenames:
                    path = os.path.join(root, filename)
                    size += os.path.getsize(path)

        return size

    def __get_year_candidate_composite_photos(self, all_media, year, events):
        ret = []

        # First try to see if there's enough events in the year. Use the primary photo
        # for each event.
        for event in events:
            if event["primary_source_id"] not in all_media["media_by_id"]:
                continue

            media = all_media["media_by_id"][event["primary_source_id"]]
            if media["year"] == year:
                ret.append(all_media["media_by_id"][event["primary_source_id"]])

        if len(ret) < 10:
            # If there's not enough events for the year, then use all photos to fill out
            # the thumbnail a little more.
            ret = []
            for event in events:
                for media in event["media"]:
                    if media["year"] == year:
                        ret.append(media)

        return ret

    def __fetch_media(self, all_media):
        # Download regular photos...
        qry = "SELECT event_id, id, filename, title, comment, filesize, exposure_time, " + \
              "time_created, rating, width, height, orientation, transformations " + \
              "FROM PhotoTable WHERE develop_embedded_id = -1 AND event_id != -1 AND " + \
              "rating >= 0 ORDER BY PhotoTable.exposure_time"
        cursor = self.conn.cursor()
        for row in cursor.execute(qry):
            self.__process_photo_row(all_media, row, None)

        if self.__does_table_exist("BackingPhotoTable"):
            # Now download RAW photos...
            qry = "SELECT PhotoTable.event_id, PhotoTable.id, " + \
                  "PhotoTable.filename as download_filename, " + \
                  "BackingPhotoTable.filepath AS filename, PhotoTable.title, " + \
                  "PhotoTable.comment, PhotoTable.filesize, PhotoTable.exposure_time, " + \
                  "PhotoTable.time_created, PhotoTable.rating, PhotoTable.width, " + \
                  "PhotoTable.height, PhotoTable.orientation, PhotoTable.transformations " + \
                  "FROM PhotoTable, BackingPhotoTable " + \
                  "WHERE PhotoTable.develop_embedded_id != -1 AND " + \
                  "BackingPhotoTable.id=PhotoTable.develop_embedded_id AND " + \
                  "PhotoTable.event_id != -1 AND PhotoTable.rating >= 0 " + \
                  "ORDER BY PhotoTable.exposure_time"
            cursor = self.conn.cursor()
            for row in cursor.execute(qry):
                self.__process_photo_row(all_media, row, row["download_filename"])

        if self.__does_table_exist("VideoTable"):
            qry = "SELECT event_id, id, filename, title, comment, filesize, exposure_time, " + \
                  "time_created, rating, clip_duration FROM VideoTable " + \
                  "WHERE event_id != -1 AND rating >= 0 " + \
                  "ORDER BY exposure_time"
            cursor = self.conn.cursor()
            for row in cursor.execute(qry):
                media_id = "video-%016x" % (row["id"])
                reg_short_mp_path = self.thumbnailer.create_animated_gif(row["filename"], media_id,
                                                                         0, None, None, None, None,
                                                                         ThumbnailType.REGULAR)
                large_short_mp_path = self.thumbnailer.create_animated_gif(row["filename"],
                                                                           media_id, 0, None,
                                                                           None, None, None,
                                                                           ThumbnailType.LARGE)
                small_short_mp_path = self.thumbnailer.create_animated_gif(row["filename"],
                                                                           media_id, 0, None,
                                                                           None, None, None,
                                                                           ThumbnailType.SMALL_SQ)
                medium_short_mp_path = self.thumbnailer.create_animated_gif(row["filename"],
                                                                            media_id, 0, None,
                                                                            None, None, None,
                                                                            ThumbnailType.MEDIUM_SQ)
                video = self.__transform_video(row["filename"])
                video_json = self.thumbnailer.write_video_json(video, media_id)
                media = self.__add_media(all_media, row, media_id, video, video, None, 0,
                                         self.icons.play, self.icons.play, self.icons.play_small,
                                         self.icons.play_medium, reg_short_mp_path,
                                         large_short_mp_path, small_short_mp_path,
                                         medium_short_mp_path, video_json)
                media["clip_duration"] = row["clip_duration"]

    def __process_photo_row(self, all_media, row, raw_download_source):
        # pylint: disable=too-many-locals,too-many-statements
        if row["orientation"] == 6:
            rotate = 90
        elif row["orientation"] == 3:
            rotate = 180
        elif row["orientation"] == 8:
            rotate = -90
        else:
            rotate = 0

        # Read the EXIV/XMP/IPTC metadata two separate times: the first using
        # python (and in turn libexiv2) since it provides a nice easy way to
        # retrieve various attributes (like shutter speed, GPS, etc).
        #
        # The second method is from the generated text file with all of the
        # metadata in text form. Some of the Android phones that support motion
        # photos write out the XMP metadata with a tag like
        # Xmp.Container.Directory[2]/Container:Item/Item:Length. However, some
        # photos get written out with the tag
        # Xmp.Container_1_.Directory[2]/Container_1_:Item/Item_1_:Length
        # instead. Unfortunately, libexiv2 has a bug somewhere where
        # you can't read successive photos from the two different XMP
        # namespaces after the library has been initialized. It'll either
        # read one or the other, depending on which one was read first. Reading
        # via a new process and reinitializing the library each time works
        # around the issue. So use the generated text files to generate the
        # animated GIFs and to extract the motion photos.
        exiv2_metadata = pyexiv2.ImageMetadata(row["filename"])
        exiv2_metadata.read()

        transformations = self.__parse_transformations(row["transformations"])

        media_id = "thumb%016x" % (row["id"])
        (metadata_text, exif_metadata) = self.thumbnailer.write_exif_txt(row["filename"], media_id)

        # Get the original shotwell image width/height and pass that to create_animated_gif()
        # since that's the pixel count that shotwell expects. Note that the width/height are
        # recalculted further down in this function.
        (width, height) = (row["width"], row["height"])
        if rotate in (90, -90):
            (width, height) = (height, width)

        reg_short_mp_path = self.thumbnailer.create_animated_gif(row["filename"], media_id,
                                                                 rotate, exif_metadata,
                                                                 transformations, width, height,
                                                                 ThumbnailType.REGULAR)
        large_short_mp_path = self.thumbnailer.create_animated_gif(row["filename"], media_id,
                                                                   rotate, exif_metadata,
                                                                   transformations, width, height,
                                                                   ThumbnailType.LARGE)
        small_short_mp_path = self.thumbnailer.create_animated_gif(row["filename"], media_id,
                                                                   rotate, exif_metadata,
                                                                   transformations, width, height,
                                                                   ThumbnailType.SMALL_SQ)
        medium_short_mp_path = self.thumbnailer.create_animated_gif(row["filename"], media_id,
                                                                    rotate, exif_metadata,
                                                                    transformations, width, height,
                                                                    ThumbnailType.MEDIUM_SQ)

        if raw_download_source is not None:
            reg_overlay_icon = self.icons.raw
            large_overlay_icon = self.icons.raw
            small_overlay_icon = None
            medium_overlay_icon = None
        elif reg_short_mp_path:
            reg_overlay_icon = self.icons.motion_photo
            large_overlay_icon = self.icons.motion_photo
            small_overlay_icon = None
            medium_overlay_icon = None
        elif row["width"] / row["height"] >= 2.0:
            reg_overlay_icon = None
            large_overlay_icon = self.icons.panorama
            small_overlay_icon = self.icons.panorama_small
            medium_overlay_icon = self.icons.panorama_small
        else:
            reg_overlay_icon = None
            large_overlay_icon = None
            small_overlay_icon = None
            medium_overlay_icon = None

        media = self.__add_media(all_media, row, media_id, raw_download_source, row["filename"],
                                 transformations, rotate, reg_overlay_icon,
                                 large_overlay_icon, small_overlay_icon, medium_overlay_icon,
                                 reg_short_mp_path, large_short_mp_path, small_short_mp_path,
                                 medium_short_mp_path, metadata_text)

        media.update(self.__parse_photo_exiv2_metadata(exiv2_metadata))

        # Photos can be cropped and Shotwell doesn't contain the cropped size. Look it up again.
        if media["filename"].startswith("transformed/"):
            (width, height) = self.__get_image_dimensions(media["filename_fullpath"])
            if rotate in (90, -90):
                (width, height) = (height, width)

        (media["width"], media["height"]) = (width, height)

        media["is_raw"] = raw_download_source is not None

    def __parse_transformations(self, transformations):
        if not transformations:
            return None

        ret = {}
        last_block = None
        for line in transformations.split("\n"):
            if not line:
                continue

            if line.startswith("["):
                last_block = line.replace("[", "").replace("]", "")
                continue

            parts = line.split("=")
            if last_block == "adjustments" and parts[1] == "0":
                continue

            ret["%s.%s" % (last_block, parts[0])] = parts[1]

        return ret

    def __fetch_events(self, all_media):
        qry = "SELECT id, name, comment, primary_source_id FROM EventTable"
        cursor = self.conn.cursor()
        for row in cursor.execute(qry):
            event = self.__get_event(row["id"], all_media)
            event["title"] = row["name"]
            event["comment"] = row["comment"]
            event["tags"] = []

            event["primary_source_id"] = row["primary_source_id"]
            if event["primary_source_id"] in all_media["media_by_id"]:
                all_media["media_by_id"][event["primary_source_id"]]["extra_rating"] += 1

            # Overall event thumbnail across all years
            dirhash = get_dir_hash(str(row["id"]))
            overall_thumbnail = self.__generate_event_thumbnail(dirhash, event, None)
            event["thumbnail_path"] = overall_thumbnail["thumbnail_path"]
            event["small_thumbnail_path"] = overall_thumbnail["small_thumbnail_path"]
            event["medium_thumbnail_path"] = overall_thumbnail["medium_thumbnail_path"]

            if len(event["years"]) == 1:
                # Event only spans one year, so use the already generated thumbnail.
                year = list(event["years"].keys())[0]
                event["years"][year] = overall_thumbnail
            else:
                # Each year gets its own event thumbnail
                for year in event["years"].keys():
                    event["years"][year] = self.__generate_event_thumbnail(dirhash, event, year)

        self.__fetch_event_max_dates(all_media)

    def __generate_event_thumbnail(self, dirhash, event, year):
        stats = self.__create_new_stats()

        candidate_media = []
        for media in event["media"]:
            if not year or media["year"] == year:
                candidate_media.append(media)
                self.__add_media_to_stats(stats, media)

        if not year:
            thumbnail_basename = "%d.png" % (event["id"])
            descr = "event %s (all years)" % (cleanup_event_title(event))
        else:
            thumbnail_basename = "%d_%s.png" % (event["id"], year)
            descr = "event %s, year %s" % (cleanup_event_title(event), year)

        thumbnail_path = "event/large/%s/%s" % (dirhash, thumbnail_basename)
        fspath = self.__get_thumbnail_fs_path(thumbnail_path)

        self.thumbnailer.create_composite_media_thumbnail(descr, candidate_media, fspath)

        small_thumbnail_path = "event/small/%s/%s" % (dirhash, thumbnail_basename)
        small_fspath = self.__get_thumbnail_fs_path(small_thumbnail_path)
        self.thumbnailer.create_thumbnail(fspath, False, 0, small_fspath, None,
                                          ThumbnailType.SMALL_SQ)

        medium_thumbnail_path = "event/medium/%s/%s" % (dirhash, thumbnail_basename)
        medium_fspath = self.__get_thumbnail_fs_path(medium_thumbnail_path)
        self.thumbnailer.create_thumbnail(fspath, False, 0, medium_fspath, None,
                                          ThumbnailType.MEDIUM_SQ)

        return {"thumbnail_path": thumbnail_path, "small_thumbnail_path": small_thumbnail_path,
                "medium_thumbnail_path": medium_thumbnail_path, "stats": stats}

    def __fetch_tags(self, all_media):
        # pylint: disable=too-many-locals
        tags_by_name = {}

        qry = "SELECT id, name, photo_id_list FROM TagTable WHERE photo_id_list != '' " + \
              "ORDER BY name"
        cursor = self.conn.cursor()
        for row in cursor.execute(qry):
            if row["name"] in self.tags_to_skip:
                continue

            tag = self.__create_event_or_tag(row["id"])
            tag["title"] = row["name"].split("/")[-1]
            tag["full_title"] = row["name"]
            tag["comment"] = None
            tag["media"] = []

            tag["parent_tag"] = None
            tag["child_tags"] = []
            if "/" in row["name"]:
                parent_tag = row["name"].rsplit("/", 1)[0]
                if parent_tag:
                    tag["parent_tag"] = tags_by_name[parent_tag]
                    tags_by_name[parent_tag]["child_tags"].append(tag)

            media_list = row["photo_id_list"].split(",")
            for media_id in media_list:
                if not media_id or media_id not in all_media["media_by_id"]:
                    continue

                media = all_media["media_by_id"][media_id]
                tag["media"].append(media)

                all_media["tags"].append(row["id"])
                all_media["media_by_id"][media["media_id"]]["tags"].add(row["id"])
                all_media["events_by_year"][media["year"]]["tags"].append(row["id"])
                all_media["events_by_id"][media["event_id"]]["tags"].append(row["id"])

                self.__add_media_to_stats(tag["stats"], media)

            thumbnail_basename = "%d.png" % (tag["id"])
            dir_shard = get_dir_hash(thumbnail_basename)
            tag["thumbnail_path"] = "tag/large/%s/%s" % (dir_shard, thumbnail_basename)
            fspath = self.__get_thumbnail_fs_path(tag["thumbnail_path"])
            self.thumbnailer.create_composite_media_thumbnail("tag %s" % (tag["full_title"]),
                                                              tag["media"], fspath)

            tag["small_thumbnail_path"] = "tag/small/%s/%s" % (dir_shard, thumbnail_basename)
            small_fspath = self.__get_thumbnail_fs_path(tag["small_thumbnail_path"])
            self.thumbnailer.create_thumbnail(fspath, False, 0, small_fspath, None,
                                              ThumbnailType.SMALL_SQ)

            tag["medium_thumbnail_path"] = "tag/medium/%s/%s" % (dir_shard, thumbnail_basename)
            medium_fspath = self.__get_thumbnail_fs_path(tag["medium_thumbnail_path"])
            self.thumbnailer.create_thumbnail(fspath, False, 0, medium_fspath, None,
                                              ThumbnailType.MEDIUM_SQ)

            all_media["tags_by_id"][row["id"]] = tag
            tags_by_name[row["name"]] = tag

    def __fetch_event_max_dates(self, all_media):
        qry = "SELECT EventTable.id, MAX(PhotoTable.exposure_time) AS max_date " + \
              "FROM PhotoTable, EventTable WHERE EventTable.id=PhotoTable.event_id " + \
              "GROUP BY EventTable.id"
        cursor = self.conn.cursor()
        for row in cursor.execute(qry):
            self.__populate_max_event_date(all_media["events_by_id"][row["id"]], row["max_date"])

        qry = "SELECT EventTable.id, MAX(VideoTable.exposure_time) AS max_date " + \
              "FROM VideoTable, EventTable WHERE EventTable.id=VideoTable.event_id " + \
              "GROUP BY EventTable.id"
        cursor = self.conn.cursor()
        for row in cursor.execute(qry):
            self.__populate_max_event_date(all_media["events_by_id"][row["id"]], row["max_date"])

    def __populate_max_event_date(self, event, date):
        if event["date"] is None:
            event["date"] = date
        else:
            event["date"] = max(event["date"], date)

    def __strip_path_prefix(self, path, prefix):
        if not prefix.endswith("/"):
            prefix += "/"

        return path.replace(prefix, "")

    def __get_html_basepath(self, path):
        if path.startswith(self.input_media_path):
            return "original/" + self.__strip_path_prefix(path, self.input_media_path)

        return "transformed/" + self.__strip_path_prefix(path, self.transformed_origs_directory)

    def __transform_img(self, source_image, transformations, thumbnail):
        transformed_path = os.path.join(self.transformed_origs_directory,
                                        self.__strip_path_prefix(source_image,
                                                                 self.input_media_path))
        return self.thumbnailer.transform_original_image(source_image, transformed_path,
                                                         transformations, thumbnail)

    def __transform_video(self, source_video):
        if not self.video_convert_ext or source_video.lower().endswith(self.video_convert_ext):
            return source_video

        part = self.__strip_path_prefix(source_video, self.input_media_path) + \
               "." + self.video_convert_ext

        transformed_path = os.path.join(self.transformed_origs_directory, part)
        return self.thumbnailer.transform_video(source_video, transformed_path)

    def __get_image_dimensions(self, infile):
        image = Image.open(infile)
        return image.size

    def __create_thumbnail(self, media, thumbnail_source, rotate, overlay_icon, thumbnail_type,
                           path_part):
        # pylint: disable=too-many-arguments
        fspath = self.__get_thumbnail_fs_path(path_part)
        self.thumbnailer.create_thumbnail(thumbnail_source, media["media_id"].startswith("video"),
                                          rotate, fspath, overlay_icon, thumbnail_type)
        return fspath

    def __add_media(self, all_media, row, media_id, download_source, thumbnail_source,
                    transformations, rotate, reg_overlay_icon, large_overlay_icon,
                    small_overlay_icon, medium_overlay_icon, reg_motion_photo,
                    large_motion_photo, small_motion_photo, medium_motion_photo, metadata_text):
        # pylint: disable=too-many-arguments,too-many-locals,too-many-statements
        media = {}
        media["id"] = row["id"]
        media["event_id"] = row["event_id"]
        media["media_id"] = media_id

        all_artifacts = set([])

        media["title"] = row["title"]
        media["comment"] = row["comment"]
        media["filesize"] = row["filesize"]

        media["exposure_time"] = row["exposure_time"]
        media["time_created"] = row["time_created"]
        date = datetime.datetime.fromtimestamp(row["exposure_time"])
        media["year"] = date.strftime("%Y")

        media["rating"] = row["rating"]
        # When generating composite thumbnails, give photos that are used as an event thumbnail in
        # Shotwell an extra star rating.
        media["extra_rating"] = 0

        media["tags"] = set([])

        dir_shard = get_dir_hash(media["media_id"])
        media["thumbnail_path"] = "media/large/%s/%s.png" % (dir_shard, media["media_id"])
        media["reg_thumbnail_path"] = "media/regular/%s/%s.jpg" % (dir_shard, media["media_id"])
        media["small_thumbnail_path"] = "media/small/%s/%s.jpg" % (dir_shard, media["media_id"])
        media["medium_thumbnail_path"] = "media/medium/%s/%s.jpg" % (dir_shard, media["media_id"])

        if download_source:
            all_artifacts.add(download_source)
            media["filename"] = self.__get_html_basepath(download_source)
            media["filename_fullpath"] = download_source
        else:
            # Overwrite the passed in thumbnail_source so that the transformed image is used
            # as the input image to generate the thumbnail.
            all_artifacts.add(thumbnail_source)
            thumbnail_source = self.__transform_img(thumbnail_source, transformations,
                                                    os.path.join(self.dest_thumbs_directory,
                                                                 media["thumbnail_path"]))
            all_artifacts.add(thumbnail_source)
            media["filename"] = self.__get_html_basepath(thumbnail_source)
            media["filename_fullpath"] = thumbnail_source

        reg_fspath = self.__create_thumbnail(media, thumbnail_source, rotate, reg_overlay_icon,
                                             ThumbnailType.REGULAR, media["reg_thumbnail_path"])
        all_artifacts.add(reg_fspath)
        media["reg_thumbnail_width"] = self.__get_image_dimensions(reg_fspath)[0]

        all_artifacts.add(self.__create_thumbnail(media, thumbnail_source, rotate,
                                                  large_overlay_icon, ThumbnailType.LARGE,
                                                  media["thumbnail_path"]))
        all_artifacts.add(self.__create_thumbnail(media, thumbnail_source, rotate,
                                                  small_overlay_icon, ThumbnailType.SMALL_SQ,
                                                  media["small_thumbnail_path"]))
        all_artifacts.add(self.__create_thumbnail(media, thumbnail_source, rotate,
                                                  medium_overlay_icon, ThumbnailType.MEDIUM_SQ,
                                                  media["medium_thumbnail_path"]))

        all_media["media_by_id"][media_id] = media

        for key, var in [("large_motion_photo", large_motion_photo),
                         ("small_motion_photo", small_motion_photo),
                         ("medium_motion_photo", medium_motion_photo),
                         ("reg_motion_photo", reg_motion_photo)]:
            media[key] = var
            if media[key]:
                if media[key][0]:
                    all_artifacts.add(os.path.join(self.dest_directory, media[key][0]))
                all_artifacts.add(os.path.join(self.dest_directory, media[key][1]))

        media["metadata_text"] = metadata_text
        if media["metadata_text"]:
            all_artifacts.add(os.path.join(self.dest_directory, media["metadata_text"]))

        event = self.__get_event(row["event_id"], all_media)
        event["media"].append(media)
        if media["year"] not in event["years"]:
            # Points to thumbnail for that year. Will be filled in later.
            event["years"][media["year"]] = None

        media["all_artifacts_size"] = 0
        for artifact in all_artifacts:
            media["all_artifacts_size"] += os.path.getsize(artifact)

        self.__add_media_to_stats(event["stats"], media)

        return media

    def __get_event(self, event_id, all_media):
        if event_id in all_media["events_by_id"]:
            return all_media["events_by_id"][event_id]

        event = self.__create_event_or_tag(event_id)
        event["years"] = {}
        event["date"] = None
        all_media["events_by_id"][event_id] = event

        return event

    def __create_event_or_tag(self, entity_id):
        return {"id": entity_id, "media_id": str(entity_id), "media": [],
                "stats": self.__create_new_stats()}

    def __create_new_stats(self):
        stats = {}
        stats["num_events"] = 0
        stats["num_photos"] = 0
        stats["num_videos"] = 0
        stats["total_filesize"] = 0
        stats["min_date"] = None
        stats["max_date"] = None
        return stats

    def __sum_stats(self, total_stats, stats):
        total_stats["num_photos"] += stats["num_photos"]
        total_stats["num_videos"] += stats["num_videos"]
        total_stats["total_filesize"] += stats["total_filesize"]
        add_date_to_stats(total_stats, stats["min_date"])
        add_date_to_stats(total_stats, stats["max_date"])

    def __add_media_to_stats(self, stats, media):
        num_media_stat = "num_videos" if media["media_id"].startswith("video") else "num_photos"
        stats[num_media_stat] += 1

        stats["total_filesize"] += media["all_artifacts_size"]

        if media["exposure_time"] != 0:
            add_date_to_stats(stats, media["exposure_time"])

    def __get_camera_transformations(self):
        camera_file = os.path.join(self.dest_directory, "cameras.csv")
        if not os.path.exists(camera_file):
            return {}

        logging.info('Using camera transformation file %s', camera_file)

        ret = {}
        with open(camera_file, "r", encoding="UTF-8") as csv_file:
            reader = csv.reader(csv_file)
            for row in reader:
                ret[row[0]] = row[1]

        return ret

    def __parse_photo_exiv2_metadata(self, exiv2_metadata):
        # pylint: disable=too-many-branches
        ret = {}
        ret["exif"] = []

        if "Exif.GPSInfo.GPSLatitude" in exiv2_metadata and \
           "Exif.GPSInfo.GPSLatitudeRef" in exiv2_metadata:
            lat = self.__convert_ddmmss(exiv2_metadata["Exif.GPSInfo.GPSLatitude"].value,
                                        exiv2_metadata["Exif.GPSInfo.GPSLatitudeRef"].value)
            lon = self.__convert_ddmmss(exiv2_metadata["Exif.GPSInfo.GPSLongitude"].value,
                                        exiv2_metadata["Exif.GPSInfo.GPSLongitudeRef"].value)
            if lat != 0.0 and lon != 0.0:
                ret["lat"] = lat
                ret["lon"] = lon

        aperture = exiv2_metadata.get_aperture()
        if aperture:
            ret["exif"].append("f/%.2f" % (aperture))

        shutter = exiv2_metadata.get_shutter_speed()
        if shutter:
            if shutter.denominator == 1:
                ret["exif"].append("%ds" % (shutter.numerator))
            else:
                ret["exif"].append("1/%ds" % (round(shutter.denominator / shutter.numerator)))

        focal_length = exiv2_metadata.get_focal_length()
        if focal_length:
            ret["exif"].append("%smm" % (focal_length))

        iso = exiv2_metadata.get_iso()
        if iso:
            ret["exif"].append("ISO%s" % (iso))

        if "Exif.Image.Make" in exiv2_metadata:
            camera_make = exiv2_metadata["Exif.Image.Make"].value.strip()
            camera_model = exiv2_metadata["Exif.Image.Model"].value.strip()

            if camera_make:
                if camera_model.startswith(camera_make):
                    camera = camera_model
                else:
                    camera = "%s %s" % (camera_make, camera_model)

                if camera in self.camera_transformations:
                    ret["camera"] = self.camera_transformations[camera]
                else:
                    ret["camera"] = camera

        return ret

    def __convert_ddmmss(self, ddmmss, direction):
        if not ddmmss:
            return None

        ret = float(ddmmss[0]) + float(ddmmss[1] / 60) + float(ddmmss[2] / 3600)
        if direction in ("W", "S"):
            ret = ret * -1

        return ret

    def __get_thumbnail_fs_path(self, relpath):
        return os.path.join(self.dest_thumbs_directory, relpath)

    def __does_table_exist(self, tablename):
        qry = "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?"
        cursor = self.conn.cursor()
        row = cursor.execute(qry, (tablename,))
        return next(row)[0] == 1
