#!/usr/bin/env bash

get_start_filename()
{
	if [ -f /media/pi/PHOTOS/photos/photoframe.html ] ; then
		echo "/media/pi/PHOTOS/photos/photoframe.html"
	elif [ -f /media/pi/PHOTOS1/photos/photoframe.html ] ; then
		echo "/media/pi/PHOTOS1/photos/photoframe.html"
	elif [ -f /media/pi/PHOTOS2/photos/photoframe.html ] ; then
		echo "/media/pi/PHOTOS2/photos/photoframe.html"
	else
		echo ""
	fi
}

set -e

killall chromium-browser || true

xset -dpms s off s noblank s 0 0 s noexpose

unclutter -idle 0 &

xset dpms force on

# This doesn't work on one my screens, and only the 'xset dpms' command
# above is enough. I had to comment this xrandr command out on the one
# pi where this was an issue.
xrandr --output HDMI-1 --auto || true

START_FILENAME=$(get_start_filename)
if [ "${START_FILENAME}" = "" ] ; then
	# If the thumbdrive is not unmounted cleanly, then these mount points
	# stick around. Remove them so that they can be used again.
	rmdir /media/pi/PHOTOS /media/pi/PHOTOS1 /media/pi/PHOTOS2 || true

	# If the thumbdrive is not inserted into the device, then display a page
	# prompting to insert the drive. Check in the background for the drive,
	# and kill the browser once the drive is available.
	/usr/bin/chromium-browser --kiosk file:///var/lib/photoframe/index.html &

	while [ "${START_FILENAME}" = "" ] ; do
		sleep 2
		START_FILENAME=$(get_start_filename)
	done

	killall chromium-browser || true
	sleep 0.5
fi

/usr/bin/chromium-browser --kiosk "file://${START_FILENAME}"
