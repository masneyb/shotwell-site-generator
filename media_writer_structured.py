#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0
# Copyright (C) 2020-2024 Brian Masney <masneyb@onstation.org>
#
# Exports a JSON file with the contents a shotwell photo/video library.

import csv
import datetime
import json
import os
import geojson
import humanize
from media_writer_common import CommonWriter

def write_column(media, colname, _event_names, _tag_names):
    return media[colname] if colname in media else ''

class Structured(CommonWriter):
    def __init__(self, all_media, main_title, max_media_per_page, dest_directory,
                 years_prior_are_approximate, extra_header, version_label):
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

            item["thumbnail"] = {}
            item["thumbnail"]["small"] = "thumbnails/" + event["small_thumbnail_path"]
            item["thumbnail"]["medium"] = "thumbnails/" + event["medium_thumbnail_path"]
            item["thumbnail"]["large"] = "thumbnails/" + event["thumbnail_path"]

            item["link"] = "event/%s.html" % (event["id"])
            item.update(self.__get_stats(event["stats"]))
            item.update(self.__add_year_blocks(event))
            shown_events.append(item)

            for media in event["media"]:
                item = self.__create_media_element(media)
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

        event_names = {event['id']: event['title'] for event in shown_events}
        tag_names = {tag['id']: tag['title'] for tag in tags}
        self.__write_json_files(ret)
        self.__write_csv_file(ret, event_names, tag_names)
        self.__write_geojson_file(ret, event_names, tag_names)

    def __create_media_element(self, media):
        item = self.__copy_fields(["title", "comment", "event_id", "rating", "filesize",
                                   "fps", "camera", "exif", "width", "height", "id", "media_id"],
                                  media)
        item["artifact_filesize"] = media["all_artifacts_size"]

        item["type"] = self._get_media_type(media)

        if "width" in media and item["type"] != "video":
            item["megapixels"] = float("%.1f" % \
                                       ((media["width"] * media["height"]) / (1000 * 1000)))

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
        item["thumbnail"]["small"] = "thumbnails/" + media["small_thumbnail_path"]
        item["thumbnail"]["medium"] = "thumbnails/" + media["medium_thumbnail_path"]
        item["thumbnail"]["large"] = "thumbnails/" + media["thumbnail_path"]
        if "reg_thumbnail_path" in media:
            item["thumbnail"]["reg"] = "thumbnails/" + media["reg_thumbnail_path"]
            item["thumbnail"]["reg_width"] = media["reg_thumbnail_width"]

        item["tags"] = []
        for tag_id, _ in self._cleanup_tags(media["tags"]):
            item["tags"].append(tag_id)

        if "metadata_text" in media and media["metadata_text"]:
            item["metadata_text"] = media["metadata_text"]

        if "large_motion_photo" in media and media["large_motion_photo"]:
            item["motion_photo"] = {}
            if media["large_motion_photo"][0]:
                item["motion_photo"]["mp4"] = media["large_motion_photo"][0]

            item["motion_photo"]["small_gif"] = media["small_motion_photo"][1]
            item["motion_photo"]["medium_gif"] = media["medium_motion_photo"][1]
            item["motion_photo"]["large_gif"] = media["large_motion_photo"][1]
            item["motion_photo"]["reg_gif"] = media["reg_motion_photo"][1]

        if "lat" in media:
            item["lat"] = float("%.6f" % (media["lat"]))
            item["lon"] = float("%.6f" % (media["lon"]))

        return item

    def __add_year_blocks(self, event):
        if len(event["years"]) <= 1:
            return {}

        ret = {"years": []}
        for year in event["years"]:
            year_block = {}
            year_block["year"] = year

            year_block["thumbnail"] = {}
            year_block["thumbnail"]["small"] = "thumbnails/" + \
                                               event["years"][year]["small_thumbnail_path"]
            year_block["thumbnail"]["medium"] = "thumbnails/" + \
                                                event["years"][year]["medium_thumbnail_path"]
            year_block["thumbnail"]["large"] = \
                "thumbnails/" + event["years"][year]["thumbnail_path"]

            year_block.update(self.__get_stats(event["years"][year]["stats"]))
            ret["years"].append(year_block)

        return ret

    def __get_tags(self):
        shown_tags = []
        for tag in self.all_media["tags_by_id"].values():
            if not tag["stats"]["min_date"]:
                continue

            item = self.__copy_fields(["title", "full_title", "id"], tag)

            item["thumbnail"] = {}
            item["thumbnail"]["small"] = "thumbnails/" + tag["small_thumbnail_path"]
            item["thumbnail"]["medium"] = "thumbnails/" + tag["medium_thumbnail_path"]
            item["thumbnail"]["large"] = "thumbnails/" + tag["thumbnail_path"]

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

            item["thumbnail"] = {}
            item["thumbnail"]["small"] = "thumbnails/%s" % (year_block["small_thumbnail_path"])
            item["thumbnail"]["medium"] = "thumbnails/%s" % (year_block["medium_thumbnail_path"])
            item["thumbnail"]["large"] = "thumbnails/%s" % (year_block["thumbnail_path"])

            item["num_events"] = len(year_block["events"])
            item.update(self.__get_stats(year_block["stats"]))
            shown_years.append(item)

        shown_years.sort(key=lambda year: year["title"], reverse=True)

        return shown_years

    csv_cols = [('media_id', write_column),
                ('title', write_column),
                ('comment', write_column),
                ('link', write_column),
                ('type', write_column),
                ('filesize', write_column),
                ('width', write_column),
                ('height', write_column),
                ('camera', write_column),
                ('megapixels', write_column),
                ('fps', write_column),
                ('clip_duration', write_column),
                ('clip_duration_secs', write_column),
                ('rating', write_column),
                ('lat', write_column),
                ('lon', write_column),
                ('exif',
                    lambda media, _colname, _event_names, _tag_names:
                        ' '.join(media['exif'] if 'exif' in media else '')),
                ('time_created', write_column),
                ('exposure_time', write_column),
                ('exposure_time_pretty', write_column),
                ('metadata_text', write_column),
                ('reg_thumbnail',
                    lambda media, _colname, _event_names, _tag_names: media['thumbnail']['reg']),
                ('reg_motion_photo',
                    lambda media, _colname, _event_names, _tag_names:
                        media['motion_photo']['reg_gif'] if 'motion_photo' in media else ''),
                ('event_id', write_column),
                ('event_name',
                    lambda media, _colname, event_names, _tag_names:
                        event_names[media['event_id']]),
                ('tag_id',
                    lambda media, _colname, _event_names, tag_names:
                        ', '.join(str(tag_id) for tag_id in media['tags'])),
                ('tags',
                    lambda media, _colname, _event_names, tag_names:
                        ', '.join(tag_names[tag_id] for tag_id in media['tags']))]

    def __write_csv_file(self, ret, event_names, tag_names):
        with open(os.path.join(self.dest_directory, "media.csv"), "w", encoding="UTF-8") as outfile:
            csv_writer = csv.writer(outfile)
            row = []
            for col in self.csv_cols:
                row.append(col[0])
            csv_writer.writerow(row)

            for media in ret['media']:
                row = []
                for col in self.csv_cols:
                    row.append(col[1](media, col[0], event_names, tag_names))
                csv_writer.writerow(row)

    def __write_geojson_file(self, ret, event_names, tag_names):
        features = []

        for media in ret['media']:
            if 'lat' not in media:
                continue

            row = {}
            for col in self.csv_cols:
                if col[0] in ('lat', 'lon'):
                    continue

                value = col[1](media, col[0], event_names, tag_names)
                if value != "":
                    row[col[0]] = value

            point = geojson.Point((media['lon'], media['lat']))
            features.append(geojson.Feature(geometry=point, properties=row))

        feature_collection = geojson.FeatureCollection(features)
        with open(os.path.join(self.dest_directory, "media.geojson"), "w",
                  encoding="UTF-8") as f:
            geojson.dump(feature_collection, f)

    def __write_json_files(self, ret):
        # No part of the generated site reads this generated media.json file. Including here
        # for scripting purposes.
        with open(os.path.join(self.dest_directory, "media.json"), "w",
                  encoding="UTF-8") as outfile:
            outfile.write(json.dumps(ret, indent="\t"))

        # Write out the media in an embedded Javascript file to work around browser mitigations
        # for CVE-2019-11730 so that the search page will work for file URIs.
        with open(os.path.join(self.dest_directory, "media.js"), "w", encoding="UTF-8") as outfile:
            outfile.write("const _allMedia = ")
            outfile.write(json.dumps(ret, indent=None))
            outfile.write(";\n")
            outfile.write("function getAllMediaViaJsFile() {\n")
            outfile.write("  return _allMedia;\n")
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
