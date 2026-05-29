#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2024 Brian Masney <masneyb@onstation.org>

if [ -d /sys/class/backlight/rpi_backlight ] ; then
	DISABLED=$(cat /sys/class/backlight/rpi_backlight/bl_power)
elif wlopm 2>/dev/null | grep -q ' off' ; then
	DISABLED=1
else
	DISABLED=0
fi

if [ "${DISABLED}" = "1" ] ; then
	/usr/local/bin/start-photos.sh
else
	/usr/local/bin/stop-photos.sh
fi
