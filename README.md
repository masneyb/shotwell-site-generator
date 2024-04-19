# shotwell-site-generator

[Shotwell](https://wiki.gnome.org/Apps/Shotwell) is a fantastic program for organizing photos
and videos. It supports publishing media to third-party sites, however that requires
organizing the media again there, which is time consuming. Once the media is published, any
metadata changes that are made in Shotwell will not be shown on that third-party site.

This program exports a mobile-friendly static HTML site of a Shotwell library. The generated
site is fully self contained and does not require Internet access or any third-party resources
for the long-term preservation of the library. With the exception of the search page, the use of
Javascript on the generated site is minimized for the long-term preservation of the library.

The search page provides a rich, single-page user experience that allows browsing your
library through various predefined views: all media over time, all events over time, year
view, nested tag view. Additionally you can search your library using 24 different fields.

Note that the generated website is readonly and you cannot make any changes to your media there.
If you need to make a change to say add new media, change existing media, etc, then make those
changes inside Shotwell. Once you are done, you can rerun this project and it'll update the
generated website. I have automation setup so that when I backup my Shotwell library to my home
server that my photo/video website is automatically regenerated.


## Screenshots

![Mobile Default View](screenshots/mobile-default-view-small.png?raw=1)

See the [screenshots](screenshots/README.md) directory for more screenshots of the generated
HTML site. You can serve these static files on a webserver such as nginx / apache2, and if
desired, setup HTTP basic authentication. There's no complicated additional webserver plugins
that need to be setup for a particular application runtime since you're just serving static
files.


## Photo Frame

The search page also allows you setting up a browser in kiosk mode
on a small single board computer like a Raspberry Pi and use it as a photo frame as described
on the [photo frame page](photoframe/README.md).

![Photo Frame Back](photoframe-back.jpg?raw=1)


## Usage

Ensure that you have the proper dependencies installed on your system:

    # Red Hat-based systems
    sudo dnf install -y exiv2 exiv2-devel ffmpeg ImageMagick boost-python3 python3 \
                        python3-dateutil python3-exiv2 python3-humanize python3-pillow python3-pip

    # Debian-based systems
    sudo apt-get install -y exiv2 ffmpeg imagemagick libboost-python-dev libexiv2-dev python3 \
                            python3-dateutil python3-humanize python3-pil python3-pip \
                            python3-pkg-resources
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
