/*
 * Generic functions for searching for media that's used by the search and
 * screensaver pages.
 *
 * Copyright (C) 2020 Brian Masney <masneyb@onstation.org>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

function getQueryParameter(name, defaultValue) {
  var urlParams = new URLSearchParams(window.location.search);
  return urlParams.has(name) ? urlParams.get(name) : defaultValue;
}

function getIntQueryParameter(name, defaultValue) {
  var val = getQueryParameter(name, null);
  return val != null ? parseInt(val, 10) : defaultValue;
}

function getPrettyFileSize(size) {
  if (size > 1024*1024*1024)
    return `${(size / (1024*1024*1024)).toFixed(1)} GiB`;
  if (size > 1024*1024)
    return `${(size / (1024*1024)).toFixed(1)} MiB`;
  if (size > 1024)
    return `${(size / (1024)).toFixed(1)} KiB`;

  return `${size} bytes`;
}

function createMediaStatsHtml(entity, eventNames, tagNames, openInNewWindow) {
  var extraLinkAttr = openInNewWindow ? 'target="_new" ' : '';

  var ret = []
  if (entity.num_photos > 0)
    ret.push(`<span class="stat">${entity.num_photos.toLocaleString()} photos</span>`);

  if (entity.num_videos > 0)
    ret.push(`<span class="stat">${entity.num_videos.toLocaleString()} videos</span>`);

  if ("exposure_time_pretty" in entity)
    ret.push(`<span class="stat">${entity.exposure_time_pretty}</span>`);

  if (entity.filesize)
    ret.push(`<span class="stat">${getPrettyFileSize(entity.filesize)}</span>`);

  if (entity.width)
    ret.push(`<span class="stat">${entity.width}x${entity.height}</span>`);

  if (entity.clip_duration)
    ret.push(`<span class="stat">${entity.clip_duration}</span>`);

  if (entity.date_range)
    ret.push(`<span class="stat">${entity.date_range}</span>`);

  if (entity.event_id)
    ret.push('<span class="stat">Event: ' +
             `<a ${extraLinkAttr}href="0/event/${entity.event_id}.html">` +
             eventNames[entity.event_id] +
             '</a></span>');

  if (entity.tags) {
    for (var tag_id of entity.tags) {
      ret.push(`<span class="stat">Tag: <a ${extraLinkAttr}href="0/tag/${tag_id}.html">` +
               tagNames[tag_id] +
               '</a></span>');
    }
  }

  if ("lat" in entity) {
    var search = `GPS Coordinate,is within lat/lon/radius,${entity["lat"]},${entity["lon"]},0.1`;
    ret.push('<span class="stat">' +
             `<a href='search.html?search=${encodeURI(search)}'>` +
             `GPS ${entity["lat"]},${entity["lon"]}` +
             '</a>' +
             '</span>');
  }

  if ("exif" in entity) {
    ret = ret.concat(entity["exif"]);
  }

  if ("camera" in entity)
    ret.push(`<span class="stat">${entity["camera"]}</span>`);

  if ("rating" in entity) {
    var stars = "&starf;".repeat(entity.rating) + "&star;".repeat(5 - entity.rating);
    ret.push(`<span class="stat">${stars}</span>`);
  }

  if (entity.all_media_page) {
    var link = entity.all_media_page == 1 ? "" : `_${entity.all_media_page}`;
    ret.push('<span class="stat">' +
             `<a href="0/media/index${link}.html">Browse Nearby Media</a>` +
             '</span>');
  }

  return ret.join(" &nbsp; ");
}

function shuffleArray(arr) {
  if (arr === null) {
    return;
  }

  for (var i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * i);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

function textSearchContains(fieldInfo, op, value, media) {
  for (var part of value.toLowerCase().split(" ")) {
    var partFound = false;

    for (const fieldname of fieldInfo.searchFields) {
      var input = fieldname in media ? media[fieldname] : null;
      if (input == null)
        continue;

      if (Array.isArray(input)) {
        for (var inputpart of input) {
          if (inputpart.toLowerCase().includes(part)) {
            partFound = true;
            break;
          }
        }

        if (partFound)
          break;
      } else {
        if (input.toLowerCase().includes(part)) {
          partFound = true;
          break;
        }
      }
    }

    if (!partFound)
      return false;
  }

  return true;
}

function performGenericOp(fieldInfo, media, value, opFunc) {
  for (const fieldname of fieldInfo.searchFields) {
    var input = fieldname in media ? media[fieldname] : null;
    if (Array.isArray(input)) {
      for (var inputpart of input) {
        if (opFunc(inputpart, value))
          return true;
      }
    } else {
      if (opFunc(input, value))
        return true;
    }
  }

  return false;
}

const textSearch = {
  ops: [
    {
      descr: "contains",
      matches: function (field, op, values, media) {
        return textSearchContains(field, op, values[0], media);
      },
      numValues: 1
    },
    {
      descr: "does not contain",
      matches: function (field, op, values, media) {
        return !textSearchContains(field, op, values[0], media);
      },
      numValues: 1
    },
    {
      descr: "equals",
      matches: function (field, op, values, media) {
        return performGenericOp(field, media, values[0], function(input, value) {
          return input != null && input.toLowerCase() === value.toLowerCase();
        });
      },
      numValues: 1
    },
    {
      descr: "starts with",
      matches: function (field, op, values, media) {
        return performGenericOp(field, media, values[0], function(input, value) {
          return input != null && input.toLowerCase().startsWith(value.toLowerCase());
        });
      },
    },
    {
      descr: "ends with",
      matches: function (field, op, values, media) {
        return performGenericOp(field, media, values[0], function(input, value) {
          return input != null && input.toLowerCase().endsWith(value.toLowerCase());
        });
      },
      numValues: 1
    },
    {
      descr: "is set",
      matches: function (field, op, values, media) {
        return performGenericOp(field, media, values[0], function(input, value) {
          return input != null && input !== "";
        });
      },
      numValues: 0
    },
    {
      descr: "is not set",
      matches: function (field, op, values, media) {
        return performGenericOp(field, media, values[0], function(input, value) {
          return input == null || input === "";
        });
      },
      numValues: 0
    }
  ]
};

const dateSearch = {
  ops: [
    {
      descr: "starts with",
      matches: function (field, op, values, media) {
        return performGenericOp(field, media, values[0], function(input, value) {
          return input != null && input.startsWith(value);
        });
      },
      numValues: 1
    },
    {
      descr: "is before",
      matches: function (field, op, values, media) {
        return performGenericOp(field, media, values[0], function(input, value) {
          return input != null && input < value;
        });
      },
      numValues: 1
    },
    {
      descr: "is after",
      matches: function (field, op, values, media) {
        return performGenericOp(field, media, values[0], function(input, value) {
          return input != null && input > value;
        });
      },
      numValues: 1
    },
    {
      descr: "is between",
      matches: function (field, op, values, media) {
        return performGenericOp(field, media, values, function(input, values) {
          return input != null && input >= values[0] && input <= values[1];
        });
      },
      numValues: 2
    },
    {
      descr: "is set",
      matches: function (field, op, values, media) {
        return performGenericOp(field, media, null, function(input, value) {
          return input != null && input !== "";
        });
      },
      numValues: 0
    },
    {
      descr: "is not set",
      matches: function (field, op, values, media) {
        return performGenericOp(field, media, null, function(input, value) {
          return input == null || input === "";
        });
      },
      numValues: 0
    },
    {
      descr: "was taken on day (mm-dd)",
      matches: function (field, op, values, media) {
        return performGenericOp(field, media, null, function(input, value) {
          if (input == null)
            return false;

          const compareTo = input.split("T")[0].split("-").slice(1, 3).join("-");
          return compareTo === values[0];
        });
      },
      numValues: 1
    },
    {
      descr: "was taken on this day",
      matches: function (field, op, values, media) {
        return performGenericOp(field, media, null, function(input, value) {
          if (input == null)
            return false;

          const today = new Date();
          const monthDay = String(today.getMonth() + 1).padStart(2, '0') + "-" +
                           String(today.getDate()).padStart(2, '0');

          const compareTo = input.split("T")[0].split("-").slice(1, 3).join("-");
          return compareTo === monthDay;
        });
      },
      numValues: 0
    },
    {
      descr: "was taken on this month",
      matches: function (field, op, values, media) {
        return performGenericOp(field, media, null, function(input, value) {
          if (input == null)
            return false;

          const today = new Date();
          const month = String(today.getMonth() + 1).padStart(2, '0');

          return input.split("T")[0].split("-")[1] === month;
        });
      },
      numValues: 0
    }
  ]
};

const mediaTypeSearch = {
  ops: [
    {
      descr: "is a",
      matches: function (field, op, values, media) {
        return performGenericOp(field, media, values[0], function(input, value) {
          return input != null && input.toLowerCase() === value.toLowerCase();
        });
      },
      numValues: 1
    },
    {
      descr: "is not a",
      matches: function (field, op, values, media) {
        return performGenericOp(field, media, values[0], function(input, value) {
          return input == null || input.toLowerCase() !== value.toLowerCase();
        });
      },
      numValues: 1
    }
  ]
};

const numberSearch = {
  ops: [
    {
      descr: "is at least",
      matches: function (field, op, values, media) {
        return performGenericOp(field, media, values[0], function(input, value) {
          return input != null && input >= value;
        });
      },
      numValues: 1,
      inputType: ["number"]
    },
    {
      descr: "is at most",
      matches: function (field, op, values, media) {
        return performGenericOp(field, media, values[0], function(input, value) {
          return input != null && input <= value;
        });
      },
      numValues: 1,
      inputType: ["number"]
    },
    {
      descr: "equals",
      matches: function (field, op, values, media) {
        return performGenericOp(field, media, values[0], function(input, value) {
          return input != null && input == value;
        });
      },
      numValues: 1,
      inputType: ["number"]
    }
  ]
};

function gpsIsWithin(field, op, values, media) {
  if (!("lat" in media))
    return false;

  const userLat = parseFloat(values[0]);
  const userLon = parseFloat(values[1]);
  const userRadius = parseFloat(values[2]);

  return (userLat - userRadius) <= media["lat"] &&
         (userLat + userRadius) >= media["lat"] &&
         (userLon - userRadius) <= media["lon"] &&
         (userLon + userRadius) >= media["lon"];
}

const gpsSearch = {
  ops: [
    {
      descr: "is set",
      matches: function (field, op, values, media) {
        return performGenericOp(field, media, null, function(input, value) {
          return input != null && input !== "";
        });
      },
      numValues: 0
    },
    {
      descr: "is not set",
      matches: function (field, op, values, media) {
        return performGenericOp(field, media, null, function(input, value) {
          return input == null || input === "";
        });
      },
      numValues: 0
    },
    {
      descr: "is within lat/lon/radius",
      matches: function (field, op, values, media) {
        return gpsIsWithin(field, op, values, media);
      },
      numValues: 3,
      inputType: ["number", "number", "number"],
      inputStep: ["any", "any", "any"]
    },
    {
      descr: "is outside lat/lon/radius",
      matches: function (field, op, values, media) {
        if (!("lat" in media))
          return false;

        return !gpsIsWithin(field, op, values, media);
      },
      numValues: 3,
      inputType: ["number", "number", "number"],
      inputStep: ["any", "any", "any"]
    },
  ]
};

const searchFields = [
  {
    title: "Any Text",
    search: textSearch,
    searchFields: ["title", "comment", "link", "event_name", "tag_name"],
  },
  {
    title: "Camera",
    search: textSearch,
    searchFields: ["camera"],
  },
  {
    title: "Comment",
    search: textSearch,
    searchFields: ["comment"],
  },
  {
    title: "Date",
    search: dateSearch,
    searchFields: ["exposure_time"],
  },
  {
    title: "Event Name",
    search: textSearch,
    searchFields: ["event_name"],
  },
  {
    title: "Filename",
    search: textSearch,
    searchFields: ["link"],
  },
  {
    title: "GPS Coordinate",
    search: gpsSearch,
    searchFields: ["lat"],
  },
  {
    title: "Photo Height",
    search: numberSearch,
    searchFields: ["height"],
  },
  {
    title: "Photo Width",
    search: numberSearch,
    searchFields: ["width"],
  },
  {
    title: "Photo W/H Ratio",
    search: numberSearch,
    searchFields: ["photo_ratio"],
  },
  {
    title: "Rating",
    search: numberSearch,
    searchFields: ["rating"],
    validValues: [["Unrated", "0"], ["&starf;", "1"], ["&starf;&starf;", "2"],
                  ["&starf;&starf;&starf;", "3"], ["&starf;&starf;&starf;&starf;", "4"],
                  ["&starf;&starf;&starf;&starf;&starf;", "5"]],
  },
  {
    title: "Tag Name",
    search: textSearch,
    searchFields: ["tag_name"],
  },
  {
    title: "Title",
    search: textSearch,
    searchFields: ["title"],
  },
  {
    title: "Type",
    search: mediaTypeSearch,
    searchFields: ["type"],
    validValues: [["photo", "photo"], ["raw photo", "raw_photo"], ["video", "video"],
                  ["event", "events"], ["tag", "tags"]],
  },
  {
    title: "Video Duration (secs)",
    search: numberSearch,
    searchFields: ["clip_duration_secs"],
  },
];

function performSearch(allItems) {
  var urlParams = new URLSearchParams(window.location.search);
  var allCriteria = [];

  for (const searchCriteria of urlParams.getAll("search")) {
    // FIXME - doesn't support comma in value
    var parts = searchCriteria.split(",");
    if (parts.length < 2) {
      continue;
    }

    var criteria = {field: null, op: null, searchValues: parts.slice(2, parts.length)};

    for (const searchField of searchFields) {
      if (searchField.title === parts[0]) {
        criteria.field = searchField;
        break;
      }
    }

    if (criteria.field == null)
      continue;

    for (const searchOp of criteria.field.search.ops) {
      if (searchOp.descr === parts[1]) {
        criteria.op = searchOp;
        break
      }
    }

    if (criteria.op == null)
      continue;

    if (criteria.op.numValues != criteria.searchValues.length)
      continue;

    allCriteria.push(criteria);
  }

  if (allCriteria.length == 0) {
    // Create an operator that always returns true so that all media, events and tags are shown.
    var noopField = {title: null, search: textSearch, searchFields: ["noop"]};
    var trueOp = {descr: "equals", matches: function (field, op, values, media) { return true; }, numValues: 0};
    allCriteria.push({field: noopField, op: trueOp, searchValues: []});
  }

  var matchPolicy = getQueryParameter("match_policy", "all"); // any,none,all

  var tagNames = {}
  for (var tag of allItems["tags"]) {
    tagNames[tag["id"]] = tag["title"];
  }

  var eventNames = {}
  for (var event of allItems["events"]) {
    eventNames[event["id"]] = event["title"];
  }

  var ret = []
  for (const mediaType of [["events", "Event: "], ["tags", "Tag: "], ["media", ""]]) {
    for (const media of allItems[mediaType[0]]) {
      if (!("type" in media))
        media.type = mediaType[0];

      if ("tags" in media) {
        // Write out the tag name into the media element to simplify code for the text search.
        media.tag_name = [];
        for (var tag_id of media["tags"])
          media.tag_name.push(tagNames[tag_id]);
      }

      if ("event_id" in media) {
        // Write out the event name into the media element to simplify code for the text search.
        media.event_name = eventNames[media["event_id"]]
      }

      if (mediaType[0] == "events")
        media.event_name = media.title;
      else if (mediaType[0] == "tags")
        media.tag_name = media.title;

      if ("width" in media)
        media.photo_ratio = media.width / media.height;

      var numFound = 0;
      for (const criteria of allCriteria) {
        if (criteria.op.matches(criteria.field, criteria.op, criteria.searchValues, media))
          numFound++;
      }

      var matches = false;
      if (matchPolicy == "none")
        matches = numFound == 0;
      else if (matchPolicy == "all")
        matches = numFound == allCriteria.length;
      else
        matches = numFound > 0;

      if (matches) {
        if (mediaType[1]) {
          if (media.title)
            media.title = mediaType[1] + media.title;
          else
            media.title = mediaType[1]
        }

        ret.push(media);
      }
    }
  }

  return ret;
}

function loadJson(readyFunc, errorFunc) {
  var xmlhttp = new XMLHttpRequest();
  xmlhttp.onreadystatechange = function() {
    if (this.readyState !== XMLHttpRequest.DONE)
      return;

    if (this.status >= 200 && this.status < 400) {
      var resp = JSON.parse(this.responseText);

      var eventNames = {}
      for (var evt of resp["events"]) {
        eventNames[evt["id"]] = "title" in evt ? evt["title"] : `Unnamed ${event["id"]}`;
      }

      var tagNames = {}
      for (var tag of resp["tags"]) {
        tagNames[tag["id"]] = tag["title"];
      }

      document.title = `${resp["title"]}: Search`;
      var ele = document.querySelector("#title");
      if (ele)
        ele.innerText = document.title;

      ele = document.querySelector("#generated_timestamp");
      if (ele)
        ele.innerText = resp["generated_at"];

      ele = document.querySelector("#app_version");
      if (ele)
        ele.innerText = resp["version_label"];

      var allMedia = performSearch(resp);
      readyFunc(allMedia, eventNames, tagNames);
    } else {
      errorFunc();
    }
  };

  xmlhttp.open("GET", "media.json", true);
  xmlhttp.send();
}
