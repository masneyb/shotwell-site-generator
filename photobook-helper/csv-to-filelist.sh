#!/usr/bin/env bash

# Processes a media.csv file and creates a file list for photobook-helper.py.
# See README.md for more details.
#
# Copyright (C) 2020 Brian Masney <masneyb@onstation.org>
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

EXTRA_HEADER_IMAGE=$1
FILE_PREFIX=${2:-/home/masneyb/data/photos-html}

if [ "${EXTRA_HEADER_IMAGE}" != "" ] ; then
	echo "${EXTRA_HEADER_IMAGE}"
fi

awk -F\" '{print $6}' | sed s/\"//g | grep -v \.mp4$ | grep -v \.MP4$ | grep -v \.html$ | \
		grep -v ^Path$ | tac | while IFS= read -r LINE ; do
	echo "${FILE_PREFIX}/${LINE}"
done
