#!/usr/bin/env bash

LAT=$1
LON=$2
BASEDIR=$3

if [ "${LAT}" = "" ] || [ "${LON}" = "" ] ; then
	echo "usage: $0 <lan> <lon> <base directory>"
	exit 1
fi

set -x

cat media.csv | grep -v ^media_id | grep -v ^$ | awk "-F(transformed|original)/" '{print $2}' | awk -F, '{print $1}' | while read FILE ; do
	./stage2-gps-set.sh "${LAT}" "${LON}" "${BASEDIR}/${FILE}"
done

rm media.csv
