#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2024 Brian Masney <masneyb@onstation.org>

USER=$(whoami)
MEDIA_DIR="/media/${USER}"

get_start_filename()
{
	FILE="photoframe.html"
	if [ -f "${MEDIA_DIR}/PHOTOS/photos/${FILE}" ] ; then
		echo "${MEDIA_DIR}/PHOTOS/photos/${FILE}"
	elif [ -f "${MEDIA_DIR}/PHOTOS1/photos/${FILE}" ] ; then
		echo "${MEDIA_DIR}/PHOTOS1/photos/${FILE}"
	elif [ -f "${MEDIA_DIR}/PHOTOS2/photos/${FILE}" ] ; then
		echo "${MEDIA_DIR}/PHOTOS2/photos/${FILE}"
	else
		echo ""
	fi
}

set -e

killall chromium || true

# Power all outputs on. wlopm talks to the running labwc compositor over
# $WAYLAND_DISPLAY in $XDG_RUNTIME_DIR.
wlopm --on '*' || true

CHROMIUM_FLAGS=(
	--kiosk
	--ozone-platform=wayland
	--enable-features=UseOzonePlatform
)

START_FILENAME=$(get_start_filename)
if [ "${START_FILENAME}" = "" ] ; then
	# If the thumbdrive is not unmounted cleanly, then these mount points
	# stick around. Remove them so that they can be used again.
	rmdir ${MEDIA_DIR}/PHOTOS ${MEDIA_DIR}/PHOTOS1 ${MEDIA_DIR}/PHOTOS2 || true

	# If the thumbdrive is not inserted into the device, then display a page
	# prompting to insert the drive. Check in the background for the drive,
	# and kill the browser once the drive is available.
	/usr/bin/chromium "${CHROMIUM_FLAGS[@]}" file:///var/lib/photoframe/index.html &

	while [ "${START_FILENAME}" = "" ] ; do
		sleep 2
		START_FILENAME=$(get_start_filename)
	done

	killall chromium || true
	sleep 0.5
fi

/usr/bin/chromium "${CHROMIUM_FLAGS[@]}" "file://${START_FILENAME}" &
sleep 4
# Move the mouse cursor so that the pointer disappears when the browser starts in kiosk mode.
wlrctl pointer move 640 400
