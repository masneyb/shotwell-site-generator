#!/usr/bin/env bash

set -x

if [ -d /sys/class/backlight/rpi_backlight ] ; then
	echo 1 > /sys/class/backlight/rpi_backlight/bl_power
else
	xset dpms force off
	# This doesn't work on one my screens, and only the 'xset dpms' command
	# above is enough. I had to comment this xrandr command out on the one
	# pi where this was an issue.
	xrandr --output HDMI-1 --off
fi

killall chromium-browser
