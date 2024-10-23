#!/usr/bin/env bash

xset dpms force off

# This doesn't work on one my screens, and only the 'xset dpms' command
# above is enough. I had to comment this xrandr command out on the one
# pi where this was an issue.
xrandr --output HDMI-1 --off

killall chromium-browser
killall unclutter
