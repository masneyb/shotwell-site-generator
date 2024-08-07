/*
 * SPDX-License-Identifier: GPL-3.0
 * Copyright (C) 2020-2022 Brian Masney <masneyb@onstation.org>
 */

let randomSeed = null;

function getRandomSeed() {
  return randomSeed;
}

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
  /* eslint eqeqeq: 0 */
  return number == 1 ? `${number.toLocaleString()} ${singular}` : `${number.toLocaleString()} ${plural}`;
}

function createMediaStat(child) {
  const ret = document.createElement('span');
  ret.className = 'media_stat';
  ret.appendChild(child);
  return ret;
}

function createTextMediaStat(text) {
  return createMediaStat(document.createTextNode(text));
}

function createSearchLink(label, field, op, val, extraOnClick) {
  const anchor = document.createElement('a');
  anchor.href = '#';
  anchor.onclick = (event) => {
    if (extraOnClick) {
      extraOnClick(event);
    }
    searchPageLinkGenerator(event, [[field, op, val]]);
    return false;
  };
  anchor.innerText = label;
  return createMediaStat(anchor);
}

function generateSearchUrl(criterias, matchPolicy, iconSize, groupBy, sortBy) {
  const qs = [];
  for (const criteria of criterias) {
    qs.push(`search=${encodeURI(criteria)}`);
  }
  if (matchPolicy !== 'all') {
    qs.push(`match=${matchPolicy}`);
  }
  if (iconSize !== 'default') {
    qs.push(`icons=${iconSize}`);
  }
  if (groupBy !== 'none') {
    qs.push(`group=${groupBy}`);
  }
  if (sortBy !== 'default') {
    qs.push(`sort=${sortBy}`);
  }
  return `index.html?${qs.join('&')}#`;
}

