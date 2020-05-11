# shotwell-site-generator

[Shotwell](https://wiki.gnome.org/Apps/Shotwell) is a fantastic program for organizing photos
and videos. It supports publishing media to third-party sites, however that requires
organizing the media again there, which is time consuming. Once the media is published, any
metadata changes that are made in Shotwell will not be shown on that third-party site.

This program exports a static mobile-friendly HTML site of a Shotwell library and makes the
media available through different views: all media over time, all events over time, year view,
and nested tag view. Composite thumbnails of the events, years, and tags are generated using
[Imagemagick](https://imagemagick.org/index.php) with the highest-rated media used as the input
images.

The generated site is fully self contained and does not require Internet access or any
third-party resources for the long-term preservation of the library. The use of Javascript on
the generated site is minimized as well for the long-term preservation.

I make the static-generated website available on my local LAN via my home server so that other
members of my family can view my Shotwell library on their devices. 

## Usage

Ensure that you have the proper dependencies installed on your system:

    # Debian-based systems
    sudo apt-get install -y imagemagick libboost-python-dev libexiv2-dev python3 \
                            python3-dateutil python3-humanize python3-pip python3-pkg-resources
    pip3 install py3exiv2
    
    # RedHat-based systems
    sudo dnf install -y ImageMagick boost-python3 exiv2-devel python3 python3-dateutil \
                        python3-humanize python3-pip
    pip3 install py3exiv2

Backup your Shotwell database/library and then generate a static HTML site:

    shotwell_site_generator.py \
                --title "Brian Masney's Photos" \
                --input-media-path /path/to/shotwell/full-sized/images \
                --input-database /path/to/shotwell/sqlite/database \
                --input-thumbs-directory /path/to/shotwell/thumbs360/directory \
                --dest-directory /path/to/generated/html/site \
                --css library.css \
                --panorama-icon images/panorama-icon.png \
                --play-icon images/play-icon.png \
                --raw-icon images/raw-icon.png \
                --ratings-to-skip 1 2 3 # optional

The following files and directories will be generated in the path specified by
`--dest-directory`:

    0/                  # Generated site for media rated 0+ stars
    0/event/
    0/media/
    0/tag/
    0/year/
    4/                  # Generated site for media rated 4+ stars
    4/event/
    4/media/
    4/tag/
    4/year/
    5/                  # Generated site for media rated 5 stars
    5/event/
    5/media/
    5/tag/
    5/year/
    original@           # Symlink to --input-database path for downloading full-sized media
    thumbnails/         # Thumbnails for the various views.
    thumbnails/event/
    thumbnails/media/
    thumbnails/tag/
    thumbnails/year/
    index.html          # HTTP redirect to 0/media/index.html
    library.css         # CSS styling for all of the generated HTML files

Open the top level index.html file in your browser to view your library. You can also change
into the dest-directory and run `python3 -mhttp.server 8000` to make the files available on your
local LAN over port 8000. You should consider running nginx or Apache if you want to run this
on your home server for the long term.

## Contact

Brian Masney: [Email](mailto:masneyb@onstation.org)
