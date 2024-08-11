let currentPageNumber = 1;
let allMedia = null;
let eventNames = null;
let tags = null;
let mediaWriter = null;
let dateRange = null;
let currentYearView = null;
let preferredPageIconSize = null;
let currentGroupName = null;
window.alwaysShowAnimations = getIntQueryParameter('animate', 0);
window.alwaysAnimateMotionPhotos = getIntQueryParameter('animateMotionPhotos', 0);

function stopEvent(event) {
  event.preventDefault();
  event.stopPropagation();
  return false;
}

function addStatusMessage(parentEle, text) {
  const msgEle = document.createElement('div');
  msgEle.className = 'status';
  msgEle.appendChild(document.createTextNode(text));
  removeAllChildren(parentEle);
  parentEle.appendChild(msgEle);
}

function updateOverallStatusMessage(text) {
  addStatusMessage(document.querySelector('#all_media'), text);
}

function jsonLoadError() {
  updateOverallStatusMessage('Error loading media');
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

function hideResultsInfo() {
  removeAllChildren(document.querySelector('.summary_stats'));
  for (const search of ['.header_links']) {
    for (const ele of document.querySelectorAll(search)) {
      ele.style.display = 'none';
    }
  }
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
    processJson(populateMedia);
  }
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

function windowScrolled() {
  if (window.innerHeight + window.scrollY >= (document.body.offsetHeight * 0.85)) {
    doShowMedia(currentPageNumber + 1);
  }
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
    const metadata = createMediaStatsHtml(media, eventNames, tags, false, showBriefMeta, null);
    metadata.className = 'media_metadata';
    mediaEle.appendChild(metadata);
  }

  return mediaEle;
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
  windowScrolled();
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

    const summaryStatsEle = document.querySelector('.summary_stats');
    removeAllChildren(summaryStatsEle);
    summaryStatsEle.appendChild(createAllStatsHtml());
  }, 0);
}

function toggleAnimations() {
  window.alwaysShowAnimations = !window.alwaysShowAnimations;
  updateAnimationsText();
  showMedia();
}

function populateMedia(newAllMedia, newEventNames, newTags, extraHeader, newDateRange, preferredView) {
  allMedia = newAllMedia;
  eventNames = newEventNames;
  tags = newTags;
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
    removeAllChildren(extraHeaderEle);
    extraHeaderEle.appendChild(outerSpan);
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

updateAnimationsText();
window.onscroll = windowScrolled;
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
  processJson(populateMedia);
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
