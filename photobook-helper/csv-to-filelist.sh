#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2020-2024 Brian Masney <masneyb@onstation.org>

# Processes a media.csv file and creates a file list for photobook-helper.py.
# See README.md for more details.

EXTRA_HEADER_IMAGE=$1
FILE_PREFIX=${2:-/home/masneyb/data/photos-html}

if [ "${EXTRA_HEADER_IMAGE}" != "" ] ; then
	echo "${EXTRA_HEADER_IMAGE}"
fi

awk -F\" '{print $6}' | sed s/\"//g | grep -v \.mp4$ | grep -v \.MP4$ | grep -v \.html$ | \
		grep -v ^Path$ | tac | while IFS= read -r LINE ; do
	echo "${FILE_PREFIX}/${LINE}"
done