function shuffleArray(arr, seed) {
  if (arr === null) {
    return;
  }

  /*
   * Use the Fisher-Yates algorithm to shuffle the array in place. Math.random() is not used
   * here since the Javascript random number implementation doesn't offer a way to provide a
   * starting seed. Use a simple Linear Congruential Generator (LCG) to generate
   * pseudo-randomized numbers. A starting seed is needed so that the QR code that's generated
   * on the slideshow can provide that seed so that a slideshow can be easily transfered in
   * place to a separate mobile device.
   */
  let rand = seed;
  for (let i = arr.length - 1; i > 0; i -= 1) {
    rand = (rand * 1103515245 + 12345) & 0x7fffffff;
    const j = rand % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
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

function getCurrentMonthDay() {
  const today = new Date();
  return `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
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
      descr: 'was taken on date',
      matches(field, op, values, media) {
        return performGenericOp(field, media, values[0], (input, value) => input != null && input.startsWith(value));
      },
      placeholder: ['yyyy-MM-dd'],
      inputPattern: ['[0-9]{4}-[0-9]{2}-[0-9]{2}'],
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
      inputPattern: ['[0-9]{2}-[0-9]{2}'],
      numValues: 1,
    },
    {
      descr: 'was taken on month',
      matches(field, op, values, media) {
        return performGenericOp(field, media, null, (input, value) => {
          if (input == null) {
            return false;
          }

          const compareTo = input.split('T')[0].split('-').slice(1, 2).join('-');
          return compareTo === values[0];
        });
      },
      placeholder: ['MM'],
      inputPattern: ['[0-9]{2}'],
      numValues: 1,
    },
    {
      descr: 'was taken on this day',
      matches(field, op, values, media) {
        return performGenericOp(field, media, null, (input, value) => {
          if (input == null) {
            return false;
          }

          const compareTo = input.split('T')[0].split('-').slice(1, 3).join('-');
          return compareTo === getCurrentMonthDay();
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
      inputPattern: ['[0-9]{4}-[0-9]{2}-[0-9]{2}'],
      numValues: 1,
    },
    {
      descr: 'is after',
      matches(field, op, values, media) {
        return performGenericOp(field, media, values[0], (input, value) => input != null && input > value);
      },
      placeholder: ['yyyy-MM-dd'],
      inputPattern: ['[0-9]{4}-[0-9]{2}-[0-9]{2}'],
      numValues: 1,
    },
    {
      descr: 'is between',
      matches(field, op, values, media) {
        return performGenericOp(field, media, values, (input, value) => input != null && input >= value[0] && input <= value[1]);
      },
      placeholder: ['yyyy-MM-dd', 'yyyy-MM-dd'],
      inputPattern: ['[0-9]{4}-[0-9]{2}-[0-9]{2}', '[0-9]{4}-[0-9]{2}-[0-9]{2}'],
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
  if (value === 'media') {
    return ['photo', 'motion_photo', 'video'].indexOf(input) > -1;
  }

  if (value === 'photo') {
    return ['photo', 'motion_photo'].indexOf(input) > -1;
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

function createNumberSearch(placeholderText, showGtLt, showIsSet, inputMin, inputMax, inputStep) {
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
      inputMin: [inputMin],
      inputMax: [inputMax],
      inputStep: [inputStep],
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
      inputMin: [inputMin],
      inputMax: [inputMax],
      inputStep: [inputStep],
      inputSize: [5],
    });
  }

  ops.push({
    descr: 'equals',
    matches(field, op, values, media) {
      /* eslint eqeqeq: 0 */
      return performGenericOp(field, media, values[0], (input, value) => input != null && input == value);
    },
    placeholder: [placeholderText],
    numValues: 1,
    inputType: ['number'],
    inputMin: [inputMin],
    inputMax: [inputMax],
    inputStep: [inputStep],
    inputSize: [5],
  });

  ops.push({
    descr: 'not equals',
    matches(field, op, values, media) {
      /* eslint eqeqeq: 0 */
      return performGenericOp(field, media, values[0], (input, value) => input == null || input != value);
    },
    placeholder: [placeholderText],
    numValues: 1,
    inputType: ['number'],
    inputMin: [inputMin],
    inputMax: [inputMax],
    inputStep: [inputStep],
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

function createIntegerSearch(placeholderText, showGtLt, showIsSet, inputMin, inputMax) {
  return createNumberSearch(placeholderText, showGtLt, showIsSet, inputMin, inputMax, 1);
}

function createDecimalSearch(placeholderText, showGtLt, showIsSet, inputMin, inputMax) {
  return createNumberSearch(placeholderText, showGtLt, showIsSet, inputMin, inputMax, 0.1);
}

function haversineDistance(coord1, coord2) {
  // Haversine formula to calculate distance between two GPS coordinates
  const [lat1, lon1] = coord1.map((deg) => deg * (Math.PI / 180));
  const [lat2, lon2] = coord2.map((deg) => deg * (Math.PI / 180));

  const dlat = lat2 - lat1;
  const dlon = lon2 - lon1;

  const a = Math.sin(dlat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return 6371 * c; // 6371 is the Earth's radius in km
}

function gpsIsWithin(field, op, values, media) {
  if (!('lat' in media)) {
    return false;
  }

  const userLat = parseFloat(values[0]);
  const userLon = parseFloat(values[1]);
  const userDistKm = parseFloat(values[2]);

  return haversineDistance([userLat, userLon], [media.lat, media.lon]) <= userDistKm;
}

const gpsSearch = {
  ops: [
    {
      descr: 'is within',
      matches(field, op, values, media) {
        return gpsIsWithin(field, op, values, media);
      },
      placeholder: ['lat', 'lon', 'km'],
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
      placeholder: ['lat', 'lon', 'km'],
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
    search: createIntegerSearch(null, false, false, 0, null),
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
    search: createDecimalSearch('bytes', true, false, 0, null),
    searchFields: ['filesize'],
  },
  {
    title: 'FPS',
    search: createIntegerSearch('fps', true, true, 0, null),
    searchFields: ['fps'],
  },
  {
    title: 'GPS Coordinate',
    search: gpsSearch,
    searchFields: ['lat'],
  },
  {
    title: 'Height',
    search: createIntegerSearch('pixels', true, false, 0, null),
    searchFields: ['height'],
  },
  {
    title: 'Megapixels',
    search: createDecimalSearch(null, true, false, 0, null),
    searchFields: ['megapixels'],
  },
  {
    title: 'Rating',
    search: createIntegerSearch(null, true, false, 0, 5),
    searchFields: ['rating'],
    validValues: [['Unrated', '0'], ['★', '1'], ['★★', '2'], ['★★★', '3'], ['★★★★', '4'], ['★★★★★', '5']],
  },
  {
    title: 'Tag ID',
    search: createIntegerSearch(null, false, false, 0, null),
    searchFields: ['tag_id'],
  },
  {
    title: 'Tag Name',
    search: textSearch,
    searchFields: ['tag_name'],
  },
  {
    title: 'Tag Parent ID',
    search: createIntegerSearch(null, false, true, 0, null),
    searchFields: ['parent_tag_id'],
  },
  {
    title: 'Title',
    search: textSearch,
    searchFields: ['title'],
  },
  {
    title: 'Total Photos',
    search: createIntegerSearch(null, true, false, 0, null),
    searchFields: ['num_photos'],
  },
  {
    title: 'Total Videos',
    search: createIntegerSearch(null, true, false, 0, null),
    searchFields: ['num_videos'],
  },
  {
    title: 'Type',
    search: mediaTypeSearch,
    searchFields: ['type'],
    validValues: [
      ['media', 'media'], ['photo', 'photo'], ['motion photo', 'motion_photo'],
      ['video', 'video'], ['event', 'events'], ['tag', 'tags'],
      ['year', 'years'],
    ],
  },
  {
    title: 'Video Length',
    search: createDecimalSearch('secs', true, false, 0, null),
    searchFields: ['clip_duration_secs'],
  },
  {
    title: 'Width',
    search: createIntegerSearch('pixels', true, false, 0, null),
    searchFields: ['width'],
  },
  {
    title: 'W/H Ratio',
    search: createDecimalSearch(null, true, false, 0, null),
    searchFields: ['photo_ratio'],
  },
  {
    title: 'Year',
    search: createIntegerSearch(null, true, false, 1800, null),
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

function getPreferredView(allCriteria, mainTitle, eventNames, tags) {
  // Search criteria can be chained in any order. Get the distinct types and order below.
  let eventTitle = null;
  let eventDefaultSort = null;
  let yearTitle = null;
  let yearDefaultSort = null;
  let tagTitle = null;
  let tagView = null;
  let yearView = null;

  for (const criteria of allCriteria) {
    if (criteria.field.title === 'Type' && criteria.op.descr === 'is a' && criteria.searchValues[0] === 'years') {
      yearTitle = `${mainTitle}: All Years`;
      yearDefaultSort = 'takenZA';
    } else if (criteria.field.title === 'Year' && criteria.op.descr === 'equals') {
      yearTitle = `${mainTitle}: Year ${criteria.searchValues[0]}`;
      // Used for generating search links when searching for events.
      yearView = criteria.searchValues[0];
      yearDefaultSort = 'takenAZ';
    } else if (criteria.field.title === 'Type' && criteria.op.descr === 'is a' && criteria.searchValues[0] === 'events') {
      eventTitle = `${mainTitle}: All Events`;
      eventDefaultSort = 'takenZA';
    } else if (criteria.field.title === 'Event ID' && criteria.op.descr === 'equals') {
      let eventName = eventNames[criteria.searchValues[0]];
      if (eventName === undefined) {
        eventName = 'Unknown event';
      }
      eventTitle = `${mainTitle}: ${eventName}`;
      eventDefaultSort = 'takenAZ';
    } else if (criteria.field.title === 'Type' && criteria.op.descr === 'is a' && criteria.searchValues[0] === 'tags') {
      tagTitle = `${mainTitle}: All Tags`;
    } else if (criteria.field.title === 'Tag ID' && criteria.op.descr === 'equals') {
      tagView = tags[criteria.searchValues[0]];
      tagTitle = `${mainTitle}: ${tagView !== undefined ? tagView.title : 'Unknown tag'}`;
    }
  }

  /* eslint indent: 0 */
  const views = [{
                   title: eventTitle,
                   cssSelector: 'events_link',
                   defaultSort: eventDefaultSort,
                   currentYearView: null,
                   searchTag: null,
                 },
                 {
                   title: yearTitle,
                   cssSelector: 'years_link',
                   defaultSort: yearDefaultSort,
                   currentYearView: yearView,
                   searchTag: null,
                 },
                 {
                   title: tagTitle,
                   cssSelector: 'tags_link',
                   defaultSort: 'takenZA',
                   currentYearView: null,
                   searchTag: tagView,
                 },
                 {
                   title: `${mainTitle}: Search`,
                   cssSelector: null,
                   defaultSort: 'takenZA',
                   currentYearView: null,
                   searchTag: null,
                 }];

  return views.find((ent) => ent.title !== null);
}

function processGpsGroups(allItems, maxDistanceKm) {
  const groups = [];
  for (const [index, media] of allItems.entries()) {
    if (!('lat' in media)) {
      media.groupIndex = Number.MAX_SAFE_INTEGER;
      media.groupName = 'No Coordinate';
      continue;
    }

    let bestGroup;
    let bestGroupDist;
    for (const group of groups) {
      const groupLat = group.totalLat / group.mediaIndexes.length;
      const groupLon = group.totalLon / group.mediaIndexes.length;
      const thisDist = haversineDistance([media.lat, media.lon], [groupLat, groupLon]);
      if (thisDist <= maxDistanceKm && (bestGroupDist === undefined || thisDist < bestGroupDist)) {
        bestGroup = group;
        bestGroupDist = thisDist;
      }
    }

    if (bestGroup != undefined) {
      bestGroup.totalLat += media.lat;
      bestGroup.totalLon += media.lon;
      bestGroup.mediaIndexes.push(index);
    } else {
      groups.push({ totalLat: media.lat, totalLon: media.lon, mediaIndexes: [index] });
    }
  }

  groups.sort((a, b) => {
    if (a.mediaIndexes.length === b.mediaIndexes.length) {
      return 0;
    }
    return a.mediaIndexes.length > b.mediaIndexes.length ? -1 : 1;
  });

  for (const [groupIndex, group] of groups.entries()) {
    const avgLat = group.totalLat / group.mediaIndexes.length;
    const avgLon = group.totalLon / group.mediaIndexes.length;
    const groupName = `GPS ${avgLat.toFixed(6)}, ${avgLon.toFixed(6)}`;

    for (const index of group.mediaIndexes) {
      allItems[index].groupIndex = groupIndex;
      allItems[index].groupName = groupName;
    }
  }
}

function processCameraGroups(allItems) {
  const cameraSet = {};
  for (const [index, media] of allItems.entries()) {
    if (!('camera' in media)) {
      media.groupIndex = Number.MAX_SAFE_INTEGER;
      media.groupName = 'No Camera Metadata';
      continue;
    }

    if (media.camera in cameraSet) {
      cameraSet[media.camera].push(index);
    } else {
      cameraSet[media.camera] = [index];
    }
  }

  groups = [];
  for (const camera of Object.keys(cameraSet)) {
    groups.push([camera, cameraSet[camera]]);
  }

  groups.sort((a, b) => {
    if (a[1].length === b[1].length) {
      return 0;
    }
    return a[1].length > b[1].length ? -1 : 1;
  });

  for (let index = 0; index < groups.length; index += 1) {
    for (const mediaId of groups[index][1]) {
      allItems[mediaId].groupIndex = index;
      allItems[mediaId].groupName = groups[index][0];
    }
  }
}
function setZeroGroupIndexAndName(allItems, groupNameFunc) {
  for (media of allItems) {
    media.groupIndex = 0;
    media.groupName = groupNameFunc(media);
  }
}

function groupAllMedia(allItems) {
  const groupBy = getQueryParameter('group', 'none');

  if (groupBy === 'year') {
    setZeroGroupIndexAndName(allItems, (media) => {
      if (!('exposure_time_pretty' in media)) {
        return null;
      }
      const parts = media.exposure_time_pretty.split(' ');
      return parts.length === 1 ? parts[0] : parts[3];
    });
  } else if (groupBy === 'month') {
    setZeroGroupIndexAndName(allItems, (media) => {
      if (!('exposure_time_pretty' in media)) {
        return null;
      }
      const parts = media.exposure_time_pretty.split(' ');
      return parts.length === 1 ? parts[0] : `${parts[1]} ${parts[3]}`;
    });
  } else if (groupBy === 'day') {
    setZeroGroupIndexAndName(allItems, (media) => {
      if (!('exposure_time_pretty' in media)) {
        return null;
      }
      const parts = media.exposure_time_pretty.split(' ');
      return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]}`;
    });
  } else if (groupBy === 'camera') {
    processCameraGroups(allItems);
  } else if (groupBy === 'gps1km') {
    processGpsGroups(allItems, 1);
  } else if (groupBy === 'gps5km') {
    processGpsGroups(allItems, 5);
  } else if (groupBy === 'gps10km') {
    processGpsGroups(allItems, 10);
  } else if (groupBy === 'gps50km') {
    processGpsGroups(allItems, 50);
  } else if (groupBy === 'gps100km') {
    processGpsGroups(allItems, 100);
  } else {
    setZeroGroupIndexAndName(allItems, (media) => { return null; });
  }
}

