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

import datetime
import hashlib
import logging
import os
import pyexiv2
from common import add_date_to_stats

class Database:
    # pylint: disable=too-few-public-methods,too-many-instance-attributes
    def __init__(self, conn, input_media_path, input_thumbs_directory, dest_thumbs_directory,
                 thumbnailer, tags_to_skip, panorama_icon, play_icon, raw_icon):
        # pylint: disable=too-many-arguments
        self.conn = conn
        self.input_media_path = input_media_path
        self.input_thumbs_directory = input_thumbs_directory
        self.dest_thumbs_directory = dest_thumbs_directory
        self.tags_to_skip = tags_to_skip
        self.thumbnailer = thumbnailer
        self.panorama_icon = panorama_icon
        self.play_icon = play_icon
        self.raw_icon = raw_icon

    def get_all_media(self, min_rating):
        all_media = {"events_by_year": {}, "all_stats": self.__create_new_stats(),
                     "events_by_id": {}, "media_by_id": {}, "tags_by_id": {}}

        self.__fetch_media(all_media, min_rating)
        self.__fetch_events(all_media)
        self.__fetch_tags(all_media)

        for event in all_media["events_by_id"].values():
            if event["date"] is None:
                logging.warning("Ignoring event id %d with no media.", event["id"])
                continue

            event["media"].sort(key=lambda media: media["exposure_time"])

            if event["id"] == -1:
                year = ""
                year_title = "No Event"
            else:
                date = datetime.datetime.fromtimestamp(event["date"])
                year = year_title = date.strftime("%Y")

            if year not in all_media["events_by_year"]:
                all_media["events_by_year"][year] = {}
                all_media["events_by_year"][year]["media_id"] = str(year)
                all_media["events_by_year"][year]["title"] = year_title
                all_media["events_by_year"][year]["comment"] = None
                all_media["events_by_year"][year]["events"] = []
                all_media["events_by_year"][year]["stats"] = self.__create_new_stats()

            all_media["events_by_year"][year]["events"].append(event)
            self.__sum_stats(all_media["events_by_year"][year]["stats"], event["stats"])
            self.__sum_stats(all_media["all_stats"], event["stats"])

        thumbnail_basedir = os.path.join(self.dest_thumbs_directory, "year")
        if not os.path.isdir(thumbnail_basedir):
            os.makedirs(thumbnail_basedir)

        for year, year_block in all_media["events_by_year"].items():
            year_block["thumbnail_path"] = "year/%s" % ("%s.png" % (year))
            fspath = self.__get_thumbnail_fs_path(year_block["thumbnail_path"])
            candidate_photos = self._get_year_candidate_composite_photos(all_media,
                                                                         year_block["events"])
            self.thumbnailer.create_composite_media_thumbnail(candidate_photos, fspath)

            year_block["events"].sort(key=lambda event: event["date"])

        return all_media

    def _get_year_candidate_composite_photos(self, all_media, events):
        ret = []

        # First try to see if there's enough events in the year. Use the primary photo
        # for each event.
        for event in events:
            if event["primary_source_id"] not in all_media["media_by_id"]:
                continue

            ret.append(all_media["media_by_id"][event["primary_source_id"]])

        if len(ret) < 10:
            # If there's not enough events for the year, then use all photos to fill out
            # the thumbnail a little more.
            ret = []
            for event in events:
                ret = ret + event["media"]

        return ret

    def __fetch_media(self, all_media, min_rating):
        # Download regular photos...
        qry = "SELECT event_id, id, filename, title, comment, filesize, exposure_time, " + \
              "rating, width, height, orientation FROM PhotoTable " + \
              "WHERE rating >= ? AND develop_embedded_id = -1 " + \
              "ORDER BY PhotoTable.exposure_time"
        cursor = self.conn.cursor()
        for row in cursor.execute(qry, str(min_rating)):
            self.__process_photo_row(all_media, row, row["filename"], False)

        if self.__does_table_exist("BackingPhotoTable"):
            # Now download RAW photos...
            qry = "SELECT PhotoTable.event_id, PhotoTable.id, " + \
                  "PhotoTable.filename as download_filename, " + \
                  "BackingPhotoTable.filepath AS filename, PhotoTable.title, " + \
                  "PhotoTable.comment, PhotoTable.filesize, PhotoTable.exposure_time, " + \
                  "PhotoTable.rating, PhotoTable.width, PhotoTable.height, " + \
                  "PhotoTable.orientation FROM PhotoTable, BackingPhotoTable " + \
                  "WHERE PhotoTable.rating >= ? AND PhotoTable.develop_embedded_id != -1 AND " + \
                  "BackingPhotoTable.id=PhotoTable.develop_embedded_id " + \
                  "ORDER BY PhotoTable.exposure_time"
            cursor = self.conn.cursor()
            for row in cursor.execute(qry, str(min_rating)):
                self.__process_photo_row(all_media, row, row["download_filename"], True)

        if self.__does_table_exist("VideoTable"):
            qry = "SELECT event_id, id, filename, title, comment, filesize, exposure_time, " + \
                  "rating, clip_duration FROM VideoTable WHERE rating >= ? ORDER BY exposure_time"
            cursor = self.conn.cursor()
            for row in cursor.execute(qry, str(min_rating)):
                media_id = "video-%016x" % (row["id"])
                media = self.__add_media(all_media, row, media_id, "num_videos", row["filename"],
                                         None, 0, self.play_icon)
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
        media = self.__add_media(all_media, row, media_id, "num_photos", download_source,
                                 row["filename"], rotate, overlay_icon)
        media["exif"] = self.__get_photo_metadata(row["filename"])
        media["width"] = row["width"]
        media["height"] = row["height"]

    def __fetch_events(self, all_media):
        qry = "SELECT id, name, comment, primary_source_id FROM EventTable"
        cursor = self.conn.cursor()
        for row in cursor.execute(qry):
            if row["id"] not in all_media["events_by_id"]:
                all_media["events_by_id"][row["id"]] = self.__create_event_or_tag(row["id"])

            event = all_media["events_by_id"][row["id"]]
            event["title"] = row["name"]
            event["comment"] = row["comment"]
            event["primary_source_id"] = row["primary_source_id"]
            event["tags"] = set([])

            thumbnail_basename = "%d.png" % (row["id"])
            dir_shard = self.__get_dir_hash(thumbnail_basename)
            event["thumbnail_path"] = "event/%s/%s" % (dir_shard, thumbnail_basename)
            fspath = self.__get_thumbnail_fs_path(event["thumbnail_path"])
            self.thumbnailer.create_composite_media_thumbnail(event["media"], fspath)

        self.__fetch_event_max_dates(all_media)

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

            tag["long_title"] = row["name"]
            if tag["long_title"].startswith("/"):
                tag["long_title"] = tag["long_title"][1:].replace("/", " > ")

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

                all_media["media_by_id"][media["media_id"]]["tags"].add((row["id"], row["name"]))
                all_media["events_by_id"][media["event_id"]]["tags"].add((row["id"], row["name"]))

                num_media_stat = "num_videos" if media_id.startswith("video") else "num_photos"
                self.__add_media_to_stats(tag["stats"], num_media_stat, media)

            thumbnail_basename = "%d.png" % (tag["id"])
            dir_shard = self.__get_dir_hash(thumbnail_basename)
            tag["thumbnail_path"] = "tag/%s/%s" % (dir_shard, thumbnail_basename)
            fspath = self.__get_thumbnail_fs_path(tag["thumbnail_path"])
            self.thumbnailer.create_composite_media_thumbnail(tag["media"], fspath)

            all_media["tags_by_id"][row["id"]] = tag
            tags_by_name[row["name"]] = tag

    def __fetch_event_max_dates(self, all_media):
        # Ensure that events are sorted consistently across all of the different rating views
        # by fetching the maximum dates from the photo and video tables.

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

    def __add_media(self, all_media, row, media_id, num_media_stat, download_source,
                    thumbnail_source, rotate, overlay_icon):
        # pylint: disable=too-many-arguments

        media = {}
        media["id"] = row["id"]
        media["event_id"] = row["event_id"]
        media["media_id"] = media_id
        media["filename"] = download_source.replace(self.input_media_path, "")
        media["title"] = row["title"]
        media["comment"] = row["comment"]
        media["filesize"] = row["filesize"]
        media["exposure_time"] = row["exposure_time"]
        media["rating"] = row["rating"]
        media["tags"] = set([])
        media["shotwell_thumbnail_path"] = self.__get_shotwell_thumbnail_path(media_id)

        if not thumbnail_source:
            thumbnail_source = media["shotwell_thumbnail_path"]

        dir_shard = self.__get_dir_hash(media_id)
        media["thumbnail_path"] = "media/%s/%s.png" % (dir_shard, media_id)
        fspath = self.__get_thumbnail_fs_path(media["thumbnail_path"])
        self.thumbnailer.create_rounded_and_square_thumbnail(thumbnail_source, rotate, fspath,
                                                             overlay_icon)

        all_media["media_by_id"][media_id] = media

        if row["event_id"] not in all_media["events_by_id"]:
            all_media["events_by_id"][row["event_id"]] = self.__create_event_or_tag(row["event_id"])

        event = all_media["events_by_id"][row["event_id"]]
        event["media"].append(media)
        self.__add_media_to_stats(event["stats"], num_media_stat, media)

        return media

    def __create_event_or_tag(self, entity_id):
        return {"id": entity_id, "media_id": str(entity_id), "date": None, "media": [],
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

    def __add_media_to_stats(self, stats, num_media_stat, media):
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

        ret = []
        if "Exif.GPSInfo.GPSLatitude" in metadata and \
           "Exif.GPSInfo.GPSLatitudeRef" in metadata:
            lat = self.__convert_ddmmss(metadata["Exif.GPSInfo.GPSLatitude"].value,
                                        metadata["Exif.GPSInfo.GPSLatitudeRef"].value)
            lon = self.__convert_ddmmss(metadata["Exif.GPSInfo.GPSLongitude"].value,
                                        metadata["Exif.GPSInfo.GPSLongitudeRef"].value)
            ret.append("GPS %.5f,%.5f" % (lat, lon))

        aperture = metadata.get_aperture()
        if aperture:
            ret.append("F%.1f" % (aperture))

        shutter = metadata.get_shutter_speed()
        if shutter:
            if shutter.denominator == 1:
                ret.append("%ds" % (shutter.numerator))
            else:
                ret.append("1/%ds" % (round(shutter.denominator / shutter.numerator)))

        iso = metadata.get_iso()
        if iso:
            ret.append("ISO%s" % (iso))

        focal_length = metadata.get_focal_length()
        if focal_length:
            ret.append("%smm" % (focal_length))

        if "Exif.Image.Make" in metadata:
            ret.append("%s %s" % (metadata["Exif.Image.Make"].value,
                                  metadata["Exif.Image.Model"].value))

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
