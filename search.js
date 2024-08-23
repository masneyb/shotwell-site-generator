/*
 * SPDX-License-Identifier: GPL-3.0
 * Copyright (C) 2020-2024 Brian Masney <masneyb@onstation.org>
 */

let currentPageNumber = 1;
let allMedia = null;
let eventNames = null;
let tags = null;
let mediaWriter = null;
let dateRange = null;
let currentYearView = null;
let preferredPageIconSize = null;
let currentGroupName = null;
let randomSeed = null;

// Search controls
let nextSearchInput = 0;

// Slideshow
let preFullscreenScrollX = -1;
let preFullscreenScrollY = -1;
let allMediaFullscreenIndex = -1;
let inPhotoFrameMode = false;
let fullScreenPhotoUpdateSecs = 0;
let fullscreenPhotoUpdateTimer = null;
let fullscreenReinstateSlideshowSecs = 0;
let fullscreenReinstateSlideshowTimer = null;
let wakeLock = null;

function getQueryParameter(name, defaultValue) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.has(name) ? urlParams.get(name) : defaultValue;
}

function getIntQueryParameter(name, defaultValue) {
  const val = getQueryParameter(name, null);
  return val != null ? parseInt(val, 10) : defaultValue;
}

window.alwaysShowAnimations = getIntQueryParameter('animate', 0);
window.alwaysAnimateMotionPhotos = getIntQueryParameter('animateMotionPhotos', 0);

function writeCsvRow(cols) {
  let ret = '';
  for (let i = 0; i < cols.length; i += 1) {
    if (i > 0) {
      ret += ',';
    }
    ret += `"${encodeURIComponent(cols[i])}"`;
  }
  ret += encodeURIComponent('\n');

  return ret;
}

function getCsvUriData() {
  let ret = 'data:text/csv;charset=utf-8,';

  /* eslint indent: 0 */
  ret += writeCsvRow(['ID', 'Type', 'Path', 'Original Size', 'Original Size w/ Artifacts',
                      'Rating', 'Width', 'Height', 'Exposure Time', 'Event ID', 'Latitude',
                      'Longitude', 'Title', 'Camera', 'Camera Settings']);

  for (const media of allMedia) {
    const cols = [];
    cols.push(media.id);
    cols.push(media.type);
    cols.push(media.link);
    cols.push('filesize' in media ? media.filesize.toString() : '');
    cols.push('artifact_filesize' in media ? media.artifact_filesize.toString() : '');
    cols.push('rating' in media ? media.rating.toString() : '');
    cols.push('width' in media ? media.width.toString() : '');
    cols.push('height' in media ? media.height.toString() : '');
    cols.push('exposure_time' in media ? media.exposure_time : '');
    cols.push('event_id' in media ? media.event_id.toString() : '');
    cols.push('lat' in media ? media.lat.toString() : '');
    cols.push('lon' in media ? media.lon.toString() : '');
    cols.push('title' in media ? media.title : '');
    cols.push('camera' in media ? media.camera : '');
    cols.push('exif' in media ? media.exif.join(' ') : '');
    ret += writeCsvRow(cols);
  }

  return ret;
}

