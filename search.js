function getQueryParameter(name, defaultValue) {
  var urlParams = new URLSearchParams(window.location.search);
  return urlParams.has(name) ? urlParams.get(name) : defaultValue;
}

function getIntQueryParameter(name, defaultValue) {
  var val = getQueryParameter(name, null);
  return val != null ? parseInt(val, 10) : defaultValue;
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
    if (opFunc(input, value))
      return true;
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

const ratingSearch = {
  ops: [
    {
      descr: "is at least",
      matches: function (field, op, values, media) {
        return performGenericOp(field, media, values[0], function(input, value) {
          return input != null && input >= value;
        });
      },
      numValues: 1
    },
    {
      descr: "is at most",
      matches: function (field, op, values, media) {
        return performGenericOp(field, media, values[0], function(input, value) {
          return input != null && input <= value;
        });
      },
      numValues: 1
    },
    {
      descr: "equals",
      matches: function (field, op, values, media) {
        return performGenericOp(field, media, values[0], function(input, value) {
          return input != null && input == value;
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
    title: "Title",
    search: textSearch,
    searchFields: ["title"],
  },
  {
    title: "Comment",
    search: textSearch,
    searchFields: ["comment"],
  },
  {
    title: "Event Name",
    search: textSearch,
    searchFields: ["event_name"],
  },
  {
    title: "Tag Name",
    search: textSearch,
    searchFields: ["tag_name"],
  },
  {
    title: "Filename",
    search: textSearch,
    searchFields: ["link"],
  },
  {
    title: "Date",
    search: dateSearch,
    searchFields: ["exposure_time"],
  },
  {
    title: "Rating",
    search: ratingSearch,
    searchFields: ["rating"],
    validValues: [["Unrated", "0"], ["&starf;", "1"], ["&starf;&starf;", "2"],
                  ["&starf;&starf;&starf;", "3"], ["&starf;&starf;&starf;&starf;", "4"],
                  ["&starf;&starf;&starf;&starf;&starf;", "5"]],
  },
  {
    title: "Type",
    search: mediaTypeSearch,
    searchFields: ["type"],
    validValues: [["photo", "photo"], ["video", "video"], ["event", "events"], ["tag", "tags"]],
  }
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

    criteria = {field: null, op: null, searchValues: parts.slice(2, parts.length)};

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
    noopField = {title: null, search: textSearch, searchFields: ["noop"]};
    trueOp = {descr: "equals", matches: function (field, op, values, media) { return true; }, numValues: 0};
    allCriteria.push({field: noopField, op: trueOp, searchValues: []});
  }

  var matchPolicy = getQueryParameter("match_policy", "all"); // any,none,all

  var tagNames = {}
  for (tag of allItems["tags"]) {
    tagNames[tag["id"]] = tag["title"];
  }

  var eventNames = {}
  for (tag of allItems["events"]) {
    eventNames[tag["id"]] = tag["title"];
  }

  ret = []
  for (const mediaType of [["events", "Event: "], ["tags", "Tag: "], ["media", ""]]) {
    for (const media of allItems[mediaType[0]]) {
      if (!("type" in media))
        media.type = mediaType[0];

      if ("tags" in media) {
        // Write out the tag name into the media element to simplify code for the text search.
        media.tag_name = [];
        for (tag_id of media["tags"])
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
