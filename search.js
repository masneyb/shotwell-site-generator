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
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.has(name) ? urlParams.get(name) : defaultValue;
}

function getIntQueryParameter(name, defaultValue) {
  const val = getQueryParameter(name, null);
  return val != null ? parseInt(val, 10) : defaultValue;
}

function getSearchQueryParams() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.getAll('search');
}

function getPrettyFileSize(size) {
  if (size > 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GiB`;
  } if (size > 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MiB`;
  } if (size > 1024) {
    return `${(size / (1024)).toFixed(1)} KiB`;
  }
  return `${size} bytes`;
}

function createMediaStatsHtml(entity, eventNames, tagNames, searchLinkGenerator, showTitle) {
  let ret = [];
  if (showTitle && 'title' in entity && entity.title) {
    ret.push(entity.title);
  }

  if (entity.num_photos > 0) {
    ret.push(`${entity.num_photos.toLocaleString()} photos`);
  }

  if (entity.num_videos > 0) {
    ret.push(`${entity.num_videos.toLocaleString()} videos`);
  }

  if ('num_events' in entity && entity.num_events > 1) {
    ret.push(`${entity.num_events.toLocaleString()} events`);
  }

  if ('exposure_time_pretty' in entity) {
    ret.push(entity.exposure_time_pretty);
  }

  if (entity.filesize) {
    ret.push(getPrettyFileSize(entity.filesize));
  }

  if ('motion_photo' in entity) {
    ret.push(`<a target="_new" href="${entity['motion_photo']}">Motion Photo</a>`);
  }

  if (entity.width) {
    ret.push(`${entity.width}x${entity.height}`);
  }

  if (entity.clip_duration) {
    ret.push(entity.clip_duration);
  }

  if (entity.date_range) {
    ret.push(entity.date_range);
  }

  if (entity.event_id && entity.type !== 'events') {
    const anchorOpts = searchLinkGenerator('Event ID', 'equals', entity.event_id);
    ret.push(`Event: <a ${anchorOpts}>${eventNames[entity.event_id]}</a>`);
  }

  if (entity.tags && entity.type !== 'tags') {
    for (const tagId of entity.tags) {
      const anchorOpts = searchLinkGenerator('Tag ID', 'equals', tagId);
      ret.push(`Tag: <a ${anchorOpts}>${tagNames[tagId]}</a>`);
    }
  }

  if ('lat' in entity) {
    const anchorOpts = searchLinkGenerator('GPS Coordinate', 'is within',
      `${entity.lat},${entity.lon},0.1`);
    ret.push(`<a ${anchorOpts}>GPS ${entity.lat},${entity.lon}</a>`);
  }

  if ('exif' in entity) {
    ret = ret.concat(entity.exif);
  }

  if ('camera' in entity) {
    const anchorOpts = searchLinkGenerator('Camera', 'equals', entity.camera);
    ret.push(`<a ${anchorOpts}>${entity.camera}</a>`);
  }

  if ('rating' in entity) {
    ret.push('&starf;'.repeat(entity.rating) + '&star;'.repeat(5 - entity.rating));
  }

  if ('exif_text' in entity) {
    ret.push(`<a target="_new" href="${entity['exif_text']}">EXIF</a>`);
  }

  if (entity.all_media_page) {
    const link = entity.all_media_page === 1 ? '' : `_${entity.all_media_page}`;
    ret.push(`<a href="media/index${link}.html">Browse Nearby Media</a>`);
  }

  return ret.join(' · ');
}

function appendToExistingSearchUrl(criteria, appendOntoExisting) {
  let ret = `search.html?search=${encodeURI(criteria)}`;
  if (appendOntoExisting && window.location.search != null && window.location.search !== '') {
    ret += `&${window.location.search.replace('?', '')}`;
  }

  return ret;
}

function shuffleArray(arr) {
  if (arr === null) {
    return;
  }

  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * i);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
}

function doTextSearch(fieldInfo, op, value, media, searchOp) {
  const allParts = value.toLowerCase().split(' ');
  let numPartsMatched = 0;

  for (const part of allParts) {
    let partFound = false;

    for (const fieldname of fieldInfo.searchFields) {
      const input = fieldname in media ? media[fieldname] : null;
      if (input == null) {
        // NOOP
      } else if (Array.isArray(input)) {
        for (const inputpart of input) {
          if (searchOp(inputpart, part)) {
            partFound = true;
            break;
          }
        }

        if (partFound) {
          break;
        }
      } else if (searchOp(input, part)) {
        partFound = true;
        break;
      }
    }

    if (partFound) {
      numPartsMatched += 1;
    }
  }

  return numPartsMatched === allParts.length;
}

