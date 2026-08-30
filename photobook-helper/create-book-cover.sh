#!/usr/bin/env bash
#
# Combines a front cover, spine, and back cover into a single book cover
# image with a black background using ImageMagick. The back cover is on
# the left, the spine in the middle, and the front cover on the right.
#
# All measurements are in inches at 300 dpi. The total cover size and
# spine width come from the book printer's cover specifications for the
# page count. The front and back cover images are kept at their original
# size and centered within each panel, so the border around the edges
# expands to fill the requested dimensions.

set -e

if [ "$#" -ne 6 ]; then
    echo "Usage: $0 <total-width-inches> <total-height-inches>" \
         "<spine-width-inches> <front-cover> <back-cover> <output>"
    echo "Example: $0 27.208 11.625 1.097 front.jpg back.jpg cover.jpg"
    exit 1
fi

TOTAL_WIDTH_IN="$1"
TOTAL_HEIGHT_IN="$2"
SPINE_WIDTH_IN="$3"
FRONT="$4"
BACK="$5"
OUTPUT="$6"

DPI=300

for FILE in "$FRONT" "$BACK" ; do
    if [ ! -f "$FILE" ]; then
        echo "Error: file '$FILE' not found"
        exit 1
    fi
done

# Convert inches to pixels, rounding to the nearest pixel.
to_px() {
    awk -v inches="$1" -v dpi="$DPI" 'BEGIN { printf "%d", inches * dpi + 0.5 }'
}

TOTAL_WIDTH_PX=$(to_px "$TOTAL_WIDTH_IN")
TOTAL_HEIGHT_PX=$(to_px "$TOTAL_HEIGHT_IN")
SPINE_WIDTH_PX=$(to_px "$SPINE_WIDTH_IN")

PANEL_WIDTH_IN=$(awk -v t="$TOTAL_WIDTH_IN" -v s="$SPINE_WIDTH_IN" \
                     'BEGIN { printf "%g", (t - s) / 2 }')
PANEL_WIDTH_PX=$(to_px "$PANEL_WIDTH_IN")

echo "Total size:  ${TOTAL_WIDTH_IN}x${TOTAL_HEIGHT_IN} inches" \
     "(${TOTAL_WIDTH_PX}x${TOTAL_HEIGHT_PX} pixels)"
echo "Panel size:  ${PANEL_WIDTH_IN}x${TOTAL_HEIGHT_IN} inches" \
     "(${PANEL_WIDTH_PX}x${TOTAL_HEIGHT_PX} pixels)"
echo "Spine width: ${SPINE_WIDTH_IN} inches (${SPINE_WIDTH_PX} pixels)"

# The panels and spine are appended together, then a final extent enforces
# the exact total size in case the per-piece pixel rounding is off by one.
magick \
    \( "$BACK" -background black -gravity center \
       -extent "${PANEL_WIDTH_PX}x${TOTAL_HEIGHT_PX}" \) \
    \( -size "${SPINE_WIDTH_PX}x${TOTAL_HEIGHT_PX}" xc:black \) \
    \( "$FRONT" -background black -gravity center \
       -extent "${PANEL_WIDTH_PX}x${TOTAL_HEIGHT_PX}" \) \
    +append -background black -gravity center \
    -extent "${TOTAL_WIDTH_PX}x${TOTAL_HEIGHT_PX}" \
    -density "$DPI" -units PixelsPerInch "$OUTPUT"

echo "Wrote '$OUTPUT'"