function downloadCsv(event) {
  if (event.detail !== 1) {
    return;
  }

  const link = document.createElement('a');
  link.href = getCsvUriData();
  link.download = 'media.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
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
    // eslint-disable-next-line no-bitwise
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
        return performGenericOp(field, media, values[0], (input, _value) => input != null && input !== '');
      },
      numValues: 0,
    },
    {
      descr: 'is not set',
      matches(field, op, values, media) {
        return performGenericOp(field, media, values[0], (input, _value) => input == null || input === '');
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
        return performGenericOp(field, media, null, (input, _value) => {
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
        return performGenericOp(field, media, null, (input, _value) => {
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
        return performGenericOp(field, media, null, (input, _value) => {
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
        return performGenericOp(field, media, null, (input, _value) => {
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
        return performGenericOp(field, media, null, (input, _value) => {
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
        return performGenericOp(field, media, null, (input, _value) => input != null && input !== '');
      },
      numValues: 0,
    },
    {
      descr: 'is not set',
      matches(field, op, values, media) {
        return performGenericOp(field, media, null, (input, _value) => input == null || input === '');
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
        return performGenericOp(field, media, null, (input, _value) => input != null && input !== '');
      },
      numValues: 0,
    });

    ops.push({
      descr: 'is not set',
      matches(field, op, values, media) {
        return performGenericOp(field, media, null, (input, _value) => input == null || input === '');
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
        return performGenericOp(field, media, null, (input, _value) => input != null && input !== '');
      },
      numValues: 0,
    },
    {
      descr: 'is not set',
      matches(field, op, values, media) {
        return performGenericOp(field, media, null, (input, _value) => input == null || input === '');
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
    const trueOp = { descr: 'equals', matches(_field, _op, _values, _media) { return true; }, numValues: 0 };
    allCriteria.push({ field: noopField, op: trueOp, searchValues: [] });
  }

  return allCriteria;
}

function doUpdateItems(allItems) {
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

function getPreferredView(allCriteria, mainTitle) {
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
    setZeroGroupIndexAndName(allItems, (_media) => { return null; });
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

  let newDateRange;
  if (minDatePretty !== undefined) {
    minDatePretty = shortenPrettyDate(minDatePretty);
    maxDatePretty = shortenPrettyDate(maxDatePretty);
    if (minDatePretty === maxDatePretty) {
      newDateRange = minDatePretty;
    } else {
      newDateRange = `${minDatePretty} - ${maxDatePretty}`;
    }
  }

  return [ret, newDateRange];
}

const processedMetadata = {
  processedMedia: null,
  mainTitle: null,
  extraHeader: null,
};

function processJson() {
  if (processedMetadata.processedMedia == null) {
    const resp = getAllMediaViaJsFile();
    eventNames = {};
    for (const evt of resp.events) {
      eventNames[evt.id] = 'title' in evt ? evt.title : `Unnamed ${evt.id}`;
    }

    tags = {};
    for (const tag of resp.tags) {
      tags[tag.id] = tag;
    }

    processedMetadata.processedMedia = doUpdateItems(resp);
    processedMetadata.extraHeader = resp.extra_header;
    processedMetadata.mainTitle = resp.title;

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
  const preferredView = getPreferredView(allCriteria, processedMetadata.mainTitle);
  const searchResults = performSearch(processedMetadata.processedMedia, allCriteria,
                                      preferredView.defaultSort);
  populateMedia(searchResults[0], processedMetadata.extraHeader, searchResults[1], preferredView);
}

function createOptionNode(text, value) {
  const option = document.createElement('option');
  option.value = value;
  option.innerText = text;
  return option;
}

function removeAllChildren(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function addStatusMessage(parentEle, text) {
  const msgEle = document.createElement('div');
  msgEle.className = 'status';
  msgEle.appendChild(document.createTextNode(text));
  parentEle.replaceChildren(msgEle);
}

function updateOverallStatusMessage(text) {
  addStatusMessage(document.querySelector('#all_media'), text);
}

function hideResultsInfo() {
  removeAllChildren(document.querySelector('.summary_stats'));
  for (const search of ['.header_links']) {
    for (const ele of document.querySelectorAll(search)) {
      ele.style.display = 'none';
    }
  }
}

function setFullImageDisplay(shown) {
  document.querySelector('#description').style.display = 'none';

  const displayState = shown ? 'block' : 'none';
  for (const eleName of ['#fullimage_background', '#fullimage_container']) {
    const ele = document.querySelector(eleName);
    ele.style.display = displayState;
  }

  if (shown) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = 'auto';
    document.querySelector('#fullimage').removeAttribute('src');

    const videoEle = document.querySelector('#fullvideo');
    videoEle.pause();
    videoEle.removeAttribute('src');
    if (document.fullscreenElement != null && document.exitFullscreen) {
      document.exitFullscreen();
    }
  }
}

function updateSearchCriteria() {
  updateOverallStatusMessage('Searching');
  hideResultsInfo();

  setFullImageDisplay(false);

  window.setTimeout(() => {
    const searchArgs = [];
    for (const critChild of document.querySelector('#search_criterias').children) {
      const field = critChild.querySelector('.search_field').value;
      const op = critChild.querySelector('.search_op').value;

      let search = `${field},${op}`;
      for (const valChild of critChild.querySelector('.search_values').children) {
        search += `,${valChild.value}`;
      }
      searchArgs.push(`search=${encodeURIComponent(search)}`);
    }

    const matchPolicy = document.querySelector('#match').value;
    const sortBy = document.querySelector('#sort').value;
    const iconSize = document.querySelector('#icons').value;
    const groupBy = document.querySelector('#group').value;
    window.history.pushState({}, '', `index.html?${searchArgs.join('&')}&match=${matchPolicy}&sort=${sortBy}&icons=${iconSize}&group=${groupBy}#`);
    processJson();
  }, 0);
}

function updateCritieraIfValuesPopulated(idx) {
  const searchEles = document.querySelector(`#search_criteria${idx}`);
  for (const child of searchEles.querySelector('.search_values').children) {
    if (child.value === '' || !child.checkValidity()) {
      return;
    }
  }

  updateSearchCriteria();
}

function searchOpChanged(idx) {
  const searchEles = document.querySelector(`#search_criteria${idx}`);
  const field = searchFields[searchEles.querySelector('.search_field').selectedIndex];
  const op = field.search.ops[searchEles.querySelector('.search_op').selectedIndex];

  const values = searchEles.querySelector('.search_values');
  const existingValues = [];
  if (op.numValues === values.children.length) {
    for (const child of values.children) {
      existingValues.push([child.type, child.placeholder, child.value]);
    }
  }

  removeAllChildren(values);

  for (let i = 0; i < op.numValues; i += 1) {
    if ('validValues' in field) {
      const select = document.createElement('select');
      select.appendChild(createOptionNode('', ''));
      for (const validValue of field.validValues) {
        select.appendChild(createOptionNode(validValue[0], validValue[1]));
      }
      select.onchange = () => { updateCritieraIfValuesPopulated(idx); return false; };
      values.appendChild(select);
    } else {
      const input = document.createElement('input');
      input.className = `search_value${i}`;
      input.type = 'inputType' in op ? op.inputType[i] : 'text';
      if ('inputStep' in op) {
        input.step = op.inputStep[i];
      }
      const size = 'inputSize' in op ? op.inputSize[i] : 6;
      input.style.width = `${size}em`;
      input.placeholder = 'placeholder' in op && op.placeholder[i] != null ? op.placeholder[i] : '';
      if ('inputMin' in op && op.inputMin[i] != null) {
        input.min = op.inputMin[i];
      }
      if ('inputMax' in op && op.inputMax[i] != null) {
        input.max = op.inputMax[i];
      }
      if ('inputStep' in op && op.inputStep[i] != null) {
        input.step = op.inputStep[i];
      }
      if ('inputPattern' in op && op.inputPattern[i] != null) {
        input.pattern = op.inputPattern[i];
      }

      input.onchange = () => { window.blur(); updateCritieraIfValuesPopulated(idx); return false; };

      if (i < existingValues.length && existingValues[i][0] === input.type && existingValues[i][1] === input.placeholder) {
        input.value = existingValues[i][2];
      }

      values.appendChild(input);
    }
  }
}

function searchFieldChanged(idx) {
  const searchEles = document.querySelector(`#search_criteria${idx}`);
  const field = searchFields[searchEles.querySelector('.search_field').selectedIndex];

  const select = searchEles.querySelector('.search_op');
  removeAllChildren(select);

  for (const op of field.search.ops) {
    const option = document.createElement('option');
    option.textContent = option.value = op.descr;
    select.appendChild(option);
  }

  searchOpChanged(idx);
}

function populateSearchFields(idx) {
  const searchEles = document.querySelector(`#search_criteria${idx}`);
  const select = searchEles.querySelector('.search_field');
  removeAllChildren(select);

  for (const field of searchFields) {
    const option = document.createElement('option');
    option.textContent = option.value = field.title;
    select.appendChild(option);
  }

  searchFieldChanged(idx);
}

function addSearchInputRow() {
  const template = document.querySelector('#search_criteria_row');

  const row = template.content.cloneNode(true);
  row.querySelector('.search_criteria').id = `search_criteria${nextSearchInput}`;

  const fieldOnChange = function (idx) {
    return function () {
      searchFieldChanged(idx);
      updateCritieraIfValuesPopulated(idx);
      return false;
    };
  };
  row.querySelector('.search_field').onchange = fieldOnChange(nextSearchInput);

  const opOnChange = function (idx) {
    return function () {
      searchOpChanged(idx);
      updateCritieraIfValuesPopulated(idx);
      return false;
    };
  };
  row.querySelector('.search_op').onchange = opOnChange(nextSearchInput);

  const delRow = function (idx) {
    return function () {
      const ele = document.querySelector(`#search_criteria${idx}`);
      ele.remove();
      updateSearchCriteria();
      return false;
    };
  };
  row.querySelector('.search_delete_row').onclick = delRow(nextSearchInput);

  document.querySelector('#search_criterias').appendChild(row);
  populateSearchFields(nextSearchInput);
  nextSearchInput += 1;
}

function populateSearchValuesFromUrl() {
  removeAllChildren(document.querySelector('#search_criterias'));
  nextSearchInput = 0;

  for (const searchCriteria of getSearchQueryParams()) {
    const curIdx = nextSearchInput;
    addSearchInputRow();

    const parts = searchCriteria.split(',');
    if (parts.length < 2) {
      continue;
    }

    const searchEles = document.querySelector(`#search_criteria${curIdx}`);

    const fieldEle = searchEles.querySelector('.search_field');
    fieldEle.value = parts[0];
    searchFieldChanged(curIdx);
    const field = searchFields[fieldEle.selectedIndex];

    const opEle = searchEles.querySelector('.search_op');
    opEle.value = parts[1];
    searchOpChanged(curIdx);
    const op = field.search.ops[opEle.selectedIndex];

    for (let i = 0; i < Math.min(parts.length - 2, op.numValues); i += 1) {
      searchEles.querySelector('.search_values').children[i].value = parts[i + 2];
    }
  }

  const matchPolicy = getQueryParameter('match', 'all'); // any,none,all
  document.querySelector('#match').value = matchPolicy;

  const sortBy = getQueryParameter('sort', 'default');
  document.querySelector('#sort').value = sortBy;

  const iconSize = getQueryParameter('icons', 'default');
  document.querySelector('#icons').value = iconSize;

  const groupBy = getQueryParameter('group', 'none');
  document.querySelector('#group').value = groupBy;

  if (nextSearchInput === 0) {
    addSearchInputRow();
  }
}

function clearSearchCriteria() {
  window.history.pushState({}, '', 'index.html?#');
  processJson();
}

function fullscreenSupported() {
  return document.fullscreenEnabled && document.documentElement.requestFullscreen;
}

function fullscreenClicked() {
  if (!fullscreenSupported()) {
    return;
  }

  if (document.fullscreenElement == null) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
}

function createStatsSpan(stats) {
  const ret = document.createElement('span');
  for (let i = 0; i < stats.length; i += 1) {
    if (i > 0) {
      ret.appendChild(document.createTextNode(' '));
    }
    ret.appendChild(stats[i]);
  }
  return ret;
}

function createOpenInNewTabLink(label, link) {
  const anchor = document.createElement('a');
  anchor.target = '_new';
  anchor.href = link;
  anchor.innerText = label;
  return createMediaStat(anchor);
}

function createMoreLessAnchor(label, shortEle, longEle) {
  const anchor = document.createElement('a');
  anchor.className = 'more_less';
  anchor.innerText = label;
  anchor.href = '#';
  anchor.onclick = (event) => {
    if (shortEle.style.display === 'none') {
      longEle.style.display = 'none';
      shortEle.style.display = 'inline-block';
    } else {
      shortEle.style.display = 'none';
      longEle.style.display = 'inline-block';
    }
    event.preventDefault();
    event.stopPropagation();
  };
  return anchor;
}

function searchPageLinkGenerator(event, criterias, matchPolicy = 'all', overrideIconSize = null) {
  const parts = [];
  for (const criteria of criterias) {
    // field,op,value
    parts.push(criteria.join(','));
  }

  const iconSize = overrideIconSize !== null ? overrideIconSize : getQueryParameter('icons', 'default');
  const groupBy = getQueryParameter('group', 'none');
  const sortBy = getQueryParameter('sort', 'default');
  const search = generateSearchUrl(parts, matchPolicy, iconSize, groupBy, sortBy);

  // Check to see if the user control clicked the URL to request it be opened in a new tab.
  if (event != null && (event.ctrlKey || event.which === 2 || event.which === 3)) {
    event.preventDefault();
    event.stopPropagation();
    window.open(search, '_blank');
  } else {
    window.history.pushState({}, '', search);
    processJson();
  }
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

function createMediaStatsHtml(entity, onSlideshowPage, showBriefMetadata, extraOnClick) {
  const stats = [];
  const extStats = [];

  if (onSlideshowPage && 'title' in entity && entity.title) {
    const val = entity.title_prefix + entity.title;
    stats.push(createTextMediaStat(val));
    extStats.push(createTextMediaStat(val));
  }

  if (entity.num_photos > 0) {
    const val = getNumberString(entity.num_photos, 'photo', 'photos');
    stats.push(createTextMediaStat(val));
    extStats.push(createTextMediaStat(val));
  }

  if (entity.num_videos > 0) {
    const val = getNumberString(entity.num_videos, 'video', 'videos');
    stats.push(createTextMediaStat(val));
    extStats.push(createTextMediaStat(val));
  }

  if ('num_events' in entity && entity.num_events > 1) {
    const val = `${entity.num_events.toLocaleString()} events`;
    stats.push(createTextMediaStat(val));
    extStats.push(createTextMediaStat(val));
  }

  if ('exposure_time_pretty' in entity) {
    stats.push(createTextMediaStat(entity.exposure_time_pretty));
    extStats.push(createTextMediaStat(entity.exposure_time_pretty));
  }

  if (entity.date_range) {
    stats.push(createTextMediaStat(entity.date_range));
    extStats.push(createTextMediaStat(entity.date_range));
  }

  if (entity.filesize) {
    const val = getPrettyFileSize(entity.filesize);
    stats.push(createTextMediaStat(val));
    extStats.push(createTextMediaStat(val));
  }

  if (entity.clip_duration) {
    stats.push(createTextMediaStat(entity.clip_duration));
    extStats.push(createTextMediaStat(entity.clip_duration));
  }

  if (entity.fps) {
    extStats.push(createTextMediaStat(`${entity.fps} FPS`));
  }

  if (entity.megapixels) {
    const val = `${entity.megapixels}MP`;
    stats.push(createTextMediaStat(val));
    extStats.push(createTextMediaStat(val));
  }

  if (entity.width) {
    extStats.push(createTextMediaStat(`${entity.width}x${entity.height}`));
  }

  if ('camera' in entity) {
    extStats.push(createSearchLink(entity.camera, 'Camera', 'equals', entity.camera, extraOnClick));
  }

  if ('exif' in entity) {
    for (const exif of entity.exif) {
      extStats.push(createTextMediaStat(exif));
    }
  }

  if (entity.event_id && entity.type !== 'events') {
    extStats.push(createSearchLink(`Event: ${eventNames[entity.event_id]}`, 'Event ID', 'equals', entity.event_id, extraOnClick));
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
        extStats.push(createSearchLink(`Tag: ${tags[tagId].title}`, 'Tag ID', 'equals', tagId, extraOnClick));
      }
    }
  }

  if ('metadata_text' in entity) {
    extStats.push(createOpenInNewTabLink('Metadata', entity.metadata_text));
  }

  if ('rating' in entity) {
    const stars = '★'.repeat(entity.rating) + '☆'.repeat(5 - entity.rating);
    extStats.push(createSearchLink(stars, 'Rating', 'is at least', entity.rating, extraOnClick));
  }

  if ('motion_photo' in entity && 'mp4' in entity.motion_photo) {
    extStats.push(createOpenInNewTabLink('Motion Photo', entity.motion_photo.mp4));
  }

  if ('lat' in entity) {
    extStats.push(createSearchLink(`GPS ${entity.lat},${entity.lon}`, 'GPS Coordinate', 'is within', `${entity.lat},${entity.lon},0.1`, extraOnClick));

    let mapAnchor = document.createElement('a');
    mapAnchor.target = '_new';
    mapAnchor.href = `https://www.openstreetmap.org/?mlat=${entity.lat}&mlon=${entity.lon}#map=16/${entity.lat}/${entity.lon}`;
    mapAnchor.innerText = 'OpenStreetMap';
    extStats.push(createMediaStat(mapAnchor));

    mapAnchor = document.createElement('a');
    mapAnchor.target = '_new';
    mapAnchor.href = `https://www.google.com/maps?q=${entity.lat}%2C${entity.lon}`;
    mapAnchor.innerText = 'Google Maps';
    extStats.push(createMediaStat(mapAnchor));
  }

  if (['photo', 'motion_photo', 'video'].indexOf(entity.type) > -1) {
    extStats.push(createOpenInNewTabLink('Download', entity.link));
  }

  if (extStats.length === stats.length) {
    return createStatsSpan(stats);
  }

  if (!showBriefMetadata) {
    return createStatsSpan(extStats);
  }

  const ret = document.createElement('span');

  const shortStatsEle = createStatsSpan(stats);
  const extStatsEle = createStatsSpan(extStats);

  shortStatsEle.appendChild(document.createTextNode(' '));
  shortStatsEle.appendChild(createMoreLessAnchor('More', shortStatsEle, extStatsEle));
  ret.append(shortStatsEle);

  extStatsEle.appendChild(document.createTextNode(' '));
  extStatsEle.appendChild(createMoreLessAnchor('Less', shortStatsEle, extStatsEle));
  extStatsEle.style.display = 'none';
  ret.appendChild(extStatsEle);

  return ret;
}

function setFullscreenDescriptionShown(shown) {
  const descrEle = document.querySelector('#description');
  descrEle.style.display = shown ? 'block' : 'none';
}

function enableFullscreenPhotoUpdateTimer() {
  if (fullscreenPhotoUpdateTimer != null) {
    clearInterval(fullscreenPhotoUpdateTimer);
  }
  fullscreenPhotoUpdateTimer = setInterval(() => { showNextImageFullscreen(false); }, fullScreenPhotoUpdateSecs * 1000);
}

function getNextImageIndex() {
  return allMediaFullscreenIndex >= allMedia.length - 1 ? allMediaFullscreenIndex : allMediaFullscreenIndex + 1;
}

function getPreviousImageIndex() {
  return allMediaFullscreenIndex === 0 ? allMediaFullscreenIndex : allMediaFullscreenIndex - 1;
}

function getFullscreenImageUrl(index) {
  if (['photo', 'motion_photo', 'video'].indexOf(allMedia[index].type) > -1) {
    return allMedia[index].link;
  }

  if ('reg' in allMedia[index].thumbnail) {
    return allMedia[index].thumbnail.reg;
  }

  return allMedia[index].thumbnail.large;
}

function getQRCodeUrl() {
  const searchParams = new URLSearchParams(window.location.search);
  searchParams.delete('kiosk');

  searchParams.delete('slideshow');
  searchParams.append('slideshow', '1');

  searchParams.delete('update_secs');
  searchParams.append('update_secs', '0');

  searchParams.delete('seed');
  if (randomSeed != null) {
    searchParams.append('seed', randomSeed);
  }

  searchParams.delete('idx');
  searchParams.append('idx', allMediaFullscreenIndex);

  let location = window.location.toString();
  if (location.includes('#')) {
    location = location.split('#')[0];
  }
  if (location.includes('?')) {
    location = location.split('?')[0];
  }

  return `${location}?${searchParams.toString()}`;
}

function stopEvent(event) {
  event.preventDefault();
  event.stopPropagation();
  return false;
}

const handleVisibilityChange = () => {
  if (wakeLock !== null && document.visibilityState === 'visible') {
    // eslint-disable-next-line no-use-before-define
    requestWakeLock();
  }
};

function requestWakeLock() {
  // Only available over HTTPS and certain browsers
  if ('wakeLock' in navigator) {
    try {
      navigator.wakeLock.request('screen')
        .then((lock) => {
          wakeLock = lock;
        });

      document.addEventListener('visibilitychange', handleVisibilityChange);
    } catch (err) {
      // NOOP
    }
  }
}

function releaseWakeLock() {
  if (wakeLock != null) {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    wakeLock.release().then(() => {
      wakeLock = null;
    });
  }
}

function isImageFullscreen() {
  const fullImageEle = document.querySelector('#fullimage_container');
  return fullImageEle.style.display !== 'none';
}

function exitImageFullscreen() {
  if (!isImageFullscreen()) {
    return;
  }

  if (fullscreenPhotoUpdateTimer != null) {
    clearInterval(fullscreenPhotoUpdateTimer);
    fullscreenPhotoUpdateTimer = null;

    const searchParams = new URLSearchParams(window.location.search);
    searchParams.delete('kiosk');
    searchParams.delete('update_secs');
    searchParams.delete('slideshow');
    window.history.pushState({}, '', `?${searchParams.toString()}#`);

    releaseWakeLock();
  }

  fullScreenPhotoUpdateSecs = 0;
  fullscreenReinstateSlideshowSecs = 0;
  document.body.style.cursor = 'auto';
  setFullImageDisplay(false);
  window.scrollTo(preFullscreenScrollX, preFullscreenScrollY);
}

function updateMediaDescriptionText(descrEle) {
  const entity = allMedia[allMediaFullscreenIndex];

  const containerEle = document.createElement('div');

  const qrCodeEle = document.createElement('div');
  qrCodeEle.className = 'qrcode';
  new QRCode(qrCodeEle, {
    text: getQRCodeUrl(),
    width: 120,
    height: 120,
    colorDark: 'black',
    colorLight: 'lightgray',
    correctLevel: QRCode.CorrectLevel.L,
  });
  containerEle.appendChild(qrCodeEle);

  const textEle = createMediaStatsHtml(entity, true, false, (event) => {
    exitImageFullscreen();
    return stopEvent(event);
  });
  containerEle.appendChild(textEle);

  descrEle.replaceChildren(containerEle);
}

function getFullscreenVideoUrl(entity) {
  if (window.alwaysAnimateMotionPhotos && 'motion_photo' in entity && 'mp4' in entity.motion_photo) {
    return entity.motion_photo.mp4;
  }
  if (entity.type === 'video') {
    return entity.link;
  }
  return null;
}

function setPlayIconDisplay(display) {
  document.querySelector('#play').style.display = display;
}

function isKioskModeEnabled() {
  return getIntQueryParameter('kiosk', 0) === 1;
}

function showHidePlayIcon(entity) {
  if ('motion_photo' in entity && 'mp4' in entity.motion_photo && !isKioskModeEnabled()) {
    setPlayIconDisplay('inline-block');
  } else {
    setPlayIconDisplay('none');
  }
}

function doShowFullscreenImage(manuallyInvoked) {
  setPlayIconDisplay('none');
  if (!fullscreenSupported()) {
    document.querySelector('#fullscreen').style.display = 'none';
  }

  const descrEle = document.querySelector('#description');
  addStatusMessage(descrEle, 'Loading');

  let hideDescr = false;
  if (manuallyInvoked) {
    if (descrEle.style.display === 'none') {
      descrEle.style.display = 'block';
      hideDescr = true;
    }
    if (fullscreenPhotoUpdateTimer != null) {
      enableFullscreenPhotoUpdateTimer();
    }
  } else {
    setFullscreenDescriptionShown(false);
  }

  if (hideDescr) {
    descrEle.style.display = 'none';
  }

  const entity = allMedia[allMediaFullscreenIndex];
  const videoUrl = getFullscreenVideoUrl(entity);
  if (videoUrl !== null) {
    const imageEle = document.querySelector('#fullimage');
    imageEle.removeAttribute('src');
    imageEle.style.display = 'none';

    const videoEle = document.querySelector('#fullvideo');
    videoEle.src = videoUrl;
    videoEle.style.display = 'block';

    showHidePlayIcon(entity);
    updateMediaDescriptionText(descrEle);
  } else {
    const videoEle = document.querySelector('#fullvideo');
    videoEle.pause();
    videoEle.removeAttribute('src');
    videoEle.style.display = 'none';

    const imageEle = document.querySelector('#fullimage');
    imageEle.onload = () => {
      showHidePlayIcon(entity);
      updateMediaDescriptionText(descrEle);
    };
    imageEle.style.display = 'block';
    const imageUrl = getFullscreenImageUrl(allMediaFullscreenIndex);
    imageEle.src = imageUrl;
  }
}

function showNextImageFullscreen(manuallyInvoked) {
  if (isImageFullscreen()) {
    allMediaFullscreenIndex = getNextImageIndex();
    doShowFullscreenImage(manuallyInvoked);
  }
}

function showPreviousImageFullscreen() {
  if (isImageFullscreen()) {
    allMediaFullscreenIndex = getPreviousImageIndex();
    doShowFullscreenImage(true);
  }
}

function toggleSlideshowTimers() {
  if (fullScreenPhotoUpdateSecs === 0) {
    return;
  }

  if (fullscreenPhotoUpdateTimer == null) {
    setFullscreenDescriptionShown(false);

    if (fullscreenReinstateSlideshowTimer != null) {
      clearInterval(fullscreenReinstateSlideshowTimer);
      fullscreenReinstateSlideshowTimer = null;
    }
    enableFullscreenPhotoUpdateTimer();
  } else {
    setFullscreenDescriptionShown(true);

    clearInterval(fullscreenPhotoUpdateTimer);
    fullscreenPhotoUpdateTimer = null;
    fullscreenReinstateSlideshowTimer = setInterval(toggleSlideshowTimers, fullscreenReinstateSlideshowSecs * 1000);
  }
}

function startSlideshow() {
  fullScreenPhotoUpdateSecs = getIntQueryParameter('update_secs', 10);
  fullscreenReinstateSlideshowSecs = getIntQueryParameter('reinstate_secs', 300);
  setFullImageDisplay(true);
  allMediaFullscreenIndex = getIntQueryParameter('idx', 0);
  doShowFullscreenImage(false);
  toggleSlideshowTimers();
  requestWakeLock();
}

function slideshowClicked() {
  const searchParams = new URLSearchParams(window.location.search);
  searchParams.delete('slideshow');
  searchParams.append('slideshow', '1');
  searchParams.delete('update_secs');
  searchParams.append('update_secs', '10');
  window.history.pushState({}, '', `?${searchParams.toString()}#`);
  startSlideshow();
}

function checkForPhotoFrameMode() {
  let slideshow = false;
  if (isKioskModeEnabled()) {
    slideshow = true;
    inPhotoFrameMode = true;
    document.body.style.cursor = 'none';
    document.querySelector('#slideshow_controls').style.display = 'none';
  } else if (getIntQueryParameter('slideshow', 0) === 1) {
    slideshow = true;
  } else if (getIntQueryParameter('fullscreen', 0) === 1) {
    document.querySelector('#fullscreen').style.display = 'none';
  }

  if (slideshow) {
    startSlideshow();
  }
}

function playIconClicked() {
  if (!isImageFullscreen()) {
    return;
  }

  window.alwaysAnimateMotionPhotos = !window.alwaysAnimateMotionPhotos;
  document.querySelector('#play_pause_icon').src = window.alwaysAnimateMotionPhotos ? 'icons/pause-web-icon.png' : 'icons/play-web-icon.png';
  doShowFullscreenImage(true);
}

function toggleFullscreenDescription() {
  if (isImageFullscreen()) {
    if (inPhotoFrameMode) {
      toggleSlideshowTimers();
    } else {
      const descrEle = document.querySelector('#description');
      const shown = descrEle.style.display !== 'none';
      setFullscreenDescriptionShown(!shown);
    }
  }
  return false;
}

function enterSlideshowMode(allMediaIndex) {
  preFullscreenScrollX = window.scrollX;
  preFullscreenScrollY = window.scrollY;
  allMediaFullscreenIndex = allMediaIndex;

  setFullImageDisplay(true);
  doShowFullscreenImage(false);
}

function updateAnimationsText() {
  document.querySelector('#animations_link').innerText = window.alwaysShowAnimations ? 'Stop Animations' : 'Show Animations';
}

function createAllStatsSpan(stats) {
  const ret = document.createElement('span');
  for (let i = 0; i < stats.length; i += 1) {
    if (i > 0) {
      ret.appendChild(document.createTextNode(' '));
    }

    const span = document.createElement('span');
    span.className = 'stat';
    span.innerText = stats[i];
    ret.appendChild(span);
  }
  return ret;
}

function createAllStatsHtml() {
  const totalsByTypes = {};
  let artifactSize = 0;
  let groupSize = 0;

  for (const media of allMedia) {
    let type = null;
    if (media.type === 'motion_photo') {
      type = 'photo';
    } else {
      type = media.type;
    }

    if (!(type in totalsByTypes)) {
      totalsByTypes[type] = 1;
    } else {
      totalsByTypes[type] += 1;
    }

    if ('artifact_filesize' in media) {
      artifactSize += media.artifact_filesize;
    } else if ('filesize' in media && type !== 'tags') {
      groupSize += media.filesize;
    }
  }

  const stats = [];
  if ('photo' in totalsByTypes) {
    stats.push(getNumberString(totalsByTypes.photo, 'photo', 'photos'));
  }
  if ('video' in totalsByTypes) {
    stats.push(getNumberString(totalsByTypes.video, 'video', 'videos'));
  }
  if ('events' in totalsByTypes && totalsByTypes.events > 1) {
    stats.push(`${totalsByTypes.events.toLocaleString()} events`);
  }
  if ('years' in totalsByTypes && totalsByTypes.years > 1) {
    stats.push(`${totalsByTypes.years.toLocaleString()} years`);
  }
  if ('tags' in totalsByTypes && totalsByTypes.tags > 1) {
    stats.push(`${totalsByTypes.tags.toLocaleString()} tags`);
  }

  if (artifactSize > 0) {
    stats.push(getPrettyFileSize(artifactSize));
  } else if (groupSize > 0) {
    stats.push(getPrettyFileSize(groupSize));
  }

  if (dateRange) {
    stats.push(dateRange);
  }

  return createAllStatsSpan(stats);
}

function getExpandableString(name, value) {
  const trimmedValue = value.trim();
  if (trimmedValue.length < 150 && !trimmedValue.includes('\n')) {
    return document.createTextNode(trimmedValue);
  }

  const parentEle = document.createElement('span');

  const longEle = document.createElement('span');
  longEle.style.display = 'none';

  const shortEle = document.createElement('span');
  shortEle.style.display = 'block';

  shortEle.appendChild(document.createTextNode(`${trimmedValue.substring(0, 140).trim().replaceAll('\r', ' ').replaceAll('\n', ' ')}... `));
  shortEle.appendChild(createMoreLessAnchor('More', shortEle, longEle));
  parentEle.appendChild(shortEle);

  const longText = document.createElement('span');
  longText.innerText = `${trimmedValue} `;
  longEle.appendChild(longText);
  longEle.appendChild(createMoreLessAnchor('Less', shortEle, longEle));
  parentEle.appendChild(longEle);

  return parentEle;
}

function nearbyClicked() {
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition((position) => {
      searchPageLinkGenerator(null, [['GPS Coordinate', 'is within', position.coords.latitude, position.coords.longitude, 1]]);
    });
  }
}

function showParentTags(searchTag) {
  const tagParentsEle = document.querySelector('#tag_parents');
  removeAllChildren(tagParentsEle);

  if (searchTag != null) {
    let parentTag = searchTag.parent_tag_id;
    let firstChild = true;
    while (parentTag !== null) {
      const tag = tags[parentTag];

      const span = document.createElement('span');
      span.className = 'header_link';

      if (firstChild) {
        span.appendChild(document.createTextNode('Parent Tag: '));
        firstChild = false;
      }

      const anchor = document.createElement('a');
      anchor.innerText = tag.title;
      anchor.href = '#';
      anchor.onclick = (event) => {
        searchPageLinkGenerator(event, [['Tag ID', 'equals', tag.id]]);
        return stopEvent(event);
      };
      span.appendChild(anchor);

      tagParentsEle.appendChild(span);

      parentTag = tag.parent_tag_id;
    }
    tagParentsEle.style.display = 'block';
  } else {
    tagParentsEle.style.display = 'none';
  }
}

function getPageIconSize() {
  /* eslint indent: 0 */
  const validIconSizes = ['small', 'medium', 'small_medium', 'small_medium_large',
                          'medium_large', 'large', 'large_full_meta', 'large_no_meta',
                          'regular', 'regular_full_meta', 'regular_no_meta'];
  const iconSize = getQueryParameter('icons', 'default');
  if (validIconSizes.includes(iconSize)) {
    return iconSize;
  }

  if (iconSize === 'large_regular') {
    return window.innerWidth <= 1200 ? 'large' : 'regular';
  }
  if (window.innerWidth <= 1200) {
    return 'small_medium_large';
  }
  return 'regular';
}

function createMediaSmallContainer(items, hasPreviousGroup, iconSize) {
  const ele = document.createElement('span');
  if (items.length <= 2) {
    ele.className = `media_${iconSize}_container_2h`;
  } else {
    ele.className = `media_${iconSize}_container`;
  }

  for (let i = 0; i < items.length; i += 1) {
    ele.appendChild(items[i]);
  }

  return ele;
}

class SingleIconSizeWriter {
  constructor() {
    this.currentGroupEle = null;
  }

  add(element) {
    this.currentGroupEle.appendChild(element);
  }

  flush() {
    // NOOP
  }

  clear() {
    // NOOP
  }
}

class DoubleIconSizeWriter {
  constructor(smallIconSize, largeIconSize) {
    this.smallIconSize = smallIconSize;
    this.largeIconSize = largeIconSize;
    this.parentEle = null;
    this.unprocessedItems = [];
    this.hasPreviousGroup = false;
  }

  add(element, mediaIconSize) {
    if (mediaIconSize === this.largeIconSize) {
      this.parentEle.appendChild(element);
      this.hasPreviousGroup = true;
    } else {
      this.unprocessedItems.push(element);
      if (this.unprocessedItems.length === 4) {
        this.flush();
      }
    }
  }

  get currentGroupEle() {
    return this.parentEle;
  }

  set currentGroupEle(newParentEle) {
    this.parentEle = newParentEle;
    this.clear();
  }

  flush() {
    if (this.unprocessedItems.length > 0) {
      this.parentEle.appendChild(createMediaSmallContainer(this.unprocessedItems, this.hasPreviousGroup, this.smallIconSize));
      this.unprocessedItems = [];
      this.hasPreviousGroup = true;
    }
  }

  clear() {
    this.unprocessedItems = [];
    this.hasPreviousGroup = false;
  }
}

class TripleIconSizeWriter {
  constructor(smallIconSize, mediumIconSize, largeIconSize) {
    this.smallIconSize = smallIconSize;
    this.mediumIconSize = mediumIconSize;
    this.largeIconSize = largeIconSize;
    this.dualWriter = new DoubleIconSizeWriter(mediumIconSize, largeIconSize);
    this.unprocessedItems = [];
  }

  add(element, mediaIconSize) {
    if (mediaIconSize === this.smallIconSize) {
      this.unprocessedItems.push(element);
      if (this.unprocessedItems.length === 4) {
        this.dualWriter.add(createMediaSmallContainer(this.unprocessedItems, this.dualWriter.hasPreviousGroup, this.smallIconSize), this.mediumIconSize);
        this.unprocessedItems = [];
      }
    } else {
      this.dualWriter.add(element, mediaIconSize);
    }
  }

  get currentGroupEle() {
    return this.dualWriter.currentGroupEle;
  }

  set currentGroupEle(newParentEle) {
    this.dualWriter.currentGroupEle = newParentEle;
    this.clear();
  }

  flush() {
    if (this.unprocessedItems.length === 0) {
      this.dualWriter.flush();
      return;
    }

    this.dualWriter.add(createMediaSmallContainer(this.unprocessedItems, this.dualWriter.hasPreviousGroup, this.smallIconSize), this.mediumIconSize);

    this.unprocessedItems = [];
    this.dualWriter.flush();
  }

  clear() {
    this.unprocessedItems = [];
    this.dualWriter.clear();
  }
}

function setIconWriter() {
  if (preferredPageIconSize === 'small_medium') {
    mediaWriter = new DoubleIconSizeWriter('small', 'medium');
  } else if (preferredPageIconSize === 'medium_large') {
    mediaWriter = new DoubleIconSizeWriter('medium', 'large');
  } else if (preferredPageIconSize === 'small_medium_large') {
    mediaWriter = new TripleIconSizeWriter('small', 'medium', 'large');
  } else {
    mediaWriter = new SingleIconSizeWriter();
  }
}

function setPageTitleAndIconSize(preferredView) {
  document.title = preferredView.title;
  const ele = document.querySelector('#title');
  if (ele) {
    ele.innerText = document.title;
  }

  if (preferredView.cssSelector !== null) {
    document.querySelector(`#${preferredView.cssSelector}`).classList.add('main_view_selected');
  }
  for (const tagName of ['years_link', 'events_link', 'tags_link']) {
    if (tagName !== preferredView.cssSelector) {
      document.querySelector(`#${tagName}`).classList.remove('main_view_selected');
    }
  }

  preferredPageIconSize = getPageIconSize();
  setIconWriter();

  showParentTags(preferredView.searchTag);
}

function populateMediaAnchorTag(anchor, media, allMediaIndex) {
  if (media.type === 'events') {
    anchor.href = '#';
    const search = [['Event ID', 'equals', media.event_id]];

    /*
     * When searching for events by year, check to see if the JSON contains an entry
     * for the current year. If so, use that since thumbnails and stats are generated
     * for each year that the event spans.
     */
    if (currentYearView !== null) {
      search.push(['Year', 'equals', currentYearView]);
      if ('years' in media) {
        for (const yearBlock of media.years) {
          if (yearBlock.year === currentYearView) {
            yearBlock.title = media.title;
            if ('comment' in media) {
              yearBlock.comment = media.comment;
            }

            media = yearBlock;
          }
        }
      }
    }

    anchor.onclick = (event) => {
      searchPageLinkGenerator(event, search);
      return stopEvent(event);
    };
  } else if (media.type === 'years') {
    anchor.href = '#';
    const search = [['Year', 'equals', media.id]];
    anchor.onclick = (event) => {
      searchPageLinkGenerator(event, search);
      return stopEvent(event);
    };
  } else if (media.type === 'tags') {
    anchor.href = '#';
    const search = [['Tag ID', 'equals', media.id]];
    anchor.onclick = (event) => {
      searchPageLinkGenerator(event, search);
      return stopEvent(event);
    };
  } else {
    anchor.href = '#';
    anchor.onclick = (event) => {
      enterSlideshowMode(allMediaIndex);
      return stopEvent(event);
    };
  }

  return media;
}

function showLargerMedia(media) {
  return media.rating === 5 || (['photo', 'motion_photo', 'video'].indexOf(media.type) === -1);
}

function addExtraFlush(media) {
  return (['photo', 'motion_photo', 'video'].indexOf(media.type) === -1) && (['small_medium', 'medium_large', 'small_medium_large'].indexOf(preferredPageIconSize) !== -1);
}

function getMediaIconSize(media) {
  if (preferredPageIconSize === 'small_medium') {
    return showLargerMedia(media) ? 'medium' : 'small';
  }
  if (preferredPageIconSize === 'medium_large') {
    return showLargerMedia(media) ? 'large' : 'medium';
  }
  if (preferredPageIconSize === 'small_medium_large') {
    if (showLargerMedia(media)) {
      return 'large';
    }
    return media.rating === 4 ? 'medium' : 'small';
  }
  return preferredPageIconSize;
}

function showLargeIconWithNoDescr(iconSize, mediaType) {
  if (iconSize === 'large_no_meta') {
    return true;
  }

  if (!['medium_large', 'small_medium_large'].includes(preferredPageIconSize)) {
    return false;
  }

  if (['events', 'tags', 'years'].includes(mediaType)) {
    return false;
  }

  return true;
}

function createMediaElement(index, media, iconSize) {
  const mediaEle = document.createElement('span');

  const anchor = document.createElement('a');
  const mediaThumbSpan = document.createElement('span');
  mediaThumbSpan.className = 'media_thumb';
  const img = document.createElement('img');
  mediaThumbSpan.appendChild(img);
  anchor.appendChild(mediaThumbSpan);
  mediaEle.appendChild(anchor);

  // See the comment above for why the media element can be overridden for the event search.
  media = populateMediaAnchorTag(anchor, media, index);

  if (window.alwaysShowAnimations && media.motion_photo) {
    if (iconSize === 'small') {
      img.src = media.motion_photo.small_gif;
      mediaEle.className = 'media_small';
    } else if (iconSize === 'medium') {
      img.src = media.motion_photo.medium_gif;
      mediaEle.className = 'media_medium';
    } else if (['large', 'large_full_meta', 'large_no_meta'].includes(iconSize) || !('reg_gif' in media.motion_photo)) {
      img.src = media.motion_photo.large_gif;
      if (showLargeIconWithNoDescr(iconSize, media.type)) {
        mediaEle.className = 'media_no_descr';
      } else {
        mediaEle.className = 'media';
      }
    } else {
      img.src = media.motion_photo.reg_gif;
      mediaEle.className = 'media_dyn';
      mediaEle.style.width = `${media.thumbnail.reg_width}px`;
    }
  } else if (iconSize === 'small') {
    img.src = media.thumbnail.small;
    if (media.motion_photo) {
      img.onmouseover = () => { img.src = media.motion_photo.small_gif; };
      img.onmouseleave = () => { img.src = media.thumbnail.small; };
      img.ontouchstart = () => { img.src = media.motion_photo.small_gif; };
      img.ontouchend = () => { img.src = media.thumbnail.small; };
    }
    mediaEle.className = 'media_small';
  } else if (iconSize === 'medium') {
    img.src = media.thumbnail.medium;
    if (media.motion_photo) {
      img.onmouseover = () => { img.src = media.motion_photo.medium_gif; };
      img.onmouseleave = () => { img.src = media.thumbnail.medium; };
      img.ontouchstart = () => { img.src = media.motion_photo.medium_gif; };
      img.ontouchend = () => { img.src = media.thumbnail.medium; };
    }
    mediaEle.className = 'media_medium';
  } else if (['large', 'large_full_meta', 'large_no_meta'].includes(iconSize) || !('reg' in media.thumbnail)) {
    img.src = media.thumbnail.large;
    if (media.motion_photo) {
      img.onmouseover = () => { img.src = media.motion_photo.large_gif; };
      img.onmouseleave = () => { img.src = media.thumbnail.large; };
      img.ontouchstart = () => { img.src = media.motion_photo.large_gif; };
      img.ontouchend = () => { img.src = media.thumbnail.large; };
    }
    if (showLargeIconWithNoDescr(iconSize, media.type)) {
      mediaEle.className = 'media_no_descr';
    } else {
      mediaEle.className = 'media';
    }
  } else {
    img.src = media.thumbnail.reg;
    if (media.motion_photo) {
      img.onmouseover = () => { img.src = media.motion_photo.reg_gif; };
      img.onmouseleave = () => { img.src = media.thumbnail.reg; };
      img.ontouchstart = () => { img.src = media.motion_photo.reg_gif; };
      img.ontouchend = () => { img.src = media.thumbnail.reg; };
    }
    mediaEle.className = 'media_dyn';
    mediaEle.style.width = `${media.thumbnail.reg_width}px`;
  }

  if (['large', 'large_full_meta', 'regular', 'regular_full_meta'].includes(iconSize) && !showLargeIconWithNoDescr(iconSize, media.type)) {
    if (media.title) {
      const name = `title${media.type}${media.id}`;
      const title = document.createElement('span');
      title.className = 'media_title';
      if (media.title_prefix) {
        title.appendChild(getExpandableString(name, media.title_prefix + media.title));
      } else {
        title.appendChild(getExpandableString(name, media.title));
      }
      mediaEle.appendChild(title);
    }

    if (media.comment) {
      const name = `comment${media.type}${media.id}`;
      const comment = document.createElement('span');
      comment.className = 'media_comment';
      comment.appendChild(getExpandableString(name, media.comment));
      mediaEle.appendChild(comment);
    }

    const showBriefMeta = ['large', 'regular'].includes(iconSize);
    const metadata = createMediaStatsHtml(media, false, showBriefMeta, null);
    metadata.className = 'media_metadata';
    mediaEle.appendChild(metadata);
  }

  return mediaEle;
}

function loadMoreMedia() {
  return window.innerHeight + window.scrollY >= document.body.offsetHeight * 0.85;
}

function doShowMedia(pageNumber) {
  let pageSize;
  if (preferredPageIconSize.includes('small')) {
    pageSize = 48;
  } else if (preferredPageIconSize.includes('medium')) {
    pageSize = 36;
  } else {
    pageSize = 12;
  }

  const lastPageNumber = Math.ceil(allMedia.length / pageSize);
  if (pageNumber > lastPageNumber) {
    return;
  }

  const allMediaEle = document.querySelector('#all_media');
  if (mediaWriter.currentGroupEle == null) {
    mediaWriter.currentGroupEle = allMediaEle;
  }

  const startIdx = (pageNumber - 1) * pageSize;

  for (const [index, media] of allMedia.slice(startIdx, startIdx + pageSize).entries()) {
    if (media.groupName !== currentGroupName) {
      currentGroupName = media.groupName;
      mediaWriter.flush();

      mediaWriter.currentGroupEle = document.createElement('div');
      mediaWriter.currentGroupEle.className = 'media_group';

      const titleEle = document.createElement('div');
      titleEle.className = 'media_group_title';
      titleEle.innerText = media.groupName;
      mediaWriter.currentGroupEle.appendChild(titleEle);

      allMediaEle.appendChild(mediaWriter.currentGroupEle);
    }

    /*
     * When showing mixed icon sizes, the event icon will show up at the end with larger text.
     * Add a flush to be sure it always shows up at the end as expected.
     */
    if (addExtraFlush(media)) {
      mediaWriter.flush();
    }

    const mediaIconSize = getMediaIconSize(media);
    mediaWriter.add(createMediaElement(startIdx + index, media, mediaIconSize), mediaIconSize);
  }

  currentPageNumber = pageNumber;
  if (pageNumber === lastPageNumber) {
    mediaWriter.flush();
  }

  // Ensure that the viewport is filled with media for higher screen resolutions.
  if (loadMoreMedia()) {
    doShowMedia(currentPageNumber + 1);
  }
}

function clearPreviousMedia(allMediaEle) {
  mediaWriter.clear();
  removeAllChildren(allMediaEle);
  lastSmallMediaItems = [];
  window.scrollTo(0, 0);
}

function showMedia() {
  const allMediaEle = document.querySelector('#all_media');

  clearPreviousMedia(allMediaEle);
  if (allMedia == null) {
    return;
  }

  document.querySelector('#search_controls').style.display = 'block';
  document.querySelector('#search_criterias').style.display = 'block';

  if (allMedia.length === 0) {
    updateOverallStatusMessage('No results found');
    hideResultsInfo();
    return;
  }

  window.setTimeout(() => {
    // In case an event was in flight before the JSON was processed
    clearPreviousMedia(allMediaEle);

    doShowMedia(1);

    for (const ele of document.querySelectorAll('.header_links')) {
      ele.style.display = 'block';
    }

    document.querySelector('#csv_link').onclick = (event) => {
      downloadCsv(event);
      return stopEvent(event);
    };

    document.querySelector('.summary_stats').replaceChildren(createAllStatsHtml());
  }, 0);
}

function toggleAnimations() {
  window.alwaysShowAnimations = !window.alwaysShowAnimations;
  updateAnimationsText();
  showMedia();
}

function populateMedia(newAllMedia, extraHeader, newDateRange, preferredView) {
  allMedia = newAllMedia;
  dateRange = newDateRange;
  currentYearView = preferredView.currentYearView;

  if (extraHeader) {
    const extraHeaderEle = document.querySelector('#extra_header');
    const outerSpan = document.createElement('span');
    const anchor = document.createElement('a');
    anchor.href = extraHeader.link;
    const innerSpan = document.createElement('span');
    innerSpan.className = 'main_view';
    innerSpan.innerText = extraHeader.description;

    anchor.appendChild(innerSpan);
    outerSpan.appendChild(anchor);
    extraHeaderEle.replaceChildren(outerSpan);
  }

  setPageTitleAndIconSize(preferredView);
  showMedia();
  populateSearchValuesFromUrl();
}

function windowSizeChanged() {
  const prevPageIconSize = preferredPageIconSize;
  preferredPageIconSize = getPageIconSize();
  if (prevPageIconSize !== preferredPageIconSize) {
    setIconWriter();
    showMedia();
  }
}

// The next two functions are referenced in the index.html in a script element.
// eslint-disable-next-line no-unused-vars
function jsonLoadError() {
  updateOverallStatusMessage('Error loading media');
}

// eslint-disable-next-line no-unused-vars
function jsonLoadSuccess() {
  processJson();
  checkForPhotoFrameMode();
}

updateAnimationsText();
window.onscroll = () => {
  if (loadMoreMedia()) {
    doShowMedia(currentPageNumber + 1);
  }
};

window.onresize = windowSizeChanged;

document.querySelector('#fullimage').onclick = toggleFullscreenDescription;

document.onkeydown = (event) => {
  if (event.key === 'ArrowLeft') {
    showPreviousImageFullscreen();
  } else if (event.key === 'ArrowRight') {
    showNextImageFullscreen(true);
  } else if (event.key === 'Escape') {
    exitImageFullscreen(event);
  } else if (event.key === ' ') {
    toggleFullscreenDescription();
  }
};

const fullImageEle = document.querySelector('#fullimage_container');
fullImageEle.addEventListener('swiped-left', () => {
  if (window.visualViewport.scale === 1.0) {
    showNextImageFullscreen(true);
  }
});
fullImageEle.addEventListener('swiped-right', () => {
  if (window.visualViewport.scale === 1.0) {
    showPreviousImageFullscreen();
  }
});

window.onpopstate = function () {
  processJson();
};

document.querySelector('#today_link').onclick = (event) => {
  searchPageLinkGenerator(event, [['Date', 'was taken on month/day', getCurrentMonthDay()],
                                  ['Type', 'is a', 'media']], 'all', 'large_regular');
  return stopEvent(event);
};
document.querySelector('#nearby_link').onclick = (event) => {
  nearbyClicked();
  return stopEvent(event);
};
document.querySelector('#animations_link').onclick = (event) => {
  toggleAnimations();
  return stopEvent(event);
};
document.querySelector('#slideshow_link').onclick = (event) => {
  slideshowClicked();
  return stopEvent(event);
};
document.querySelector('#date_link').onclick = (event) => {
  searchPageLinkGenerator(event, []);
  return stopEvent(event);
};
document.querySelector('#event_link').onclick = (event) => {
  searchPageLinkGenerator(event, [['Type', 'is a', 'events']]);
  return stopEvent(event);
};
document.querySelector('#year_link').onclick = (event) => {
  searchPageLinkGenerator(event, [['Type', 'is a', 'years']]);
  return stopEvent(event);
};
document.querySelector('#tag_link').onclick = (event) => {
  searchPageLinkGenerator(event, [['Type', 'is a', 'tags'], ['Tag Parent ID', 'is not set']]);
  return stopEvent(event);
};
document.querySelector('#add_search_row').onclick = (event) => {
  addSearchInputRow();
  return stopEvent(event);
};
document.querySelector('#clear_search_criteria').onclick = (event) => {
  clearSearchCriteria();
  return stopEvent(event);
};
document.querySelector('#play').onclick = (event) => {
  playIconClicked();
  return stopEvent(event);
};
document.querySelector('#fullscreen').onclick = (event) => {
  fullscreenClicked();
  return stopEvent(event);
};
document.querySelector('#close').onclick = (event) => {
  exitImageFullscreen();
  return stopEvent(event);
};
document.querySelector('#match').onchange = (event) => {
  updateSearchCriteria();
  return stopEvent(event);
};
document.querySelector('#group').onchange = (event) => {
  updateSearchCriteria();
  return stopEvent(event);
};
document.querySelector('#sort').onchange = (event) => {
  updateSearchCriteria();
  return stopEvent(event);
};
document.querySelector('#icons').onchange = (event) => {
  updateSearchCriteria();
  return stopEvent(event);
};
