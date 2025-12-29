/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2020-2025 Brian Masney <masneyb@onstation.org>
 */

/*
 * Note that everything is in one big file since Javascript modules (with the export/import)
 * are currently not supported on file:// URIs.
 */

class SearchState {
  currentPageNumber = 1;
  allMedia = null;
  events = null;
  tags = null;
  mediaWriter = null;
  dateRange = null;
  currentYearView = null;
  preferredPageIconSize = null;
  currentGroupName = null;
  randomSeed = Date.now();

  // Search controls
  nextSearchInput = 0;

  // Slideshow
  preFullScreenScrollX = -1;
  preFullScreenScrollY = -1;
  allMediaFullScreenIndex = -1;
  inPhotoFrameMode = false;
  fullScreenPhotoUpdateSecs = 0;
  fullScreenPhotoUpdateTimer = null;
  fullScreenReinstateSlideshowSecs = 0;
  fullScreenReinstateSlideshowTimer = null;
  wakeLock = null;

  // Search engine
  processedMedia = null;
  mainTitle = null;
  extraHeader = null;

  alwaysShowAnimations = getIntQueryParameter('animate', 0);
  alwaysAnimateMotionPhotos = getIntQueryParameter('animateMotionPhotos', 0);
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

function getQueryParameter(name, defaultValue) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(name) ?? defaultValue;
}

function getIntQueryParameter(name, defaultValue) {
  const val = getQueryParameter(name, null);
  return val ? parseInt(val, 10) : defaultValue;
}

