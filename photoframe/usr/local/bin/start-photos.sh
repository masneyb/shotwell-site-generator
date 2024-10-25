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

START=/media/pi/PHOTOS/photos/photoframe.html
if [ ! -f "${START}" ] ; then
	# Give time for the USB thumbdrive to be automounted on boot up
	sleep 5
fi

if [ -f "${START}" ] ; then
	/usr/bin/chromium-browser --kiosk "file://${START}"
elif [ -f /media/pi/PHOTOS1/photos/photoframe.html ] ; then
	/usr/bin/chromium-browser --kiosk file:///media/pi/PHOTOS1/photos/photoframe.html &
else
	/usr/bin/chromium-browser --kiosk file:///var/lib/photoframe/index.html &
	#/usr/bin/chromium-browser --kiosk "https://USER:PASS@HOSTNAME/photoframe.html" &
fi
