#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2024 Brian Masney <masneyb@onstation.org>

# There's a bug on the Pixel camera app where the orientation of the photo
# doesn't match the MP4 for the motion photo. The orientation field in the
# EXIF doesn't match either. Identify which photos in a library have this
# issue.

set -e

HTML_BASE_DIR=$1
if [ "${HTML_BASE_DIR}" = "" ] ; then
	echo "usage: $0 <html base directory>"
	exit 1
fi

find "${HTML_BASE_DIR}/motion_photo/regular/" -name "thumb*.gif" | while read -r GIF_FILE ; do
	GIF_RESOLUTION=$(identify "${GIF_FILE}" | head -n 1 | awk '{print $3}')
	GIF_X=$(echo "${GIF_RESOLUTION}" | awk -Fx '{print $1}')
	GIF_Y=$(echo "${GIF_RESOLUTION}" | awk -Fx '{print $2}')

	JPG_FILE=$(echo "${GIF_FILE}" | sed s/motion_photo/media/ | sed s/gif/jpg/)
	JPG_RESOLUTION=$(identify "${JPG_FILE}" | awk '{print $3}')
	JPG_X=$(echo "${JPG_RESOLUTION}" | awk -Fx '{print $1}')
	JPG_Y=$(echo "${JPG_RESOLUTION}" | awk -Fx '{print $2}')

	DIFF_X=$((GIF_X - JPG_X))
	if [ ${DIFF_X} -lt 0 ] ; then
		DIFF_X=$((DIFF_X * -1))
	fi

	DIFF_Y=$((GIF_Y - JPG_Y))
	if [ ${DIFF_Y} -lt 0 ] ; then
		DIFF_Y=$((DIFF_Y * -1))
	fi

	if [ ${DIFF_X} -eq 0 ] && [ ${DIFF_Y} -eq 0 ] ; then
		echo "OK: ${GIF_FILE}=${GIF_RESOLUTION}, ${JPG_FILE}=${JPG_RESOLUTION}"
	else
		echo "ERROR: ${GIF_FILE}=${GIF_RESOLUTION}, ${JPG_FILE}=${JPG_RESOLUTION}"
	fi
done
