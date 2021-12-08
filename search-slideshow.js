/*
 * SPDX-License-Identifier: Apache-2.0
 * Copyright (C) 2020-2021 Brian Masney <masneyb@onstation.org>
 */

let wasPreviouslyFullscreen = false;
let preFullscreenScrollX = -1;
let preFullscreenScrollY = -1;
let allMediaFullscreenIndex = -1;
let fullscreenImageLink = null;
let inPhotoFrameMode = false;
let fullScreenPhotoUpdateSecs = 0;
let fullscreenPhotoUpdateTimer = null;
let fullscreenReinstateSlideshowSecs = 0;
let fullscreenReinstateSlideshowTimer = null;

function setFullscreenDescriptionShown(shown) {
  const descrEle = document.querySelector('#description');
  document.body.style.cursor = shown ? 'auto' : 'none';
  descrEle.style.display = shown ? 'block' : 'none';
}

function doShowFullscreenImage() {
  const descrEle = document.querySelector('#description');
  descrEle.innerHTML = "<div class='loading'>Loading</div>";

  const imageEle = document.querySelector('#fullimage');
  const searchLinkGenerator = function (field, op, val) {
    return `href="#" onclick="exitImageFullscreen(); searchPageLinkGenerator(event, [['${field}', '${op}', '${val}']]);"`;
  };
  imageEle.onload = () => {
    descrEle.innerHTML = createMediaStatsHtml(allMedia[allMediaFullscreenIndex], eventNames, tags, searchLinkGenerator, true);
  };

  if (allMedia[allMediaFullscreenIndex].type === 'photo') {
    imageEle.src = allMedia[allMediaFullscreenIndex].link;
    fullscreenImageLink = null;
  } else if ('reg' in allMedia[allMediaFullscreenIndex].thumbnail) {
    imageEle.src = allMedia[allMediaFullscreenIndex].thumbnail.reg;
  } else {
    imageEle.src = allMedia[allMediaFullscreenIndex].thumbnail.sq;
  }

  // FIXME - links to events, tags, and years don't work at the moment
  if (allMedia[allMediaFullscreenIndex].type === 'video') {
    fullscreenImageLink = allMedia[allMediaFullscreenIndex].link;
  }
}

function isImageFullscreen() {
  const fullImageEle = document.querySelector('#fullimage_container');
  return fullImageEle.style.display !== 'none';
}

function showNextImageFullscreen(event) {
  if (isImageFullscreen()) {
    const fullImageEle = document.querySelector('#fullimage');
    allMediaFullscreenIndex = allMediaFullscreenIndex >= allMedia.length - 1 ? 0 : allMediaFullscreenIndex + 1;
    doShowFullscreenImage();
  }
}

function showPreviousImageFullscreen(event) {
  if (isImageFullscreen()) {
    const fullImageEle = document.querySelector('#fullimage');
    allMediaFullscreenIndex = allMediaFullscreenIndex === 0 ? allMedia.length - 1 : allMediaFullscreenIndex - 1;
    doShowFullscreenImage();
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
    fullscreenPhotoUpdateTimer = setInterval(showNextImageFullscreen, fullScreenPhotoUpdateSecs * 1000);
  } else {
    setFullscreenDescriptionShown(true);

    clearInterval(fullscreenPhotoUpdateTimer);
    fullscreenPhotoUpdateTimer = null;
    fullscreenReinstateSlideshowTimer = setInterval(toggleSlideshowTimers, fullscreenReinstateSlideshowSecs * 1000);
  }
}

function isFullscreen() {
  return document.fullscreenElement != null || document.webkitIsFullScreen || document.mozFullScreen || document.msFullscreenElement != null;
}

function doExitFullscreen() {
  if (isFullscreen()) {
    document.exitFullscreen();
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
    wasPreviouslyFullscreen = isFullscreen();
    if (!wasPreviouslyFullscreen) {
      document.documentElement.requestFullscreen();
    }

    document.body.style.overflow = 'hidden';
  } else {
    if (!wasPreviouslyFullscreen) {
      doExitFullscreen();
    }

    document.body.style.overflow = 'auto';
    const ele = document.querySelector('#fullimage');
    ele.src = '';
  }
}

function startSlideshow() {
  fullScreenPhotoUpdateSecs = getIntQueryParameter('photo_update_secs', 10);
  fullscreenReinstateSlideshowSecs = getIntQueryParameter('reinstate_slideshow_secs', 300);
  setFullImageDisplay(true);
  allMediaFullscreenIndex = 0;
  doShowFullscreenImage();
  toggleSlideshowTimers();
}

function slideshowClicked() {
  const params = window.location.search.startsWith('?') ? window.location.search : '?';
  let search = `search.html${params}`;
  if (!search.includes('photo_frame=')) {
    search += '&photo_frame=1';
  }
  if (!search.includes('photo_update_secs=')) {
    search += '&photo_update_secs=30';
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
  startSlideshow();
}

function toggleFullscreen() {
  if (document.fullscreenElement !== null) {
    doExitFullscreen();
  } else {
    document.documentElement.requestFullscreen();
  }
}

function exitImageFullscreen() {
  if (isImageFullscreen()) {
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
    } else if (fullscreenImageLink === null) {
      const descrEle = document.querySelector('#description');
      const shown = descrEle.style.display !== 'none';
      setFullscreenDescriptionShown(!shown);
    } else {
      window.open(fullscreenImageLink, '_blank');
    }
  }
}

function enterSlideshowMode(allMediaIndex) {
  preFullscreenScrollX = window.scrollX;
  preFullscreenScrollY = window.scrollY;
  allMediaFullscreenIndex = allMediaIndex;

  setFullImageDisplay(true);
  doShowFullscreenImage();
}
