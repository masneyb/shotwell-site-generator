/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2020-2021 Brian Masney <masneyb@onstation.org>
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
    return `${(size / (1024 * 1024 * 1024)).toFixed(1)}GiB`;
  } if (size > 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)}MiB`;
  } if (size > 1024) {
    return `${(size / (1024)).toFixed(1)}KiB`;
  }
  return `${size} bytes`;
}

function getNumberString(number, singular, plural) {
  return number == 1 ? `${number.toLocaleString()} ${singular}` : `${number.toLocaleString()} ${plural}`;
}

function createMediaStatsHtml(entity, eventNames, tags, searchLinkGenerator, showTitle) {
  let ret = [];
  if (showTitle && 'title' in entity && entity.title) {
    if (entity.title_prefix) {
      ret.push(entity.title_prefix + entity.title);
    } else {
      ret.push(entity.title);
    }
  }

  if (entity.num_photos > 0) {
    ret.push(getNumberString(entity.num_photos, 'photo', 'photos'));
  }

  if (entity.num_videos > 0) {
    ret.push(getNumberString(entity.num_videos, 'video', 'videos'));
  }

  if ('num_events' in entity && entity.num_events > 1) {
    ret.push(`${entity.num_events.toLocaleString()} events`);
  }

  if ('exposure_time_pretty' in entity) {
    ret.push(entity.exposure_time_pretty);
  }

  if (entity.date_range) {
    ret.push(entity.date_range);
  }

  if (entity.megapixels) {
    ret.push(`${entity.megapixels}MP`);
  }

  if (entity.filesize) {
    ret.push(getPrettyFileSize(entity.filesize));
  }

  if (entity.width) {
    ret.push(`${entity.width}x${entity.height}`);
  }

  if (entity.clip_duration) {
    ret.push(entity.clip_duration);
  }

  if ('camera' in entity) {
    const anchorOpts = searchLinkGenerator('Camera', 'equals', entity.camera);
    ret.push(`<a ${anchorOpts}>${entity.camera}</a>`);
  }

  if ('exif' in entity) {
    ret = ret.concat(entity.exif);
  }

  if ('metadata_text' in entity) {
    ret.push(`<a target="_new" href="${entity.metadata_text}">Metadata</a>`);
  }

  if (entity.event_id && entity.type !== 'events') {
    const anchorOpts = searchLinkGenerator('Event ID', 'equals', entity.event_id);
    ret.push(`Event: <a ${anchorOpts}>${eventNames[entity.event_id]}</a>`);
  }

  if (entity.tags && entity.type !== 'tags') {
    const parentTags = new Set([]);
    for (const tagId of entity.tags) {
      if (tags[tagId].parent_tag_id !== null) {
        parentTags.add(tags[tagId].parent_tag_id);
      }
    }

    for (const tagId of entity.tags) {
      if (!parentTags.has(tagId)) {
        const anchorOpts = searchLinkGenerator('Tag ID', 'equals', tagId);
        ret.push(`Tag: <a ${anchorOpts}>${tags[tagId].title}</a>`);
      }
    }
  }

  if ('lat' in entity) {
    const anchorOpts = searchLinkGenerator('GPS Coordinate', 'is within', `${entity.lat},${entity.lon},0.01`);
    ret.push(`<a ${anchorOpts}>GPS ${entity.lat},${entity.lon}</a>`);
  }

  if ('motion_photo' in entity && 'mp4' in entity.motion_photo) {
    ret.push(`<a target="_new" href="${entity.motion_photo.mp4}">Motion Photo</a>`);
  }

  if ('rating' in entity) {
    const anchorOpts = searchLinkGenerator('Rating', 'is at least', entity.rating);
    const stars = '&starf;'.repeat(entity.rating) + '&star;'.repeat(5 - entity.rating);
    ret.push(`<a ${anchorOpts}>${stars}</a>`);
  }

  for (let i = 0; i < ret.length; i += 1) {
    ret[i] = `<span class="media_stat">${ret[i]}</span>`;
  }
  return ret.join(' ');
}

function generateSearchUrl(criterias, matchPolicy) {
  const qs = [];
  for (const criteria of criterias) {
    qs.push(`search=${encodeURI(criteria)}`);
  }
  if (matchPolicy !== 'all') {
    qs.push(`match_policy=${matchPolicy}`);
  }
  return `search.html?${qs.join('&')}#`;
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
  const func = (input, searchterm) => input.toLowerCase().includes(searchterm);
  return doTextSearch(fieldInfo, op, value, media, func);
}