function textSearchContains(fieldInfo, op, value, media) {
  return doTextSearch(fieldInfo, op, value, media, function (input, searchterm) {
    return input.toLowerCase().includes(searchterm);
  });
}

function textSearchContainsWord(fieldInfo, op, value, media) {
  return doTextSearch(fieldInfo, op, value, media, function (input, searchterm) {
    for (const part of input.toLowerCase().split(' ')) {
       if (part === searchterm) {
         return true;
       }
    }

    return false;
  });
}

function performGenericOp(fieldInfo, media, value, opFunc) {
  for (const fieldname of fieldInfo.searchFields) {
    const input = fieldname in media ? media[fieldname] : null;
    if (Array.isArray(input)) {
      for (const inputpart of input) {
        if (opFunc(inputpart, value)) {
          return true;
        }
      }
    } else if (opFunc(input, value)) {
      return true;
    }
  }

  return false;
}

const textSearch = {
  ops: [
    {
      descr: 'contains',
      matches(field, op, values, media) {
        return textSearchContains(field, op, values[0], media);
      },
      numValues: 1,
    },
    {
      descr: 'missing',
      matches(field, op, values, media) {
        return !textSearchContains(field, op, values[0], media);
      },
      numValues: 1,
    },
    {
      descr: 'contains word',
      matches(field, op, values, media) {
        return textSearchContainsWord(field, op, values[0], media);
      },
      numValues: 1,
    },
    {
      descr: 'missing word',
      matches(field, op, values, media) {
        return !textSearchContainsWord(field, op, values[0], media);
      },
      numValues: 1,
    },
    {
      descr: 'equals',
      matches(field, op, values, media) {
        return performGenericOp(field, media, values[0],
          (input, value) => input != null && input.toLowerCase() === value.toLowerCase());
      },
      numValues: 1,
    },
    {
      descr: 'does not equal',
      matches(field, op, values, media) {
        return performGenericOp(field, media, values[0],
          (input, value) => input == null || input.toLowerCase() !== value.toLowerCase());
      },
      numValues: 1,
    },
    {
      descr: 'starts with',
      matches(field, op, values, media) {
        return performGenericOp(field, media, values[0],
          (input, value) => input != null && input.toLowerCase().startsWith(value.toLowerCase()));
      },
      numValues: 1,
    },
    {
      descr: 'ends with',
      matches(field, op, values, media) {
        return performGenericOp(field, media, values[0],
          (input, value) => input != null && input.toLowerCase().endsWith(value.toLowerCase()));
      },
      numValues: 1,
    },
    {
      descr: 'is set',
      matches(field, op, values, media) {
        return performGenericOp(field, media, values[0],
          (input, value) => input != null && input !== '');
      },
      numValues: 0,
    },
    {
      descr: 'is not set',
      matches(field, op, values, media) {
        return performGenericOp(field, media, values[0],
          (input, value) => input == null || input === '');
      },
      numValues: 0,
    },
  ],
};

const dateSearch = {
  ops: [
    {
      descr: 'was taken on day',
      matches(field, op, values, media) {
        return performGenericOp(field, media, values[0],
          (input, value) => input != null && input.startsWith(value));
      },
      placeholder: ['yyyy-MM-dd'],
      numValues: 1,
    },
    {
      descr: 'was taken on month/day',
      matches(field, op, values, media) {
        return performGenericOp(field, media, null, (input, value) => {
          if (input == null) {
            return false;
          }

          const compareTo = input.split('T')[0].split('-').slice(1, 3).join('-');
          return compareTo === values[0];
        });
      },
      placeholder: ['MM-dd'],
      numValues: 1,
    },
    {
      descr: 'was taken on this day',
      matches(field, op, values, media) {
        return performGenericOp(field, media, null, (input, value) => {
          if (input == null) {
            return false;
          }

          const today = new Date();
          const monthDay = `${String(today.getMonth() + 1).padStart(2, '0')}-${
            String(today.getDate()).padStart(2, '0')}`;

          const compareTo = input.split('T')[0].split('-').slice(1, 3).join('-');
          return compareTo === monthDay;
        });
      },
      numValues: 0,
    },
    {
      descr: 'was taken on this month',
      matches(field, op, values, media) {
        return performGenericOp(field, media, null, (input, value) => {
          if (input == null) {
            return false;
          }

          const today = new Date();
          const month = String(today.getMonth() + 1).padStart(2, '0');

          return input.split('T')[0].split('-')[1] === month;
        });
      },
      numValues: 0,
    },
    {
      descr: 'is before',
      matches(field, op, values, media) {
        return performGenericOp(field, media, values[0],
          (input, value) => input != null && input < value);
      },
      placeholder: ['yyyy-MM-dd'],
      numValues: 1,
    },
    {
      descr: 'is after',
      matches(field, op, values, media) {
        return performGenericOp(field, media, values[0],
          (input, value) => input != null && input > value);
      },
      placeholder: ['yyyy-MM-dd'],
      numValues: 1,
    },
    {
      descr: 'is between',
      matches(field, op, values, media) {
        return performGenericOp(field, media, values,
          (input, value) => input != null && input >= value[0] && input <= value[1]);
      },
      placeholder: ['yyyy-MM-dd', 'yyyy-MM-dd'],
      numValues: 2,
    },
    {
      descr: 'is set',
      matches(field, op, values, media) {
        return performGenericOp(field, media, null,
          (input, value) => input != null && input !== '');
      },
      numValues: 0,
    },
    {
      descr: 'is not set',
      matches(field, op, values, media) {
        return performGenericOp(field, media, null,
          (input, value) => input == null || input === '');
      },
      numValues: 0,
    },
  ],
};

