#!/usr/bin/env bash
#
# Usage: set-gps.sh <latitude> <longitude> <image-file>
# Example: set-gps.sh 37.7749 -122.4194 photo.jpg

if [ "$#" -ne 3 ]; then
    echo "Usage: $0 <latitude> <longitude> <image-file>"
    exit 1
fi

LAT_DEC="$1"
LON_DEC="$2"
FILE="$3"

if [ ! -f "$FILE" ]; then
    echo "Error: file '$FILE' not found"
    exit 1
fi

# Check if GPSLatitude is already set
FOUND=$(exiv2 -g Exif.GPSInfo.GPSLatitude "$FILE" 2>/dev/null | grep -w "Exif.GPSInfo.GPSLatitude" | grep -v "0 deg 0' 0\"" | wc -l)
if [ "${FOUND}" != "0" ] ; then
    echo "GPS data already present in '$FILE'; nothing to do."
    exit 0
fi

# Helper: convert decimal degrees to "deg/1 min/1 sec*10000/10000"
dec_to_dms() {
    local dec="$1"
    local abs
    abs=$(awk -v v="$dec" 'BEGIN{if(v<0)v=-v; printf "%.8f", v}')
    local deg min sec
    deg=$(awk -v v="$abs" 'BEGIN{d=int(v); print d}')
    min=$(awk -v v="$abs" 'BEGIN{d=int(v); m=(v-d)*60; print int(m)}')
    sec=$(awk -v v="$abs" 'BEGIN{
        d=int(v);
        m=(v-d)*60;
        s=(m-int(m))*60;
        printf "%.4f", s
    }')
    # seconds as rational with 4 decimal precision
    local sec_num
    sec_num=$(awk -v s="$sec" 'BEGIN{printf "%d", s*10000+0.5}')
    echo "${deg}/1 ${min}/1 ${sec_num}/10000"
}

LAT_REF="N"
LON_REF="E"
awk -v v="$LAT_DEC" 'BEGIN{if(v<0) print "S"; else print "N"}' >/tmp/.latref
LAT_REF=$(cat /tmp/.latref)
awk -v v="$LON_DEC" 'BEGIN{if(v<0) print "W"; else print "E"}' >/tmp/.lonref
LON_REF=$(cat /tmp/.lonref)
rm -f /tmp/.latref /tmp/.lonref

LAT_DMS=$(dec_to_dms "$LAT_DEC")
LON_DMS=$(dec_to_dms "$LON_DEC")

echo "Setting GPS data on '$FILE'"
echo "  Latitude : $LAT_DEC ($LAT_DMS $LAT_REF)"
echo "  Longitude: $LON_DEC ($LON_DMS $LON_REF)"

set -x

# Write GPS tags
exiv2 -M"set Exif.GPSInfo.GPSLatitudeRef Ascii $LAT_REF" \
      -M"set Exif.GPSInfo.GPSLatitude Rational $LAT_DMS" \
      -M"set Exif.GPSInfo.GPSLongitudeRef Ascii $LON_REF" \
      -M"set Exif.GPSInfo.GPSLongitude Rational $LON_DMS" \
      "$FILE"
