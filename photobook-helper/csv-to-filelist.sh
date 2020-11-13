#!/usr/bin/env bash

EXTRA_HEADER_IMAGE=$1
FILE_PREFIX=${2:-/home/masneyb/data/photos-html}

if [ "${EXTRA_HEADER_IMAGE}" != "" ] ; then
	echo "${EXTRA_HEADER_IMAGE}"
fi

awk -F, '{print $3}' | sed s/\"//g | grep -v \.mp4$ | grep -v \.html$ | \
		grep -v ^Path$ | tac | while IFS= read -r LINE ; do
	echo "${FILE_PREFIX}/${LINE}"
done
