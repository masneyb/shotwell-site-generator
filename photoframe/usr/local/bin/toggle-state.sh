#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2024 Brian Masney <masneyb@onstation.org>

if [ -d /sys/class/backlight/rpi_backlight ] ; then
	DISABLED=$(cat /sys/class/backlight/rpi_backlight/bl_power)
else
	DISABLED=$(xset q | grep "Monitor is Off" | wc -l)
fi

if [ "${DISABLED}" = "1" ] ; then
	/usr/local/bin/start-photos.sh
else
	/usr/local/bin/stop-photos.sh
fi
