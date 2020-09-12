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
    ret.push(`${entity.num_photos.toLocaleString()} photos`);

  if (entity.num_videos > 0)
    ret.push(`${entity.num_videos.toLocaleString()} videos`);

  if ("exposure_time_pretty" in entity)
    ret.push(entity.exposure_time_pretty);

  if (entity.filesize)
    ret.push(getPrettyFileSize(entity.filesize));

  if (entity.width)
    ret.push(`${entity.width}x${entity.height}`);

  if (entity.clip_duration)
    ret.push(entity.clip_duration);

  if (entity.date_range)
    ret.push(entity.date_range);

  if (entity.event_id && entity.type != 'events') {
    var search = `Event ID,equals,${entity.event_id}`;
    ret.push(`Event: <a href='${appendToExistingSearchUrl(search)}'>${eventNames[entity.event_id]}</a>`);
  }

  if (entity.tags && entity.type != 'tags') {
    for (var tag_id of entity.tags) {
      var search = `Tag ID,equals,${tag_id}`;
      ret.push(`Tag: <a href='${appendToExistingSearchUrl(search)}'>${tagNames[tag_id]}</a>`);
    }
  }

  if ("lat" in entity) {
    var search = `GPS Coordinate,is within,${entity["lat"]},${entity["lon"]},0.1`;
    ret.push(`<a href='${appendToExistingSearchUrl(search)}'>` +
             `GPS ${entity["lat"]},${entity["lon"]}` +
             '</a>');
  }

  if ("exif" in entity)
    ret = ret.concat(entity["exif"]);

  if ("camera" in entity) {
    var search = `Camera,equals,${entity["camera"]}`;
    ret.push(`<a href='${appendToExistingSearchUrl(search)}'>${entity["camera"]}</a>`);
  }

  if ("rating" in entity)
    ret.push("&starf;".repeat(entity.rating) + "&star;".repeat(5 - entity.rating));

  if (entity.all_media_page) {
    var link = entity.all_media_page == 1 ? "" : `_${entity.all_media_page}`;
    ret.push(`<a href="media/index${link}.html">Browse Nearby Media</a>`);
  }

  return ret.join(" &nbsp; ");
}

