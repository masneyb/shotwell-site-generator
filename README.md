# shotwell-site-generator

[Shotwell](https://wiki.gnome.org/Apps/Shotwell) is a fantastic program for organizing photos
and videos. It supports publishing media to third-party sites, however that requires
organizing the media again there, which is time consuming. Once the media is published, any
metadata changes that are made in Shotwell will not be shown on that third-party site.

This program exports a mobile-friendly HTML site of a Shotwell library. The generated site is
fully self contained and does not require Internet access or any third-party resources for the
long-term preservation of the library. With the exception of the search page, the use of
Javascript on the generated site is minimized for the long-term preservation of the library.

The search page provides a rich, single-page user experience that allows browsing your
library through various predefined views: all media over time, all events over time, year
view, nested tag view. Additionally you can search your library 24 different fields.

The search page also allows you setting up a browser in kiosk mode
on a small single board computer like a Raspberry Pi and use it as a photo frame as described
on the [PHOTOFRAME.md](PHOTOFRAME.md) page.

## Usage

Ensure that you have the proper dependencies installed on your system:

    # Red Hat-based systems
    sudo dnf install -y exiv2 exiv2-devel ffmpeg ImageMagick boost-python3 python3 \
                        python3-dateutil python3-humanize python3-pip
    pip3 install py3exiv2

    # Debian-based systems
    sudo apt-get install -y exiv2 ffmpeg imagemagick libboost-python-dev libexiv2-dev python3 \
                            python3-dateutil python3-humanize python3-pip python3-pkg-resources
    pip3 install py3exiv2
    
Backup your Shotwell database/library and then generate a static HTML site:

    shotwell_site_generator.py \
                --input-database /path/to/shotwell/sqlite/database \
                --input-media-path /path/to/shotwell/full-sized/images \
                --input-thumbs-directory /path/to/shotwell/thumbs360/directory \
                --dest-directory /path/to/generated/html/site \
                --src-assets-directory /path/to/this/repo \
                --title "My Photos"

Open the top level index.html file in your browser to view your library.
