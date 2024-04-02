#!/usr/bin/env bash

set -x

if [ -d /sys/class/backlight/rpi_backlight ] ; then
	echo 1 > /sys/class/backlight/rpi_backlight/bl_power
else
	xrandr --output HDMI-1 --off
fi

killall chromium-browser
