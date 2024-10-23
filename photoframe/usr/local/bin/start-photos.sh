#!/usr/bin/env bash

set -e

killall chromium-browser || true

xset -dpms s off s noblank s 0 0 s noexpose

unclutter -idle 0 &

xset dpms force on

# This doesn't work on one my screens, and only the 'xset dpms' command
# above is enough. I had to comment this xrandr command out on the one
# pi where this was an issue.
xrandr --output HDMI-1 --auto || true

# Prefer to pull the media from a USB thumb drive if possible
LOCAL_FILE=/media/pi/PHOTOS/photos/photoframe.html
if [ -f "${LOCAL_FILE}" ] ; then
	/usr/bin/chromium-browser --kiosk "file://${LOCAL_FILE}" &
else
	/usr/bin/chromium-browser --kiosk "https://USER:PASS@HOSTNAME/photoframe.html" &
fi
