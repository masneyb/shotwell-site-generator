#!/usr/bin/env bash

set -x

if [ -d /sys/class/backlight/rpi_backlight ] ; then
	echo 1 > /sys/class/backlight/rpi_backlight/bl_power
else
	xset dpms force off
	xrandr --output HDMI-1 --off
fi

killall chromium-browser