const mediaTypeSearch = {
  ops: [
    {
      descr: 'is a',
      matches(field, op, values, media) {
        return performGenericOp(field, media, values[0],
          (input, value) => input != null && input.toLowerCase() === value.toLowerCase());
      },
      numValues: 1,
    },
    {
      descr: 'is not a',
      matches(field, op, values, media) {
        return performGenericOp(field, media, values[0],
          (input, value) => input == null || input.toLowerCase() !== value.toLowerCase());
      },
      numValues: 1,
    },
  ],
};

function createNumberSearch(placeholderText, showGtLt) {
  const ops = [];

  if (showGtLt) {
    ops.push({
      descr: 'is at least',
      matches(field, op, values, media) {
        return performGenericOp(field, media, values[0],
          (input, value) => input != null && input >= value);
      },
      placeholder: [placeholderText],
      numValues: 1,
      inputType: ['number'],
    });

    ops.push({
      descr: 'is at most',
      matches(field, op, values, media) {
        return performGenericOp(field, media, values[0],
          (input, value) => input != null && input <= value);
      },
      placeholder: [placeholderText],
      numValues: 1,
      inputType: ['number'],
    });
  }

  ops.push({
    descr: 'equals',
    matches(field, op, values, media) {
      return performGenericOp(field, media, values[0],
        (input, value) => input != null && input == value);
    },
    placeholder: [placeholderText],
    numValues: 1,
    inputType: ['number'],
  });

  ops.push({
    descr: 'not equals',
    matches(field, op, values, media) {
      return performGenericOp(field, media, values[0],
        (input, value) => input == null || input != value);
    },
    placeholder: [placeholderText],
    numValues: 1,
    inputType: ['number'],
  });

  return { ops };
}

function gpsIsWithin(field, op, values, media) {
  if (!('lat' in media)) {
    return false;
  }

  const userLat = parseFloat(values[0]);
  const userLon = parseFloat(values[1]);
  const userRadius = parseFloat(values[2]);

  return (userLat - userRadius) <= media.lat && (userLat + userRadius) >= media.lat
         && (userLon - userRadius) <= media.lon && (userLon + userRadius) >= media.lon;
}

const gpsSearch = {
  ops: [
    {
      descr: 'is within',
      matches(field, op, values, media) {
        return gpsIsWithin(field, op, values, media);
      },
      placeholder: ['lat', 'lon', 'radius'],
      numValues: 3,
      inputType: ['number', 'number', 'number'],
      inputStep: ['any', 'any', 'any'],
    },
    {
      descr: 'is outside',
      matches(field, op, values, media) {
        if (!('lat' in media)) {
          return false;
        }

        return !gpsIsWithin(field, op, values, media);
      },
      placeholder: ['lat', 'lon', 'radius'],
      numValues: 3,
      inputType: ['number', 'number', 'number'],
      inputStep: ['any', 'any', 'any'],
    },
    {
      descr: 'is set',
      matches(field, op, values, media) {
        return performGenericOp(field, media, null,
          (input, value) => input != null && input !== '');
      },
      numValues: 0,
    },
    {
      descr: 'is not set',
      matches(field, op, values, media) {
        return performGenericOp(field, media, null,
          (input, value) => input == null || input === '');
      },
      numValues: 0,
    },
  ],
};

