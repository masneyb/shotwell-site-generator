#!/usr/bin/env python3

# Exports a JSON file with the contents a shotwell photo/video library.
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
import os
import json
import humanize
from media_writer_common import CommonWriter

class Json(CommonWriter):
    # pylint: disable=too-few-public-methods
    def __init__(self, all_media, main_title, max_media_per_page, dest_directory,
                 years_prior_are_approximate, version_label):
        # pylint: disable=too-many-arguments
        CommonWriter.__init__(self, all_media, main_title, max_media_per_page,
                              years_prior_are_approximate, version_label)
        self.dest_directory = dest_directory

    def write(self):
        shown_media = []
        shown_events = []
        all_media_index = self.__get_all_media_index()

        for event in self.all_media["events_by_id"].values():
            if not event["stats"]["min_date"]:
                continue

            item = self.__copy_fields(["title", "comment", "id", "date"], event)
            item["thumbnail_path"] = "thumbnails/" + event["thumbnail_path"]
            item["link"] = "event/%s.html" % (event["id"])
            item.update(self.__get_stats(event["stats"]))
            shown_events.append(item)

            for media in event["media"]:
                item = self.__copy_fields(["title", "comment", "event_id", "rating", "filesize",
                                           "camera", "exif", "width", "height", "id"], media)
                if "clip_duration" in media:
                    item["clip_duration"] = humanize.naturaldelta(int(media["clip_duration"]))
                    item["clip_duration_secs"] = int(media["clip_duration"])

                item["exposure_time"] = datetime.datetime.fromtimestamp(media["exposure_time"]) \
                                            .isoformat()
                item["exposure_time_pretty"] = \
                    self._get_date_string(self._get_date_parts(media["exposure_time"]))
                item["link"] = media["filename"]
                item["thumbnail_path"] = "thumbnails/" + media["thumbnail_path"]
                item["tags"] = []
                for tag_id, _ in self._cleanup_tags(media["tags"]):
                    item["tags"].append(tag_id)

                if media["media_id"].startswith("thumb"):
                    item["type"] = "raw_photo" if media["is_raw"] else "photo"
                else:
                    item["type"] = "video"

                item["all_media_page"] = all_media_index["media"][media["media_id"]]["page"]

                if "lat" in media:
                    item["lat"] = float("%.5f" % (media["lat"]))
                    item["lon"] = float("%.5f" % (media["lon"]))

                shown_media.append(item)

        shown_tags = []

        for tag in self.all_media["tags_by_id"].values():
            if not tag["stats"]["min_date"]:
                continue

            item = self.__copy_fields(["title", "full_title", "id"], tag)
            item["thumbnail_path"] = "thumbnails/" + tag["thumbnail_path"]
            item["link"] = "tag/%s.html" % (tag["id"])
            item.update(self.__get_stats(tag["stats"]))

            if tag["parent_tag"]:
                item["parent_tag_id"] = tag["parent_tag"]["id"]
            else:
                item["parent_tag_id"] = None

            shown_tags.append(item)

        shown_events.sort(key=lambda event: event["date"], reverse=True)
        shown_media.sort(key=lambda media: media["exposure_time"], reverse=True)
        shown_tags.sort(key=lambda tag: tag["full_title"])

        ret = {"title": self.main_title, "version_label": self.version_label,
               "generated_at": self.generated_at, "media": shown_media,
               "events": shown_events, "tags": shown_tags}

        self.__write_json_files(ret)

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

    def __get_all_media_index(self):
        shown_media = []
        for event in self.all_media["events_by_id"].values():
            for media in event["media"]:
                shown_media.append({"media": media})

        shown_media.sort(key=lambda media: media["media"]["exposure_time"], reverse=True)

        all_media_index = {"year": {}, "event": {}, "media": {}}
        self._generate_media_index(shown_media, self._all_media_indexer, all_media_index)

        return all_media_index

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
