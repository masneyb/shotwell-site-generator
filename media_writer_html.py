#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
# Copyright (C) 2020-2021 Brian Masney <masneyb@onstation.org>
#
# Exports a static HTML view of your shotwell photo/video library.

import html
import os
from collections import Counter
import urllib.parse
import humanize
import common
from media_writer_common import CommonWriter

class Html(CommonWriter):
    # pylint: disable=too-many-instance-attributes
    def __init__(self, all_media, dest_directory, main_title, years_prior_are_approximate,
                 max_media_per_page, expand_all_elements, extra_header, version_label,
                 remove_stale_artifacts):
        # pylint: disable=too-many-arguments
        CommonWriter.__init__(self, all_media, main_title, max_media_per_page,
                              years_prior_are_approximate, extra_header, version_label)
        self.html_basedir = dest_directory
        self.expand_all_elements = expand_all_elements
        self.remove_stale_artifacts = remove_stale_artifacts
        self.generated_artifacts = set([])

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
                                      None, self.all_media["all_stats"], None, shown_media, None)

        # Now generate the individual year pages. Reverse the year list again so that the
        # breadcrumbs at the bottom of the generated year pages are correct.
        all_years.reverse()

        all_year_index = self.__generate_all_years_index(all_years)
        sorted_years = list(all_year_index.keys())
        sorted_years.sort()

        all_event_index = self.__write_event_html_files(all_media_index, all_year_index,
                                                        sorted_years)
        self.__write_event_index_file()

        # And now write all events a second time with the event index...
        self.__write_all_years(all_years, all_media_index, all_event_index)

    def __generate_all_years_index(self, all_years):
        all_year_index = {}
        for year in all_years:
            year_block = self.all_media["events_by_year"][year]

            shown_media = []
            for event in year_block["events"]:
                shown_media.append(event)

            all_year_index[year] = {}
            self._generate_media_index(shown_media, self.__all_year_indexer, all_year_index[year])

        return all_year_index

    def __write_all_years(self, all_years, all_media_index, all_event_index):
        for current_year_index, _ in enumerate(all_years):
            self.__write_year_html_file(all_years, current_year_index, all_media_index,
                                        all_event_index)

    def write_all_media_index_file(self):
        shown_media = []
        for event in self.all_media["events_by_id"].values():
            for media in event["media"]:
                relpath = "../%s" % (media["filename"])
                shown_media.append({"media": media, "link": relpath,
                                    "thumbnail_path": media["thumbnail_path"],
                                    "stats": None, "show_daterange": True})

        shown_media.sort(key=lambda media: media["media"]["exposure_time"], reverse=True)

        self.__write_media_html_files(["media", "index"], "%s: All Media" % (self.main_title),
                                      None, self.all_media["all_stats"], None, shown_media, None)

        all_media_index = {"year": {}, "event": {}, "media": {}}
        self._generate_media_index(shown_media, self._all_media_indexer, all_media_index)

        return all_media_index

    def __all_event_indexer(self, config, page_number, media_on_page):
        for media in media_on_page:
            if media["media"]["event_id"] not in config:
                config[media["media"]["event_id"]] = {}

            year = self._get_date_parts(media["media"]["exposure_time"])["year"]
            if year not in config[media["media"]["event_id"]]:
                config[media["media"]["event_id"]][year] = {"page": page_number}

    def __all_year_indexer(self, config, page_number, media_on_page):
        for media in media_on_page:
            config[media["id"]] = {"page": page_number}

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
                                    "link": "../%s" % (media["filename"]),
                                    "thumbnail_path": media["thumbnail_path"],
                                    "stats": None, "show_daterange": False})

            shown_media.sort(key=lambda media: media["media"]["exposure_time"],
                             reverse=True)

            self.__write_media_html_files(["tag", str(tag["id"])], "Tag: %s" % (tag["title"]),
                                          None, tag["stats"], self.__get_tag_page_header_links(tag),
                                          shown_tags + shown_media, None)

        self.__write_tag_index_html_files()

    def __get_tag_page_header_links(self, tag):
        links = []
        parent = tag["parent_tag"]
        while parent:
            links.append("<a href='../tag/%d.html'><span class='header_link'>%s</span></a>" % \
                         (parent["id"], html.escape(parent["title"])))
            parent = parent["parent_tag"]

        links.reverse()

        ret = "<span class='header_links'>"

        ret += self.__get_search_element("Tag ID", tag["id"])

        if not links:
            ret += "</span>"
        elif len(links) <= 11:
            ret += " · Parents: " + " · ".join(links)
            ret += "</span>"
        else:
            ret += "</span>"
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
                                      shown_tags, None)

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

        if self.extra_header:
            output.write("<span><a href='../%s'><span class='main_view'>%s</span></a></span>" % \
                         (self.extra_header[1], self.extra_header[0]))

        output.write("<span><a href='../search.html#'>" + \
                     "<span class='main_view'>Search</span>" + \
                     "</a></span>")

        output.write("</span>")

    def __write_media_block(self, output, media, thumbnail_path, stats, link, show_daterange):
        # pylint: disable=too-many-arguments

        output.write("<span class='media'>")

        if "media_id" in media:
            output.write("<a name='%s' href='%s'>" % \
                         (html.escape(media["media_id"]), html.escape(link)))
        else:
            output.write("<a href='%s'>" % (html.escape(link)))

        thumbnail = '../thumbnails/%s' % (html.escape(thumbnail_path))
        if "motion_photo" in media and media["motion_photo"]:
            motion_photo = '../%s' % (html.escape(media["motion_photo"][1]))
            output.write(("<span class='media_thumb'>"
                          f"<img onMouseOver='this.src=\"{motion_photo}\"'"
                          f" onMouseLeave='this.src=\"{thumbnail}\"'"
                          f" onTouchStart='this.src=\"{motion_photo}\"'"
                          f" onTouchEnd='this.src=\"{thumbnail}\"'"
                          f" src='{thumbnail}'/></span>"))
        else:
            output.write("<span class='media_thumb'><img src='%s'/></span>" % (thumbnail))

        output.write("</a>")

        if media["title"]:
            output.write(self.__get_expandable_string("title%s" % (media["media_id"]),
                                                      media["title"], "media_title"))

        if stats:
            if show_daterange:
                date_range = self._get_date_range(stats["min_date"], stats["max_date"])
            else:
                date_range = None

            output.write("<span class='media_metadata'>%s</span>" %
                         (self.__get_stats_description(stats, date_range, None)))

        if media["comment"]:
            output.write(self.__get_expandable_string("comment%s" % (media["id"]),
                                                      media["comment"], "media_comment"))

        self.__write_media_metadata(output, media)

        output.write("</span>")

    def __write_media_metadata(self, output, media):
        # pylint: disable=too-many-branches
        summary = []
        detailed = []

        if "exposure_time" in media and media["exposure_time"] != 0:
            summary.append(self._get_date_string(self._get_date_parts(media["exposure_time"])))

        if "filesize" in media and media["filesize"] > 0:
            summary.append(humanize.naturalsize(media["filesize"], binary=True).replace(" ", ""))

        if "clip_duration" in media:
            summary.append(humanize.naturaldelta(int(media["clip_duration"])))

        if "motion_photo" in media and media["motion_photo"] and media["motion_photo"][0]:
            summary.append("<a target='_new' href='../%s'>Motion Photo</a>" %
                           (media["motion_photo"][0]))

        if "width" in media and media["width"]:
            detailed.append("%sx%s" % (media["width"], media["height"]))

        if "event_id" in media and media["event_id"]:
            title = common.cleanup_event_title(self.all_media["events_by_id"][media["event_id"]])
            detailed.append("<a href='../event/%d.html'>Event: %s</a>" % \
                            (media["event_id"], html.escape(title)))

        if "tags" in media and media["tags"]:
            for tag_id, tag_name in self._cleanup_tags(media["tags"]):
                detailed.append("<a href='../tag/%d.html'>Tag: %s</a>" % \
                                (tag_id, html.escape(tag_name)))

        if "lat" in media:
            search = "%s,%s,%.5f,%.5f,0.1" % \
                     ("GPS Coordinate", "is within", media["lat"], media["lon"])
            detailed.append("<a href='../search.html?search=%s'>GPS %.5f,%.5f</a>" % \
                            (urllib.parse.quote(search), media["lat"], media["lon"]))

        if "exif" in media:
            detailed += media["exif"]

        if "camera" in media:
            detailed.append("<a href='../search.html?search=%s'>%s</a>" % \
                            (urllib.parse.quote("Camera,equals,%s" % (media["camera"])),
                             media["camera"]))

        if "exif_text" in media and media["exif_text"]:
            detailed.append("<a target='_new' href='../%s'>EXIF</a>" % (media["exif_text"]))

        if "rating" in media:
            detailed.append(("&starf;" * media["rating"]) + ("&star;" * (5 - media["rating"])))

        if not summary:
            return

        sep = " · "
        output.write(self.__get_expandable_element("meta%s" % (media["media_id"]),
                                                   sep.join(summary), sep.join(summary + detailed),
                                                   "media_metadata", "More"))

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
              " · <span class='more_less'%s>%s</span>" % (short_inner_onclick, more_label) + \
              "</span>"

        ret += "<span id='%s' class='%s' style='display: %s;'%s>%s" % \
               (long_id, span_class, long_display, long_outer_onclick, long_value) + \
               " · <span class='more_less'%s>Less</span>" % (long_inner_onclick) + \
               "</span>"

        return ret

    def __write_year_html_file(self, all_years, current_year_index, all_media_index,
                               all_event_index):
        year = all_years[current_year_index]
        year_block = self.all_media["events_by_year"][year]

        shown_media = []
        for event in year_block["events"]:
            event_idx = all_event_index[event["id"]][year]
            link = self.__get_page_url_with_anchor(["event", str(event["id"])],
                                                   event_idx["page"])

            shown_media.append({"media": event, "link": link,
                                "thumbnail_path": event["years"][year]["thumbnail_path"],
                                "stats": event["years"][year]["stats"],
                                "show_daterange": True})

        breadcrumb_config = {}
        breadcrumb_config["current_index"] = current_year_index
        breadcrumb_config["all_items"] = all_years
        breadcrumb_config["to_html_label"] = str
        breadcrumb_config["to_html_filename"] = lambda year: "%s.html" % (year)

        self.__write_media_html_files(["year", str(year)], "Year: %s" % (year), None,
                                      year_block["stats"],
                                      self.__get_year_extra_links(all_media_index, year),
                                      shown_media, breadcrumb_config)

    def __get_year_extra_links(self, all_media_index, year):
        ret = ""

        if year in all_media_index["year"]:
            ret += "<span class='header_links'>"
            ret += self.__get_all_media_link(all_media_index["year"][year])
            ret += "</span>"

        ret += self.__get_popular_tag_header_links(self.all_media["events_by_year"][year]["tags"])

        return ret

    def __get_all_media_link(self, link):
        return "<a href='%s'>" % (self.__get_page_url_with_anchor(["media", "index"],
                                                                  link["page"])) + \
               "<span class='header_link'>Nearby Media</span>" + \
               "</a>"

    def __get_search_element(self, search_field, search_val):
        search = html.escape("%s,equals,%s" % (search_field, search_val))
        return "<a href='../search.html?search=%s'>" % (search) + \
               "<span class='header_link'>Search</span>" + \
               "</a>"

    def __write_event_index_file(self):
        shown_media = []
        for event in self.all_media["events_by_id"].values():
            if event["date"] is None:
                continue

            shown_media.append({"media": event, "link": "%d.html" % (event["id"]),
                                "thumbnail_path": event["thumbnail_path"],
                                "stats": event["stats"], "show_daterange": True})

        shown_media.sort(key=lambda media: media["media"]["date"], reverse=True)

        self.__write_media_html_files(["event", "index"], "%s: All Events" % (self.main_title),
                                      None, self.all_media["all_stats"], None, shown_media, None)

    def __write_event_html_files(self, all_media_index, all_year_index, years):
        all_event_index = {}

        for event in self.all_media["events_by_id"].values():
            shown_media = []
            for media in event["media"]:
                relpath = "../%s" % (media["filename"])
                shown_media.append({"media": media, "link": relpath,
                                    "thumbnail_path": media["thumbnail_path"],
                                    "stats": None, "show_daterange": True})

            self.__write_media_html_files(["event", str(event["id"])],
                                          "Event: %s" % (event["title"]), event["comment"],
                                          event["stats"],
                                          self.__get_event_extra_links(event, all_media_index,
                                                                       all_year_index, years),
                                          shown_media, None)

            self._generate_media_index(shown_media, self.__all_event_indexer, all_event_index)

        return all_event_index

    def __get_event_extra_links(self, event, all_media_index, all_year_index, years):
        ret = "<span class='header_links'>"

        ret += self.__get_search_element("Event ID", event["id"])

        if event["id"] in all_media_index["event"]:
            ret += " · "
            ret += self.__get_all_media_link(all_media_index["event"][event["id"]])

        year_links = []
        for year in years:
            if not event["id"] in all_year_index[year]:
                continue

            idx = all_year_index[year][event["id"]]
            link = self.__get_page_url_with_anchor(["year", year], idx["page"])

            year_links.append("<a href='%s'>" % (link) + \
                              "<span class='header_link'>%s</span>" % (year) + \
                              "</a>")

        if len(year_links) <= 11:
            ret += " · " + " · ".join(year_links)
            ret += "</span>"
        else:
            ret += "</span>"
            ret += self.__get_expandable_header_links("Years", year_links)

        ret += self.__get_popular_tag_header_links(event["tags"])

        return ret

    def __get_popular_tag_header_links(self, tags):
        if not tags:
            return ""

        cleaned_tags = {}
        for tag_id, tag_name in self._cleanup_tags(tags):
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
                               (html.escape(common.cleanup_event_title(event)),
                                self._get_date_range(event["stats"]["min_date"],
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
                                 all_media, breadcrumb_config):
        # pylint: disable=too-many-arguments,too-many-locals

        # Split the media list up into multiple HTML files if needed. The first file will
        # be named like index.html, and additional pages will be index_2.html, index_3.html, etc.

        # Write out an empty file
        if len(all_media) == 0:
            media_chunks = [[]]
        else:
            media_chunks = list(self._split_media_list_into_chunks(all_media))

        for index, media_on_page in enumerate(media_chunks):
            page_number = index + 1

            page_dates = {"min_date": None, "max_date": None}
            for media in media_on_page:
                if "exposure_time" in media["media"] and media["media"]["exposure_time"] != 0:
                    common.add_date_to_stats(page_dates, media["media"]["exposure_time"])

            page_date_range = self._get_date_range(page_dates["min_date"],
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

            for media in media_on_page:
                self.__write_media_block(output, media["media"], media["thumbnail_path"],
                                         media["stats"], media["link"], media["show_daterange"])

            if len(media_chunks) > 1:
                self.__write_page_links(output, current_page_link, page_number, len(media_chunks))

            if breadcrumb_config:
                self.__write_breadcrumbs(output, breadcrumb_config)

            self.__write_html_footer(output)

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

        output.write("<span class='breadcrumb'>Page %s</span>" % (humanize.intcomma(page_number)))

        self.__write_page_link(output, current_page_link, page_number < total_pages, "&gt;&gt;",
                               page_number + 1)

        if total_pages > 25:
            self.__write_page_link(output, current_page_link, page_number <= total_pages - 10,
                                   "&gt;&gt;&gt;&gt;", page_number + 10)

        if total_pages > 2:
            self.__write_page_link(output, current_page_link, page_number < total_pages, "&gt;|",
                                   total_pages)

        output.write("</span>")

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

        self.generated_artifacts.add(path)
        output = open(path, "w", encoding="UTF-8")

        output.write("<html lang='en'>")
        output.write("<head>")
        output.write("<link rel='stylesheet' type='text/css' href='../library.css'/>")
        output.write("<meta name='viewport' content='width=device-width'/>")
        output.write("<meta charset='UTF-8'/>")

        if title:
            output.write("<title>%s</title>" % (html.escape(title)))

        output.write("</head>")

        output.write("<body>")

        if title:
            output.write("<span class='page_title'>%s</span>" % (html.escape(title)))

        date_range = self._get_date_range(stats["min_date"], stats["max_date"])
        output.write("<span class='summary_stats'>%s</span>" % \
                     (self.__get_stats_description(stats, date_range, page_date_range)))

        return output

    def __write_html_footer(self, output):
        url = "https://github.com/masneyb/shotwell-site-generator"
        output.write("<span class='generated_at'>Site generated from " + \
                     "<a href='https://wiki.gnome.org/Apps/Shotwell'>Shotwell</a> " + \
                     "library at %s by <a href='%s'>shotwell-site-generator</a> %s.</span>" % \
                     (html.escape(self.generated_at), url, self.version_label))

        output.write("</body>")
        output.write("</html>")
        output.close()

    def __get_stats_description(self, stats, date_range, page_date_range):
        # pylint: disable=too-many-branches

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

        if stats["num_events"] > 1:
            ret.append("<span class='stat'>%s events</span>" % \
                       (humanize.intcomma(stats["num_events"])))

        if stats["num_videos"] == 0 and stats["num_photos"] == 0:
            ret.append("<span class='stat'>No media fits the search criteria.</span>")

        if stats["total_filesize"] > 0:
            ret.append("<span class='stat'>%s</span>" % \
                       (humanize.naturalsize(stats["total_filesize"], binary=True)))

        ret2 = []
        if date_range:
            if not page_date_range or page_date_range == date_range:
                ret.append(date_range)
            else:
                ret2.append("%s (page)" % (page_date_range))
                ret2.append("%s (overall)" % (date_range))

        if ret2:
            return "%s<br/>%s" % (" · ".join(ret), " · ".join(ret2))

        return " · ".join(ret)

    def __has_shown_media(self, stats):
        return stats["num_photos"] > 0 or stats["num_videos"] > 0

    def remove_stale_files(self):
        common.remove_stale_artifacts(os.path.join(self.html_basedir, "event"),
                                      self.generated_artifacts, self.remove_stale_artifacts)
        common.remove_stale_artifacts(os.path.join(self.html_basedir, "media"),
                                      self.generated_artifacts, self.remove_stale_artifacts)
        common.remove_stale_artifacts(os.path.join(self.html_basedir, "tag"),
                                      self.generated_artifacts, self.remove_stale_artifacts)
        common.remove_stale_artifacts(os.path.join(self.html_basedir, "year"),
                                      self.generated_artifacts, self.remove_stale_artifacts)
