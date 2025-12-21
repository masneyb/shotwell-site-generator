## Take control of your media

[Shotwell](https://wiki.gnome.org/Apps/Shotwell) is a fantastic program for organizing photos
and videos. It supports publishing media to third-party sites, however that requires
organizing the media again there, which is time consuming. Once the media is published, any
metadata changes that are made in Shotwell will not be shown on that third-party site.

This program exports a mobile-friendly static HTML site of a Shotwell library. The generated
site is fully self contained and does not require Internet access or any third-party resources
for the long-term preservation of the library. The search page provides a rich, single-page
user experience that allows browsing your library through various predefined views: all media
over time, all events over time, year view, and nested tag view. Additionally you can search
your library using 24 different fields.

A second static site is generated where the use of Javascript is minimized for the long-term
preservation of the library.

You can serve these static files on a webserver such as nginx / apache2, and if desired, setup
some kind of authentication (like HTTP basic auth over HTTPS). There's no complicated additional
webserver plugins that need to be setup for a particular application runtime since you're just
serving static content.

Note that the generated website is readonly and you cannot make any changes to your media there.
If you need to make a change, then make those changes inside Shotwell, and rerun this project to
incrementally update the generated website. I have automation setup so that when I backup my
Shotwell library to my home server that my photo/video website is automatically regenerated.


## Screenshots

![Mobile Default View](screenshots/mobile-default-view-small.png?raw=1)

See the [screenshots page](screenshots/README.md) for more screenshots of the generated
HTML site.


## Photo Frame

The search page also allows you setting up a browser in kiosk mode
on a small single board computer like a Raspberry Pi and use it as a photo frame that pulls
from your home server as described on the [photo frame page](photoframe/README.md).

![Photo Frame Front](screenshots/photo-frame-front.jpg?raw=1)


## Keeping directory structure in sync with the library

There is a utility script [utils/rename_media.py](rename_media.py) that you can run to rename
all of your media files so that the directory structure on disk matches the way that you have
your media organized within Shotwell. It will store the media on disk using the format
`year(s)/event name/original base filename`.


## How to create printed photo books

The search page supports exporting the current view as a CSV file. For my photo books, I
export a series of CSV files for events that occurred throughout the year, and chain
together all of the images into a PDF that can be sent off to the book printer. My process
for creating these books is described on [this page](photobook-helper/README.md).

![Photo Books](screenshots/photobooks.jpg?raw=1)


## Usage

Ensure that you have the proper dependencies installed on your system:

    # Red Hat-based systems
    sudo dnf install -y exiv2 ffmpeg ImageMagick python3 python3-dateutil python3-geojson \
                        python3-humanize python3-pillow python3-pip uglify-js

    # Debian-based systems
    sudo apt-get install -y exiv2 ffmpeg imagemagick python3 python3-dateutil python3-geojson \
                            python3-humanize python3-pil python3-pip python3-pkg-resources \
                            uglifyjs

Backup your Shotwell database/library and then generate a static HTML site:

    shotwell_site_generator.py \
                --input-database /path/to/shotwell/sqlite/database \
                --input-media-path /path/to/shotwell/full-sized/images \
                --input-thumbs-directory /path/to/shotwell/thumbs360/directory \
                --dest-directory /path/to/generated/html/site \
                --src-assets-directory /path/to/this/repo \
                --title "My Photos"

Open the top level `index.html` file in your browser to view your library using the rich search
experience. The file `static-site/media/index.html` contains the site that minimizes the use of
Javascript.
