#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2024 Brian Masney <masneyb@onstation.org>

xset dpms force off

# This doesn't work on one my screens, and only the 'xset dpms' command
# above is enough. I had to comment this xrandr command out on the one
# pi where this was an issue.
xrandr --output HDMI-1 --off

killall chromium-browser
killall unclutter
