/*
 * SPDX-License-Identifier: GPL-3.0
 * Copyright (C) 2020-2023 Brian Masney <masneyb@onstation.org>
 */

let preFullscreenScrollX = -1;
let preFullscreenScrollY = -1;
let allMediaFullscreenIndex = -1;
let inPhotoFrameMode = false;
let fullScreenPhotoUpdateSecs = 0;
let fullscreenPhotoUpdateTimer = null;
let fullscreenReinstateSlideshowSecs = 0;
let fullscreenReinstateSlideshowTimer = null;
let wakeLock = null;

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

function createMediaStatsHtml(entity, eventNames, tags, showTitle, showBriefMetadata, extraOnClick) {
  const stats = [];
  const extStats = [];

  if (showTitle && 'title' in entity && entity.title) {
    const title = entity.title_prefix ? entity.title_prefix + entity.title : entity.title;
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

  if (entity.megapixels) {
    const val = `${entity.megapixels}MP`;
    stats.push(createTextMediaStat(val));
    extStats.push(createTextMediaStat(val));
  }

  if (entity.filesize) {
    const val = getPrettyFileSize(entity.filesize);
    stats.push(createTextMediaStat(val));
    extStats.push(createTextMediaStat(val));
  }

  if (entity.width) {
    extStats.push(createTextMediaStat(`${entity.width}x${entity.height}`));
  }

  if (entity.clip_duration) {
    stats.push(createTextMediaStat(entity.clip_duration));
    extStats.push(createTextMediaStat(entity.clip_duration));
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
    extStats.push(createSearchLink(`GPS ${entity.lat},${entity.lon}`, 'GPS Coordinate', 'is within', `${entity.lat},${entity.lon},0.01`, extraOnClick));

    const mapAnchor = document.createElement('a');
    mapAnchor.target = '_new';
    mapAnchor.href = `https://www.openstreetmap.org/?mlat=${entity.lat}&mlon=${entity.lon}#map=16/${entity.lat}/${entity.lon}`;
    mapAnchor.innerText = 'OpenStreetMap';
    extStats.push(createMediaStat(mapAnchor));
  }

  if (entity.type === 'video' || entity.type === 'photo') {
    const downloadAnchor = document.createElement('a');
    downloadAnchor.href = '#';
    downloadAnchor.innerText = 'Download';
    downloadAnchor.onclick = (event) => {
      showDownloadPage(entity.link);
      event.preventDefault();
      event.stopPropagation();
    };
    extStats.push(createMediaStat(downloadAnchor));
  }

  if (extStats.length == stats.length) {
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
  fullscreenPhotoUpdateTimer = setInterval((e) => { showNextImageFullscreen(e, false); }, fullScreenPhotoUpdateSecs * 1000);
}

function getNextImageIndex() {
  return allMediaFullscreenIndex >= allMedia.length - 1 ? allMediaFullscreenIndex : allMediaFullscreenIndex + 1;
}

function getPreviousImageIndex() {
  return allMediaFullscreenIndex === 0 ? allMediaFullscreenIndex : allMediaFullscreenIndex - 1;
}

function getFullscreenImageUrl(index) {
  if (allMedia[index].type === 'photo' || allMedia[index].type === 'video') {
    return allMedia[index].link;
  }

  if ('reg' in allMedia[index].thumbnail) {
    return allMedia[index].thumbnail.reg;
  }

  return allMedia[index].thumbnail.large;
}

function updateMediaDescriptionText(descrEle) {
  descrEle.replaceChildren(createMediaStatsHtml(allMedia[allMediaFullscreenIndex], eventNames, tags, true, false, (event) => {
    exitImageFullscreen(event);
  }));
}

function getFullscreenVideoUrl(entity) {
  if (window.alwaysShowAnimations && 'motion_photo' in entity && 'mp4' in entity.motion_photo) {
    return entity.motion_photo.mp4;
  }
  if (entity.type === 'video') {
    return entity.link;
  }
  return null;
}

function getDownloadFullUrl(path) {
  let location = window.location.toString();
  if (location.includes('#')) {
    location = location.split('#')[0];
  }
  if (location.includes('?')) {
    location = location.split('?')[0];
  }
  if (location.includes('/index.html')) {
    location = location.split('/index.html')[0];
  }
  if (!location.endsWith('/')) {
    location += '/';
  }
  return location + path;
}

function showDownloadPage(path) {
  setFullImageDisplay(true);

  const imageEle = document.querySelector('#fullmedia_container');
  imageEle.style.display = 'none';

  const downloadEle = document.querySelector('#download_container');
  downloadEle.style.display = 'block';

  const downloadUrl = getDownloadFullUrl(path);

  const downloadAnchor = document.querySelector('#download_anchor');
  downloadAnchor.href = downloadUrl;

  const qrcodeEle = document.getElementById('qrcode');
  removeAllChildren(qrcodeEle);
  new QRious({ element: qrcodeEle, value: downloadUrl, size: 300 });
}

function doCloseDownloadPage() {
  const imageEle = document.querySelector('#fullmedia_container');
  imageEle.style.display = 'block';

  const downloadEle = document.querySelector('#download_container');
  downloadEle.style.display = 'none';
}

function closeDownloadPage(event) {
  doCloseDownloadPage();
  if (!inPhotoFrameMode) {
    setFullImageDisplay(false);
  }

  event.preventDefault();
  event.stopPropagation();
}

function doShowFullscreenImage(manuallyInvoked) {
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

  const dlEle = document.querySelector('#download_container');
  dlEle.style.display = 'none';

  const videoUrl = getFullscreenVideoUrl(allMedia[allMediaFullscreenIndex]);
  if (videoUrl !== null) {
    const imageEle = document.querySelector('#fullimage');
    imageEle.removeAttribute('src');
    imageEle.style.display = 'none';

    const videoEle = document.querySelector('#fullvideo');
    videoEle.src = videoUrl;
    videoEle.style.display = 'block';

    updateMediaDescriptionText(descrEle);
  } else {
    const videoEle = document.querySelector('#fullvideo');
    videoEle.pause();
    videoEle.removeAttribute('src');
    videoEle.style.display = 'none';

    const imageEle = document.querySelector('#fullimage');
    imageEle.onload = () => {
      updateMediaDescriptionText(descrEle);
    };
    imageEle.style.display = 'block';
    imageEle.src = getFullscreenImageUrl(allMediaFullscreenIndex);
  }
}

function isImageFullscreen() {
  const fullImageEle = document.querySelector('#fullimage_container');
  return fullImageEle.style.display !== 'none';
}

function showNextImageFullscreen(event, manuallyInvoked) {
  if (isImageFullscreen()) {
    allMediaFullscreenIndex = getNextImageIndex();
    doShowFullscreenImage(manuallyInvoked);
  }
}

function showPreviousImageFullscreen(event) {
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

    const qrcodeEle = document.getElementById('qrcode');
    removeAllChildren(qrcodeEle);
  }
}

const handleVisibilityChange = () => {
  if (wakeLock !== null && document.visibilityState === 'visible') {
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

function startSlideshow() {
  fullScreenPhotoUpdateSecs = getIntQueryParameter('photo_update_secs', 10);
  fullscreenReinstateSlideshowSecs = getIntQueryParameter('reinstate_slideshow_secs', 300);
  setFullImageDisplay(true);
  allMediaFullscreenIndex = 0;
  doShowFullscreenImage(false);
  toggleSlideshowTimers();
  requestWakeLock();
}

function slideshowClicked() {
  const searchParams = new URLSearchParams(window.location.search);
  searchParams.delete('photo_frame');
  searchParams.append('photo_frame', '1');
  searchParams.delete('photo_update_secs');
  searchParams.append('photo_update_secs', '10');
  window.history.pushState({}, '', `?${searchParams.toString()}#`);
  startSlideshow();
}

function checkForPhotoFrameMode() {
  if (getIntQueryParameter('photo_frame', 0) === 0) {
    return;
  }

  inPhotoFrameMode = true;
  document.body.style.cursor = 'none';
  document.querySelector('#close').style.display = 'none';
  startSlideshow();
}

function exitImageFullscreen(event) {
  if (!isImageFullscreen()) {
    return;

  }

  event.preventDefault();
  event.stopPropagation();

  doCloseDownloadPage();

  if (fullscreenPhotoUpdateTimer != null) {
    clearInterval(fullscreenPhotoUpdateTimer);
    fullscreenPhotoUpdateTimer = null;

    const searchParams = new URLSearchParams(window.location.search);
    searchParams.delete('photo_frame');
    searchParams.delete('photo_update_secs');
    window.history.pushState({}, '', `?${searchParams.toString()}#`);

    releaseWakeLock();
  }

  fullScreenPhotoUpdateSecs = 0;
  fullscreenReinstateSlideshowSecs = 0;
  document.body.style.cursor = 'auto';
  setFullImageDisplay(false);
  window.scrollTo(preFullscreenScrollX, preFullscreenScrollY);
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
}

function enterSlideshowMode(allMediaIndex) {
  preFullscreenScrollX = window.scrollX;
  preFullscreenScrollY = window.scrollY;
  allMediaFullscreenIndex = allMediaIndex;

  setFullImageDisplay(true);
  doShowFullscreenImage(false);
}
