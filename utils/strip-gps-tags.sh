#!/usr/bin/env bash
#
# Strips GPS EXIF tags from one or more JPG files.
#
# Usage: strip-gps-tags.sh <image-file> [<image-file> ...]

if [ "$#" -lt 1 ]; then
    echo "Usage: $0 <image-file> [<image-file> ...]"
    exit 1
fi

GPS_TAGS=(
    Exif.GPSInfo.GPSLatitudeRef
    Exif.GPSInfo.GPSLatitude
    Exif.GPSInfo.GPSLongitudeRef
    Exif.GPSInfo.GPSLongitude
    Exif.GPSInfo.GPSAltitudeRef
    Exif.GPSInfo.GPSAltitude
    Exif.GPSInfo.GPSTimeStamp
    Exif.GPSInfo.GPSProcessingMethod
    Exif.GPSInfo.GPSDateStamp
    Exif.Image.GPSTag
)

RET=0
for FILE in "$@" ; do
    if [ ! -f "$FILE" ]; then
        echo "Error: file '$FILE' not found"
        RET=1
        continue
    fi

    ARGS=()
    for TAG in "${GPS_TAGS[@]}" ; do
        ARGS+=(-M"del ${TAG}")
    done

    echo "Stripping GPS tags from '$FILE'"
    exiv2 "${ARGS[@]}" "$FILE" || RET=1
done

exit $RET