function getFloatQueryParameter(name, defaultValue) {
  const val = getQueryParameter(name, null);
  if (val === null)
    return defaultValue;
  let value = parseFloat(val);
  return isNaN(value) ? defaultValue : value;
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

class CommonMultiIconWriter {
  createMediaSmallContainer(items, hasPreviousGroup, iconSize) {
    const ele = document.createElement('span');
    if (items.length <= 2) {
      ele.className = `media_${iconSize}_container_2h`;
    } else {
      ele.className = `media_${iconSize}_container`;
    }

    for (const item of items) {
      ele.appendChild(item);
    }

    return ele;
  }
}

class DoubleIconSizeWriter extends CommonMultiIconWriter {
  constructor(smallIconSize, largeIconSize) {
    super();
    this.smallIconSize = smallIconSize;
    this.largeIconSize = largeIconSize;
    this.parentEle = null;
    this.unprocessed = [];
    this.hasPreviousGroup = false;
  }

  add(element, mediaIconSize) {
    if (mediaIconSize === this.largeIconSize) {
      this.parentEle.appendChild(element);
      this.hasPreviousGroup = true;
    } else {
      this.unprocessed.push(element);
      if (this.unprocessed.length === 4) {
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
    if (this.unprocessed.length > 0) {
      this.parentEle.appendChild(
        this.createMediaSmallContainer(this.unprocessed, this.hasPreviousGroup, this.smallIconSize));
      this.unprocessed = [];
      this.hasPreviousGroup = true;
    }
  }

  clear() {
    this.unprocessed = [];
    this.hasPreviousGroup = false;
  }
}

class TripleIconSizeWriter extends CommonMultiIconWriter {
  constructor(smallIconSize, mediumIconSize, largeIconSize) {
    super();
    this.smallIconSize = smallIconSize;
    this.mediumIconSize = mediumIconSize;
    this.largeIconSize = largeIconSize;
    this.dualWriter = new DoubleIconSizeWriter(mediumIconSize, largeIconSize);
    this.unprocessed = [];
  }

  add(element, mediaIconSize) {
    if (mediaIconSize === this.smallIconSize) {
      this.unprocessed.push(element);
      if (this.unprocessed.length === 4) {
        const con =
          this.createMediaSmallContainer(this.unprocessed, this.dualWriter.hasPreviousGroup, this.smallIconSize);
        this.dualWriter.add(con, this.mediumIconSize);
        this.unprocessed = [];
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
    if (this.unprocessed.length === 0) {
      this.dualWriter.flush();
      return;
    }

    const con = this.createMediaSmallContainer(this.unprocessed, this.dualWriter.hasPreviousGroup, this.smallIconSize);
    this.dualWriter.add(con, this.mediumIconSize);
    this.unprocessed = [];
    this.dualWriter.flush();
  }

  clear() {
    this.unprocessed = [];
    this.dualWriter.clear();
  }
}

class CsvWriter {
  constructor(state) {
    this.state = state;
  }

  csvEscape(col) {
    if (typeof col === 'string' || col instanceof String) {
      if (col.includes('"') || col.includes(',') || col.includes('\n') || col.includes('\r')) {
        col = col.replace(/"/g, '""');
        return `"${encodeURIComponent(col)}"`;
      }

      return encodeURIComponent(col);
    }

    return String(col);
  }

  writeCsvRow(cols) {
    return cols.map(col => this.csvEscape(col)).join(',') + '%0A';
  }

  getCsvUriData() {
    let ret = 'data:text/csv;charset=utf-8,';

    ret += this.writeCsvRow([
      'media_id', 'title', 'comment', 'link', 'type', 'filesize', 'width', 'height', 'camera',
      'megapixels', 'fps', 'clip_duration', 'clip_duration_secs', 'rating', 'lat', 'lon', 'exif',
      'time_created', 'exposure_time', 'exposure_time_pretty', 'metadata_text', 'reg_thumbnail',
      'reg_motion_photo', 'event_id', 'event_name', 'tag_id', 'tags']);

    for (const media of this.state.allMedia) {
      const cols = [
        media.id,
        media.title ?? '',
        media.comment ?? '',
        media.link,
        media.type,
        media.filesize?.toString() ?? '',
        media.width?.toString() ?? '',
        media.height?.toString() ?? '',
        media.camera ?? '',
        media.megapixels ?? '',
        media.fps ?? '',
        media.clip_duration ?? '',
        media.clip_duration_secs ?? '',
        media.rating?.toString() ?? '',
        media.lat?.toString() ?? '',
        media.lon?.toString() ?? '',
        media.exif?.join(' ') ?? '',
        media.time_created ?? '',
        media.exposure_time ?? '',
        media.exposure_time_pretty ?? '',
        media.metadata_text ?? '',
        media.thumbnail.reg,
        media.motion_photo?.reg_gif ?? '',
        media.event_id?.toString() ?? '',
        media.event_name ?? '',
        media.tags?.join(', ') ?? '',
        media.tag_name?.join(', ') ?? '',
      ];
      ret += this.writeCsvRow(cols);
    }

    return ret;
  }

  downloadCsv(event) {
    if (event.detail !== 1) {
      return;
    }

    const link = document.createElement('a');
    link.href = this.getCsvUriData();
    link.download = 'media.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

class SearchEngine {
  static MEDIA_TYPES = ['photo', 'motion_photo', 'video'];
  static PHOTO_TYPES = ['photo', 'motion_photo'];

  constructor(state) {
    this.state = state;
  }

  generateSearchUrl(criterias, matchPolicy, iconSize, groupBy, sortBy) {
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

  shuffleArray(arr) {
    if (arr === null) {
      return;
    }

    // Don't use Math.random() since we can't provide a starting seed
    let rand = this.state.randomSeed;
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = rand % i;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      rand = (rand * 1103515245 + 12345) & 0x7fffffff;
    }
  }

  doTextSearch(fieldInfo, op, value, media, searchOp) {
    const allParts = value.toLowerCase().split(' ');
    let numPartsMatched = 0;

    for (const part of allParts) {
      let partFound = false;

      for (const fieldname of fieldInfo.searchFields) {
        const input = fieldname in media ? media[fieldname] : null;
        if (input != null) {
          if (Array.isArray(input)) {
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
      }

      if (partFound) {
        numPartsMatched += 1;
      }
    }

    return numPartsMatched === allParts.length;
  }

  textSearchContains(fieldInfo, op, value, media) {
    const func = (input, searchterm) => input.toLowerCase().includes(searchterm);
    return this.doTextSearch(fieldInfo, op, value, media, func);
  }

  textSearchContainsWord(fieldInfo, op, value, media) {
    return this.doTextSearch(fieldInfo, op, value, media, (input, searchterm) => {
      for (const part of input.toLowerCase().split(' ')) {
        if (part === searchterm) {
          return true;
        }
      }

      return false;
    });
  }

  performGenericOp(fieldInfo, media, value, opFunc) {
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

  getCurrentMonthDay() {
    const today = new Date();
    return `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }

  textSearch = {
    ops: [
      {
        descr: 'contains',
        matches: (field, op, values, media) => {
          return this.textSearchContains(field, op, values[0], media);
        },
        numValues: 1,
      },
      {
        descr: 'missing',
        matches: (field, op, values, media) => {
          return !this.textSearchContains(field, op, values[0], media);
        },
        numValues: 1,
      },
      {
        descr: 'contains word',
        matches: (field, op, values, media) => {
          return this.textSearchContainsWord(field, op, values[0], media);
        },
        numValues: 1,
      },
      {
        descr: 'missing word',
        matches: (field, op, values, media) => {
          return !this.textSearchContainsWord(field, op, values[0], media);
        },
        numValues: 1,
      },
      {
        descr: 'equals',
        matches: (field, op, values, media) => {
          const match = (input, value) => input != null && input.toLowerCase() === value.toLowerCase();
          return this.performGenericOp(field, media, values[0], match);
        },
        numValues: 1,
      },
      {
        descr: 'does not equal',
        matches: (field, op, values, media) => {
          const match = (input, value) => input == null || input.toLowerCase() !== value.toLowerCase();
          return this.performGenericOp(field, media, values[0], match);
        },
        numValues: 1,
      },
      {
        descr: 'starts with',
        matches: (field, op, values, media) => {
          const match = (input, value) => input != null && input.toLowerCase().startsWith(value.toLowerCase());
          return this.performGenericOp(field, media, values[0], match);
        },
        numValues: 1,
      },
      {
        descr: 'ends with',
        matches: (field, op, values, media) => {
          const match = (input, value) => input != null && input.toLowerCase().endsWith(value.toLowerCase());
          return this.performGenericOp(field, media, values[0], match);
        },
        numValues: 1,
      },
      {
        descr: 'is set',
        matches: (field, op, values, media) => {
          return this.performGenericOp(field, media, values[0], (input, _value) => input != null && input !== '');
        },
        numValues: 0,
      },
      {
        descr: 'is not set',
        matches: (field, op, values, media) => {
          return this.performGenericOp(field, media, values[0], (input, _value) => input == null || input === '');
        },
        numValues: 0,
      },
    ],
  };

  dateSearch = {
    ops: [
      {
        descr: 'was taken on date',
        matches: (field, op, values, media) => {
          return this.performGenericOp(field, media, values[0],
            (input, value) => input != null && input.startsWith(value));
        },
        placeholder: ['yyyy-MM-dd'],
        inputPattern: ['[0-9]{4}-[0-9]{2}-[0-9]{2}'],
        numValues: 1,
      },
      {
        descr: 'was taken on month/day',
        matches: (field, op, values, media) => {
          return this.performGenericOp(field, media, null, (input, _value) => {
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
        matches: (field, op, values, media) => {
          return this.performGenericOp(field, media, null, (input, _value) => {
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
        matches: (field, op, values, media) => {
          return this.performGenericOp(field, media, null, (input, _value) => {
            if (input == null) {
              return false;
            }

            const compareTo = input.split('T')[0].split('-').slice(1, 3).join('-');
            return compareTo === this.getCurrentMonthDay();
          });
        },
        numValues: 0,
      },
      {
        descr: 'was taken on this week',
        matches: (field, op, values, media) => {
          return this.performGenericOp(field, media, null, (input, _value) => {
            if (input == null) {
              return false;
            }

            const firstDate = new Date();
            firstDate.setDate(firstDate.getDate() - 6);
            const firstMonth = String(firstDate.getMonth() + 1).padStart(2, '0');
            const firstDay = String(firstDate.getDate()).padStart(2, '0');
            const firstMonthDay = `${firstMonth}-${firstDay}`;

            const lastDate = new Date();
            const lastMonth = String(lastDate.getMonth() + 1).padStart(2, '0');
            const lastDay = String(lastDate.getDate()).padStart(2, '0');
            const lastMonthDay = `${lastMonth}-${lastDay}`;

            const compareTo = input.split('T')[0].split('-').slice(1, 3).join('-');
            return firstMonthDay <= compareTo && compareTo <= lastMonthDay;
          });
        },
        numValues: 0,
      },
      {
        descr: 'was taken on this month',
        matches: (field, op, values, media) => {
          return this.performGenericOp(field, media, null, (input, _value) => {
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
        matches: (field, op, values, media) => {
          return this.performGenericOp(field, media, values[0], (input, value) => input != null && input < value);
        },
        placeholder: ['yyyy-MM-dd'],
        inputPattern: ['[0-9]{4}-[0-9]{2}-[0-9]{2}'],
        numValues: 1,
      },
      {
        descr: 'is after',
        matches: (field, op, values, media) => {
          return this.performGenericOp(field, media, values[0], (input, value) => input != null && input > value);
        },
        placeholder: ['yyyy-MM-dd'],
        inputPattern: ['[0-9]{4}-[0-9]{2}-[0-9]{2}'],
        numValues: 1,
      },
      {
        descr: 'is between',
        matches: (field, op, values, media) => {
          const match = (input, value) => input != null && input >= value[0] && input <= value[1];
          return this.performGenericOp(field, media, values, match);
        },
        placeholder: ['yyyy-MM-dd', 'yyyy-MM-dd'],
        inputPattern: ['[0-9]{4}-[0-9]{2}-[0-9]{2}', '[0-9]{4}-[0-9]{2}-[0-9]{2}'],
        numValues: 2,
      },
      {
        descr: 'is set',
        matches: (field, op, values, media) => {
          return this.performGenericOp(field, media, null, (input, _value) => input != null && input !== '');
        },
        numValues: 0,
      },
      {
        descr: 'is not set',
        matches: (field, op, values, media) => {
          return this.performGenericOp(field, media, null, (input, _value) => input == null || input === '');
        },
        numValues: 0,
      },
    ],
  };

  doMediaSearchEquals(input, value) {
    if (input == null) {
      return false;
    }

    // If the user searches for a photo, then include the other subtypes in that search.
    if (value === 'media') {
      return SearchEngine.MEDIA_TYPES.includes(input);
    }

    if (value === 'photo') {
      return SearchEngine.PHOTO_TYPES.includes(input);
    }

    return input === value;
  }

  mediaTypeSearch = {
    ops: [
      {
        descr: 'is a',
        matches: (field, op, values, media) => {
          return this.performGenericOp(field, media, values[0], this.doMediaSearchEquals);
        },
        numValues: 1,
      },
      {
        descr: 'is not a',
        matches: (field, op, values, media) => {
          return this.performGenericOp(field, media, values[0],
            (input, value) => !this.doMediaSearchEquals(input, value));
        },
        numValues: 1,
      },
    ],
  };

  createNumberSearch(placeholderText, showGtLt, showIsSet, inputMin, inputMax, inputStep) {
    const ops = [];

    if (showGtLt) {
      ops.push({
        descr: 'is at least',
        matches: (field, op, values, media) => {
          return this.performGenericOp(field, media, values[0], (input, value) => input != null && input >= value);
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
        matches: (field, op, values, media) => {
          return this.performGenericOp(field, media, values[0], (input, value) => input != null && input <= value);
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
      matches: (field, op, values, media) => {
        return this.performGenericOp(field, media, values[0], (input, value) => input != null && input == value);
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
      matches: (field, op, values, media) => {
        return this.performGenericOp(field, media, values[0], (input, value) => input == null || input != value);
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
        matches: (field, op, values, media) => {
          return this.performGenericOp(field, media, null, (input, _value) => input != null && input !== '');
        },
        numValues: 0,
      });

      ops.push({
        descr: 'is not set',
        matches: (field, op, values, media) => {
          return this.performGenericOp(field, media, null, (input, _value) => input == null || input === '');
        },
        numValues: 0,
      });
    }

    return { ops };
  }

  createIntegerSearch(placeholderText, showGtLt, showIsSet, inputMin, inputMax) {
    return this.createNumberSearch(placeholderText, showGtLt, showIsSet, inputMin, inputMax, 1);
  }

  createDecimalSearch(placeholderText, showGtLt, showIsSet, inputMin, inputMax) {
    return this.createNumberSearch(placeholderText, showGtLt, showIsSet, inputMin, inputMax, 0.1);
  }

  haversineDistance(coord1, coord2) {
    // Haversine formula to calculate distance between two GPS coordinates
    const [lat1, lon1] = coord1.map((deg) => deg * (Math.PI / 180));
    const [lat2, lon2] = coord2.map((deg) => deg * (Math.PI / 180));

    const dlat = lat2 - lat1;
    const dlon = lon2 - lon1;

    const a = Math.sin(dlat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return 6371 * c; // 6371 is the Earth's radius in km
  }

  gpsIsWithin(field, op, values, media) {
    if (!('lat' in media)) {
      return false;
    }

    const userLat = parseFloat(values[0]);
    const userLon = parseFloat(values[1]);
    const userDistKm = parseFloat(values[2]);

    return this.haversineDistance([userLat, userLon], [media.lat, media.lon]) <= userDistKm;
  }

  gpsSearch = {
    ops: [
      {
        descr: 'is within',
        matches: (field, op, values, media) => {
          return this.gpsIsWithin(field, op, values, media);
        },
        placeholder: ['lat', 'lon', 'km'],
        numValues: 3,
        inputType: ['number', 'number', 'number'],
        inputStep: ['any', 'any', 'any'],
      },
      {
        descr: 'is outside',
        matches: (field, op, values, media) => {
          if (!('lat' in media)) {
            return false;
          }

          return !this.gpsIsWithin(field, op, values, media);
        },
        placeholder: ['lat', 'lon', 'km'],
        numValues: 3,
        inputType: ['number', 'number', 'number'],
        inputStep: ['any', 'any', 'any'],
      },
      {
        descr: 'is set',
        matches: (field, op, values, media) => {
          return this.performGenericOp(field, media, null, (input, _value) => input != null && input !== '');
        },
        numValues: 0,
      },
      {
        descr: 'is not set',
        matches: (field, op, values, media) => {
          return this.performGenericOp(field, media, null, (input, _value) => input == null || input === '');
        },
        numValues: 0,
      },
    ],
  };

  fileExtSearch = {
    ops: [
      {
        descr: 'is',
        matches: (field, op, values, media) => {
          const match = (input, value) => input != null && input.toLowerCase().endsWith(`.${value.toLowerCase()}`);
          return this.performGenericOp(field, media, values[0], match);
        },
        numValues: 1,
      },
      {
        descr: 'is not',
        matches: (field, op, values, media) => {
          const match = (input, value) => input == null || !input.toLowerCase().endsWith(`.${value.toLowerCase()}`);
          return this.performGenericOp(field, media, values[0], match);
        },
        numValues: 1,
      },
    ],
  };

  searchFields = [
    {
      title: 'Any Text',
      search: this.textSearch,
      searchFields: ['camera', 'comment', 'event_name', 'link', 'tag_name', 'title'],
    },
    {
      title: 'Camera',
      search: this.textSearch,
      searchFields: ['camera'],
    },
    {
      title: 'Comment',
      search: this.textSearch,
      searchFields: ['comment'],
    },
    {
      title: 'Date',
      search: this.dateSearch,
      searchFields: ['exposure_time'],
    },
    {
      title: 'Event ID',
      search: this.createIntegerSearch(null, false, false, 0, null),
      searchFields: ['event_id'],
    },
    {
      title: 'Event Name',
      search: this.textSearch,
      searchFields: ['event_name'],
    },
    {
      title: 'Filename',
      search: this.textSearch,
      searchFields: ['link'],
    },
    {
      title: 'File Extension',
      search: this.fileExtSearch,
      searchFields: ['link'],
    },
    {
      title: 'File Size',
      search: this.createDecimalSearch('bytes', true, false, 0, null),
      searchFields: ['filesize'],
    },
    {
      title: 'FPS',
      search: this.createIntegerSearch('fps', true, true, 0, null),
      searchFields: ['fps'],
    },
    {
      title: 'GPS Coordinate',
      search: this.gpsSearch,
      searchFields: ['lat'],
    },
    {
      title: 'Height',
      search: this.createIntegerSearch('pixels', true, false, 0, null),
      searchFields: ['height'],
    },
    {
      title: 'Megapixels',
      search: this.createDecimalSearch(null, true, false, 0, null),
      searchFields: ['megapixels'],
    },
    {
      title: 'Rating',
      search: this.createIntegerSearch(null, true, false, 0, 5),
      searchFields: ['rating'],
      validValues: [['Unrated', '0'], ['★', '1'], ['★★', '2'], ['★★★', '3'], ['★★★★', '4'], ['★★★★★', '5']],
    },
    {
      title: 'Tag ID',
      search: this.createIntegerSearch(null, false, false, 0, null),
      searchFields: ['tag_id'],
    },
    {
      title: 'Tag Name',
      search: this.textSearch,
      searchFields: ['tag_name'],
    },
    {
      title: 'Tag Parent ID',
      search: this.createIntegerSearch(null, false, true, 0, null),
      searchFields: ['parent_tag_id'],
    },
    {
      title: 'Title',
      search: this.textSearch,
      searchFields: ['title'],
    },
    {
      title: 'Total Photos',
      search: this.createIntegerSearch(null, true, false, 0, null),
      searchFields: ['num_photos'],
    },
    {
      title: 'Total Videos',
      search: this.createIntegerSearch(null, true, false, 0, null),
      searchFields: ['num_videos'],
    },
    {
      title: 'Type',
      search: this.mediaTypeSearch,
      searchFields: ['type'],
      validValues: [
        ['media', 'media'], ['photo', 'photo'], ['motion photo', 'motion_photo'],
        ['video', 'video'], ['event', 'events'], ['tag', 'tags'],
        ['year', 'years'],
      ],
    },
    {
      title: 'Video Length',
      search: this.createDecimalSearch('secs', true, false, 0, null),
      searchFields: ['clip_duration_secs'],
    },
    {
      title: 'Width',
      search: this.createIntegerSearch('pixels', true, false, 0, null),
      searchFields: ['width'],
    },
    {
      title: 'W/H Ratio',
      search: this.createDecimalSearch(null, true, false, 0, null),
      searchFields: ['photo_ratio'],
    },
    {
      title: 'Year',
      search: this.createIntegerSearch(null, true, false, 1800, null),
      searchFields: ['year'],
    },
  ];

  getSearchQueryParams() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.getAll('search');
  }

  getSearchCriteria() {
    const allCriteria = [];

    for (const searchCriteria of this.getSearchQueryParams()) {
      // FIXME - doesn't support comma in value
      const parts = searchCriteria.split(',');
      if (parts.length < 2) {
        continue;
      }

      const criteria = { field: null, op: null, searchValues: parts.slice(2, parts.length) };

      for (const searchField of this.searchFields) {
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
      const noopField = { title: null, search: this.textSearch, searchFields: ['noop'] };
      const trueOp = { descr: 'equals', matches(_field, _op, _values, _media) { return true; }, numValues: 0 };
      allCriteria.push({ field: noopField, op: trueOp, searchValues: [] });
    }

    return allCriteria;
  }

  doUpdateItems(allItems) {
    const fileExtensions = new Set([]);

    const ret = [];
    const types = [['media', ''], ['events', 'Event: '], ['tags', 'Tag: '], ['years', 'Year: ']];
    for (const mediaType of types) {
      for (const media of allItems[mediaType[0]]) {
        if (!media.type) {
          media.type = mediaType[0];
        }

        if (media.tags) {
          // Write out the tag name into the media element to simplify code for the text search.
          media.tag_id = [];
          media.tag_name = [];
          for (const tagId of media.tags) {
            media.tag_id.push(tagId);
            media.tag_name.push(this.state.tags[tagId].title);
          }
        }

        if (media.event_id) {
          // Write out the event name into the media element to simplify code for the text search.
          media.event_name = this.state.events[media.event_id].title;
        }

        if (mediaType[0] !== 'media') {
          media.time_created = media.min_date;
          media.exposure_time = media.max_date;
        }

        if (mediaType[0] === 'years') {
          media.year = [media.id];
        } else if (mediaType[0] === 'events') {
          media.year = [];
          if (media.years) {
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
            media.tag_name.push(this.state.tags[media.parent_tag_id].title);
          }
        }

        if (media.width) {
          media.photo_ratio = media.width / media.height;
        }

        if (media.link) {
          const idx = media.link.lastIndexOf('.');
          if (idx !== -1) {
            fileExtensions.add(media.link.substring(idx + 1).toLowerCase());
          }
        }

        media.title_prefix = mediaType[1];
        ret.push(media);
      }
    }

    for (const field of this.searchFields) {
      if (field.title === 'File Extension') {
        field.validValues = Array.from(fileExtensions)
          .sort()
          .map(ext => [ext, ext]);
        break;
      }
    }

    return ret;
  }

  shortenPrettyDate(input) {
    const parts = input.split(' ');
    if (parts.length < 4) {
      return input;
    }

    return `${parts[1]} ${parts[2]} ${parts[3]}`;
  }

  getPreferredView(allCriteria, mainTitle) {
    // Search criteria can be chained in any order. Get the distinct types and order below.
    let eventTitle = null;
    let eventDefaultSort = null;
    let eventId = null;
    let yearTitle = null;
    let yearDefaultSort = null;
    let tagTitle = null;
    let tagView = null;
    let yearView = null;

    for (const criteria of allCriteria) {
      if (criteria.field.title === 'Type' && criteria.op.descr === 'is a' &&
          criteria.searchValues[0] === 'years') {
        yearTitle = `${mainTitle}: All Years`;
        yearDefaultSort = 'takenZA';
      } else if (criteria.field.title === 'Year' && criteria.op.descr === 'equals') {
        yearTitle = `${mainTitle}: Year ${criteria.searchValues[0]}`;
        // Used for generating search links when searching for events.
        yearView = criteria.searchValues[0];
        yearDefaultSort = 'takenAZ';
      } else if (criteria.field.title === 'Type' && criteria.op.descr === 'is a' &&
                 criteria.searchValues[0] === 'events') {
        eventTitle = `${mainTitle}: All Events`;
        eventDefaultSort = 'takenZA';
      } else if (criteria.field.title === 'Event ID' && criteria.op.descr === 'equals') {
        eventId = criteria.searchValues[0];
        let eventName = this.state.events[eventId]?.title;
        if (eventName === undefined) {
          eventName = 'Unknown event';
        }
        eventTitle = `${mainTitle}: ${eventName}`;
        eventDefaultSort = 'takenAZ';
      } else if (criteria.field.title === 'Type' && criteria.op.descr === 'is a' &&
                 criteria.searchValues[0] === 'tags') {
        tagTitle = `${mainTitle}: All Tags`;
      } else if (criteria.field.title === 'Tag ID' && criteria.op.descr === 'equals') {
        tagView = this.state.tags[criteria.searchValues[0]];
        tagTitle = `${mainTitle}: ${tagView !== undefined ? tagView.title : 'Unknown tag'}`;
      }
    }

    const views = [
      {
        title: eventTitle,
        cssSelector: 'events_link',
        defaultSort: eventDefaultSort,
        currentYearView: null,
        searchTag: null,
        searchEventId: eventId,
      },
      {
        title: yearTitle,
        cssSelector: 'years_link',
        defaultSort: yearDefaultSort,
        currentYearView: yearView,
        searchTag: null,
        searchEventId: null,
      },
      {
        title: tagTitle,
        cssSelector: 'tags_link',
        defaultSort: 'takenZA',
        currentYearView: null,
        searchTag: tagView,
        searchEventId: null,
      },
      {
        title: `${mainTitle}: Search`,
        cssSelector: null,
        defaultSort: 'takenZA',
        currentYearView: null,
        searchTag: null,
        searchEventId: null,
      }];

    return views.find((ent) => ent.title !== null);
  }

  processGpsGroups(allItems, maxDistanceKm) {
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
        const thisDist = this.haversineDistance([media.lat, media.lon], [groupLat, groupLon]);
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

    groups.sort((a, b) => b.mediaIndexes.length - a.mediaIndexes.length);

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

  processCameraGroups(allItems) {
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

    const groups = Object.entries(cameraSet);

    groups.sort((a, b) => b[1].length - a[1].length);

    groups.forEach(([cameraName, mediaIds], index) => {
      for (const mediaId of mediaIds) {
        allItems[mediaId].groupIndex = index;
        allItems[mediaId].groupName = cameraName;
      }
    });
  }

  setZeroGroupIndexAndName(allItems, groupNameFunc) {
    for (const media of allItems) {
      media.groupIndex = 0;
      media.groupName = groupNameFunc(media);
    }
  }

  groupAllMedia(allItems) {
    const groupBy = getQueryParameter('group', 'none');

    if (groupBy === 'year') {
      this.setZeroGroupIndexAndName(allItems, (media) => {
        if (!media.exposure_time_pretty) {
          return null;
        }
        const parts = media.exposure_time_pretty.split(' ');
        return parts.length === 1 ? parts[0] : parts[3];
      });
    } else if (groupBy === 'month') {
      this.setZeroGroupIndexAndName(allItems, (media) => {
        if (!media.exposure_time_pretty) {
          return null;
        }
        const parts = media.exposure_time_pretty.split(' ');
        return parts.length === 1 ? parts[0] : `${parts[1]} ${parts[3]}`;
      });
    } else if (groupBy === 'day') {
      this.setZeroGroupIndexAndName(allItems, (media) => {
        if (!media.exposure_time_pretty) {
          return null;
        }
        const parts = media.exposure_time_pretty.split(' ');
        return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]}`;
      });
    } else if (groupBy === 'camera') {
      this.processCameraGroups(allItems);
    } else if (groupBy === 'gps1km') {
      this.processGpsGroups(allItems, 1);
    } else if (groupBy === 'gps5km') {
      this.processGpsGroups(allItems, 5);
    } else if (groupBy === 'gps10km') {
      this.processGpsGroups(allItems, 10);
    } else if (groupBy === 'gps50km') {
      this.processGpsGroups(allItems, 50);
    } else if (groupBy === 'gps100km') {
      this.processGpsGroups(allItems, 100);
    } else {
      this.setZeroGroupIndexAndName(allItems, (_media) => { return null; });
    }
  }

  performSearch(allItems, allCriteria, defaultSort) {
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

        if (media.exposure_time && media.exposure_time_pretty) {
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

    this.groupAllMedia(ret);

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

    // default,takenZA,takenAZ,createdZA,createdAZ,random
    let sortBy = getQueryParameter('sort', 'default');
    if (sortBy === 'default') {
      sortBy = defaultSort;
    }

    if (sortBy === 'random') {
      this.shuffleArray(ret);
    } else {
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
      minDatePretty = this.shortenPrettyDate(minDatePretty);
      maxDatePretty = this.shortenPrettyDate(maxDatePretty);
      if (minDatePretty === maxDatePretty) {
        newDateRange = minDatePretty;
      } else {
        newDateRange = `${minDatePretty} - ${maxDatePretty}`;
      }
    }

    return [ret, newDateRange];
  }

  processJson(readyFunc) {
    if (this.state.processedMedia == null) {
      // getAllMediaViaJsFile() is defined in the media.json file.
      // eslint-disable-next-line no-undef
      const resp = getAllMediaViaJsFile();
      this.state.events = {};
      for (const evt of resp.events) {
        this.state.events[evt.id] = {
          id: evt.id,
          title: 'title' in evt ? evt.title : `Unnamed ${evt.id}`,
          comment: evt.comment ?? ''
        };
      }

      this.state.tags = {};
      for (const tag of resp.tags) {
        this.state.tags[tag.id] = tag;
      }

      this.state.processedMedia = this.doUpdateItems(resp);
      this.state.extraHeader = resp.extra_header;
      this.state.mainTitle = resp.title;

      let ele = document.querySelector('#generated_timestamp');
      if (ele) {
        ele.innerText = `at ${resp.generated_at}`;
      }

      ele = document.querySelector('#app_version');
      if (ele) {
        ele.innerText = resp.version_label;
      }
    }

    const allCriteria = this.getSearchCriteria();
    const preferredView = this.getPreferredView(allCriteria, this.state.mainTitle);
    const searchResults =
      this.performSearch(this.state.processedMedia, allCriteria, preferredView.defaultSort);
    readyFunc(searchResults[0], this.state.extraHeader, searchResults[1], preferredView);
  }
}

class SearchUI {
  static SCREEN_BREAKPOINT_SMALL = 800;
  static SCREEN_BREAKPOINT_MEDIUM = 1200;

  static ICON_SIZES = {
    SMALL: 'small',
    MEDIUM: 'medium',
    LARGE: 'large',
    SMALL_MEDIUM: 'small_medium',
    MEDIUM_LARGE: 'medium_large',
    SMALL_MEDIUM_LARGE: 'small_medium_large',
    LARGE_FULL_META: 'large_full_meta',
    LARGE_TAG_META: 'large_tag_meta',
    LARGE_NO_META: 'large_no_meta',
    REGULAR: 'regular',
    REGULAR_FULL_META: 'regular_full_meta',
    REGULAR_TAG_META: 'regular_tag_meta',
    REGULAR_NO_META: 'regular_no_meta',
    LARGE_REGULAR: 'large_regular',
  };

  static FULL_METADATA_SIZES = [
    SearchUI.ICON_SIZES.LARGE_FULL_META,
    SearchUI.ICON_SIZES.REGULAR_FULL_META
  ];

  static TAG_METADATA_SIZES = [
    SearchUI.ICON_SIZES.LARGE_TAG_META,
    SearchUI.ICON_SIZES.REGULAR_TAG_META
  ];

  static BRIEF_METADATA_SIZES = [
    SearchUI.ICON_SIZES.LARGE,
    SearchUI.ICON_SIZES.REGULAR
  ];

  static LARGE_ICON_SIZES = [
    SearchUI.ICON_SIZES.LARGE,
    SearchUI.ICON_SIZES.LARGE_FULL_META,
    SearchUI.ICON_SIZES.LARGE_TAG_META,
    SearchUI.ICON_SIZES.LARGE_NO_META
  ];

  static FILE_SIZE_UNITS = {
    GB: 1024 * 1024 * 1024,
    MB: 1024 * 1024,
    KB: 1024,
  };

  static MEDIA_TYPE_STRINGS = {
    EVENTS: 'events',
    YEARS: 'years',
    TAGS: 'tags',
    MEDIA: 'media',
  };

  static VIDEO_SIZES = {
    P480: '480p',
    P720: '720p',
    P1080: '1080p',
    FULL: 'full',
  };

  constructor(state, searchEngine, csvWriter) {
    this.state = state;
    this.searchEngine = searchEngine;
    this.csvWriter = csvWriter;
  }

  setFullImageDisplay(shown) {
    document.querySelector('#description').style.display = 'none';

    const displayState = shown ? 'block' : 'none';
    document.querySelector('#fullimage_background').style.display = displayState;
    document.querySelector('#fullimage_container').style.display = displayState;

    const mapEle = document.querySelector('#map');
    if (mapEle) {
      mapEle.style.display = shown ? 'none' : 'block';
    }

    if (shown) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
      document.querySelector('#fullimage').removeAttribute('src');

      const videoEle = document.querySelector('#fullvideo');
      videoEle.pause();
      videoEle.removeAttribute('src');
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }

  setFullscreenDescriptionShown(shown) {
    const descrEle = document.querySelector('#description');
    descrEle.style.display = shown ? 'block' : 'none';
  }

  enableFullscreenPhotoUpdateTimer() {
    if (this.state.fullScreenPhotoUpdateTimer != null) {
      clearInterval(this.state.fullScreenPhotoUpdateTimer);
    }
    this.state.fullScreenPhotoUpdateTimer =
      setInterval(() => { this.showNextImageFullscreen(false); }, this.state.fullScreenPhotoUpdateSecs * 1000);
  }

  getNextImageIndex() {
    return this.state.allMediaFullScreenIndex >= this.state.allMedia.length - 1 ?
      0 : this.state.allMediaFullScreenIndex + 1;
  }

  getPreviousImageIndex() {
    return Math.max(0, this.state.allMediaFullScreenIndex - 1);
  }

  getFullscreenImageUrl(index) {
    const media = this.state.allMedia[index];
    if (SearchEngine.MEDIA_TYPES.includes(media.type)) {
      return media.link;
    }

    return media.thumbnail.reg ?? media.thumbnail.large;
  }

  handleVisibilityChange = () => {
    if (this.state.wakeLock !== null && document.visibilityState === 'visible') {
      this.requestWakeLock();
    }
  };

  requestWakeLock() {
    // Only available over HTTPS and certain browsers
    if ('wakeLock' in navigator) {
      try {
        navigator.wakeLock.request('screen')
          .then((lock) => {
            this.state.wakeLock = lock;
          });

        document.addEventListener('visibilitychange', this.handleVisibilityChange);
      } catch (err) {
        // NOOP
      }
    }
  }

  releaseWakeLock() {
    if (this.state.wakeLock != null) {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
      this.state.wakeLock.release().then(() => {
        this.state.wakeLock = null;
      });
    }
  }

  isImageFullscreen() {
    const fullImageEle = document.querySelector('#fullimage_container');
    return fullImageEle.style.display !== 'none';
  }

  exitImageFullscreen() {
    if (!this.isImageFullscreen()) {
      return;
    }

    if (this.state.fullScreenPhotoUpdateTimer != null) {
      clearInterval(this.state.fullScreenPhotoUpdateTimer);
      this.state.fullScreenPhotoUpdateTimer = null;

      const searchParams = new URLSearchParams(window.location.search);
      searchParams.delete('kiosk');
      searchParams.delete('update_secs');
      searchParams.delete('slideshow');
      window.history.pushState({}, '', `?${searchParams.toString()}#`);

      this.releaseWakeLock();
    }

    this.state.fullScreenPhotoUpdateSecs = 0;
    this.state.fullScreenReinstateSlideshowSecs = 0;
    document.body.style.cursor = 'auto';
    this.setFullImageDisplay(false);
    window.scrollTo(this.state.preFullScreenScrollX, this.state.preFullScreenScrollY);
  }

  stopEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    return false;
  }

  updateMediaDescriptionText(descrEle) {
    const entity = this.state.allMedia[this.state.allMediaFullScreenIndex];
    descrEle.replaceChildren(this.createMediaStatsHtml(entity, true, (event) => {
      this.exitImageFullscreen();
      return this.stopEvent(event);
    }));
  }

  getVideoVariantLink(entity, size) {
    return entity.variants?.[size] ?? entity.link;
  }

  getCookie(name) {
    const nameSearch = `${name}=`;
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const trimmedCookie = cookie.trim();
      if (trimmedCookie.startsWith(nameSearch)) {
        return decodeURIComponent(trimmedCookie.substring(nameSearch.length));
      }
    }
    return null;
  }

  getDefaultVideoSize() {
    const videoSize = this.getCookie('video_size');
    const validSizes = Object.values(SearchUI.VIDEO_SIZES);
    if (videoSize !== null && validSizes.includes(videoSize)) {
      return videoSize;
    } else if (window.innerWidth <= SearchUI.SCREEN_BREAKPOINT_SMALL) {
      return SearchUI.VIDEO_SIZES.P480;
    } else if (window.innerWidth <= SearchUI.SCREEN_BREAKPOINT_MEDIUM) {
      return SearchUI.VIDEO_SIZES.P720;
    } else {
      return SearchUI.VIDEO_SIZES.P1080;
    }
  }

  getFullscreenVideoUrl(entity) {
    if (this.state.alwaysAnimateMotionPhotos && entity.motion_photo?.mp4) {
      return entity.motion_photo.mp4;
    }
    if (entity.type !== 'video') {
      return null;
    }

    const videoSize = document.querySelector('#slideshow_videos').value;
    return this.getVideoVariantLink(entity, videoSize);
  }

  setPlayIconDisplay(display) {
    document.querySelector('#play').style.display = display;
  }

  setMetadataIconDisplay(display) {
    document.querySelector('#metadata').style.display = display;
  }

  setVideoSizeState(display) {
    document.querySelector('#slideshow_videos').style.display = display;
  }

  isKioskModeEnabled() {
    return getIntQueryParameter('kiosk', 0) === 1;
  }

  updateSlideshowNavigationIcons(entity) {
    if (entity.type === 'video') {
      this.setPlayIconDisplay('none');
      this.setMetadataIconDisplay('inline-block');
      this.setVideoSizeState('inline-block');
    } else if (entity.motion_photo?.mp4 && !this.isKioskModeEnabled()) {
      this.setPlayIconDisplay('inline-block');
      this.setMetadataIconDisplay('inline-block');
      this.setVideoSizeState('none');
    } else {
      this.setPlayIconDisplay('none');
      this.setMetadataIconDisplay('none');
      this.setVideoSizeState('none');
    }
  }

  doShowFullscreenImage(manuallyInvoked) {
    this.setPlayIconDisplay('none');
    this.setMetadataIconDisplay('none');
    this.setVideoSizeState('none');
    if (!this.fullscreenSupported()) {
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
      if (this.state.fullScreenPhotoUpdateTimer != null) {
        this.enableFullscreenPhotoUpdateTimer();
      }
    } else {
      this.setFullscreenDescriptionShown(false);
    }

    if (hideDescr) {
      descrEle.style.display = 'none';
    }

    const entity = this.state.allMedia[this.state.allMediaFullScreenIndex];
    const videoUrl = this.getFullscreenVideoUrl(entity);
    if (videoUrl !== null) {
      const imageEle = document.querySelector('#fullimage');
      imageEle.removeAttribute('src');
      imageEle.style.display = 'none';

      const videoEle = document.querySelector('#fullvideo');
      videoEle.src = videoUrl;
      videoEle.style.display = 'block';

      this.updateSlideshowNavigationIcons(entity);
      this.updateMediaDescriptionText(descrEle);
    } else {
      const videoEle = document.querySelector('#fullvideo');
      videoEle.pause();
      videoEle.removeAttribute('src');
      videoEle.style.display = 'none';

      const imageEle = document.querySelector('#fullimage');
      imageEle.onload = () => {
        this.updateSlideshowNavigationIcons(entity);
        this.updateMediaDescriptionText(descrEle);
      };
      imageEle.style.display = 'block';
      const imageUrl = this.getFullscreenImageUrl(this.state.allMediaFullScreenIndex);
      imageEle.src = imageUrl;
    }
  }

  showNextImageFullscreen(manuallyInvoked) {
    if (this.isImageFullscreen()) {
      this.state.allMediaFullScreenIndex = this.getNextImageIndex();
      this.doShowFullscreenImage(manuallyInvoked);
    }
  }

  showPreviousImageFullscreen() {
    if (this.isImageFullscreen()) {
      this.state.allMediaFullScreenIndex = this.getPreviousImageIndex();
      this.doShowFullscreenImage(true);
    }
  }

  toggleSlideshowTimers() {
    if (this.state.fullScreenPhotoUpdateSecs === 0) {
      return;
    }

    if (this.state.fullScreenPhotoUpdateTimer == null) {
      this.setFullscreenDescriptionShown(false);

      if (this.state.fullScreenReinstateSlideshowTimer != null) {
        clearInterval(this.state.fullScreenReinstateSlideshowTimer);
        this.state.fullScreenReinstateSlideshowTimer = null;
      }
      this.enableFullscreenPhotoUpdateTimer();
    } else {
      this.setFullscreenDescriptionShown(true);

      clearInterval(this.state.fullScreenPhotoUpdateTimer);
      this.state.fullScreenPhotoUpdateTimer = null;
      this.state.fullScreenReinstateSlideshowTimer =
        setInterval(() => { this.toggleSlideshowTimers(); }, this.state.fullScreenReinstateSlideshowSecs * 1000);
    }
  }

  startSlideshow() {
    this.state.fullScreenPhotoUpdateSecs = getIntQueryParameter('update_secs', 10);
    this.state.fullScreenReinstateSlideshowSecs = getIntQueryParameter('reinstate_secs', 300);
    this.setFullImageDisplay(true);
    this.state.allMediaFullScreenIndex = getIntQueryParameter('idx', 0);
    this.doShowFullscreenImage(false);
    this.toggleSlideshowTimers();
    this.requestWakeLock();
  }

  slideshowClicked() {
    const searchParams = new URLSearchParams(window.location.search);
    searchParams.delete('slideshow');
    searchParams.append('slideshow', '1');
    searchParams.delete('update_secs');
    searchParams.append('update_secs', '10');
    window.history.pushState({}, '', `?${searchParams.toString()}#`);
    this.startSlideshow();
  }

  checkForPhotoFrameMode() {
    let slideshow = false;
    if (this.isKioskModeEnabled()) {
      slideshow = true;
      this.state.inPhotoFrameMode = true;
      document.body.style.cursor = 'none';
      document.querySelector('#slideshow_controls').style.display = 'none';
    } else if (getIntQueryParameter('slideshow', 0) === 1) {
      slideshow = true;
    } else if (getIntQueryParameter('fullscreen', 0) === 1) {
      document.querySelector('#fullscreen').style.display = 'none';
    }

    if (slideshow) {
      this.startSlideshow();
    }
  }

  playIconClicked() {
    if (!this.isImageFullscreen()) {
      return;
    }

    this.state.alwaysAnimateMotionPhotos = !this.state.alwaysAnimateMotionPhotos;
    document.querySelector('#play_pause_icon').src =
      this.state.alwaysAnimateMotionPhotos ? 'icons/pause-web-icon.png' : 'icons/play-web-icon.png';
    this.doShowFullscreenImage(true);
  }

  fullscreenSupported() {
    return document.fullscreenEnabled && document.documentElement.requestFullscreen;
  }

  fullscreenClicked() {
    if (!this.fullscreenSupported()) {
      return;
    }

    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }

  toggleFullscreenDescription() {
    if (this.isImageFullscreen()) {
      if (this.state.inPhotoFrameMode) {
        this.toggleSlideshowTimers();
      } else {
        const descrEle = document.querySelector('#description');
        const shown = descrEle.style.display !== 'none';
        this.setFullscreenDescriptionShown(!shown);
      }
    }
    return false;
  }

  enterSlideshowMode(allMediaIndex) {
    this.state.preFullScreenScrollX = window.scrollX;
    this.state.preFullScreenScrollY = window.scrollY;
    this.state.allMediaFullScreenIndex = allMediaIndex;

    document.querySelector('#slideshow_videos').value = this.getDefaultVideoSize();

    this.setFullImageDisplay(true);
    this.doShowFullscreenImage(false);
  }


  setupSwipeDetection(element, threshold = 50, restraint = 100, allowedTime = 300) {
    let startX, startY, startTime;

    element.addEventListener('touchstart', e => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startTime = Date.now();
    }, { passive: true });

    element.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime <= allowedTime && Math.abs(dx) >= threshold && Math.abs(dy) <= restraint) {
        if (window.visualViewport.scale === 1.0) {
          if (dx < 0) {
            this.showNextImageFullscreen(true);
          } else {
            this.showPreviousImageFullscreen();
          }
        }
      }
    }, { passive: true });
  }

  createOptionNode(text, value) {
    const option = document.createElement('option');
    option.value = value;
    option.innerText = text;
    return option;
  }

  hideResultsInfo() {
    document.querySelector('.summary_stats').replaceChildren();
    for (const search of ['.header_links']) {
      for (const ele of document.querySelectorAll(search)) {
        ele.style.display = 'none';
      }
    }
  }

  updateSearchCriteria() {
    updateOverallStatusMessage('Searching');
    this.hideResultsInfo();

    this.setFullImageDisplay(false);

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
      const url = `index.html?${searchArgs.join('&')}&match=${matchPolicy}&sort=${sortBy}` +
        `&icons=${iconSize}&group=${groupBy}#`;
      window.history.pushState({}, '', url);
      this.doPerformSearch();
    }, 0);
  }

  updateCritieraIfValuesPopulated(idx) {
    const searchEles = document.querySelector(`#search_criteria${idx}`);
    for (const child of searchEles.querySelector('.search_values').children) {
      if (child.value === '' || !child.checkValidity()) {
        return;
      }
    }

    this.updateSearchCriteria();
  }

  searchOpChanged(idx) {
    const searchEles = document.querySelector(`#search_criteria${idx}`);
    const field = this.searchEngine.searchFields[searchEles.querySelector('.search_field').selectedIndex];
    const op = field.search.ops[searchEles.querySelector('.search_op').selectedIndex];

    const values = searchEles.querySelector('.search_values');
    const existingValues = [];
    if (op.numValues === values.children.length) {
      for (const child of values.children) {
        existingValues.push([child.type, child.placeholder, child.value]);
      }
    }

    values.replaceChildren();

    for (let i = 0; i < op.numValues; i += 1) {
      if ('validValues' in field) {
        const select = document.createElement('select');
        select.appendChild(this.createOptionNode('', ''));
        for (const validValue of field.validValues) {
          select.appendChild(this.createOptionNode(validValue[0], validValue[1]));
        }
        select.onchange = () => { this.updateCritieraIfValuesPopulated(idx); return false; };
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

        input.onchange = () => { window.blur(); this.updateCritieraIfValuesPopulated(idx); return false; };

        if (i < existingValues.length && existingValues[i][0] === input.type &&
            existingValues[i][1] === input.placeholder) {
          input.value = existingValues[i][2];
        }

        values.appendChild(input);
      }
    }
  }

  searchFieldChanged(idx) {
    const searchEles = document.querySelector(`#search_criteria${idx}`);
    const field = this.searchEngine.searchFields[searchEles.querySelector('.search_field').selectedIndex];

    const select = searchEles.querySelector('.search_op');
    select.replaceChildren();

    for (const op of field.search.ops) {
      const option = document.createElement('option');
      option.textContent = option.value = op.descr;
      select.appendChild(option);
    }

    this.searchOpChanged(idx);
  }

  populateSearchFields(idx) {
    const searchEles = document.querySelector(`#search_criteria${idx}`);
    const select = searchEles.querySelector('.search_field');
    select.replaceChildren();

    for (const field of this.searchEngine.searchFields) {
      const option = document.createElement('option');
      option.textContent = option.value = field.title;
      select.appendChild(option);
    }

    this.searchFieldChanged(idx);
  }

  addSearchInputRow() {
    const template = document.querySelector('#search_criteria_row');

    const row = template.content.cloneNode(true);
    row.querySelector('.search_criteria').id = `search_criteria${this.state.nextSearchInput}`;

    const fieldOnChange = (idx) => () => {
      this.searchFieldChanged(idx);
      this.updateCritieraIfValuesPopulated(idx);
      return false;
    };
    row.querySelector('.search_field').onchange = fieldOnChange(this.state.nextSearchInput);

    const opOnChange = (idx) => () => {
      this.searchOpChanged(idx);
      this.updateCritieraIfValuesPopulated(idx);
      return false;
    };
    row.querySelector('.search_op').onchange = opOnChange(this.state.nextSearchInput);

    const delRow = (idx) => () => {
      const ele = document.querySelector(`#search_criteria${idx}`);
      ele.remove();
      this.updateSearchCriteria();
      return false;
    };
    row.querySelector('.search_delete_row').onclick = delRow(this.state.nextSearchInput);

    document.querySelector('#search_criterias').appendChild(row);
    this.populateSearchFields(this.state.nextSearchInput);
    this.state.nextSearchInput += 1;
  }

  populateSearchValuesFromUrl() {
    document.querySelector('#search_criterias').replaceChildren();
    this.state.nextSearchInput = 0;

    for (const searchCriteria of this.searchEngine.getSearchQueryParams()) {
      const curIdx = this.state.nextSearchInput;
      this.addSearchInputRow();

      const parts = searchCriteria.split(',');
      if (parts.length < 2) {
        continue;
      }

      const searchEles = document.querySelector(`#search_criteria${curIdx}`);

      const fieldEle = searchEles.querySelector('.search_field');
      fieldEle.value = parts[0];
      this.searchFieldChanged(curIdx);
      const field = this.searchEngine.searchFields[fieldEle.selectedIndex];

      const opEle = searchEles.querySelector('.search_op');
      opEle.value = parts[1];
      this.searchOpChanged(curIdx);
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

    if (this.state.nextSearchInput === 0) {
      this.addSearchInputRow();
    }
  }

  clearSearchCriteria() {
    window.history.pushState({}, '', 'index.html?#');
    this.doPerformSearch();
  }

  searchPageLinkGenerator(event, criterias, matchPolicy = 'all', overrideIconSize = null, navigateToUrl = false) {
    const parts = [];
    for (const criteria of criterias) {
      // field,op,value
      parts.push(criteria.join(','));
    }

    const iconSize = overrideIconSize !== null ?  overrideIconSize : getQueryParameter('icons', 'default');
    const groupBy = getQueryParameter('group', 'none');
    const sortBy = getQueryParameter('sort', 'default');
    const search = this.searchEngine.generateSearchUrl(parts, matchPolicy, iconSize, groupBy, sortBy);

    // Check to see if the user control clicked the URL to request it be opened in a new tab.
    if (event != null && (event.ctrlKey || event.which === 2 || event.which === 3)) {
      event.preventDefault();
      event.stopPropagation();
      window.open(search, '_blank');
    } else if (navigateToUrl) {
      window.location.href = search;
    } else {
      window.history.pushState({}, '', search);
      this.doPerformSearch();
    }
  }

  nearbyClicked() {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition((position) => {
        const criteria = [['GPS Coordinate', 'is within', position.coords.latitude, position.coords.longitude, 1]];
        this.searchPageLinkGenerator(null, criteria);
      });
    }
  }

  setIconWriter() {
    if (this.state.preferredPageIconSize === 'small_medium') {
      this.state.mediaWriter = new DoubleIconSizeWriter('small', 'medium');
    } else if (this.state.preferredPageIconSize === 'medium_large') {
      this.state.mediaWriter = new DoubleIconSizeWriter('medium', 'large');
    } else if (this.state.preferredPageIconSize === 'small_medium_large') {
      this.state.mediaWriter = new TripleIconSizeWriter('small', 'medium', 'large');
    } else {
      this.state.mediaWriter = new SingleIconSizeWriter();
    }
  }

  showEventComment(searchEventId) {
    const eventCommentEle = document.querySelector('#event_comment');
    eventCommentEle.replaceChildren();

    if (searchEventId != null && this.state.events[searchEventId]) {
      const comment = this.state.events[searchEventId].comment;
      if (comment && comment.trim()) {
        const name = `event_comment_${searchEventId}`;
        const commentSpan = document.createElement('span');
        commentSpan.className = 'event_comment';
        commentSpan.appendChild(this.getExpandableString(name, comment, 'block'));
        eventCommentEle.appendChild(commentSpan);
        eventCommentEle.style.display = 'block';
      } else {
        eventCommentEle.style.display = 'none';
      }
    } else {
      eventCommentEle.style.display = 'none';
    }
  }

  showParentTags(searchTag) {
    const tagParentsEle = document.querySelector('#tag_parents');
    tagParentsEle.replaceChildren();

    if (searchTag != null) {
      let parentTag = searchTag.parent_tag_id;
      let firstChild = true;
      while (parentTag !== null) {
        const tag = this.state.tags[parentTag];

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
          this.searchPageLinkGenerator(event, [['Tag ID', 'equals', tag.id]]);
          return this.stopEvent(event);
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

  getPageIconSize() {
    const iconSize = getQueryParameter('icons', 'default');
    if (iconSize === SearchUI.ICON_SIZES.LARGE_REGULAR) {
      return window.innerWidth <= SearchUI.SCREEN_BREAKPOINT_MEDIUM ?
        SearchUI.ICON_SIZES.LARGE : SearchUI.ICON_SIZES.REGULAR;
    }

    const validIconSizes = Object.values(SearchUI.ICON_SIZES);
    if (validIconSizes.includes(iconSize)) {
      return iconSize;
    }

    if (window.innerWidth <= SearchUI.SCREEN_BREAKPOINT_MEDIUM) {
      return SearchUI.ICON_SIZES.SMALL_MEDIUM_LARGE;
    }

    return SearchUI.ICON_SIZES.REGULAR;
  }

  setPageTitleAndIconSize(preferredView) {
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

    this.state.preferredPageIconSize = this.getPageIconSize();
    this.setIconWriter();

    this.showEventComment(preferredView.searchEventId);
    this.showParentTags(preferredView.searchTag);
  }

  populateMediaAnchorTag(anchor, media, allMediaIndex) {
    if (media.type === 'events') {
      anchor.href = '#';
      const search = [['Event ID', 'equals', media.event_id]];

      /*
       * When searching for events by year, check to see if the JSON contains an entry
       * for the current year. If so, use that since thumbnails and stats are generated
       * for each year that the event spans.
       */
      if (this.state.currentYearView !== null) {
        search.push(['Year', 'equals', this.state.currentYearView]);
        if (media.years) {
          for (const yearBlock of media.years) {
            if (yearBlock.year === this.state.currentYearView) {
              yearBlock.title = media.title;
              if (media.comment) {
                yearBlock.comment = media.comment;
              }

              media = yearBlock;
            }
          }
        }
      }

      anchor.onclick = (event) => {
        this.searchPageLinkGenerator(event, search);
        return this.stopEvent(event);
      };
    } else if (media.type === 'years') {
      anchor.href = '#';
      const search = [['Year', 'equals', media.id]];
      anchor.onclick = (event) => {
        this.searchPageLinkGenerator(event, search);
        return this.stopEvent(event);
      };
    } else if (media.type === 'tags') {
      anchor.href = '#';
      const search = [['Tag ID', 'equals', media.id]];
      anchor.onclick = (event) => {
        this.searchPageLinkGenerator(event, search);
        return this.stopEvent(event);
      };
    } else {
      anchor.href = '#';
      anchor.onclick = (event) => {
        this.enterSlideshowMode(allMediaIndex);
        return this.stopEvent(event);
      };
    }

    return media;
  }

  showLargerMedia(media) {
    return media.rating === 5 || !SearchEngine.MEDIA_TYPES.includes(media.type);
  }

  addExtraFlush(media) {
    return !SearchEngine.MEDIA_TYPES.includes(media.type) &&
            ['small_medium', 'medium_large', 'small_medium_large'].includes(this.state.preferredPageIconSize);
  }

  getMediaIconSize(media) {
    if (this.state.preferredPageIconSize === 'small_medium') {
      return this.showLargerMedia(media) ? 'medium' : 'small';
    }
    if (this.state.preferredPageIconSize === 'medium_large') {
      return this.showLargerMedia(media) ? 'large' : 'medium';
    }
    if (this.state.preferredPageIconSize === 'small_medium_large') {
      if (this.showLargerMedia(media)) {
        return 'large';
      }
      return media.rating === 4 ? 'medium' : 'small';
    }
    return this.state.preferredPageIconSize;
  }

  showLargeIconWithNoDescr(iconSize, mediaType) {
    if (iconSize === 'large_no_meta') {
      return true;
    }

    if (!['medium_large', 'small_medium_large'].includes(this.state.preferredPageIconSize)) {
      return false;
    }

    if (['events', 'tags', 'years'].includes(mediaType)) {
      return false;
    }

    return true;
  }

  createMoreLessAnchor(label, shortEle, longEle, displayType) {
    const anchor = document.createElement('a');
    anchor.className = 'more_less';
    anchor.innerText = label;
    anchor.href = '#';
    anchor.onclick = (event) => {
      if (shortEle.style.display === 'none') {
        longEle.style.display = 'none';
        shortEle.style.display = displayType;
      } else {
        shortEle.style.display = 'none';
        longEle.style.display = displayType;
      }
      event.preventDefault();
      event.stopPropagation();
    };
    return anchor;
  }

  getExpandableString(name, value, displayType) {
    const trimmedValue = value.trim();
    if (trimmedValue.length < 150 && !trimmedValue.includes('\n')) {
      return document.createTextNode(trimmedValue);
    }

    const parentEle = document.createElement('span');

    const longEle = document.createElement('span');
    longEle.style.display = 'none';

    const shortEle = document.createElement('span');
    shortEle.style.display = displayType;

    const truncated = trimmedValue.substring(0, 140).trim().replaceAll('\r', ' ').replaceAll('\n', ' ');
    shortEle.appendChild(document.createTextNode(`${truncated}... `));
    shortEle.appendChild(this.createMoreLessAnchor('More', shortEle, longEle, displayType));
    parentEle.appendChild(shortEle);

    const longText = document.createElement('span');
    longText.innerText = `${trimmedValue} `;
    longEle.appendChild(longText);
    longEle.appendChild(this.createMoreLessAnchor('Less', shortEle, longEle, displayType));
    parentEle.appendChild(longEle);

    return parentEle;
  }

  createStatsSpan(stats) {
    const ret = document.createElement('span');
    stats.forEach((stat, i) => {
      if (i > 0) {
        ret.appendChild(document.createTextNode(' '));
      }
      ret.appendChild(stat);
    });
    return ret;
  }

  createMediaStat(child) {
    const ret = document.createElement('span');
    ret.className = 'media_stat';
    ret.appendChild(child);
    return ret;
  }

  createTextMediaStat(text) {
    return this.createMediaStat(document.createTextNode(text));
  }

  createOpenInNewTabLink(label, link) {
    const anchor = document.createElement('a');
    anchor.target = '_new';
    anchor.href = link;
    anchor.innerText = label;
    return this.createMediaStat(anchor);
  }

  createSearchLink(label, field, op, val, extraOnClick, navigateToUrl = false) {
    const anchor = document.createElement('a');
    anchor.href = '#';
    anchor.onclick = (event) => {
      if (extraOnClick) {
        extraOnClick(event);
      }
      this.searchPageLinkGenerator(event, [[field, op, val]], 'all', null, navigateToUrl);
      return false;
    };
    anchor.innerText = label;
    return this.createMediaStat(anchor);
  }

  getPrettyFileSize(size) {
    if (size > SearchUI.FILE_SIZE_UNITS.GB) {
      return `${(size / SearchUI.FILE_SIZE_UNITS.GB).toFixed(1)}GiB`;
    } else if (size > SearchUI.FILE_SIZE_UNITS.MB) {
      return `${(size / SearchUI.FILE_SIZE_UNITS.MB).toFixed(1)}MiB`;
    } else if (size > SearchUI.FILE_SIZE_UNITS.KB) {
      return `${(size / SearchUI.FILE_SIZE_UNITS.KB).toFixed(1)}KiB`;
    }
    return `${size} bytes`;
  }

  getNumberString(number, singular, plural) {
    return `${number.toLocaleString()} ${number === 1 ? singular : plural}`;
  }

  createMediaStatsHtml(entity, onSlideshowPage, extraOnClick, navigateToUrl = false, iconSize = null) {
    const stats = [];
    const extStats = [];

    const showBriefMetadata = iconSize !== null && SearchUI.BRIEF_METADATA_SIZES.includes(iconSize);
    const isTagMetadataMode = iconSize && SearchUI.TAG_METADATA_SIZES.includes(iconSize);

    const name = `title${entity.type}${entity.id}`;
    if (onSlideshowPage && entity.title) {
      const val = entity.title_prefix + entity.title;
      stats.push(this.getExpandableString(name, val, 'inline'));
      extStats.push(this.getExpandableString(name, val, 'inline'));
    }

    if (onSlideshowPage && entity.comment) {
      stats.push(this.getExpandableString(name, entity.comment, 'inline'));
      extStats.push(this.getExpandableString(name, entity.comment, 'inline'));
    }

    if (!isTagMetadataMode && entity.num_photos > 0) {
      const val = this.getNumberString(entity.num_photos, 'photo', 'photos');
      stats.push(this.createTextMediaStat(val));
      extStats.push(this.createTextMediaStat(val));
    }

    if (!isTagMetadataMode && entity.num_videos > 0) {
      const val = this.getNumberString(entity.num_videos, 'video', 'videos');
      stats.push(this.createTextMediaStat(val));
      extStats.push(this.createTextMediaStat(val));
    }

    if (!isTagMetadataMode && entity.num_events > 1) {
      const val = `${entity.num_events.toLocaleString()} events`;
      stats.push(this.createTextMediaStat(val));
      extStats.push(this.createTextMediaStat(val));
    }

    if (!isTagMetadataMode && entity.exposure_time_pretty) {
      const dateOnly = entity.exposure_time.split('T')[0];
      stats.push(this.createSearchLink(entity.exposure_time_pretty, 'Date', 'was taken on date',
        dateOnly, extraOnClick, navigateToUrl));
      extStats.push(this.createSearchLink(entity.exposure_time_pretty, 'Date', 'was taken on date',
        dateOnly, extraOnClick, navigateToUrl));
    }

    if (!isTagMetadataMode && entity.date_range) {
      stats.push(this.createTextMediaStat(entity.date_range));
      extStats.push(this.createTextMediaStat(entity.date_range));
    }

    if (!isTagMetadataMode && entity.filesize) {
      const val = this.getPrettyFileSize(entity.filesize);
      stats.push(this.createTextMediaStat(val));
      extStats.push(this.createTextMediaStat(val));
    }

    if (!isTagMetadataMode && entity.clip_duration) {
      stats.push(this.createTextMediaStat(entity.clip_duration));
      extStats.push(this.createTextMediaStat(entity.clip_duration));
    }

    if (!isTagMetadataMode && entity.fps) {
      extStats.push(this.createTextMediaStat(`${entity.fps} FPS`));
    }

    if (!isTagMetadataMode && entity.megapixels) {
      const val = `${entity.megapixels}MP`;
      stats.push(this.createTextMediaStat(val));
      extStats.push(this.createTextMediaStat(val));
    }

    if (!isTagMetadataMode && entity.width) {
      extStats.push(this.createTextMediaStat(`${entity.width}x${entity.height}`));
    }

    if (!isTagMetadataMode && entity.camera) {
      extStats.push(this.createSearchLink(entity.camera, 'Camera', 'equals', entity.camera, extraOnClick, navigateToUrl));
    }

    if (!isTagMetadataMode && entity.exif) {
      for (const exif of entity.exif) {
        extStats.push(this.createTextMediaStat(exif));
      }
    }

    if (!isTagMetadataMode && entity.event_id && entity.type !== 'events') {
      extStats.push(
        this.createSearchLink(`Event: ${this.state.events[entity.event_id].title}`, 'Event ID', 'equals',
          entity.event_id, extraOnClick, navigateToUrl));
    }

    if (entity.tags && entity.type !== 'tags') {
      const parentTags = new Set([]);
      for (const tagId of entity.tags) {
        if (this.state.tags[tagId].parent_tag_id !== null) {
          parentTags.add(this.state.tags[tagId].parent_tag_id);
        }
      }

      for (const tagId of entity.tags) {
        if (!parentTags.has(tagId)) {
          extStats.push(this.createSearchLink(`Tag: ${this.state.tags[tagId].title}`, 'Tag ID', 'equals',
            tagId, extraOnClick, navigateToUrl));
        }
      }
    }

    if (!isTagMetadataMode && entity.metadata_text) {
      extStats.push(this.createOpenInNewTabLink('Metadata', entity.metadata_text));
    }

    if (!isTagMetadataMode && entity.rating) {
      const stars = '★'.repeat(entity.rating) + '☆'.repeat(5 - entity.rating);
      extStats.push(this.createSearchLink(stars, 'Rating', 'is at least', entity.rating, extraOnClick, navigateToUrl));
    }

    if (!isTagMetadataMode && entity.motion_photo?.mp4) {
      extStats.push(this.createOpenInNewTabLink('Motion Photo', entity.motion_photo.mp4));
    }

    if (!isTagMetadataMode && entity.lat) {
      if (!navigateToUrl) {
        // Only show the Map link when not already on the map page
        const osmAnchor = document.createElement('a');
        osmAnchor.target = '_new';

        const searchParams = new URLSearchParams(window.location.search);
        searchParams.set('lat', entity.lat);
        searchParams.set('lon', entity.lon);

        osmAnchor.href = `map.html?${searchParams.toString()}`;
        osmAnchor.innerText = `${entity.lat},${entity.lon}`;
        extStats.push(this.createMediaStat(osmAnchor));
      } else {
        extStats.push(this.createTextMediaStat(`${entity.lat},${entity.lon}`));
      }
    }

    if (SearchEngine.MEDIA_TYPES.includes(entity.type)) {
      extStats.push(this.createOpenInNewTabLink('Download', entity.link));
    }

    if (extStats.length === stats.length) {
      return this.createStatsSpan(stats);
    }

    if (!showBriefMetadata) {
      return this.createStatsSpan(extStats);
    }

    const ret = document.createElement('span');

    const shortStatsEle = this.createStatsSpan(stats);
    const extStatsEle = this.createStatsSpan(extStats);

    shortStatsEle.appendChild(document.createTextNode(' '));
    shortStatsEle.appendChild(this.createMoreLessAnchor('More', shortStatsEle, extStatsEle, 'block'));
    ret.append(shortStatsEle);

    extStatsEle.appendChild(document.createTextNode(' '));
    extStatsEle.appendChild(this.createMoreLessAnchor('Less', shortStatsEle, extStatsEle, 'block'));
    extStatsEle.style.display = 'none';
    ret.appendChild(extStatsEle);

    return ret;
  }

  getMediaRegularWidth(media) {
    // FIXME - the maxWidth isn't updated when the window is resized.
    const maxWidth = document.documentElement.clientWidth - 10;
    return maxWidth < media.thumbnail.reg_width ? maxWidth : media.thumbnail.reg_width;
  }

  setupMotionPhotoHover(img, thumbnailSrc, motionPhotoSrc) {
    img.onmouseover = () => { img.src = motionPhotoSrc; };
    img.onmouseleave = () => { img.src = thumbnailSrc; };
    img.ontouchstart = () => { img.src = motionPhotoSrc; };
    img.ontouchend = () => { img.src = thumbnailSrc; };
  }

  createMediaElement(index, media, iconSize) {
    const mediaEle = document.createElement('span');

    const anchor = document.createElement('a');
    const mediaThumbSpan = document.createElement('span');
    mediaThumbSpan.className = 'media_thumb';
    const img = document.createElement('img');
    mediaThumbSpan.appendChild(img);
    anchor.appendChild(mediaThumbSpan);
    mediaEle.appendChild(anchor);

    // See the comment above for why the media element can be overridden for the event search.
    media = this.populateMediaAnchorTag(anchor, media, index);

    if (this.state.alwaysShowAnimations && media.motion_photo) {
      if (iconSize === 'small') {
        img.src = media.motion_photo.small_gif;
        mediaEle.className = 'media_small';
      } else if (iconSize === 'medium') {
        img.src = media.motion_photo.medium_gif;
        mediaEle.className = 'media_medium';
      } else if (SearchUI.LARGE_ICON_SIZES.includes(iconSize) || !('reg_gif' in media.motion_photo)) {
        img.src = media.motion_photo.large_gif;
        if (this.showLargeIconWithNoDescr(iconSize, media.type)) {
          mediaEle.className = 'media_no_descr';
        } else {
          mediaEle.className = 'media';
        }
      } else {
        img.src = media.motion_photo.reg_gif;
        img.style.width = '100%';
        mediaEle.className = 'media_dyn';
        mediaEle.style.width = `${this.getMediaRegularWidth(media)}px`;
      }
    } else if (iconSize === 'small') {
      img.src = media.thumbnail.small;
      if (media.motion_photo) {
        this.setupMotionPhotoHover(img, media.thumbnail.small, media.motion_photo.small_gif);
      }
      mediaEle.className = 'media_small';
    } else if (iconSize === 'medium') {
      img.src = media.thumbnail.medium;
      if (media.motion_photo) {
        this.setupMotionPhotoHover(img, media.thumbnail.medium, media.motion_photo.medium_gif);
      }
      mediaEle.className = 'media_medium';
    } else if (SearchUI.LARGE_ICON_SIZES.includes(iconSize) || !media.thumbnail.reg) {
      img.src = media.thumbnail.large;
      if (media.motion_photo) {
        this.setupMotionPhotoHover(img, media.thumbnail.large, media.motion_photo.large_gif);
      }
      if (this.showLargeIconWithNoDescr(iconSize, media.type)) {
        mediaEle.className = 'media_no_descr';
      } else {
        mediaEle.className = 'media';
      }
    } else {
      img.src = media.thumbnail.reg;
      img.style.width = '100%';
      if (media.motion_photo) {
        this.setupMotionPhotoHover(img, media.thumbnail.reg, media.motion_photo.reg_gif);
      }
      mediaEle.className = 'media_dyn';
      mediaEle.style.width = `${this.getMediaRegularWidth(media)}px`;
    }

    if ((SearchUI.FULL_METADATA_SIZES.includes(iconSize) ||
         SearchUI.TAG_METADATA_SIZES.includes(iconSize) ||
         SearchUI.BRIEF_METADATA_SIZES.includes(iconSize)) &&
        !this.showLargeIconWithNoDescr(iconSize, media.type)) {
      if (media.title) {
        const name = `title${media.type}${media.id}`;
        const title = document.createElement('span');
        title.className = 'media_title';
        if (media.title_prefix) {
          title.appendChild(this.getExpandableString(name, media.title_prefix + media.title, 'block'));
        } else {
          title.appendChild(this.getExpandableString(name, media.title, 'block'));
        }
        mediaEle.appendChild(title);
      }

      if (media.comment) {
        const name = `comment${media.type}${media.id}`;
        const comment = document.createElement('span');
        comment.className = 'media_comment';
        comment.appendChild(this.getExpandableString(name, media.comment, 'block'));
        mediaEle.appendChild(comment);
      }

      const metadata = this.createMediaStatsHtml(media, false, null, false, iconSize);
      metadata.className = 'media_metadata';
      mediaEle.appendChild(metadata);
    }

    return mediaEle;
  }

  loadMoreMedia() {
    return window.innerHeight + window.scrollY >= document.body.offsetHeight * 0.85;
  }

  doShowMedia(pageNumber) {
    let pageSize;
    if (this.state.preferredPageIconSize.includes('small')) {
      pageSize = 48;
    } else if (this.state.preferredPageIconSize.includes('medium')) {
      pageSize = 36;
    } else {
      pageSize = 12;
    }

    const lastPageNumber = Math.ceil(this.state.allMedia.length / pageSize);
    if (pageNumber > lastPageNumber) {
      return;
    }

    const allMediaEle = document.querySelector('#all_media');
    if (this.state.mediaWriter.currentGroupEle == null) {
      this.state.mediaWriter.currentGroupEle = allMediaEle;
    }

    const startIdx = (pageNumber - 1) * pageSize;

    for (const [index, media] of this.state.allMedia.slice(startIdx, startIdx + pageSize).entries()) {
      if (media.groupName !== this.state.currentGroupName) {
        this.state.currentGroupName = media.groupName;
        this.state.mediaWriter.flush();

        this.state.mediaWriter.currentGroupEle = document.createElement('div');
        this.state.mediaWriter.currentGroupEle.className = 'media_group';

        const titleEle = document.createElement('div');
        titleEle.className = 'media_group_title';
        titleEle.innerText = media.groupName;
        this.state.mediaWriter.currentGroupEle.appendChild(titleEle);

        allMediaEle.appendChild(this.state.mediaWriter.currentGroupEle);
      }

      /*
       * When showing mixed icon sizes, the event icon will show up at the end with larger text.
       * Add a flush to be sure it always shows up at the end as expected.
       */
      if (this.addExtraFlush(media)) {
        this.state.mediaWriter.flush();
      }

      const mediaIconSize = this.getMediaIconSize(media);
      this.state.mediaWriter.add(this.createMediaElement(startIdx + index, media, mediaIconSize), mediaIconSize);
    }

    this.state.currentPageNumber = pageNumber;
    if (pageNumber === lastPageNumber) {
      this.state.mediaWriter.flush();
    }

    // Ensure that the viewport is filled with media for higher screen resolutions.
    if (this.loadMoreMedia()) {
      this.doShowMedia(this.state.currentPageNumber + 1);
    }
  }

  clearPreviousMedia(allMediaEle) {
    this.state.mediaWriter.clear();
    allMediaEle.replaceChildren();
    window.scrollTo(0, 0);
  }

  createAllStatsSpan(stats) {
    const ret = document.createElement('span');
    stats.forEach((statText, i) => {
      if (i > 0) {
        ret.appendChild(document.createTextNode(' '));
      }

      const span = document.createElement('span');
      span.className = 'stat';
      span.innerText = statText;
      ret.appendChild(span);
    });
    return ret;
  }

  createAllStatsHtml() {
    const totalsByTypes = {};
    let artifactSize = 0;
    let groupSize = 0;

    for (const media of this.state.allMedia) {
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

      if (media.artifact_filesize) {
        artifactSize += media.artifact_filesize;
      } else if (media.filesize && type !== 'tags') {
        groupSize += media.filesize;
      }
    }

    const stats = [];
    if ('photo' in totalsByTypes) {
      stats.push(this.getNumberString(totalsByTypes.photo, 'photo', 'photos'));
    }
    if ('video' in totalsByTypes) {
      stats.push(this.getNumberString(totalsByTypes.video, 'video', 'videos'));
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
      stats.push(this.getPrettyFileSize(artifactSize));
    } else if (groupSize > 0) {
      stats.push(this.getPrettyFileSize(groupSize));
    }

    if (this.state.dateRange) {
      stats.push(this.state.dateRange);
    }

    return this.createAllStatsSpan(stats);
  }

  showMedia() {
    const allMediaEle = document.querySelector('#all_media');

    this.clearPreviousMedia(allMediaEle);
    if (this.state.allMedia == null) {
      return;
    }

    document.querySelector('#search_controls').style.display = 'block';
    document.querySelector('#search_criterias').style.display = 'block';

    if (this.state.allMedia.length === 0) {
      updateOverallStatusMessage('No results found');
      this.hideResultsInfo();
      return;
    }

    window.setTimeout(() => {
      // In case an event was in flight before the JSON was processed
      this.clearPreviousMedia(allMediaEle);

      this.doShowMedia(1);

      for (const ele of document.querySelectorAll('.header_links')) {
        ele.style.display = 'block';
      }

      document.querySelector('#csv_link').onclick = (event) => {
        this.csvWriter.downloadCsv(event);
        return this.stopEvent(event);
      };

      document.querySelector('#map_link').onclick = (event) => {
        const mapUrl = `map.html${window.location.search}`;
        window.location.href = mapUrl;
        return this.stopEvent(event);
      };

      document.querySelector('.summary_stats').replaceChildren(this.createAllStatsHtml());
    }, 0);
  }

  doPerformSearch() {
    this.searchEngine.processJson((newAllMedia, extraHeader, newDateRange, preferredView) =>
      this.populateMedia(newAllMedia, extraHeader, newDateRange, preferredView));
  }

  populateMedia(newAllMedia, extraHeader, newDateRange, preferredView) {
    this.state.allMedia = newAllMedia;
    this.state.dateRange = newDateRange;
    this.state.currentYearView = preferredView.currentYearView;

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

    this.setPageTitleAndIconSize(preferredView);
    this.showMedia();
    this.populateSearchValuesFromUrl();
  }

  updateAnimationsText() {
    document.querySelector('#animations_link').innerText =
      this.state.alwaysShowAnimations ? 'Stop Animations' : 'Show Animations';
  }

  toggleAnimations() {
    this.state.alwaysShowAnimations = !this.state.alwaysShowAnimations;
    this.updateAnimationsText();
    this.showMedia();
  }

  windowScrolled() {
    if (this.loadMoreMedia()) {
      this.doShowMedia(this.state.currentPageNumber + 1);
    }
  }

  windowSizeChanged() {
    const prevPageIconSize = this.state.preferredPageIconSize;
    this.state.preferredPageIconSize = this.getPageIconSize();
    if (prevPageIconSize !== this.state.preferredPageIconSize) {
      this.setIconWriter();
      this.showMedia();
    }
    if (!this.isImageFullscreen) {
      document.querySelector('#slideshow_videos').value = this.getDefaultVideoSize();
    }
  }

  setupClickHandler(selector, handler) {
    document.querySelector(selector).onclick = (event) => {
      handler(event);
      return this.stopEvent(event);
    };
  }

  setupChangeHandler(selector, handler) {
    document.querySelector(selector).onchange = (event) => {
      handler(event);
      return this.stopEvent(event);
    };
  }

  initFullscreenControls() {
    document.querySelector('#fullimage').onclick = () => this.toggleFullscreenDescription();

    const keyHandlers = {
      'ArrowLeft': () => this.showPreviousImageFullscreen(),
      'ArrowRight': () => this.showNextImageFullscreen(true),
      'Escape': (event) => this.exitImageFullscreen(event),
      ' ': () => this.toggleFullscreenDescription(),
    };

    document.onkeydown = (event) => {
      keyHandlers[event.key]?.(event);
    };

    const fullImageEle = document.querySelector('#fullimage_container');
    this.setupSwipeDetection(fullImageEle);

    this.setupClickHandler('#metadata', () => this.toggleFullscreenDescription());
    document.querySelector('#slideshow_videos').onchange = (event) => {
      const videoSize = event.target.value;
      document.cookie = `video_size=${videoSize}`;

      this.doShowFullscreenImage(false);
      document.querySelector('#fullvideo').focus();
      return this.stopEvent(event);
    };
    this.setupClickHandler('#play', () => this.playIconClicked());
    this.setupClickHandler('#fullscreen', () => this.fullscreenClicked());
    this.setupClickHandler('#close', () => this.exitImageFullscreen());
  }

  init() {
    this.updateAnimationsText();

    window.onload = () => {
      this.doPerformSearch();
      this.checkForPhotoFrameMode();
    };

    window.onpopstate = () => this.doPerformSearch();
    window.onscroll = () => this.windowScrolled();
    window.onresize = () => this.windowSizeChanged();

    this.initFullscreenControls();

    this.setupClickHandler('#today_link', (event) => {
      const criteria = [
        ['Date', 'was taken on month/day', this.searchEngine.getCurrentMonthDay()],
        ['Type', 'is a', SearchUI.MEDIA_TYPE_STRINGS.MEDIA]];
      this.searchPageLinkGenerator(event, criteria, 'all', 'large_regular');
    });
    this.setupClickHandler('#nearby_link', () => this.nearbyClicked());
    this.setupClickHandler('#animations_link', () => this.toggleAnimations());
    this.setupClickHandler('#slideshow_link', () => this.slideshowClicked());
    this.setupClickHandler('#date_link', (event) => this.searchPageLinkGenerator(event, []));
    this.setupClickHandler('#event_link', (event) =>
      this.searchPageLinkGenerator(event, [['Type', 'is a', SearchUI.MEDIA_TYPE_STRINGS.EVENTS]]));
    this.setupClickHandler('#year_link', (event) =>
      this.searchPageLinkGenerator(event, [['Type', 'is a', SearchUI.MEDIA_TYPE_STRINGS.YEARS]]));
    this.setupClickHandler('#tag_link', (event) =>
      this.searchPageLinkGenerator(event,
        [['Type', 'is a', SearchUI.MEDIA_TYPE_STRINGS.TAGS], ['Tag Parent ID', 'is not set']]));
    this.setupClickHandler('#add_search_row', () => this.addSearchInputRow());
    this.setupClickHandler('#clear_search_criteria', () => this.clearSearchCriteria());
    this.setupChangeHandler('#match', () => this.updateSearchCriteria());
    this.setupChangeHandler('#group', () => this.updateSearchCriteria());
    this.setupChangeHandler('#sort', () => this.updateSearchCriteria());
    this.setupChangeHandler('#icons', () => this.updateSearchCriteria());
  }
}

class MapUI {
  constructor(state, searchEngine, searchUI) {
    this.state = state;
    this.searchEngine = searchEngine;
    this.searchUI = searchUI;
  }

  populateMapWithMedia(filteredMedia) {
    const features = [];
    for (const [index, media] of filteredMedia.entries()) {
      if (!media.lat || !media.lon) {
        continue;
      }

      media['reg_thumbnail'] = media.thumbnail?.reg;
      media['smallest_video'] = media.type === 'video' ?
        (media.variants?.['480p'] || media.link) : null;
      media['mediaIndex'] = index;

      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [media.lon, media.lat]
        },
        properties: media,
      });
    }

    return features;
  }

  initMap(mapInstance, markers, popupWidth, autoPanPadding) {
    this.searchEngine.processJson((filteredMedia, _extraHeader, _newDateRange, preferredView) => {
      if (preferredView && preferredView.title) {
        document.title = preferredView.title + ' - Map';
      }

      this.state.allMedia = filteredMedia;

      const features = this.populateMapWithMedia(filteredMedia);

      const geojson = {
        type: 'FeatureCollection',
        features: features
      };

      const geoJsonLayer = L.geoJSON(geojson, {
        pointToLayer: (feature, latlng) => {
          return L.marker(latlng);
        },
        onEachFeature: (feature, layer) => {
          const props = feature.properties || {};

          const popupContainer = document.createElement('div');
          popupContainer.className = 'popup-container';
          popupContainer.setAttribute('data-media-index', props.mediaIndex);

          const loadingText = document.createElement('div');
          loadingText.className = 'popup-loading';
          loadingText.textContent = 'Loading...';
          popupContainer.appendChild(loadingText);

          if (props.type === 'video') {
            const video = document.createElement('video');
            video.setAttribute('data-src', props.smallest_video);
            video.className = 'popup-image';
            video.loop = true;
            video.controls = true;
            video.style.display = 'none';
            popupContainer.appendChild(video);
          } else {
            const img = document.createElement('img');
            img.setAttribute('data-src', props.reg_thumbnail);
            img.className = 'popup-image';
            img.style.display = 'none';

            if (props.motion_photo) {
              img.setAttribute('data-motion-photo', props.motion_photo.reg_gif);
            }

            popupContainer.appendChild(img);
          }

          const metadata = this.searchUI.createMediaStatsHtml(props, false, null, true);
          metadata.className = 'popup-metadata';
          popupContainer.appendChild(metadata);

          layer.bindPopup(popupContainer, {
            minWidth: popupWidth,
            maxWidth: popupWidth,
            autoPan: true,
            autoPanPadding: autoPanPadding
          });
        }
      });

      markers.addLayer(geoJsonLayer);
      mapInstance.addLayer(markers);

      // Lazy load media when popup opens
      mapInstance.on('popupopen', (e) => {
        const popup = e.popup;
        const content = popup.getContent();

        if (content && content.querySelector) {
          const loadingText = content.querySelector('.popup-loading');
          const video = content.querySelector('video[data-src]');
          const img = content.querySelector('img[data-src]');
          const mediaIndex = parseInt(content.getAttribute('data-media-index'));

          if (video) {
            video.src = video.getAttribute('data-src');
            video.removeAttribute('data-src');
            video.addEventListener('loadeddata', () => {
              if (loadingText) {
                loadingText.style.display = 'none';
              }
              video.style.display = 'block';
            }, { once: true });
            video.load();
            video.play().catch(() => {
              // Autoplay might be blocked, user can click play button
            });
          }

          if (img) {
            const imgSrc = img.getAttribute('data-src');
            const motionPhotoSrc = img.getAttribute('data-motion-photo');

            img.onload = () => {
              if (loadingText) {
                loadingText.style.display = 'none';
              }
              img.style.display = 'block';
            };

            img.src = imgSrc;
            img.removeAttribute('data-src');

            if (motionPhotoSrc) {
              this.searchUI.setupMotionPhotoHover(img, imgSrc, motionPhotoSrc);
              img.removeAttribute('data-motion-photo');
            }

            img.style.cursor = 'pointer';
            img.onclick = () => {
              this.searchUI.enterSlideshowMode(mediaIndex);
            };
          }
        }
      });

      const lat = getFloatQueryParameter('lat', null);
      const lon = getFloatQueryParameter('lon', null);
      if (lat !== null && lon !== null) {
        mapInstance.setView([lat, lon], 13);
      } else if (markers.getLayers().length > 0) {
        mapInstance.fitBounds(markers.getBounds(), { padding: [20, 20] });
      }

      document.getElementById('loading').style.display = 'none';

      const zoomExtentsBtn = document.getElementById('zoom-extents');
      if (zoomExtentsBtn && markers.getLayers().length > 0) {
        zoomExtentsBtn.style.display = 'block';
        zoomExtentsBtn.onclick = () => {
          mapInstance.fitBounds(markers.getBounds(), { padding: [20, 20] });
        };
      }

      const myLocationBtn = document.getElementById('my-location');
      if (myLocationBtn) {
        myLocationBtn.style.display = 'block';
        myLocationBtn.onclick = () => {
          if ('geolocation' in navigator) {
            myLocationBtn.disabled = true;
            myLocationBtn.style.opacity = '0.5';
            navigator.geolocation.getCurrentPosition(
              (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                mapInstance.setView([lat, lng], 16);
                myLocationBtn.disabled = false;
                myLocationBtn.style.opacity = '1';
              },
              (error) => {
                alert('Error getting location: ' + error.message);
                myLocationBtn.disabled = false;
                myLocationBtn.style.opacity = '1';
              },
              {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
              }
            );
          } else {
            alert('Geolocation is not supported by your browser');
          }
        };
      }

      const zoomLastBtn = document.getElementById('zoom-last');
      if (zoomLastBtn) {
        const MAX_HISTORY = 50;
        let viewHistory = [];
        let currentViewIndex = -1;
        let isRestoringView = false;

        mapInstance.on('zoomend moveend', () => {
          if (!isRestoringView) {
            const currentCenter = mapInstance.getCenter();
            const currentZoom = mapInstance.getZoom();
            const newView = {
              center: currentCenter,
              zoom: currentZoom
            };

            // Check if this is a different view from the current one in history
            if (currentViewIndex >= 0 && currentViewIndex < viewHistory.length) {
              const currentHistoryView = viewHistory[currentViewIndex];
              if (currentHistoryView.zoom === currentZoom &&
                  currentHistoryView.center.lat === currentCenter.lat &&
                  currentHistoryView.center.lng === currentCenter.lng) {
                return;
              }
            }

            // If we're not at the end of history, truncate everything after current position
            if (currentViewIndex < viewHistory.length - 1) {
              viewHistory = viewHistory.slice(0, currentViewIndex + 1);
            }

            // Add the new view to history
            viewHistory.push(newView);

            // Cap the history at MAX_HISTORY entries
            if (viewHistory.length > MAX_HISTORY) {
              viewHistory.shift();
            } else {
              currentViewIndex++;
            }

            // Enable/disable button based on history
            zoomLastBtn.disabled = currentViewIndex <= 0;
          }
          isRestoringView = false;
        });

        zoomLastBtn.style.display = 'block';
        zoomLastBtn.disabled = true;
        zoomLastBtn.onclick = () => {
          if (currentViewIndex > 0) {
            currentViewIndex--;
            const previousView = viewHistory[currentViewIndex];
            isRestoringView = true;
            mapInstance.setView([previousView.center.lat, previousView.center.lng], previousView.zoom);
            zoomLastBtn.disabled = currentViewIndex <= 0;
          }
        };
      }

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          mapInstance.closePopup();
        }
      });
    });
  }
}

function doSearchInit() {
  const _state = new SearchState();
  const _searchEngine = new SearchEngine(_state);
  const _csvWriter = new CsvWriter(_state);
  const _mediaSearchUI = new SearchUI(_state, _searchEngine, _csvWriter);
  _mediaSearchUI.init();
}

function doMapInit() {
  const POPUP_WIDTH = 350;
  const AUTOPAN_PADDING = [30, 30];

  try {
    const map = L.map('map').setView([0, 0], 2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    const markers = L.markerClusterGroup();

    const state = new SearchState();
    const searchEngine = new SearchEngine(state);
    const csvWriter = new CsvWriter(state);
    const searchUI = new SearchUI(state, searchEngine, csvWriter);
    searchUI.initFullscreenControls();
    const mapUI = new MapUI(state, searchEngine, searchUI);

    mapUI.initMap(map, markers, POPUP_WIDTH, AUTOPAN_PADDING);
  } catch (error) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('error').style.display = 'block';
    document.getElementById('error-message').textContent =
      error.message || 'An error occurred while loading the map';
  }
}