function performSearch(allItems, allCriteria, defaultSort) {
  const matchPolicy = getQueryParameter('match', 'all'); // any,none,all
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

  groupAllMedia(ret);

  const sortedTypes = {
    photo: 1,
    motion_photo: 1,
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

  let sortBy = getQueryParameter('sort', 'default'); // default,takenZA,takenAZ,createdZA,createdAZ,random
  if (sortBy === 'default') {
    sortBy = defaultSort;
  }

  if (sortBy === 'random') {
    randomSeed = getIntQueryParameter('seed', Date.now());
    shuffleArray(ret, randomSeed);
  } else {
    randomSeed = null;
    let sortField;
    let sortValLt;
    let sortValGt;
    if (sortBy === 'createdZA') {
      sortField = 'time_created';
      sortValLt = 1;
      sortValGt = -1;
    } else if (sortBy === 'createdAZ') {
      sortField = 'time_created';
      sortValLt = -1;
      sortValGt = 1;
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
      if (a.groupIndex < b.groupIndex) {
        return -1;
      }
      if (a.groupIndex > b.groupIndex) {
        return 1;
      }

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

    let ele = document.querySelector('#generated_timestamp');
    if (ele) {
      ele.innerText = `at ${resp.generated_at}`;
    }

    ele = document.querySelector('#app_version');
    if (ele) {
      ele.innerText = resp.version_label;
    }
  }

  const allCriteria = getSearchCriteria();
  const preferredView = getPreferredView(allCriteria, mainTitle, eventNames, tags);
  const searchResults = performSearch(processedMedia, allCriteria, preferredView.defaultSort);
  readyFunc(searchResults[0], extraHeader, searchResults[1], preferredView);
}
