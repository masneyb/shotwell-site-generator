#!/usr/bin/env bash

set -e

killall chromium-browser || true

xset -dpms s off s noblank s 0 0 s noexpose

if [ -d /sys/class/backlight/rpi_backlight ] ; then
	echo 0 > /sys/class/backlight/rpi_backlight/bl_power
else
	xset dpms force on
	xrandr --output HDMI-1 --auto
fi

/usr/bin/chromium-browser --kiosk "https://USER:PASS@HOSTNAME/photoframe.html" &
