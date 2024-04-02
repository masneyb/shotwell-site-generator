#!/usr/bin/env bash

if [ -d /sys/class/backlight/rpi_backlight ] ; then
	DISABLED=$(cat /sys/class/backlight/rpi_backlight/bl_power)
else
	DISABLED=$(xrandr | grep "HDMI-1 connected primary (normal" | wc -l)
fi

if [ "${DISABLED}" = "1" ] ; then
	/usr/local/bin/start-photos.sh
else
	/usr/local/bin/stop-photos.sh
fi
