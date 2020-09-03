#!/usr/bin/env python3

# Functions that are common to writing out media for the JSON and HTML views.
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
import dateutil.tz

class CommonWriter:
    # pylint: disable=too-few-public-methods

    def __init__(self, all_media, main_title, max_media_per_page, years_prior_are_approximate,
                 version_label):
        # pylint: disable=too-many-arguments

        self.all_media = all_media
        self.main_title = main_title
        self.max_media_per_page = max_media_per_page
        self.years_prior_are_approximate = years_prior_are_approximate
        self.version_label = version_label
        self.generated_at = datetime.datetime.now(dateutil.tz.tzlocal()) \
            .strftime("%B %-d, %Y %H:%M:%S %Z")

    def _get_date_parts(self, timestamp):
        date = datetime.datetime.fromtimestamp(timestamp)
        if self.years_prior_are_approximate and date.year < int(self.years_prior_are_approximate):
            return {"year": str(date.year), "month": None, "day": None}

        return {"year": str(date.year), "month": date.strftime("%b"), "day": str(date.day)}

    def _get_date_string(self, date_parts):
        if date_parts["month"]:
            return "%s %s, %s" % (date_parts["month"], date_parts["day"], date_parts["year"])

        return date_parts["year"]

    def _get_date_range(self, min_timestamp, max_timestamp):
        if min_timestamp is None:
            return None

        min_parts = self._get_date_parts(min_timestamp)
        max_parts = self._get_date_parts(max_timestamp)

        if min_parts != max_parts and min_parts["month"]:
            if min_parts["year"] == max_parts["year"] and min_parts["month"] == max_parts["month"]:
                return "%s %s-%s, %s" % \
                       (min_parts["month"], min_parts["day"], max_parts["day"], min_parts["year"])

            if min_parts["year"] == max_parts["year"]:
                return "%s %s-%s %s, %s" % \
                       (min_parts["month"], min_parts["day"], max_parts["month"], max_parts["day"],
                        min_parts["year"])

        min_str = self._get_date_string(min_parts)
        max_str = self._get_date_string(max_parts)
        if min_str == max_str:
            return min_str

        return "%s to %s" % (min_str, max_str)

    def _cleanup_tags(self, taglist):
        # Cleanup nested tags. For example, ['/Places', '/Places/WV'] becomes ['WV']
        tags_to_remove = set([])
        all_tags = set(taglist)
        tag_name_to_id = {}

        for tag_id in all_tags:
            tag_name = self.all_media["tags_by_id"][tag_id]["full_title"]
            if not tag_name.startswith("/"):
                continue

            tag_name_to_id[tag_name] = tag_id
            tag_parts = tag_name.split("/")
            if len(tag_parts) == 2:
                continue

            tags_to_remove.add("/".join(tag_parts[0:-1]))

        for tag_name in tags_to_remove:
            tag_id = tag_name_to_id[tag_name]
            all_tags.remove(tag_id)

        ret = [(tag_id, self.all_media["tags_by_id"][tag_id]["title"]) for tag_id in all_tags]
        ret.sort(key=lambda tag: tag[1])

        return ret

    def _generate_media_index(self, all_media, media_indexer, media_index_config):
        if not all_media:
            return

        media_chunks = list(self._split_media_list_into_chunks(all_media))
        for index, media_on_page in enumerate(media_chunks):
            media_indexer(media_index_config, index + 1, media_on_page)

    def _split_media_list_into_chunks(self, media):
        for i in range(0, len(media), self.max_media_per_page):
            yield media[i:i + self.max_media_per_page]

    def _all_media_indexer(self, config, page_number, media_on_page):
        for media in media_on_page:
            if "exposure_time" not in media["media"] or media["media"]["exposure_time"] == 0:
                continue

            year = self._get_date_parts(media["media"]["exposure_time"])["year"]
            if year not in config["year"]:
                config["year"][year] = {"page": page_number}

            if "event_id" in media["media"] and media["media"]["event_id"] not in config["event"]:
                config["event"][media["media"]["event_id"]] = {"page": page_number}

            config["media"][media["media"]["media_id"]] = {"page": page_number}
