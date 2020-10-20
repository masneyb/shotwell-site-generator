#!/usr/bin/env python3

# Reads photos, videos, events, and tags from a Shotwell sqlite database.
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

import datetime
import hashlib
import logging
import os
import pyexiv2
from common import add_date_to_stats, cleanup_event_title

class Database:
    # pylint: disable=too-few-public-methods,too-many-instance-attributes
    def __init__(self, conn, input_media_path, input_thumbs_directory, dest_directory,
                 thumbnailer, tags_to_skip, video_convert_ext, panorama_icon, play_icon, raw_icon):
        # pylint: disable=too-many-arguments
        self.conn = conn
        self.input_media_path = input_media_path
        self.input_thumbs_directory = input_thumbs_directory
        self.dest_thumbs_directory = os.path.join(dest_directory, "thumbnails")
        self.transformed_origs_directory = os.path.join(dest_directory, "transformed")
        self.tags_to_skip = tags_to_skip
        self.thumbnailer = thumbnailer
        self.video_convert_ext = video_convert_ext
        self.panorama_icon = panorama_icon
        self.play_icon = play_icon
        self.raw_icon = raw_icon

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

                for media in event["media"]:
                    if media["year"] == year:
                        self.__add_media_to_stats(all_media["events_by_year"][year]["stats"], media)

            self.__sum_stats(all_media["all_stats"], event["stats"])

        self.__fetch_tags(all_media)

        thumbnail_basedir = os.path.join(self.dest_thumbs_directory, "year")
        if not os.path.isdir(thumbnail_basedir):
            os.makedirs(thumbnail_basedir)

        for year, year_block in all_media["events_by_year"].items():
            year_block["thumbnail_path"] = "year/%s" % ("%s.png" % (year))
            fspath = self.__get_thumbnail_fs_path(year_block["thumbnail_path"])
            candidate_photos = self.__get_year_candidate_composite_photos(all_media,
                                                                          year,
                                                                          year_block["events"])
            self.thumbnailer.create_composite_media_thumbnail("year %s" % (year),
                                                              candidate_photos, fspath)

            year_block["events"].sort(key=lambda event: event["stats"]["min_date"], reverse=True)

        return all_media

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
              "rating, width, height, orientation, transformations FROM PhotoTable " + \
              "WHERE develop_embedded_id = -1 AND event_id != -1 ORDER BY PhotoTable.exposure_time"
        cursor = self.conn.cursor()
        for row in cursor.execute(qry):
            self.__process_photo_row(all_media, row, None, False)

        if self.__does_table_exist("BackingPhotoTable"):
            # Now download RAW photos...
            qry = "SELECT PhotoTable.event_id, PhotoTable.id, " + \
                  "PhotoTable.filename as download_filename, " + \
                  "BackingPhotoTable.filepath AS filename, PhotoTable.title, " + \
                  "PhotoTable.comment, PhotoTable.filesize, PhotoTable.exposure_time, " + \
                  "PhotoTable.rating, PhotoTable.width, PhotoTable.height, " + \
                  "PhotoTable.orientation, PhotoTable.transformations " + \
                  "FROM PhotoTable, BackingPhotoTable " + \
                  "WHERE PhotoTable.develop_embedded_id != -1 AND " + \
                  "BackingPhotoTable.id=PhotoTable.develop_embedded_id AND " + \
                  "PhotoTable.event_id != -1 " + \
                  "ORDER BY PhotoTable.exposure_time"
            cursor = self.conn.cursor()
            for row in cursor.execute(qry):
                self.__process_photo_row(all_media, row, row["download_filename"], True)

        if self.__does_table_exist("VideoTable"):
            qry = "SELECT event_id, id, filename, title, comment, filesize, exposure_time, " + \
                  "rating, clip_duration FROM VideoTable WHERE event_id != -1 " + \
                  "ORDER BY exposure_time"
            cursor = self.conn.cursor()
            for row in cursor.execute(qry):
                media_id = "video-%016x" % (row["id"])
                media = self.__add_media(all_media, row, media_id, row["filename"], None, None, 0,
                                         self.play_icon)
                media["clip_duration"] = row["clip_duration"]

    def __process_photo_row(self, all_media, row, download_source, is_raw):
        if row["orientation"] == 6:
            rotate = 90
        elif row["orientation"] == 3:
            rotate = 180
        elif row["orientation"] == 8:
            rotate = -90
        else:
            rotate = 0

        if is_raw:
            overlay_icon = self.raw_icon
        elif row["width"] / row["height"] >= 2.0:
            overlay_icon = self.panorama_icon
        else:
            overlay_icon = None

        media_id = "thumb%016x" % (row["id"])
        media = self.__add_media(all_media, row, media_id, download_source, row["filename"],
                                 row["transformations"], rotate, overlay_icon)
        media["width"] = row["width"]
        media["height"] = row["height"]
        media["is_raw"] = is_raw
        media.update(self.__get_photo_metadata(row["filename"]))

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
            basedir = "event/%s" % (self.__get_dir_hash(str(row["id"])))
            overall_thumbnail = self.__generate_event_thumbnail(basedir, event, None)
            event["thumbnail_path"] = overall_thumbnail["thumbnail_path"]

            if len(event["years"]) == 1:
                # Event only spans one year, so use the already generated thumbnail.
                year = list(event["years"].keys())[0]
                event["years"][year] = overall_thumbnail
            else:
                # Each year gets its own event thumbnail
                for year in event["years"].keys():
                    event["years"][year] = self.__generate_event_thumbnail(basedir, event, year)

        self.__fetch_event_max_dates(all_media)

    def __generate_event_thumbnail(self, basedir, event, year):
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

        thumbnail_path = "%s/%s" % (basedir, thumbnail_basename)
        fspath = self.__get_thumbnail_fs_path(thumbnail_path)

        self.thumbnailer.create_composite_media_thumbnail(descr, candidate_media, fspath)

        return {"thumbnail_path": thumbnail_path, "stats": stats}

    def __fetch_tags(self, all_media):
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
            dir_shard = self.__get_dir_hash(thumbnail_basename)
            tag["thumbnail_path"] = "tag/%s/%s" % (dir_shard, thumbnail_basename)
            fspath = self.__get_thumbnail_fs_path(tag["thumbnail_path"])
            self.thumbnailer.create_composite_media_thumbnail("tag %s" % (tag["full_title"]),
                                                              tag["media"], fspath)

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
        parsed_transformations = self.__parse_transformations(transformations)
        transformed_path = os.path.join(self.transformed_origs_directory,
                                        self.__strip_path_prefix(source_image,
                                                                 self.input_media_path))
        return self.thumbnailer.transform_original_image(source_image, transformed_path,
                                                         parsed_transformations, thumbnail)

    def __transform_video(self, source_video):
        if not self.video_convert_ext or source_video.lower().endswith(self.video_convert_ext):
            return source_video

        part = self.__strip_path_prefix(source_video, self.input_media_path) + \
               "." + self.video_convert_ext

        transformed_path = os.path.join(self.transformed_origs_directory, part)
        return self.thumbnailer.transform_video(source_video, transformed_path)

    def __add_media(self, all_media, row, media_id, download_source, thumbnail_source,
                    transformations, rotate, overlay_icon):
        # pylint: disable=too-many-arguments

        media = {}
        media["id"] = row["id"]
        media["event_id"] = row["event_id"]
        media["media_id"] = media_id

        media["shotwell_thumbnail_path"] = self.__get_shotwell_thumbnail_path(media_id)
        dir_shard = self.__get_dir_hash(media_id)
        media["thumbnail_path"] = "media/%s/%s.png" % (dir_shard, media_id)

        if not thumbnail_source:
            thumbnail_source = media["shotwell_thumbnail_path"]

        if download_source:
            if media_id.startswith("video"):
                transformed_video = self.__transform_video(download_source)
                media["filename"] = self.__get_html_basepath(transformed_video)
            else:
                media["filename"] = self.__get_html_basepath(download_source)
        else:
            # Overwrite the passed in thumbnail_source so that the transformed image is used
            # as the input image to generate the thumbnail.
            thumbnail_source = self.__transform_img(thumbnail_source, transformations,
                                                    os.path.join(self.dest_thumbs_directory,
                                                                 media["thumbnail_path"]))
            media["filename"] = self.__get_html_basepath(thumbnail_source)

        media["title"] = row["title"]
        media["comment"] = row["comment"]
        media["filesize"] = row["filesize"]

        media["exposure_time"] = row["exposure_time"]
        date = datetime.datetime.fromtimestamp(row["exposure_time"])
        media["year"] = date.strftime("%Y")

        media["rating"] = row["rating"]
        # When generating composite thumbnails, give photos that are used as an event thumbnail in
        # Shotwell an extra star rating.
        media["extra_rating"] = 0

        media["tags"] = set([])

        fspath = self.__get_thumbnail_fs_path(media["thumbnail_path"])
        self.thumbnailer.create_rounded_and_square_thumbnail(thumbnail_source, rotate, fspath,
                                                             overlay_icon)

        all_media["media_by_id"][media_id] = media

        event = self.__get_event(row["event_id"], all_media)
        event["media"].append(media)
        if media["year"] not in event["years"]:
            # Points to thumbnail for that year. Will be filled in later.
            event["years"][media["year"]] = None

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

        stats["total_filesize"] += media["filesize"]

        fspath = self.__get_thumbnail_fs_path(media["thumbnail_path"])
        if os.path.exists(fspath):
            stats["total_filesize"] += os.path.getsize(fspath)

        if media["exposure_time"] != 0:
            add_date_to_stats(stats, media["exposure_time"])

    def __get_photo_metadata(self, filename):
        metadata = pyexiv2.ImageMetadata(filename)
        metadata.read()

        ret = {}
        ret["exif"] = []

        if "Exif.GPSInfo.GPSLatitude" in metadata and \
           "Exif.GPSInfo.GPSLatitudeRef" in metadata:
            lat = self.__convert_ddmmss(metadata["Exif.GPSInfo.GPSLatitude"].value,
                                        metadata["Exif.GPSInfo.GPSLatitudeRef"].value)
            lon = self.__convert_ddmmss(metadata["Exif.GPSInfo.GPSLongitude"].value,
                                        metadata["Exif.GPSInfo.GPSLongitudeRef"].value)
            if lat != 0.0 and lon != 0.0:
                ret["lat"] = lat
                ret["lon"] = lon

        aperture = metadata.get_aperture()
        if aperture:
            ret["exif"].append("F%.1f" % (aperture))

        shutter = metadata.get_shutter_speed()
        if shutter:
            if shutter.denominator == 1:
                ret["exif"].append("%ds" % (shutter.numerator))
            else:
                ret["exif"].append("1/%ds" % (round(shutter.denominator / shutter.numerator)))

        iso = metadata.get_iso()
        if iso:
            ret["exif"].append("ISO%s" % (iso))

        focal_length = metadata.get_focal_length()
        if focal_length:
            ret["exif"].append("%smm" % (focal_length))

        if "Exif.Image.Make" in metadata:
            camera_make = metadata["Exif.Image.Make"].value.strip()
            camera_model = metadata["Exif.Image.Model"].value.strip()

            if camera_make:
                if camera_model.startswith(camera_make):
                    ret["camera"] = camera_model
                else:
                    ret["camera"] = "%s %s" % (camera_make, camera_model)

        return ret

    def __convert_ddmmss(self, ddmmss, direction):
        if not ddmmss:
            return None

        ret = float(ddmmss[0]) + float(ddmmss[1] / 60) + float(ddmmss[2] / 3600)
        if direction in ("W", "S"):
            ret = ret * -1

        return ret

    def __get_dir_hash(self, basename):
        return hashlib.sha1(basename.encode('UTF-8')).hexdigest()[0:2]

    def __get_shotwell_thumbnail_path(self, source_image_basename):
        # The source_image_basename does not have a file extension so try some variants.
        path = os.path.join(self.input_thumbs_directory, "%s.jpg" % (source_image_basename))
        if not os.path.exists(path):
            path = os.path.join(self.input_thumbs_directory, "%s.png" % (source_image_basename))

        return path

    def __get_thumbnail_fs_path(self, relpath):
        return os.path.join(self.dest_thumbs_directory, relpath)

    def __does_table_exist(self, tablename):
        qry = "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?"
        cursor = self.conn.cursor()
        row = cursor.execute(qry, (tablename,))
        return next(row)[0] == 1
