/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2020-2025 Brian Masney <masneyb@onstation.org>
 */

const POPUP_WIDTH = 350;
const MAP_PADDING = [20, 20];
const AUTOPAN_PADDING = [30, 30];

function showError(message) {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('error').style.display = 'block';
  document.getElementById('error-message').textContent = message;
}

function populateMapWithMedia(filteredMedia) {
  const features = [];
  for (const media of filteredMedia) {
    if (!media.lat || !media.lon) {
      continue;
    }

    media['reg_thumbnail'] = media.thumbnail?.reg;
    media['smallest_video'] = media.type === 'video' ? (media.variants?.['480p'] || media.link) : null;

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

function initMap() {
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

    searchEngine.processJson((filteredMedia, _extraHeader, _newDateRange, preferredView) => {
      if (preferredView && preferredView.title) {
        document.title = preferredView.title + ' - Map';
      }

      const features = populateMapWithMedia(filteredMedia);

      const geojson = {
        type: 'FeatureCollection',
        features: features
      };

      const geoJsonLayer = L.geoJSON(geojson, {
        pointToLayer: function (feature, latlng) {
          return L.marker(latlng);
        },
        onEachFeature: function (feature, layer) {
          const props = feature.properties || {};

          const popupContainer = document.createElement('div');
          popupContainer.className = 'popup-container';

          if (props.type === 'video') {
            const video = document.createElement('video');
            video.src = props.smallest_video;
            video.className = 'popup-image';
            video.autoplay = true;
            video.loop = true;
            video.controls = true;
            popupContainer.appendChild(video);
          } else {
            const img = document.createElement('img');
            img.src = props.reg_thumbnail;
            img.className = 'popup-image';
            popupContainer.appendChild(img);
          }

          const metadata = searchUI.createMediaStatsHtml(props, false, false, null, true);
          metadata.className = 'popup-metadata';
          popupContainer.appendChild(metadata);

          layer.bindPopup(popupContainer, {
            minWidth: POPUP_WIDTH,
            maxWidth: POPUP_WIDTH,
            autoPan: true,
            autoPanPadding: AUTOPAN_PADDING
          });
        }
      });

      markers.addLayer(geoJsonLayer);
      map.addLayer(markers);

      const lat = getFloatQueryParameter('lat', null);
      const lon = getFloatQueryParameter('lon', null);
      if (lat !== null && lon !== null) {
        map.setView([lat, lon], 13);
      } else if (markers.getLayers().length > 0) {
        map.fitBounds(markers.getBounds(), { padding: MAP_PADDING });
      }

      document.getElementById('loading').style.display = 'none';

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          map.closePopup();
        }
      });
    });
  } catch (error) {
    showError(error.message || 'An error occurred while loading the map');
  }
}

window.addEventListener('load', initMap);