function appendToExistingSearchUrl(additionalCriteria) {
  var ret = `search.html?search=${encodeURI(additionalCriteria)}`;
  if (window.location.search != null && window.location.search !== "")
    ret += `&${window.location.search.replace('?', '')}`;

  return ret;
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
  const allParts = value.toLowerCase().split(" ");
  var numPartsMatched = 0;

  for (var part of allParts) {
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

    if (partFound)
      numPartsMatched++;
  }

  return numPartsMatched == allParts.length;
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
      descr: "does not equal",
      matches: function (field, op, values, media) {
        return performGenericOp(field, media, values[0], function(input, value) {
          return input == null || input.toLowerCase() !== value.toLowerCase();
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
      placeholder: ["yyyy-MM-dd"],
      numValues: 1
    },
    {
      descr: "is before",
      matches: function (field, op, values, media) {
        return performGenericOp(field, media, values[0], function(input, value) {
          return input != null && input < value;
        });
      },
      placeholder: ["yyyy-MM-dd"],
      numValues: 1
    },
    {
      descr: "is after",
      matches: function (field, op, values, media) {
        return performGenericOp(field, media, values[0], function(input, value) {
          return input != null && input > value;
        });
      },
      placeholder: ["yyyy-MM-dd"],
      numValues: 1
    },
    {
      descr: "is between",
      matches: function (field, op, values, media) {
        return performGenericOp(field, media, values, function(input, values) {
          return input != null && input >= values[0] && input <= values[1];
        });
      },
      placeholder: ["yyyy-MM-dd", "yyyy-MM-dd"],
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
      descr: "was taken on day",
      matches: function (field, op, values, media) {
        return performGenericOp(field, media, null, function(input, value) {
          if (input == null)
            return false;

          const compareTo = input.split("T")[0].split("-").slice(1, 3).join("-");
          return compareTo === values[0];
        });
      },
      placeholder: ["MM-dd"],
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

function createNumberSearch(placeholderText, showGtLt) {
  var ops = [];

  if (showGtLt) {
    ops.push({
      descr: "is at least",
      matches: function (field, op, values, media) {
        return performGenericOp(field, media, values[0], function(input, value) {
          return input != null && input >= value;
        });
      },
      placeholder: [placeholderText],
      numValues: 1,
      inputType: ["number"]
    });

    ops.push({
      descr: "is at most",
      matches: function (field, op, values, media) {
        return performGenericOp(field, media, values[0], function(input, value) {
          return input != null && input <= value;
        });
      },
      placeholder: [placeholderText],
      numValues: 1,
      inputType: ["number"]
    });
  }

  ops.push({
    descr: "equals",
    matches: function (field, op, values, media) {
      return performGenericOp(field, media, values[0], function(input, value) {
        return input != null && input == value;
      });
    },
    placeholder: [placeholderText],
    numValues: 1,
    inputType: ["number"]
  });

  ops.push({
    descr: "not equals",
    matches: function (field, op, values, media) {
      return performGenericOp(field, media, values[0], function(input, value) {
        return input == null || input !== value;
      });
    },
    placeholder: [placeholderText],
    numValues: 1,
    inputType: ["number"]
  });

  return { ops: ops };
}

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
      descr: "is within",
      matches: function (field, op, values, media) {
        return gpsIsWithin(field, op, values, media);
      },
      placeholder: ["lat", "lon", "radius"],
      numValues: 3,
      inputType: ["number", "number", "number"],
      inputStep: ["any", "any", "any"]
    },
    {
      descr: "is outside",
      matches: function (field, op, values, media) {
        if (!("lat" in media))
          return false;

        return !gpsIsWithin(field, op, values, media);
      },
      placeholder: ["lat", "lon", "radius"],
      numValues: 3,
      inputType: ["number", "number", "number"],
      inputStep: ["any", "any", "any"]
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
  ]
};

const fileExtSearch = {
  ops: [
    {
      descr: "is",
      matches: function (field, op, values, media) {
        return performGenericOp(field, media, values[0], function(input, value) {
          return input != null && input.toLowerCase().endsWith(`.${value.toLowerCase()}`);
        });
      },
      numValues: 1
    },
    {
      descr: "is not",
      matches: function (field, op, values, media) {
        return performGenericOp(field, media, values[0], function(input, value) {
          return input == null || !input.toLowerCase().endsWith(`.${value.toLowerCase()}`);
        });
      },
      numValues: 1
    }
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
    title: "Event ID",
    search: createNumberSearch(null, false),
    searchFields: ["event_id"],
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
    title: "File Extension",
    search: fileExtSearch,
    searchFields: ["link"],
  },
  {
    title: "File Size",
    search: createNumberSearch("bytes", true),
    searchFields: ["filesize"],
  },
  {
    title: "GPS Coordinate",
    search: gpsSearch,
    searchFields: ["lat"],
  },
  {
    title: "Photo Height",
    search: createNumberSearch("pixels", true),
    searchFields: ["height"],
  },
  {
    title: "Photo Width",
    search: createNumberSearch("pixels", true),
    searchFields: ["width"],
  },
  {
    title: "Photo W/H Ratio",
    search: createNumberSearch(null, true),
    searchFields: ["photo_ratio"],
  },
  {
    title: "Rating",
    search: createNumberSearch(null, true),
    searchFields: ["rating"],
    validValues: [["Unrated", "0"], ["&starf;", "1"], ["&starf;&starf;", "2"],
                  ["&starf;&starf;&starf;", "3"], ["&starf;&starf;&starf;&starf;", "4"],
                  ["&starf;&starf;&starf;&starf;&starf;", "5"]],
  },
  {
    title: "Tag ID",
    search: createNumberSearch(null, false),
    searchFields: ["tag_id"],
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
    title: "Total Photos",
    search: createNumberSearch(null, true),
    searchFields: ["num_photos"],
  },
  {
    title: "Total Videos",
    search: createNumberSearch(null, true),
    searchFields: ["num_videos"],
  },
  {
    title: "Type",
    search: mediaTypeSearch,
    searchFields: ["type"],
    validValues: [["photo", "photo"], ["raw photo", "raw_photo"], ["video", "video"],
                  ["event", "events"], ["tag", "tags"]],
  },
  {
    title: "Video Duration",
    search: createNumberSearch("secs", true),
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

  var fileExtensions = new Set([]);

  var ret = []
  for (const mediaType of [["events", "Event: "], ["tags", "Tag: "], ["media", ""]]) {
    for (const media of allItems[mediaType[0]]) {
      if (!("type" in media))
        media.type = mediaType[0];

      if ("tags" in media) {
        // Write out the tag name into the media element to simplify code for the text search.
        media.tag_id = [];
        media.tag_name = [];
        for (var tag_id of media["tags"]) {
          media.tag_id.push(tag_id);
          media.tag_name.push(tagNames[tag_id]);
        }
      }

      if ("event_id" in media) {
        // Write out the event name into the media element to simplify code for the text search.
        media.event_name = eventNames[media["event_id"]]
      }

      if (mediaType[0] == "events") {
        media.event_id = media.id;
        media.event_name = media.title;
      } else if (mediaType[0] == "tags") {
        media.tag_id = media.id;
        media.tag_name = media.title;
      }

      if ("width" in media)
        media.photo_ratio = media.width / media.height;

      if ("link" in media) {
        const idx = media["link"].lastIndexOf('.');
        if (idx != -1) {
          fileExtensions.add(media["link"].substring(idx + 1).toLowerCase());
        }
      }

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

  for (var field of searchFields) {
    if (field.title === "File Extension") {
      field.validValues = [];

      var sortedExtensions = Array.from(fileExtensions);
      sortedExtensions.sort();

      for (var ext of sortedExtensions) {
        field.validValues.push([ext, ext]);
      }
      break;
    }
  }

  return ret;
}

function processJson(resp, readyFunc) {
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
    ele.innerText = `at ${resp["generated_at"]}`;

  ele = document.querySelector("#app_version");
  if (ele)
    ele.innerText = resp["version_label"];

  var allMedia = performSearch(resp);
  readyFunc(allMedia, eventNames, tagNames);
}

function loadJson(readyFunc, errorFunc) {
  /*
   * Read the media from a javascript file rather than as a JSON file using XMLHttpRequest
   * to work around browser mitigations that are in place for CVE-2019-11730. This change allows
   * the search and screensaver pages to function correctly when accessed over a file URI.
   */

  var scr = document.createElement("script");
  scr.setAttribute("src", "media.js");
  scr.onload = function() { processJson(getAllMediaViaJsFile(), readyFunc); }
  scr.onerror = function() { errorFunc(); }
  document.body.appendChild(scr);
}
