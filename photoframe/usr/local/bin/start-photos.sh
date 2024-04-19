#!/usr/bin/env bash

set -e

killall chromium-browser || true

xset -dpms s off s noblank s 0 0 s noexpose

if [ -d /sys/class/backlight/rpi_backlight ] ; then
	echo 0 > /sys/class/backlight/rpi_backlight/bl_power
else
	xset dpms force on
	# This doesn't work on one my screens, and only the 'xset dpms' command
	# above is enough. I had to comment this xrandr command out on the one
	# pi where this was an issue.
	xrandr --output HDMI-1 --auto || true
fi

/usr/bin/chromium-browser --kiosk "https://USER:PASS@HOSTNAME/photoframe.html" &