const fileExtSearch = {
  ops: [
    {
      descr: 'is',
      matches(field, op, values, media) {
        return performGenericOp(field, media, values[0],
          (input, value) => input != null && input.toLowerCase().endsWith(`.${value.toLowerCase()}`));
      },
      numValues: 1,
    },
    {
      descr: 'is not',
      matches(field, op, values, media) {
        return performGenericOp(field, media, values[0],
          (input, value) => input == null || !input.toLowerCase().endsWith(`.${value.toLowerCase()}`));
      },
      numValues: 1,
    },
  ],
};

const searchFields = [
  {
    title: 'Any Text',
    search: textSearch,
    searchFields: ['camera', 'comment', 'event_name', 'link', 'tag_name', 'title'],
  },
  {
    title: 'Camera',
    search: textSearch,
    searchFields: ['camera'],
  },
  {
    title: 'Comment',
    search: textSearch,
    searchFields: ['comment'],
  },
  {
    title: 'Date',
    search: dateSearch,
    searchFields: ['exposure_time'],
  },
  {
    title: 'Event ID',
    search: createNumberSearch(null, false),
    searchFields: ['event_id'],
  },
  {
    title: 'Event Name',
    search: textSearch,
    searchFields: ['event_name'],
  },
  {
    title: 'Filename',
    search: textSearch,
    searchFields: ['link'],
  },
  {
    title: 'File Extension',
    search: fileExtSearch,
    searchFields: ['link'],
  },
  {
    title: 'File Size',
    search: createNumberSearch('bytes', true),
    searchFields: ['filesize'],
  },
  {
    title: 'GPS Coordinate',
    search: gpsSearch,
    searchFields: ['lat'],
  },
  {
    title: 'Photo Height',
    search: createNumberSearch('pixels', true),
    searchFields: ['height'],
  },
  {
    title: 'Photo Width',
    search: createNumberSearch('pixels', true),
    searchFields: ['width'],
  },
  {
    title: 'Photo W/H Ratio',
    search: createNumberSearch(null, true),
    searchFields: ['photo_ratio'],
  },
  {
    title: 'Rating',
    search: createNumberSearch(null, true),
    searchFields: ['rating'],
    validValues: [['Unrated', '0'], ['&starf;', '1'], ['&starf;&starf;', '2'],
      ['&starf;&starf;&starf;', '3'], ['&starf;&starf;&starf;&starf;', '4'],
      ['&starf;&starf;&starf;&starf;&starf;', '5']],
  },
  {
    title: 'Tag ID',
    search: createNumberSearch(null, false),
    searchFields: ['tag_id'],
  },
  {
    title: 'Tag Name',
    search: textSearch,
    searchFields: ['tag_name'],
  },
  {
    title: 'Title',
    search: textSearch,
    searchFields: ['title'],
  },
  {
    title: 'Total Photos',
    search: createNumberSearch(null, true),
    searchFields: ['num_photos'],
  },
  {
    title: 'Total Videos',
    search: createNumberSearch(null, true),
    searchFields: ['num_videos'],
  },
  {
    title: 'Type',
    search: mediaTypeSearch,
    searchFields: ['type'],
    validValues: [['event', 'events'], ['photo', 'photo'], ['raw photo', 'raw_photo'],
                  ['tag', 'tags'], ['video', 'video'], ['year', 'years']],
  },
  {
    title: 'Video Duration',
    search: createNumberSearch('secs', true),
    searchFields: ['clip_duration_secs'],
  },
];