function textSearchContainsWord(fieldInfo, op, value, media) {
  return doTextSearch(fieldInfo, op, value, media, (input, searchterm) => {
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
        return performGenericOp(field, media, values[0], (input, value) => input != null && input.toLowerCase() === value.toLowerCase());
      },
      numValues: 1,
    },
    {
      descr: 'does not equal',
      matches(field, op, values, media) {
        return performGenericOp(field, media, values[0], (input, value) => input == null || input.toLowerCase() !== value.toLowerCase());
      },
      numValues: 1,
    },
    {
      descr: 'starts with',
      matches(field, op, values, media) {
        return performGenericOp(field, media, values[0], (input, value) => input != null && input.toLowerCase().startsWith(value.toLowerCase()));
      },
      numValues: 1,
    },
    {
      descr: 'ends with',
      matches(field, op, values, media) {
        return performGenericOp(field, media, values[0], (input, value) => input != null && input.toLowerCase().endsWith(value.toLowerCase()));
      },
      numValues: 1,
    },
    {
      descr: 'is set',
      matches(field, op, values, media) {
        return performGenericOp(field, media, values[0], (input, value) => input != null && input !== '');
      },
      numValues: 0,
    },
    {
      descr: 'is not set',
      matches(field, op, values, media) {
        return performGenericOp(field, media, values[0], (input, value) => input == null || input === '');
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
        return performGenericOp(field, media, values[0], (input, value) => input != null && input.startsWith(value));
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
      descr: 'was taken on this week',
      matches(field, op, values, media) {
        return performGenericOp(field, media, null, (input, value) => {
          if (input == null) {
            return false;
          }

          const firstDate = new Date();
          firstDate.setDate(firstDate.getDate() - 6);
          const firstMonthDay = `${String(firstDate.getMonth() + 1).padStart(2, '0')}-${String(firstDate.getDate()).padStart(2, '0')}`;

          const lastDate = new Date();
          const lastMonthDay = `${String(lastDate.getMonth() + 1).padStart(2, '0')}-${String(lastDate.getDate()).padStart(2, '0')}`;

          const compareTo = input.split('T')[0].split('-').slice(1, 3).join('-');
          return firstMonthDay <= compareTo && compareTo <= lastMonthDay;
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
        return performGenericOp(field, media, values[0], (input, value) => input != null && input < value);
      },
      placeholder: ['yyyy-MM-dd'],
      numValues: 1,
    },
    {
      descr: 'is after',
      matches(field, op, values, media) {
        return performGenericOp(field, media, values[0], (input, value) => input != null && input > value);
      },
      placeholder: ['yyyy-MM-dd'],
      numValues: 1,
    },
    {
      descr: 'is between',
      matches(field, op, values, media) {
        return performGenericOp(field, media, values, (input, value) => input != null && input >= value[0] && input <= value[1]);
      },
      placeholder: ['yyyy-MM-dd', 'yyyy-MM-dd'],
      numValues: 2,
    },
    {
      descr: 'is set',
      matches(field, op, values, media) {
        return performGenericOp(field, media, null, (input, value) => input != null && input !== '');
      },
      numValues: 0,
    },
    {
      descr: 'is not set',
      matches(field, op, values, media) {
        return performGenericOp(field, media, null, (input, value) => input == null || input === '');
      },
      numValues: 0,
    },
  ],
};

function doMediaSearchEquals(input, value) {
  if (input == null) {
    return false;
  }

  // If the user searches for a photo, then include the other subtypes in that search.
  if (value === 'photo') {
    return ['photo', 'raw_photo', 'motion_photo'].indexOf(input) > -1;
  }

  return input === value;
}

const mediaTypeSearch = {
  ops: [
    {
      descr: 'is a',
      matches(field, op, values, media) {
        return performGenericOp(field, media, values[0], doMediaSearchEquals);
      },
      numValues: 1,
    },
    {
      descr: 'is not a',
      matches(field, op, values, media) {
        return performGenericOp(field, media, values[0], (input, value) => !doMediaSearchEquals(input, value));
      },
      numValues: 1,
    },
  ],
};

function createNumberSearch(placeholderText, showGtLt, showIsSet) {
  const ops = [];

  if (showGtLt) {
    ops.push({
      descr: 'is at least',
      matches(field, op, values, media) {
        return performGenericOp(field, media, values[0], (input, value) => input != null && input >= value);
      },
      placeholder: [placeholderText],
      numValues: 1,
      inputType: ['number'],
      inputSize: [5],
    });

    ops.push({
      descr: 'is at most',
      matches(field, op, values, media) {
        return performGenericOp(field, media, values[0], (input, value) => input != null && input <= value);
      },
      placeholder: [placeholderText],
      numValues: 1,
      inputType: ['number'],
      inputSize: [5],
    });
  }

  ops.push({
    descr: 'equals',
    matches(field, op, values, media) {
      return performGenericOp(field, media, values[0], (input, value) => input != null && input == value);
    },
    placeholder: [placeholderText],
    numValues: 1,
    inputType: ['number'],
    inputSize: [5],
  });

  ops.push({
    descr: 'not equals',
    matches(field, op, values, media) {
      return performGenericOp(field, media, values[0], (input, value) => input == null || input != value);
    },
    placeholder: [placeholderText],
    numValues: 1,
    inputType: ['number'],
    inputSize: [5],
  });

  if (showIsSet) {
    ops.push({
      descr: 'is set',
      matches(field, op, values, media) {
        return performGenericOp(field, media, null, (input, value) => input != null && input !== '');
      },
      numValues: 0,
    });

    ops.push({
      descr: 'is not set',
      matches(field, op, values, media) {
        return performGenericOp(field, media, null, (input, value) => input == null || input === '');
      },
      numValues: 0,
    });
  }

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
        return performGenericOp(field, media, null, (input, value) => input != null && input !== '');
      },
      numValues: 0,
    },
    {
      descr: 'is not set',
      matches(field, op, values, media) {
        return performGenericOp(field, media, null, (input, value) => input == null || input === '');
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
        return performGenericOp(field, media, values[0], (input, value) => input != null && input.toLowerCase().endsWith(`.${value.toLowerCase()}`));
      },
      numValues: 1,
    },
    {
      descr: 'is not',
      matches(field, op, values, media) {
        return performGenericOp(field, media, values[0], (input, value) => input == null || !input.toLowerCase().endsWith(`.${value.toLowerCase()}`));
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
    search: createNumberSearch(null, false, false),
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
    search: createNumberSearch('bytes', true, false),
    searchFields: ['filesize'],
  },
  {
    title: 'GPS Coordinate',
    search: gpsSearch,
    searchFields: ['lat'],
  },
  {
    title: 'Height',
    search: createNumberSearch('pixels', true, false),
    searchFields: ['height'],
  },
  {
    title: 'Megapixels',
    search: createNumberSearch(null, true, false),
    searchFields: ['megapixels'],
  },
  {
    title: 'Rating',
    search: createNumberSearch(null, true, false),
    searchFields: ['rating'],
    validValues: [['Unrated', '0'], ['&starf;', '1'], ['&starf;&starf;', '2'],
      ['&starf;&starf;&starf;', '3'], ['&starf;&starf;&starf;&starf;', '4'],
      ['&starf;&starf;&starf;&starf;&starf;', '5']],
  },
  {
    title: 'Tag ID',
    search: createNumberSearch(null, false, false),
    searchFields: ['tag_id'],
  },
  {
    title: 'Tag Name',
    search: textSearch,
    searchFields: ['tag_name'],
  },
  {
    title: 'Tag Parent ID',
    search: createNumberSearch(null, false, true),
    searchFields: ['parent_tag_id'],
  },
  {
    title: 'Title',
    search: textSearch,
    searchFields: ['title'],
  },
  {
    title: 'Total Photos',
    search: createNumberSearch(null, true, false),
    searchFields: ['num_photos'],
  },
  {
    title: 'Total Videos',
    search: createNumberSearch(null, true, false),
    searchFields: ['num_videos'],
  },
  {
    title: 'Type',
    search: mediaTypeSearch,
    searchFields: ['type'],
    validValues: [
      ['event', 'events'], ['photo', 'photo'], ['motion photo', 'motion_photo'],
      ['raw photo', 'raw_photo'], ['tag', 'tags'], ['video', 'video'],
      ['year', 'years'],
    ],
  },
  {
    title: 'Video Length',
    search: createNumberSearch('secs', true, false),
    searchFields: ['clip_duration_secs'],
  },
  {
    title: 'Width',
    search: createNumberSearch('pixels', true, false),
    searchFields: ['width'],
  },
  {
    title: 'W/H Ratio',
    search: createNumberSearch(null, true, false),
    searchFields: ['photo_ratio'],
  },
  {
    title: 'Year',
    search: createNumberSearch(null, true, false),
    searchFields: ['year'],
  },
];

function getSearchCriteria() {
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

  return allCriteria;
}

function doUpdateItems(allItems, eventNames, tags) {
  const fileExtensions = new Set([]);

  const ret = [];
  const types = [['media', ''], ['events', 'Event: '], ['tags', 'Tag: '], ['years', 'Year: ']];
  for (const mediaType of types) {
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
          media.tag_name.push(tags[tagId].title);
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

      if (mediaType[0] === 'years') {
        media.year = [media.id];
      } else if (mediaType[0] === 'events') {
        media.year = [];
        if ('years' in media) {
          for (const yearBlock of media.years) {
            media.year.push(yearBlock.year);
          }
        } else {
          media.year.push(media.min_date.split('-')[0]);
        }
      } else if (mediaType[0] === 'media') {
        media.year = [media.exposure_time.split('-')[0]];
      }

      if (mediaType[0] === 'events') {
        media.event_id = media.id;
        media.event_name = media.title;
      } else if (mediaType[0] === 'tags') {
        media.tag_id = [media.id];
        media.tag_name = [media.title];
        if (media.parent_tag_id !== null) {
          media.tag_id.push(media.parent_tag_id);
          media.tag_name.push(tags[media.parent_tag_id].title);
        }
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

      media.title_prefix = mediaType[1];
      ret.push(media);
    }
  }

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

function shortenPrettyDate(input) {
  const parts = input.split(' ');
  if (parts.length < 4) {
    return input;
  }

  return `${parts[1]} ${parts[2]} ${parts[3]}`;
}

function performSearch(allItems, eventNames, tags) {
  const allCriteria = getSearchCriteria();
  const matchPolicy = getQueryParameter('match_policy', 'all'); // any,none,all
  let minDate;
  let minDatePretty;
  let maxDate;
  let maxDatePretty;

  const ret = [];
  for (const media of allItems) {
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
      ret.push(media);

      if ('exposure_time' in media && 'exposure_time_pretty' in media) {
        if (minDate === undefined || media.exposure_time < minDate) {
          minDate = media.exposure_time;
          minDatePretty = media.exposure_time_pretty;
        }

        if (maxDate === undefined || media.exposure_time > maxDate) {
          maxDate = media.exposure_time;
          maxDatePretty = media.exposure_time_pretty;
        }
      }
    }
  }

  const sortedTypes = {
    photo: 1,
    motion_photo: 1,
    raw_photo: 1,
    video: 1,
    events: 2,
    tags: 3,
    years: 4,
  };

  // When searching by event or tags, change the sort priority so that those
  // entities show up at the top.
  for (const criteria of allCriteria) {
    if (criteria.field.title === 'Tag ID' || criteria.field.title === 'Tag Parent ID') {
      sortedTypes.tags = 0;
    } else if (criteria.field.title === 'Year') {
      sortedTypes.events = 0;
    }
  }

  const sortBy = getQueryParameter('sortby', 'takenZA'); // takenZA,takenAZ,createdZA,random
  if (sortBy === 'random') {
    shuffleArray(ret);
  } else {
    let sortField;
    let sortValLt;
    let sortValGt;
    if (sortBy === 'createdZA') {
      sortField = 'time_created';
      sortValLt = 1;
      sortValGt = -1;
    } else if (sortBy === 'takenAZ') {
      sortField = 'exposure_time';
      sortValLt = -1;
      sortValGt = 1;
    } else {
      sortField = 'exposure_time';
      sortValLt = 1;
      sortValGt = -1;
    }

    ret.sort((a, b) => {
      if (sortedTypes[a.type] < sortedTypes[b.type]) {
        return -1;
      }
      if (sortedTypes[a.type] > sortedTypes[b.type]) {
        return 1;
      }

      // No secondary sorting for tags
      if (a.type === 'tags') {
        return 0;
      }

      if (a[sortField] < b[sortField]) {
        return sortValLt;
      }
      if (a[sortField] > b[sortField]) {
        return sortValGt;
      }
      return 0;
    });
  }

  let dateRange;
  if (minDatePretty !== undefined) {
    minDatePretty = shortenPrettyDate(minDatePretty);
    maxDatePretty = shortenPrettyDate(maxDatePretty);
    if (minDatePretty === maxDatePretty) {
      dateRange = minDatePretty;
    } else {
      dateRange = `${minDatePretty} - ${maxDatePretty}`;
    }
  }

  return [ret, dateRange];
}

let processedMedia = null;
const eventNames = {};
const tags = {};
let extraHeader = null;
let mainTitle = null;

function processJson(readyFunc) {
  if (processedMedia == null) {
    const resp = getAllMediaViaJsFile();
    for (const evt of resp.events) {
      eventNames[evt.id] = 'title' in evt ? evt.title : `Unnamed ${evt.id}`;
    }

    for (const tag of resp.tags) {
      tags[tag.id] = tag;
    }

    processedMedia = doUpdateItems(resp, eventNames, tags);
    extraHeader = resp.extra_header;
    mainTitle = resp.title;

    ele = document.querySelector('#generated_timestamp');
    if (ele) {
      ele.innerText = `at ${resp.generated_at}`;
    }

    ele = document.querySelector('#app_version');
    if (ele) {
      ele.innerText = resp.version_label;
    }
  }

  const searchResults = performSearch(processedMedia, eventNames, tags);
  readyFunc(searchResults[0], extraHeader, mainTitle, searchResults[1]);
}