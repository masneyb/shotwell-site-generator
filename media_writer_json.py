#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# Copyright (C) 2020-2021 Brian Masney <masneyb@onstation.org>
#
# Exports a JSON file with the contents a shotwell photo/video library.

import datetime
import os
import json
import humanize
from media_writer_common import CommonWriter

class Json(CommonWriter):
    # pylint: disable=too-few-public-methods
    def __init__(self, all_media, main_title, max_media_per_page, dest_directory,
                 years_prior_are_approximate, extra_header, version_label):
        # pylint: disable=too-many-arguments
        CommonWriter.__init__(self, all_media, main_title, max_media_per_page,
                              years_prior_are_approximate, extra_header, version_label)
        self.dest_directory = dest_directory

    def write(self):
        shown_media = []
        shown_events = []

        for event in self.all_media["events_by_id"].values():
            if not event["stats"]["min_date"]:
                continue

            item = self.__copy_fields(["title", "comment", "id", "date"], event)
            item["thumbnail"] = {"sq": "thumbnails/" + event["thumbnail_path"]}
            item["link"] = "event/%s.html" % (event["id"])
            item.update(self.__get_stats(event["stats"]))
            shown_events.append(item)

            for media in event["media"]:
                item = self.__copy_fields(["title", "comment", "event_id", "rating", "filesize",
                                           "camera", "exif", "width", "height", "id"], media)
                if "clip_duration" in media:
                    item["clip_duration"] = humanize.naturaldelta(int(media["clip_duration"]))
                    item["clip_duration_secs"] = int(media["clip_duration"])

                item["time_created"] = datetime.datetime.fromtimestamp(media["time_created"]) \
                                            .isoformat()
                item["exposure_time"] = datetime.datetime.fromtimestamp(media["exposure_time"]) \
                                            .isoformat()
                item["exposure_time_pretty"] = \
                    self._get_date_string(self._get_date_parts(media["exposure_time"]), True)
                item["link"] = media["filename"]

                item["thumbnail"] = {}
                item["thumbnail"]["sq"] = "thumbnails/" + media["thumbnail_path"]
                if "reg_thumbnail_path" in media:
                    item["thumbnail"]["reg"] = "thumbnails/" + media["reg_thumbnail_path"]
                    item["thumbnail"]["reg_width"] = media["reg_thumbnail_width"]

                item["tags"] = []
                for tag_id, _ in self._cleanup_tags(media["tags"]):
                    item["tags"].append(tag_id)

                item["type"] = self.__get_media_type(media)

                if "exif_text" in media and media["exif_text"]:
                    item["exif_text"] = media["exif_text"]

                if "sq_motion_photo" in media and media["sq_motion_photo"]:
                    item["motion_photo"] = {}
                    if media["sq_motion_photo"][0]:
                        item["motion_photo"]["mp4"] = media["sq_motion_photo"][0]

                    item["motion_photo"]["sq_gif"] = media["sq_motion_photo"][1]
                    item["motion_photo"]["reg_gif"] = media["reg_motion_photo"][1]

                if "lat" in media:
                    item["lat"] = float("%.5f" % (media["lat"]))
                    item["lon"] = float("%.5f" % (media["lon"]))

                shown_media.append(item)

        shown_events.sort(key=lambda event: event["date"], reverse=True)
        shown_media.sort(key=lambda media: media["exposure_time"], reverse=True)

        tags = self.__get_tags()
        years = self.__get_years()
        ret = {"title": self.main_title, "version_label": self.version_label,
               "generated_at": self.generated_at, "media": shown_media,
               "events": shown_events, "tags": tags, "years": years}

        if self.extra_header:
            ret['extra_header'] = {'description': self.extra_header[0],
                                   'link': self.extra_header[1]}

        self.__write_json_files(ret)

    def __get_media_type(self, media):
        if media["media_id"].startswith("thumb"):
            if media["is_raw"]:
                return "raw_photo"
            if "motion_photo" in media and media["motion_photo"]:
                return "motion_photo"

            return "photo"

        return "video"

    def __get_tags(self):
        shown_tags = []
        for tag in self.all_media["tags_by_id"].values():
            if not tag["stats"]["min_date"]:
                continue

            item = self.__copy_fields(["title", "full_title", "id"], tag)
            item["thumbnail"] = {"sq": "thumbnails/" + tag["thumbnail_path"]}
            item["link"] = "tag/%s.html" % (tag["id"])
            item.update(self.__get_stats(tag["stats"]))

            if tag["parent_tag"]:
                item["parent_tag_id"] = tag["parent_tag"]["id"]
            else:
                item["parent_tag_id"] = None

            shown_tags.append(item)

        shown_tags.sort(key=lambda tag: tag["full_title"])

        return shown_tags

    def __get_years(self):
        shown_years = []
        all_years = list(self.all_media["events_by_year"].keys())
        all_years.sort(reverse=True)
        for year in all_years:
            year_block = self.all_media["events_by_year"][year]

            item = {}
            item["id"] = year
            item["title"] = year
            item["link"] = "year/%s.html" % (year)
            item["thumbnail"] = {"sq": "thumbnails/%s" % (year_block["thumbnail_path"])}
            item["num_events"] = len(year_block["events"])
            item.update(self.__get_stats(year_block["stats"]))
            shown_years.append(item)

        shown_years.sort(key=lambda year: year["title"], reverse=True)

        return shown_years

    def __write_json_files(self, ret):
        # No part of the generated site reads this generated media.json file. Including here
        # for scripting purposes.
        with open(os.path.join(self.dest_directory, "media.json"), "w") as outfile:
            outfile.write(json.dumps(ret, indent="\t"))

        # Write out the media in an embedded Javascript file to work around browser mitigations
        # for CVE-2019-11730 so that the search/screensaver pages will work for file URIs.
        with open(os.path.join(self.dest_directory, "media.js"), "w") as outfile:
            outfile.write("var _allMedia = ")
            outfile.write(json.dumps(ret, indent=None))
            outfile.write(";\n")
            outfile.write("function getAllMediaViaJsFile() {\n")
            outfile.write("  // Perform deep copy\n")
            outfile.write("  return JSON.parse(JSON.stringify(_allMedia));\n")
            outfile.write("}\n")

    def __get_stats(self, stats):
        ret = self.__copy_fields(["num_photos", "num_videos"], stats)
        ret["filesize"] = stats["total_filesize"]
        ret["date_range"] = self._get_date_range(stats["min_date"], stats["max_date"])
        ret["min_date"] = datetime.datetime.fromtimestamp(stats["min_date"]).isoformat()
        ret["max_date"] = datetime.datetime.fromtimestamp(stats["max_date"]).isoformat()

        return ret

    def __copy_fields(self, copy_these_fields, source):
        item = {}
        for field in copy_these_fields:
            if field not in source:
                continue

            if isinstance(source[field], int) or source[field]:
                item[field] = source[field]

        return item