function performSearch(allItems) {
  const allCriteria = [];

  for (const searchCriteria of getSearchQueryParams()) {
    // FIXME - doesn't support comma in value
    const parts = searchCriteria.split(',');
    if (parts.length < 2) {
      continue;
    }

    const criteria = { field: null, op: null, searchValues: parts.slice(2, parts.length) };

    for (const searchField of searchFields) {
      if (searchField.title === parts[0]) {
        criteria.field = searchField;
        break;
      }
    }

    if (criteria.field == null) {
      continue;
    }

    for (const searchOp of criteria.field.search.ops) {
      if (searchOp.descr === parts[1]) {
        criteria.op = searchOp;
        break;
      }
    }

    if (criteria.op == null || criteria.op.numValues !== criteria.searchValues.length) {
      continue;
    }

    allCriteria.push(criteria);
  }

  if (allCriteria.length === 0) {
    // Create an operator that always returns true so that all media, events and tags are shown.
    const noopField = { title: null, search: textSearch, searchFields: ['noop'] };
    const trueOp = { descr: 'equals', matches(field, op, values, media) { return true; }, numValues: 0 };
    allCriteria.push({ field: noopField, op: trueOp, searchValues: [] });
  }

  const matchPolicy = getQueryParameter('match_policy', 'all'); // any,none,all

  const tagNames = {};
  for (const tag of allItems.tags) {
    tagNames[tag.id] = tag.title;
  }

  const eventNames = {};
  for (const event of allItems.events) {
    eventNames[event.id] = event.title;
  }

  const fileExtensions = new Set([]);

  const ret = [];
  for (const mediaType of [['media', ''], ['events', 'Event: '], ['tags', 'Tag: '],
                           ['years', 'Year: ']]) {
    for (const media of allItems[mediaType[0]]) {
      if (!('type' in media)) {
        media.type = mediaType[0];
      }

      if ('tags' in media) {
        // Write out the tag name into the media element to simplify code for the text search.
        media.tag_id = [];
        media.tag_name = [];
        for (const tagId of media.tags) {
          media.tag_id.push(tagId);
          media.tag_name.push(tagNames[tagId]);
        }
      }

      if ('event_id' in media) {
        // Write out the event name into the media element to simplify code for the text search.
        media.event_name = eventNames[media.event_id];
      }

      if (mediaType[0] !== 'media') {
        media.time_created = media.min_date;
        media.exposure_time = media.max_date;
      }

      if (mediaType[0] === 'events') {
        media.event_id = media.id;
        media.event_name = media.title;
      } else if (mediaType[0] === 'tags') {
        media.tag_id = media.id;
        media.tag_name = media.title;
      }

      if ('width' in media) {
        media.photo_ratio = media.width / media.height;
      }

      if ('link' in media) {
        const idx = media.link.lastIndexOf('.');
        if (idx !== -1) {
          fileExtensions.add(media.link.substring(idx + 1).toLowerCase());
        }
      }

      let numFound = 0;
      for (const criteria of allCriteria) {
        if (criteria.op.matches(criteria.field, criteria.op, criteria.searchValues, media)) {
          numFound += 1;
        }
      }

      let matches = false;
      if (matchPolicy === 'none') {
        matches = numFound === 0;
      } else if (matchPolicy === 'all') {
        matches = numFound === allCriteria.length;
      } else {
        matches = numFound > 0;
      }

      if (matches) {
        if (mediaType[1]) {
          if (media.title) {
            media.title = mediaType[1] + media.title;
          } else {
            media.title = mediaType[1];
          }
        }

        ret.push(media);
      }
    }
  }

  const sortedTypes = {photo: 0, raw_photo: 0, video: 0, events: 1, tags: 2, years: 3};
  const sortby = getQueryParameter('sortby', 'taken'); // taken,created
  const sortField = sortby === 'created' ? 'time_created' : 'exposure_time';

  ret.sort((a, b) => {
    if (sortedTypes[a.type] < sortedTypes[b.type]) {
      return -1;
    } else if (sortedTypes[a.type] > sortedTypes[b.type]) {
      return 1;
    } else {
      if (a[sortField] < b[sortField]) {
        return 1;
      } else if (a[sortField] > b[sortField]) {
        return -1;
      } else {
        return 0;
      }
    }
  });

  for (const field of searchFields) {
    if (field.title === 'File Extension') {
      field.validValues = [];

      const sortedExtensions = Array.from(fileExtensions);
      sortedExtensions.sort();

      for (const ext of sortedExtensions) {
        field.validValues.push([ext, ext]);
      }
      break;
    }
  }

  return ret;
}

function processJson(resp, readyFunc) {
  const eventNames = {};
  for (const evt of resp.events) {
    eventNames[evt.id] = 'title' in evt ? evt.title : `Unnamed ${evt.id}`;
  }

  const tagNames = {};
  for (const tag of resp.tags) {
    tagNames[tag.id] = tag.title;
  }

  document.title = `${resp.title}: Search`;
  let ele = document.querySelector('#title');
  if (ele) {
    ele.innerText = document.title;
  }

  ele = document.querySelector('#generated_timestamp');
  if (ele) {
    ele.innerText = `at ${resp.generated_at}`;
  }

  ele = document.querySelector('#app_version');
  if (ele) {
    ele.innerText = resp.version_label;
  }

  const allMedia = performSearch(resp);
  readyFunc(allMedia, eventNames, tagNames, resp.extra_header);
}

function loadJson(readyFunc, errorFunc) {
  /*
   * Read the media from a javascript file rather than as a JSON file using XMLHttpRequest
   * to work around browser mitigations that are in place for CVE-2019-11730. This change allows
   * the search and screensaver pages to function correctly when accessed over a file URI.
   */

  const scr = document.createElement('script');
  scr.setAttribute('src', 'media.js');
  scr.onload = function () { processJson(getAllMediaViaJsFile(), readyFunc); };
  scr.onerror = function () { errorFunc(); };
  document.body.appendChild(scr);
}
