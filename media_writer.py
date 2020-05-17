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
import dateutil.tz
import humanize
from common import add_date_to_stats

YEAR_FRAME_SIZE = 4

class Html:
    # pylint: disable=too-many-instance-attributes
    def __init__(self, all_media, dest_directory, min_media_rating, all_media_ratings,
                 main_title, years_prior_are_approximate, main_page_extra_link,
                 main_page_extra_link_descr, max_media_per_page):
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
        self.generated_at = datetime.datetime.now(dateutil.tz.tzlocal()) \
            .strftime("%B %-d, %Y %H:%M:%S %Z")

    def write_year_and_event_html_files(self, all_media_year_index):
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
                                "show_daterange": False})

        self.__write_media_html_files(["year", "index"], self.main_title, None,
                                      self.all_media["all_stats"], None, shown_media, None,
                                      None, None)

        # Now generate the individual year pages. Reverse the year list again so that the
        # breadcrumbs at the bottom of the generated year pages are correct.
        all_years.reverse()

        for current_year_index, year in enumerate(all_years):
            self.__write_year_html_file(all_years, current_year_index, all_media_year_index)
            self.__write_event_html_files(all_years, current_year_index)

        self.__write_event_index_file()

    def write_all_media_index_file(self):
        shown_media = []
        for year in self.all_media["events_by_year"].values():
            for event in year["events"]:
                for media in event["media"]:
                    relpath = "../../original/%s" % (media["filename"])
                    shown_media.append({"media": media, "link": relpath, "show_daterange": True})

        shown_media.sort(key=lambda media: media["media"]["exposure_time"], reverse=True)

        all_media_year_index = {}
        self.__write_media_html_files(["media", "index"], self.main_title, None,
                                      self.all_media["all_stats"], None, shown_media, None,
                                      None, None, self.__all_media_indexer, all_media_year_index)

        return all_media_year_index

    def __all_media_indexer(self, config, page_number, media_on_page):
        for media in media_on_page:
            if "exposure_time" not in media["media"] or media["media"]["exposure_time"] == 0:
                continue

            year = self.__get_date_parts(media["media"]["exposure_time"])["year"]
            if year not in config:
                config[year] = {"page": page_number, "media_id": media["media"]["media_id"]}

    def write_tag_html_files(self):
        for tag in self.all_media["tags_by_id"].values():
            # Keep the child tags and the tagged media in separate lists since they have
            # separate sort criteria. The two lists are concatenated together.

            shown_tags = []
            for media in tag["child_tags"]:
                shown_tags.append({"media": media,
                                   "link": "%s.html" % (media["id"]),
                                   "show_daterange": True})

            shown_tags.sort(key=lambda media: media["media"]["title"])

            shown_media = []
            for media in tag["media"]:
                shown_media.append({"media": media,
                                    "link": "../../original/%s" % (media["filename"]),
                                    "show_daterange": False})

            shown_media.sort(key=lambda media: media["media"]["exposure_time"],
                             reverse=True)

            if tag["parent_tag"]:
                back_link_descr = "Media tagged %s" % (tag["parent_tag"]["title"])
                back_link_path = "%s.html" % (tag["parent_tag"]["id"])
            else:
                back_link_descr = "Tag Index"
                back_link_path = "index.html"

            self.__write_media_html_files(["tag", str(tag["id"])], tag["long_title"], None,
                                          tag["stats"], self.__get_tag_event_links(tag),
                                          shown_tags + shown_media, None, back_link_descr,
                                          back_link_path)

        self.__write_tag_index_html_files()

    def __write_tag_index_html_files(self):
        shown_tags = []
        for tag in self.all_media["tags_by_id"].values():
            if tag["parent_tag"]:
                continue

            shown_tags.append({"media": tag,
                               "link": "%s.html" % (tag["id"]),
                               "show_daterange": True})

        shown_tags.sort(key=lambda media: media["media"]["title"])

        self.__write_media_html_files(["tag", "index"], self.main_title, None,
                                      self.all_media["all_stats"], None, shown_tags, None,
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

        if self.main_page_extra_link:
            output.write("<span><a href='%s'><span class='main_view'>%s</span></a></span>" % \
                         (self.main_page_extra_link, self.main_page_extra_link_descr))

        output.write("</span>")

    def __write_media_block(self, output, media, link, show_daterange):
        output.write("<span class='media'>")

        if "media_id" in media:
            output.write("<a name='%s' href='%s'>" % \
                         (html.escape(media["media_id"]), html.escape(link)))
        else:
            output.write("<a href='%s'>" % (html.escape(link)))

        output.write("<span class='media_thumb'><img src='../../thumbnails/%s'/></span>" % \
                     (html.escape(media["thumbnail_path"])))

        if media["title"]:
            output.write("<span class='media_title'>%s</span>" % (html.escape(media["title"])))

        output.write("</a>")

        if "stats" in media:
            output.write("<span class='media_stats'>%s</span>" % \
                         (self.__get_stats_description(media["stats"])))

            if show_daterange:
                date_range = self.__get_date_range(media["stats"]["min_date"],
                                                   media["stats"]["max_date"])
                if date_range:
                    output.write("<span class='media_date'>%s</span>" % (html.escape(date_range)))

        if media["comment"]:
            self.__write_comment(output, media["id"], media["comment"], "media_comment")

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
            title = self.__cleanup_event_title(self.all_media["events_by_id"][media["event_id"]])
            detailed.append("<a href='../event/%d.html'>%s</a>" % \
                            (media["event_id"], html.escape(title)))

        if "tags" in media and media["tags"]:
            for tag_id, tag_name in self.__cleanup_tags(media["tags"]):
                detailed.append("<a href='../tag/%d.html'>%s</a>" % \
                                (tag_id, html.escape(tag_name)))

        if "exif" in media:
            detailed = detailed + media["exif"]

        if "rating" in media:
            detailed.append(("&starf;" * media["rating"]) + ("&star;" * (5 - media["rating"])))

        if not summary:
            return

        sep = " &nbsp; "
        if not detailed:
            output.write("<span class='media_metadata'>%s</span>" % (sep.join(summary)))
            return

        short_id = 'meta%s_short' % (media["media_id"])
        long_id = 'meta%s_long' % (media["media_id"])
        output.write("<span id='%s' class='media_metadata'>%s" % (short_id, sep.join(summary)) + \
                     "%s<span class='more_less' onClick=\"%s\">More</span>" % \
                     (sep, self.__js_hide_show(short_id, long_id)) + \
                     "</span>")
        output.write("<span id='%s' class='media_metadata' style='display: none;'>%s" % \
                     (long_id, sep.join(summary + detailed)) + \
                     "%s<span class='more_less' onClick=\"%s\">Less</span>" % \
                     (sep, self.__js_hide_show(long_id, short_id)) + \
                     "</span>")

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

    def __write_comment(self, output, media_id, comment, span_class):
        if len(comment) < 40:
            output.write("<span class='%s'>%s</span>" % (span_class, html.escape(comment.strip())))
        else:
            short_id = 'comment%s_short' % (media_id)
            long_id = 'comment%s_long' % (media_id)

            output.write("<span id='%s' class='%s comment_more_less'" % (short_id, span_class) + \
                         " onClick=\"%s\">" % (self.__js_hide_show(short_id, long_id)) + \
                         html.escape(comment[0:30].strip()) +
                         " <span class='more_less'>More...</span>" + \
                         "</span>")

            output.write("<span id='%s' class='%s comment_more_less'" % (long_id, span_class) + \
                         " onClick=\"%s\"" % (self.__js_hide_show(long_id, short_id)) + \
                         " style='display: none;'>" + \
                         html.escape(comment.strip()).replace("\n", "<br/>") +
                         " <span class='more_less'>Less</span>" + \
                         "</span>")

    def __write_year_html_file(self, all_years, current_year_index, all_media_year_index):
        year = all_years[current_year_index]
        events_by_year = self.all_media["events_by_year"]
        year_block = events_by_year[year]

        shown_media = []
        for event in year_block["events"]:
            if not self.__has_shown_media(year_block["stats"]) and self.min_media_rating > 0:
                continue

            event_html_filename = str(event["id"])
            shown_media.append({"media": event, "link": "../event/%s.html" % (event_html_filename),
                                "show_daterange": True})

        breadcrumb_config = {}
        breadcrumb_config["current_index"] = current_year_index
        breadcrumb_config["all_items"] = all_years
        breadcrumb_config["to_html_label"] = str
        breadcrumb_config["to_html_filename"] = lambda year: "%s.html" % (year)

        extra_links = ""
        if year in all_media_year_index:
            url_parts = self.__get_page_url_parts(["media", "index"],
                                                  all_media_year_index[year]["page"])
            extra_links = "<span class='header_links'><a href='../media/%s.html#%s'>" % \
                          (url_parts[-1], all_media_year_index[year]["media_id"]) + \
                          "<span class='header_link'>Browse media around this year</span>" + \
                          "</a></span>"

        self.__write_media_html_files(["year", str(year)], year, None, year_block["stats"],
                                      extra_links, shown_media, breadcrumb_config, "Year Index",
                                      "index.html")

    def __write_event_index_file(self):
        shown_media = []
        for year in self.all_media["events_by_year"].values():
            for event in year["events"]:
                if not self.__has_shown_media(event["stats"]) and self.min_media_rating > 0:
                    continue

                shown_media.append({"media": event, "link": "%d.html" % (event["id"]),
                                    "show_daterange": True})

        shown_media.sort(key=lambda media: media["media"]["date"], reverse=True)

        self.__write_media_html_files(["event", "index"], self.main_title, None,
                                      self.all_media["all_stats"], None, shown_media, None,
                                      None, None)

    def __write_event_html_files(self, all_years, current_year_index):
        year = all_years[current_year_index]
        events_by_year = self.all_media["events_by_year"]
        year_block = events_by_year[year]

        for current_event_index, event in enumerate(year_block["events"]):
            breadcrumb_config = {}
            breadcrumb_config["to_html_label"] = self.__cleanup_event_title
            breadcrumb_config["to_html_filename"] = lambda evt: "%s.html" % (evt["id"])

            breadcrumb_config["current_index"] = current_event_index
            breadcrumb_config["all_items"] = events_by_year[year]["events"]

            if current_year_index > 0:
                prev_year = all_years[current_year_index - 1]
                breadcrumb_config["previous_group"] = events_by_year[prev_year]["events"][-1]

            if current_year_index < len(all_years) - 1:
                next_year = all_years[current_year_index + 1]
                breadcrumb_config["next_group"] = events_by_year[next_year]["events"][0]

            shown_media = []
            for media in event["media"]:
                relpath = "../../original/%s" % (media["filename"])
                shown_media.append({"media": media, "link": relpath, "show_daterange": True})

            self.__write_media_html_files(["event", str(event["id"])], event["title"],
                                          event["comment"], event["stats"],
                                          self.__get_event_tag_links(event), shown_media,
                                          breadcrumb_config, "Year %s" % (year),
                                          "../year/%s.html" % (year))

    def __get_event_tag_links(self, event):
        if "tags" not in event or not event["tags"]:
            return None

        tag_links = []
        for tag_id, tag_name in self.__cleanup_tags(event["tags"]):
            tag_links.append("<a href='../tag/%d.html'><span class='header_link'>%s</span></a>" % \
                             (tag_id, html.escape(tag_name)))

        if len(tag_links) < 11:
            return "<span class='header_links'>Tags: %s</span>" % \
                   ("".join(tag_links))

        ret = "<span id='tag_links_short' class='header_links'>" + \
              "Tags: %s " % ("".join(tag_links[0:10])) + \
              "<span class='more_less' onClick=\"%s\">More...</span>" % \
              (self.__js_hide_show("tag_links_short", "tag_links_long")) + \
              "</span>"
        ret += "<span id='tag_links_long' class='header_links' style='display: none;'>" + \
               "Tags: %s, " % ("".join(tag_links)) + \
               "<span class='more_less' onClick=\"%s\">Less</span>" % \
               (self.__js_hide_show("tag_links_long", "tag_links_short")) + \
               "</span>"

        return ret

    def __get_tag_event_links(self, tag):
        event_ids = set([])
        for media in tag["media"]:
            if media["event_id"] != -1:
                event_ids.add(media["event_id"])

        if not event_ids:
            return None

        events = [self.all_media["events_by_id"][event_id] for event_id in event_ids]
        events.sort(key=lambda event: event["date"], reverse=True)

        event_links = []
        for event in events:
            event_links.append("<a href='../event/%d.html'>" % (event["id"]) + \
                               "<span class='header_link'>%s (%s)" % \
                               (html.escape(self.__cleanup_event_title(event)),
                                self.__get_date_range(event["stats"]["min_date"],
                                                      event["stats"]["max_date"])) + \
                               "</span>" + \
                               "</a>")

        if len(event_links) < 11:
            return "<span class='header_links'>Events: %s</span>" % ("".join(event_links))

        ret = "<span id='event_links_short' class='header_links'>" + \
              "Events: %s " % ("".join(event_links[0:10])) + \
              "<span class='more_less' onClick=\"%s\">More...</span>" % \
              (self.__js_hide_show("event_links_short", "event_links_long")) + \
              "</span>"
        ret += "<span id='event_links_long' class='header_links' style='display: none;'>" + \
               "Events: %s " % ("".join(event_links)) + \
               "<span class='more_less' onClick=\"%s\">Less</span>" % \
               (self.__js_hide_show("event_links_long", "event_links_short")) + \
               "</span>"

        return ret

    def __cleanup_event_title(self, event):
        return event["title"] if event["title"] else "Unnamed %s" % (event["id"])

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
                                 all_media, breadcrumb_config, back_link_descr, back_link_path,
                                 media_indexer=None, media_index_config=None):
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
                                              title, comment, stats, page_date_range)

            if extra_header:
                output.write(extra_header)

            self.__write_main_view_links(output, current_page_link[0],
                                         current_page_link[1] != "index" or page_number > 1)

            if media_indexer:
                media_indexer(media_index_config, page_number, media_on_page)

            for media in media_on_page:
                self.__write_media_block(output, media["media"], media["link"],
                                         media["show_daterange"])

            if len(media_chunks) > 1:
                self.__write_page_links(output, current_page_link, page_number, len(media_chunks))

            if breadcrumb_config:
                self.__write_breadcrumbs(output, breadcrumb_config)

            self.__write_html_footer(output, current_page_link, back_link_descr, back_link_path)

    def __write_page_link(self, output, current_page_link, condition, label, page_number):
        # pylint: disable=too-many-arguments

        if condition:
            output.write("<a href='%s.html'><span class='breadcrumb'>%s</span></a>" % \
                         (self.__get_page_url_parts(current_page_link, page_number)[-1], label))
        else:
            output.write("<span class='breadcrumb_inactive'>%s</span>" % (label))

    def __write_page_links(self, output, current_page_link, page_number, total_pages):
        output.write("<span class='breadcrumbs'>")

        if total_pages > 3:
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

        if total_pages > 3:
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

    def __write_html_header(self, path_subparts, title, comment, stats, page_date_range):
        # pylint: disable=too-many-arguments
        path = os.path.join(*[self.html_basedir, *path_subparts]) + ".html"

        parent_path = os.path.dirname(path)
        if not os.path.isdir(parent_path):
            os.makedirs(parent_path)

        output = open(path, "w", encoding="UTF-8")

        output.write("<html lang='en'>")
        output.write("<head>")
        output.write("<link rel='stylesheet' type='text/css' href='../../library.css'/></head>")
        output.write("<meta name='viewport' content='width=device-width'/>")
        output.write("<meta charset='UTF-8'/>")

        if title:
            output.write("<title>%s</title>" % (html.escape(title)))

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

        if comment:
            self.__write_comment(output, "title", comment, "event_comment")

        return output

    def __write_html_footer(self, output, current_page, back_link_descr, back_link_path):
        self.__write_ratings_dropdown(output, current_page)

        if back_link_descr:
            output.write("<a href='%s'><span class='breadcrumb'>%s</span></a>" % \
                         (html.escape(back_link_path), html.escape(back_link_descr)))

        url = "https://github.com/masneyb/shotwell-site-generator"
        output.write("<span class='generated_at'>Site generated from " + \
                     "<a href='https://wiki.gnome.org/Apps/Shotwell'>Shotwell</a> " + \
                     "library at %s by <a href='%s'>shotwell-site-generator</a>.</span>" % \
                     (html.escape(self.generated_at), url))

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

        if min_parts != max_parts and min_parts["month"] and \
           min_parts["year"] == max_parts["year"] and min_parts["month"] == max_parts["month"]:
            return "%s %s-%s, %s" % \
                   (min_parts["month"], min_parts["day"], max_parts["day"], min_parts["year"])

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

        for tag_id, tag_name in all_tags:
            if not tag_name.startswith("/"):
                continue

            tag_name_to_id[tag_name] = tag_id
            tag_parts = tag_name.split("/")
            if len(tag_parts) == 2:
                continue

            tags_to_remove.add("/".join(tag_parts[0:-1]))

        for tag_name in tags_to_remove:
            tag_id = tag_name_to_id[tag_name]
            all_tags.remove((tag_id, tag_name))

        ret = [(tag_id, tag_name.split("/")[-1]) for tag_id, tag_name in all_tags]
        ret.sort(key=lambda tag: tag[1])

        return ret

    def __has_shown_media(self, stats):
        return stats["num_photos"] > 0 or stats["num_videos"] > 0
