/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2020-2021 Brian Masney <masneyb@onstation.org>
 */

let preFullscreenScrollX = -1;
let preFullscreenScrollY = -1;
let allMediaFullscreenIndex = -1;
let inPhotoFrameMode = false;
let fullScreenPhotoUpdateSecs = 0;
let fullscreenPhotoUpdateTimer = null;
let fullscreenReinstateSlideshowSecs = 0;
let fullscreenReinstateSlideshowTimer = null;
const cachedImages = new Set();
let numCachedImages = 0;

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
  return allMediaFullscreenIndex >= allMedia.length - 1 ? 0 : allMediaFullscreenIndex + 1;
}

function getPreviousImageIndex() {
  return allMediaFullscreenIndex === 0 ? allMedia.length - 1 : allMediaFullscreenIndex - 1;
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

function recordImageUrlAsCached(imageUrl) {
  new Image().src = imageUrl;
  if (numCachedImages > 100) {
    // Don't chew up a bunch of memory when running in photo frame mode
    cachedImages.clear();
    numCachedImages = 0;
  }
  cachedImages.add(imageUrl);
  numCachedImages += 1;
}

function prefetchImage(index) {
  const imageUrl = getFullscreenImageUrl(index);
  if (!cachedImages.has(imageUrl)) {
    recordImageUrlAsCached(imageUrl);
  }
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

  if (allMedia[allMediaFullscreenIndex].type === 'video') {
    descrEle.style.display = 'none';

    const imageEle = document.querySelector('#fullimage');
    imageEle.removeAttribute('src');
    imageEle.style.display = 'none';

    const videoEle = document.querySelector('#fullvideo');
    videoEle.src = allMedia[allMediaFullscreenIndex].link;
    videoEle.style.display = 'block';
    recordImageUrlAsCached(videoEle.src);
  } else if (allMedia[allMediaFullscreenIndex].type === 'photo') {
    const videoEle = document.querySelector('#fullvideo');
    videoEle.pause();
    videoEle.removeAttribute('src');
    videoEle.style.display = 'none';

    const imageEle = document.querySelector('#fullimage');
    imageEle.onload = () => {
      if (hideDescr) {
        descrEle.style.display = 'none';
      }
      descrEle.replaceChildren(createMediaStatsHtml(allMedia[allMediaFullscreenIndex], eventNames, tags, true, false, (event) => {
        exitImageFullscreen(event);
      }));
    };
    imageEle.style.display = 'block';
    imageEle.src = getFullscreenImageUrl(allMediaFullscreenIndex);
    recordImageUrlAsCached(imageEle.src);
  }
  // FIXME - links to events, tags, and years don't work at the moment

  // Cache the nearby images to make the page faster
  prefetchImage(getNextImageIndex());
  prefetchImage(getPreviousImageIndex());
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
  }
}

function startSlideshow() {
  fullScreenPhotoUpdateSecs = getIntQueryParameter('photo_update_secs', 10);
  fullscreenReinstateSlideshowSecs = getIntQueryParameter('reinstate_slideshow_secs', 300);
  setFullImageDisplay(true);
  allMediaFullscreenIndex = 0;
  doShowFullscreenImage(false);
  toggleSlideshowTimers();
}

function slideshowClicked() {
  const params = window.location.search.startsWith('?') ? window.location.search : '?';
  let search = `index.html${params}`;
  if (!search.includes('photo_frame=')) {
    search += '&photo_frame=1';
  }
  if (!search.includes('photo_update_secs=')) {
    search += '&photo_update_secs=10';
  }
  search += '#';
  window.history.pushState({}, '', search);

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
  if (isImageFullscreen()) {
    event.preventDefault();
    event.stopPropagation();

    fullScreenPhotoUpdateSecs = 0;
    fullscreenReinstateSlideshowSecs = 0;
    document.body.style.cursor = 'auto';
    setFullImageDisplay(false);
    window.scrollTo(preFullscreenScrollX, preFullscreenScrollY);
  }
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
