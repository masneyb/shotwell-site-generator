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
import html
import os
from collections import Counter
import json
import dateutil.tz
import humanize
from common import add_date_to_stats, cleanup_event_title

YEAR_FRAME_SIZE = 4

class Html:
    # pylint: disable=too-many-instance-attributes
    def __init__(self, all_media, dest_directory, min_media_rating, all_media_ratings,
                 main_title, years_prior_are_approximate, main_page_extra_link,
                 main_page_extra_link_descr, max_media_per_page, expand_all_elements,
                 version_label):
        # pylint: disable=too-many-arguments
        self.all_media = all_media
        self.html_basedir = os.path.join(dest_directory, str(min_media_rating))
        self.min_media_rating = min_media_rating
        self.all_media_ratings = all_media_ratings
        self.main_title = main_title
        self.years_prior_are_approximate = years_prior_are_approximate
        self.main_page_extra_link = main_page_extra_link
        self.main_page_extra_link_descr = main_page_extra_link_descr
        self.max_media_per_page = max_media_per_page
        self.expand_all_elements = expand_all_elements
        self.version_label = version_label
        self.generated_at = datetime.datetime.now(dateutil.tz.tzlocal()) \
            .strftime("%B %-d, %Y %H:%M:%S %Z")

    def write_year_and_event_html_files(self, all_media_index):
        if not os.path.isdir(self.html_basedir):
            os.makedirs(self.html_basedir)

        # Generate the main index.html first with the years from newest to oldest.
        all_years = list(self.all_media["events_by_year"].keys())
        all_years.sort(reverse=True)

        shown_media = []
        for year in all_years:
            year_block = self.all_media["events_by_year"][year]
            if not self.__has_shown_media(year_block["stats"]):
                continue

            shown_media.append({"media": year_block, "link": "%s.html" % (year),
                                "thumbnail_path": year_block["thumbnail_path"],
                                "stats": year_block["stats"], "show_daterange": False})

        self.__write_media_html_files(["year", "index"], "%s: All Years" % (self.main_title),
                                      None, self.all_media["all_stats"], None, shown_media, None,
                                      None, None)

        # Now generate the individual year pages. Reverse the year list again so that the
        # breadcrumbs at the bottom of the generated year pages are correct.
        all_years.reverse()

        # FIXME - ugly hack: The generated pages for the years and events both link to each other.
        # The indexer is currently tied to when the HTML files are actually written. This needs to
        # be extracted out into another layer. For the mean time, write the year files first with
        # no event index, write the event files, then write out the year files a second time with
        # the event index. It's ugly, however the generated HTML files will be clean...
        all_year_index = self.__write_all_years(all_years, all_media_index, None)

        sorted_years = list(all_year_index.keys())
        sorted_years.sort()
        all_event_index = self.__write_event_html_files(all_media_index, all_year_index,
                                                        sorted_years)
        self.__write_event_index_file()

        # And now write all events a second time with the event index...
        self.__write_all_years(all_years, all_media_index, all_event_index)

    def __write_all_years(self, all_years, all_media_index, all_event_index):
        all_year_index = {}
        for current_year_index, year in enumerate(all_years):
            all_year_index[year] = self.__write_year_html_file(all_years, current_year_index,
                                                               all_media_index, all_event_index)

        return all_year_index

    def write_all_media_index_file(self):
        shown_media = []
        for event in self.all_media["events_by_id"].values():
            for media in event["media"]:
                relpath = "../../original/%s" % (media["filename"])
                shown_media.append({"media": media, "link": relpath,
                                    "thumbnail_path": media["thumbnail_path"],
                                    "stats": None, "show_daterange": True})

        shown_media.sort(key=lambda media: media["media"]["exposure_time"], reverse=True)

        all_media_index = {"year": {}, "event": {}}
        self.__write_media_html_files(["media", "index"], "%s: All Media" % (self.main_title),
                                      None, self.all_media["all_stats"], None, shown_media, None,
                                      self.__all_media_indexer, all_media_index)

        return all_media_index

    def __all_media_indexer(self, config, page_number, media_on_page):
        for media in media_on_page:
            if "exposure_time" not in media["media"] or media["media"]["exposure_time"] == 0:
                continue

            year = self.__get_date_parts(media["media"]["exposure_time"])["year"]
            if year not in config["year"]:
                config["year"][year] = {"page": page_number}

            if "event_id" in media["media"] and media["media"]["event_id"] not in config["event"]:
                config["event"][media["media"]["event_id"]] = {"page": page_number}

    def __all_event_indexer(self, config, page_number, media_on_page):
        for media in media_on_page:
            if media["media"]["event_id"] not in config:
                config[media["media"]["event_id"]] = {}

            year = self.__get_date_parts(media["media"]["exposure_time"])["year"]
            if year not in config[media["media"]["event_id"]]:
                config[media["media"]["event_id"]][year] = {"page": page_number}

    def __all_year_indexer(self, config, page_number, media_on_page):
        for media in media_on_page:
            config[media["media"]["id"]] = {"page": page_number}

    def write_tag_html_files(self):
        for tag in self.all_media["tags_by_id"].values():
            # Keep the child tags and the tagged media in separate lists since they have
            # separate sort criteria. The two lists are concatenated together.

            shown_tags = []
            for media in tag["child_tags"]:
                shown_tags.append({"media": media,
                                   "link": "%s.html" % (media["id"]),
                                   "thumbnail_path": media["thumbnail_path"],
                                   "stats": media["stats"], "show_daterange": True})

            shown_tags.sort(key=lambda media: media["media"]["title"])

            shown_media = []
            for media in tag["media"]:
                shown_media.append({"media": media,
                                    "link": "../../original/%s" % (media["filename"]),
                                    "thumbnail_path": media["thumbnail_path"],
                                    "stats": None, "show_daterange": False})

            shown_media.sort(key=lambda media: media["media"]["exposure_time"],
                             reverse=True)

            self.__write_media_html_files(["tag", str(tag["id"])], "Tag: %s" % (tag["title"]),
                                          None, tag["stats"], self.__get_tag_page_header_links(tag),
                                          shown_tags + shown_media, None, None, None)

        self.__write_tag_index_html_files()

    def __get_tag_page_header_links(self, tag):
        ret = ""

        links = []
        parent = tag["parent_tag"]
        while parent:
            links.append("<a href='../tag/%d.html'><span class='header_link'>%s</span></a>" % \
                         (parent["id"], html.escape(parent["title"])))
            parent = parent["parent_tag"]

        links.reverse()

        ret += self.__get_expandable_header_links("Tag Parents", links)

        ret += self.__get_tag_event_links(tag)

        return ret

    def __write_tag_index_html_files(self):
        shown_tags = []
        for tag in self.all_media["tags_by_id"].values():
            if tag["parent_tag"]:
                continue

            shown_tags.append({"media": tag,
                               "link": "%s.html" % (tag["id"]),
                               "thumbnail_path": tag["thumbnail_path"],
                               "stats": tag["stats"], "show_daterange": True})

        shown_tags.sort(key=lambda media: media["media"]["title"])

        self.__write_media_html_files(["tag", "index"], "%s: All Tags" % (self.main_title),
                                      None, self.all_media["all_stats"],
                                      self.__get_popular_tag_header_links(self.all_media["tags"]),
                                      shown_tags, None,
                                      None, None)

    def __write_main_view_links(self, output, current_view, show_current_link):
        output.write("<span class='main_views'>")

        views = [("media", "Date"), ("event", "Event"), ("year", "Year"), ("tag", "Tag")]
        for view in views:
            current = current_view == view[0]
            if current and not show_current_link:
                output.write("<span class='main_view main_view_selected'>%s</span>" % (view[1]))
            else:
                extra_css = " main_view_selected" if current and show_current_link else ""
                output.write("<span><a href='../%s/index.html'>" % (view[0]) + \
                             "<span class='main_view%s'>%s</span>" % (extra_css, view[1]) + \
                             "</a></span>")

        url_params = "min_time=%s&max_time=&photo_update_secs=10&db=%s/media.json" % \
                     (datetime.datetime.fromtimestamp(self.all_media["all_stats"]["min_date"]),
                      self.min_media_rating)
        output.write("<span><a href='../../screensaver.html?%s'>" % (url_params) + \
                     "<span class='main_view'>Screensaver</span>" + \
                     "</a></span>")

        if self.main_page_extra_link:
            output.write("<span><a href='%s'><span class='main_view'>%s</span></a></span>" % \
                         (self.main_page_extra_link, self.main_page_extra_link_descr))

        output.write("</span>")

    def __write_media_block(self, output, media, thumbnail_path, stats, link, show_daterange):
        # pylint: disable=too-many-arguments

        output.write("<span class='media'>")

        if "media_id" in media:
            output.write("<a name='%s' href='%s'>" % \
                         (html.escape(media["media_id"]), html.escape(link)))
        else:
            output.write("<a href='%s'>" % (html.escape(link)))

        output.write("<span class='media_thumb'><img src='../../thumbnails/%s'/></span>" % \
                     (html.escape(thumbnail_path)))

        output.write("</a>")

        if media["title"]:
            output.write(self.__get_expandable_string("title%s" % (media["media_id"]),
                                                      media["title"], "media_title"))

        if stats:
            output.write("<span class='media_stats'>%s</span>" % \
                         (self.__get_stats_description(stats)))

            if show_daterange:
                date_range = self.__get_date_range(stats["min_date"],
                                                   stats["max_date"])
                if date_range:
                    output.write("<span class='media_date'>%s</span>" % (html.escape(date_range)))

        if media["comment"]:
            output.write(self.__get_expandable_string("comment%s" % (media["id"]),
                                                      media["comment"], "media_comment"))

        self.__write_media_metadata(output, media)

        output.write("</span>")

    def __write_media_metadata(self, output, media):
        summary = []
        detailed = []

        if "exposure_time" in media and media["exposure_time"] != 0:
            summary.append(self.__get_date_string(self.__get_date_parts(media["exposure_time"])))

        if "filesize" in media and media["filesize"] > 0:
            summary.append(humanize.naturalsize(media["filesize"], binary=True).replace(" ", ""))

        if "clip_duration" in media:
            summary.append("%s" % (humanize.naturaldelta(int(media["clip_duration"]))))

        if "width" in media and media["width"]:
            detailed.append("%sx%s" % (media["width"], media["height"]))

        if "event_id" in media and media["event_id"]:
            title = cleanup_event_title(self.all_media["events_by_id"][media["event_id"]])
            detailed.append("<a href='../event/%d.html'>Event: %s</a>" % \
                            (media["event_id"], html.escape(title)))

        if "tags" in media and media["tags"]:
            for tag_id, tag_name in self.__cleanup_tags(media["tags"]):
                detailed.append("<a href='../tag/%d.html'>Tag: %s</a>" % \
                                (tag_id, html.escape(tag_name)))

        if "exif" in media:
            detailed = detailed + media["exif"]

        if "rating" in media:
            detailed.append(("&starf;" * media["rating"]) + ("&star;" * (5 - media["rating"])))

        if not summary:
            return

        sep = " &nbsp; "
        output.write(self.__get_expandable_element("meta%s" % (media["media_id"]),
                                                   sep.join(summary), sep.join(summary + detailed),
                                                   "media_metadata", "More"))

    def __write_ratings_dropdown(self, output, current_html_basename):
        output.write("<span class='media_ratings'>Photo Rating: ")
        output.write("<select onchange='location = this.options[this.selectedIndex].value;'>")

        joined_path = html.escape(os.path.join(*current_html_basename)) + ".html"
        for rating, description in self.all_media_ratings.items():
            extra = "selected='selected' " if rating == self.min_media_rating else ""
            output.write("<option %svalue='../../%d/%s'>%s</option>" % \
                         (extra, rating, joined_path, html.escape(description)))

        output.write("</select>")
        output.write("</span>")

    def __js_hide_show(self, hide_element, show_element):
        return "document.getElementById('%s').style.display='block'; " % (show_element) + \
               "document.getElementById('%s').style.display='none';" % (hide_element)

    def __get_expandable_string(self, name, value, span_class):
        value = value.strip()
        if len(value) < 60 and "\n" not in value:
            short_value = html.escape(value)
            long_value = None
        else:
            short_value = html.escape(value[0:50].strip() + "...")
            long_value = html.escape(value).replace("\n", "<br/>")

        return self.__get_expandable_element(name, short_value, long_value, span_class, "More",
                                             True)

    def __get_expandable_element(self, name, short_value, long_value, span_class, more_label,
                                 full_onclick=False):
        # pylint: disable=too-many-arguments,too-many-locals

        if not long_value or short_value == long_value:
            return "<span class='%s'>%s</span>" % (span_class, short_value)

        short_id = '%s_short' % (name)
        long_id = '%s_long' % (name)

        if self.expand_all_elements:
            short_display = "none"
            long_display = "block"
        else:
            short_display = "block"
            long_display = "none"

        if full_onclick:
            span_class += " clickable"
            short_outer_onclick = " onClick=\"%s\"" % (self.__js_hide_show(short_id, long_id))
            long_outer_onclick = " onClick=\"%s\"" % (self.__js_hide_show(long_id, short_id))

            short_inner_onclick = ""
            long_inner_onclick = ""
        else:
            short_outer_onclick = ""
            long_outer_onclick = ""

            short_inner_onclick = " onClick=\"%s\"" % (self.__js_hide_show(short_id, long_id))
            long_inner_onclick = " onClick=\"%s\"" % (self.__js_hide_show(long_id, short_id))

        ret = "<span id='%s' class='%s' style='display: %s;'%s>%s" % \
              (short_id, span_class, short_display, short_outer_onclick, short_value) + \
              " &nbsp; <span class='more_less'%s>%s</span>" % (short_inner_onclick, more_label) + \
              "</span>"

        ret += "<span id='%s' class='%s' style='display: %s;'%s>%s" % \
               (long_id, span_class, long_display, long_outer_onclick, long_value) + \
               " &nbsp; <span class='more_less'%s>Less</span>" % (long_inner_onclick) + \
               "</span>"

        return ret

    def __write_year_html_file(self, all_years, current_year_index, all_media_index,
                               all_event_index):
        year = all_years[current_year_index]
        year_block = self.all_media["events_by_year"][year]

        shown_media = []
        for event in year_block["events"]:
            if not self.__has_shown_media(year_block["stats"]) and self.min_media_rating > 0:
                continue

            # FIXME - not needed once indexer is extracted out into a separate layer
            if all_event_index:
                event_idx = all_event_index[event["id"]][year]
                link = self.__get_page_url_with_anchor(["event", str(event["id"])],
                                                       event_idx["page"])
            else:
                link = "../event/%s.html" % (event["id"])

            shown_media.append({"media": event, "link": link,
                                "thumbnail_path": event["years"][year]["thumbnail_path"],
                                "stats": event["years"][year]["stats"],
                                "show_daterange": True})

        breadcrumb_config = {}
        breadcrumb_config["current_index"] = current_year_index
        breadcrumb_config["all_items"] = all_years
        breadcrumb_config["to_html_label"] = str
        breadcrumb_config["to_html_filename"] = lambda year: "%s.html" % (year)

        all_year_index = {}
        self.__write_media_html_files(["year", str(year)], "Year: %s" % (year), None,
                                      year_block["stats"],
                                      self.__get_year_extra_links(all_media_index, year),
                                      shown_media, breadcrumb_config, self.__all_year_indexer,
                                      all_year_index)

        return all_year_index

    def __get_year_extra_links(self, all_media_index, year):
        ret = ""

        if year in all_media_index["year"]:
            ret += "<span class='header_links'>"
            ret += self.__get_all_media_link(all_media_index["year"][year], "year")
            ret += "</span>"

        ret += self.__get_popular_tag_header_links(self.all_media["events_by_year"][year]["tags"])


        return ret

    def __get_all_media_link(self, link, description):
        return "<a href='%s'>" % (self.__get_page_url_with_anchor(["media", "index"],
                                                                  link["page"])) + \
               "<span class='header_link'>Other media near this %s</span>" % (description) + \
               "</a>"

    def __write_event_index_file(self):
        shown_media = []
        for event in self.all_media["events_by_id"].values():
            if event["date"] is None or \
               (not self.__has_shown_media(event["stats"]) and self.min_media_rating > 0):
                continue

            shown_media.append({"media": event, "link": "%d.html" % (event["id"]),
                                "thumbnail_path": event["thumbnail_path"],
                                "stats": event["stats"], "show_daterange": True})

        shown_media.sort(key=lambda media: media["media"]["date"], reverse=True)

        self.__write_media_html_files(["event", "index"], "%s: All Events" % (self.main_title),
                                      None, self.all_media["all_stats"], None, shown_media, None,
                                      None, None)

    def __write_event_html_files(self, all_media_index, all_year_index, years):
        all_event_index = {}

        for event in self.all_media["events_by_id"].values():
            shown_media = []
            for media in event["media"]:
                relpath = "../../original/%s" % (media["filename"])
                shown_media.append({"media": media, "link": relpath,
                                    "thumbnail_path": media["thumbnail_path"],
                                    "stats": None, "show_daterange": True})

            self.__write_media_html_files(["event", str(event["id"])],
                                          "Event: %s" % (event["title"]), event["comment"],
                                          event["stats"],
                                          self.__get_event_extra_links(event, all_media_index,
                                                                       all_year_index, years),
                                          shown_media, None, self.__all_event_indexer,
                                          all_event_index)

        return all_event_index

    def __get_event_extra_links(self, event, all_media_index, all_year_index, years):
        ret = "<span class='header_links'>"

        if event["id"] in all_media_index["event"]:
            ret += self.__get_all_media_link(all_media_index["event"][event["id"]], "event")

        ret += "</span>"

        # FIXME - if statement not needed once indexer is extracted out into a separate layer
        if all_year_index:
            year_links = []
            for year in years:
                if not event["id"] in all_year_index[year]:
                    continue

                idx = all_year_index[year][event["id"]]
                link = self.__get_page_url_with_anchor(["year", year], idx["page"])
                year_links.append("<a href='%s'>" % (link) + \
                                  "<span class='header_link'>%s</span>" % (year) + \
                                  "</a>")

        ret += self.__get_expandable_header_links("Years with this event", year_links)

        ret += self.__get_popular_tag_header_links(event["tags"])

        return ret

    def __get_popular_tag_header_links(self, tags):
        if not tags:
            return ""

        cleaned_tags = {}
        for tag_id, tag_name in self.__cleanup_tags(tags):
            cleaned_tags[tag_id] = tag_name

        tag_counts = []
        tmp_tag_counts = [*Counter(tags).items()]
        for (tag_id, count) in tmp_tag_counts:
            if tag_id not in cleaned_tags:
                continue

            tag_counts.append((tag_id, cleaned_tags[tag_id], count))

        tag_counts.sort(key=lambda tag: (-tag[2], tag[1]))

        tag_links = []
        for tag in tag_counts[0:150]:
            tag_links.append("<a href='../tag/%d.html'><span class='header_link'>%s</span></a>" % \
                             (tag[0], html.escape(tag[1])))

        return self.__get_expandable_header_links("Popular Tags", tag_links)

    def __get_expandable_header_links(self, label, links):
        if not links:
            return ""

        if len(links) <= 11:
            return self.__get_expandable_element(label.replace(" ", "_").lower(),
                                                 "%s: %s" % (label, " ".join(links)), None,
                                                 "header_links", None)

        more_label = "+%s more" % (len(links) - 10)
        return self.__get_expandable_element(label.replace(" ", "_").lower(),
                                             "%s: %s" % (label, " ".join(links[0:10])),
                                             "%s: %s" % (label, " ".join(links)),
                                             "header_links", more_label)

    def __get_tag_event_links(self, tag):
        event_ids = set([])
        for media in tag["media"]:
            if media["event_id"] != -1:
                event_ids.add(media["event_id"])

        if not event_ids:
            return ""

        events = [self.all_media["events_by_id"][event_id] for event_id in event_ids]
        events.sort(key=lambda event: event["date"], reverse=True)

        event_links = []
        for event in events:
            event_links.append("<a href='../event/%d.html'>" % (event["id"]) + \
                               "<span class='header_link'>%s (%s)" % \
                               (html.escape(cleanup_event_title(event)),
                                self.__get_date_range(event["stats"]["min_date"],
                                                      event["stats"]["max_date"])) + \
                               "</span>" + \
                               "</a>")

        return self.__get_expandable_header_links("Events", event_links)

    def __write_breadcrumbs(self, output, breadcrumb_config):
        current_index = breadcrumb_config["current_index"]
        current_item = breadcrumb_config["all_items"][current_index]

        if current_index == 0:
            # At the first event of the year. Link to the last event of the previous year.
            if "previous_group" in breadcrumb_config:
                previous_item = breadcrumb_config["previous_group"]
            else:
                previous_item = None
        else:
            previous_item = breadcrumb_config["all_items"][current_index - 1]

        if current_index == len(breadcrumb_config["all_items"]) - 1:
            # At the last event of the year. Link to the first event of the next year.
            if "next_group" in breadcrumb_config:
                next_item = breadcrumb_config["next_group"]
            else:
                next_item = None
        else:
            next_item = breadcrumb_config["all_items"][current_index + 1]

        output.write("<span class='breadcrumbs'>")

        if previous_item:
            output.write("<span class='breadcrumb'><a href='%s'>&lt;&lt; %s</a></span>" % \
                         (html.escape(breadcrumb_config["to_html_filename"](previous_item)),
                          html.escape(breadcrumb_config["to_html_label"](previous_item))))

        output.write("<span class='jump_to_dropdown'>")
        output.write("<select onchange='location = this.options[this.selectedIndex].value;'>")
        for item in breadcrumb_config["all_items"]:
            extra = "selected='selected' " if current_item == item else ""
            output.write("<option %svalue='%s'>%s</option>" % \
                         (extra, html.escape(breadcrumb_config["to_html_filename"](item)),
                          html.escape(breadcrumb_config["to_html_label"](item))))

        output.write("</select>")
        output.write("</span>")

        if next_item:
            output.write("<span class='breadcrumb'><a href='%s'>%s &gt;&gt;</a></span>" % \
                         (html.escape(breadcrumb_config["to_html_filename"](next_item)),
                          html.escape(breadcrumb_config["to_html_label"](next_item))))

        output.write("</span>")

    def __write_media_html_files(self, current_page_link, title, comment, stats, extra_header,
                                 all_media, breadcrumb_config, media_indexer, media_index_config):
        # pylint: disable=too-many-arguments,too-many-locals

        # Split the media list up into multiple HTML files if needed. The first file will
        # be named like index.html, and additional pages will be index_2.html, index_3.html, etc.

        # Write out an empty file
        if len(all_media) == 0:
            media_chunks = [[]]
        else:
            media_chunks = list(self.__split_media_list_into_chunks(all_media))

        for index, media_on_page in enumerate(media_chunks):
            page_number = index + 1

            page_dates = {"min_date": None, "max_date": None}
            for media in media_on_page:
                if "exposure_time" in media["media"] and media["media"]["exposure_time"] != 0:
                    add_date_to_stats(page_dates, media["media"]["exposure_time"])

            page_date_range = self.__get_date_range(page_dates["min_date"],
                                                    page_dates["max_date"])

            output = self.__write_html_header(self.__get_page_url_parts(current_page_link,
                                                                        page_number),
                                              title, stats, page_date_range)

            if extra_header:
                output.write(extra_header)

            if comment:
                output.write(self.__get_expandable_string("titlecomment",
                                                          "Comment: %s" % (comment),
                                                          "event_comment"))

            self.__write_main_view_links(output, current_page_link[0],
                                         current_page_link[1] != "index" or page_number > 1)

            if len(media_chunks) > 1:
                self.__write_page_links(output, current_page_link, page_number, len(media_chunks))

            if media_indexer:
                media_indexer(media_index_config, page_number, media_on_page)

            for media in media_on_page:
                self.__write_media_block(output, media["media"], media["thumbnail_path"],
                                         media["stats"], media["link"], media["show_daterange"])

            if len(media_chunks) > 1:
                self.__write_page_links(output, current_page_link, page_number, len(media_chunks))

            if breadcrumb_config:
                self.__write_breadcrumbs(output, breadcrumb_config)

            self.__write_html_footer(output, current_page_link)

    def __write_page_link(self, output, current_page_link, condition, label, page_number):
        # pylint: disable=too-many-arguments

        if condition:
            output.write("<a href='%s.html'><span class='breadcrumb'>%s</span></a>" % \
                         (self.__get_page_url_parts(current_page_link, page_number)[-1], label))
        else:
            output.write("<span class='breadcrumb_inactive'>%s</span>" % (label))

    def __write_page_links(self, output, current_page_link, page_number, total_pages):
        output.write("<span class='breadcrumbs'>")

        if total_pages > 2:
            self.__write_page_link(output, current_page_link, page_number > 1, "|&lt;", 1)

        if total_pages > 25:
            self.__write_page_link(output, current_page_link, page_number > 10,
                                   "&lt;&lt;&lt;&lt;", page_number - 10)

        self.__write_page_link(output, current_page_link, page_number > 1, "&lt;&lt;",
                               page_number - 1)

        output.write("<span class='breadcrumb'>Page %s of %s</span>" % \
                     (humanize.intcomma(page_number), humanize.intcomma(total_pages)))

        self.__write_page_link(output, current_page_link, page_number < total_pages, "&gt;&gt;",
                               page_number + 1)

        if total_pages > 25:
            self.__write_page_link(output, current_page_link, page_number <= total_pages - 10,
                                   "&gt;&gt;&gt;&gt;", page_number + 10)

        if total_pages > 2:
            self.__write_page_link(output, current_page_link, page_number < total_pages, "&gt;|",
                                   total_pages)

        output.write("</span>")

    def __split_media_list_into_chunks(self, media):
        for i in range(0, len(media), self.max_media_per_page):
            yield media[i:i + self.max_media_per_page]

    def __get_page_url_parts(self, current_page_link, page_number):
        if page_number == 1:
            return current_page_link

        this_page = list(current_page_link)
        this_page[-1] += "_%d" % (page_number)

        return this_page

    def __get_page_url_with_anchor(self, current_page_link, page_number):
        current_page_link = self.__get_page_url_parts(current_page_link, page_number)
        return "../%s/%s.html" % (current_page_link[0], current_page_link[1])

    def __write_html_header(self, path_subparts, title, stats, page_date_range):
        # pylint: disable=too-many-arguments
        path = os.path.join(*[self.html_basedir, *path_subparts]) + ".html"

        parent_path = os.path.dirname(path)
        if not os.path.isdir(parent_path):
            os.makedirs(parent_path)

        output = open(path, "w", encoding="UTF-8")

        output.write("<html lang='en'>")
        output.write("<head>")
        output.write("<link rel='stylesheet' type='text/css' href='../../library.css'/>")
        output.write("<meta name='viewport' content='width=device-width'/>")
        output.write("<meta charset='UTF-8'/>")

        if title:
            output.write("<title>%s</title>" % (html.escape(title)))

        output.write("</head>")

        output.write("<body>")

        if title:
            output.write("<span class='page_title'>%s</span>" % (html.escape(title)))

        output.write("<span class='summary_stats'>%s</span>" % \
                     (self.__get_stats_description(stats)))

        date_range = self.__get_date_range(stats["min_date"], stats["max_date"])
        if date_range:
            if not page_date_range or page_date_range == date_range:
                output.write("<span class='date_range'>%s</span>" % (html.escape(date_range)))
            else:
                output.write("<span class='date_range'>%s (on this page)</span>" % \
                             (html.escape(page_date_range)))
                output.write("<span class='date_range'>%s (overall)</span>" % \
                             (html.escape(date_range)))

        return output

    def __write_html_footer(self, output, current_page):
        self.__write_ratings_dropdown(output, current_page)

        url = "https://github.com/masneyb/shotwell-site-generator"
        output.write("<span class='generated_at'>Site generated from " + \
                     "<a href='https://wiki.gnome.org/Apps/Shotwell'>Shotwell</a> " + \
                     "library at %s by <a href='%s'>shotwell-site-generator</a> %s.</span>" % \
                     (html.escape(self.generated_at), url, self.version_label))

        output.write("</body>")
        output.write("</html>")
        output.close()

    def __get_date_parts(self, timestamp):
        date = datetime.datetime.fromtimestamp(timestamp)
        if self.years_prior_are_approximate and date.year < int(self.years_prior_are_approximate):
            return {"year": str(date.year), "month": None, "day": None}

        return {"year": str(date.year), "month": date.strftime("%b"), "day": str(date.day)}

    def __get_date_string(self, date_parts):
        if date_parts["month"]:
            return "%s %s, %s" % (date_parts["month"], date_parts["day"], date_parts["year"])

        return date_parts["year"]

    def __get_date_range(self, min_timestamp, max_timestamp):
        if min_timestamp is None:
            return None

        min_parts = self.__get_date_parts(min_timestamp)
        max_parts = self.__get_date_parts(max_timestamp)

        if min_parts != max_parts and min_parts["month"]:
            if min_parts["year"] == max_parts["year"] and min_parts["month"] == max_parts["month"]:
                return "%s %s-%s, %s" % \
                       (min_parts["month"], min_parts["day"], max_parts["day"], min_parts["year"])

            if min_parts["year"] == max_parts["year"]:
                return "%s %s-%s %s, %s" % \
                       (min_parts["month"], min_parts["day"], max_parts["month"], max_parts["day"],
                        min_parts["year"])

        min_str = self.__get_date_string(min_parts)
        max_str = self.__get_date_string(max_parts)
        if min_str == max_str:
            return min_str

        return "%s to %s" % (min_str, max_str)

    def __get_stats_description(self, stats):
        ret = []
        if stats["num_photos"] > 0:
            if stats["num_photos"] == 1:
                ret.append("<span class='stat'>%d photo</span>" % (stats["num_photos"]))
            else:
                ret.append("<span class='stat'>%s photos</span>" % \
                           (humanize.intcomma(stats["num_photos"])))

        if stats["num_videos"] > 0:
            if stats["num_videos"] == 1:
                ret.append("<span class='stat'>%d video</span>" % (stats["num_videos"]))
            else:
                ret.append("<span class='stat'>%s videos</span>" % \
                           (humanize.intcomma(stats["num_videos"])))

        if stats["num_videos"] == 0 and stats["num_photos"] == 0:
            ret.append("<span class='stat'>No media fits the search criteria.</span>")

        if stats["total_filesize"] > 0:
            ret.append("<span class='stat'>%s</span>" % \
                       (humanize.naturalsize(stats["total_filesize"], binary=True)))

        return ", ".join(ret)

    def __cleanup_tags(self, taglist):
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

    def __has_shown_media(self, stats):
        return stats["num_photos"] > 0 or stats["num_videos"] > 0

COPY_MEDIA_FIELDS = ["thumbnail_path", "title", "comment", "media_id", "rating", "event_id"]

class Json:
    # pylint: disable=too-few-public-methods
    def __init__(self, all_media, dest_directory, min_media_rating):
        # pylint: disable=too-many-arguments
        self.all_media = all_media
        self.json_basedir = os.path.join(dest_directory, str(min_media_rating))

    def write(self):
        shown_media = []
        for event in self.all_media["events_by_id"].values():
            for media in event["media"]:
                item = {"link": "../original/%s" % (media["filename"])}
                for field in COPY_MEDIA_FIELDS:
                    if field in media and media[field] is not None:
                        item[field] = media[field]

                item["thumbnail_path"] = "../thumbnails/" + item["thumbnail_path"]
                item["exposure_time"] = datetime.datetime.fromtimestamp(media["exposure_time"]) \
                                            .isoformat()
                shown_media.append(item)

        shown_media.sort(key=lambda media: media["exposure_time"], reverse=True)

        ret = {"media": shown_media}

        with open(os.path.join(self.json_basedir, "media.json"), "w") as outfile:
            outfile.write(json.dumps(ret, indent="\t"))
