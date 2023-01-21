/*
 * SPDX-License-Identifier: GPL-3.0
 * Copyright (C) 2020-2022 Brian Masney <masneyb@onstation.org>
 */

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
