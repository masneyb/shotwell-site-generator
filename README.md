# shotwell-site-generator

[Shotwell](https://wiki.gnome.org/Apps/Shotwell) is a fantastic program for organizing photos
and videos. It supports publishing media to third-party sites, however that requires
organizing the media again there, which is time consuming. Once the media is published, any
metadata changes that are made in Shotwell will not be shown on that third-party site.

This program exports a static mobile-friendly HTML site of a Shotwell library and makes the
media available through different views: all media over time, all events over time, year view,
nested tag view, and advanced search. Composite thumbnails of the events, years, and tags are
generated using [Imagemagick](https://imagemagick.org/index.php) with the highest-rated media
used as the input images.

The generated site is fully self contained and does not require Internet access or any
third-party resources for the long-term preservation of the library. With the exception of the
search and screensaver pages, the use of Javascript on the generated site is minimized as well
for the long-term preservation.

It also generates a screensaver so that you can setup a browser in kiosk mode on a small single
board computer like a Raspberry Pi and use it as a photo frame. My photo frame setup is described
in the file [PHOTOFRAME.md](PHOTOFRAME.md).

I make the static-generated website available on my local LAN via my home server so that other
members of my family can view my Shotwell library on their devices. 

## Usage

Ensure that you have the proper dependencies installed on your system:

    # Debian-based systems
    sudo apt-get install -y imagemagick libboost-python-dev libexiv2-dev python3 \
                            python3-dateutil python3-humanize python3-pip python3-pkg-resources
    pip3 install py3exiv2
    
    # Red Hat-based systems
    sudo dnf install -y ImageMagick boost-python3 exiv2-devel python3 python3-dateutil \
                        python3-humanize python3-pip
    pip3 install py3exiv2

Backup your Shotwell database/library and then generate a static HTML site:

    shotwell_site_generator.py \
                --input-database /path/to/shotwell/sqlite/database \
                --input-media-path /path/to/shotwell/full-sized/images \
                --input-thumbs-directory /path/to/shotwell/thumbs360/directory \
                --dest-directory /path/to/generated/html/site \
                --src-assets-directory /path/to/this/repo \
                --title "My Photos" \
                --ratings-to-skip 1 2 3 # optional

The following files and directories will be generated in the path specified by
`--dest-directory`:

    X/                  # Generated site for each of the media ratings (0-5), where X is the rating
    X/event/            # Static HTML files for events view
    X/media/            # Static HTML files for all media view
    X/tag/              # Static HTML files for nested tag view
    X/year/             # Static HTML files for year view
    X/index.html        # HTTP redirect to the all media view
    original@           # Symlink to --input-database path for downloading full-sized media
    thumbnails/         # Thumbnails generated by Imagemagick for the various views
    thumbnails/event/
    thumbnails/media/
    thumbnails/tag/
    thumbnails/year/
    index.html          # HTTP redirect to 0/media/index.html
    library.css         # CSS styling for all of the HTML files
    media.json          # JSON file with all media, events, and tags
    screensaver.html    # Screensaver linked from the search page
    search.js           # Common functions for screensaver.html and search.html
    search.html         # Advanced search that uses Javascript in the user's browser.
                        # Reads content from generated media.json file.

Open the top level index.html file in your browser to view your library. You can also change
into the dest-directory and run `python3 -mhttp.server 8000` to make the files available on your
local LAN over port 8000. You should consider running nginx or Apache if you want to run this
on your home server for the long term.

## Screenshots

![All Events](screenshots/all_events.png?raw=1)

---

![All Media](screenshots/all_media.png?raw=1)

---

![Search](screenshots/search.png?raw=1)

## Same origin policy for file URIs

The screensaver and search pages will not work when accessed using a file:// URI. This is due to
browser mitigations in place for CVE-2019-11730. These pages work correctly when accessed over
a http:// or https:// URI. All of the other generated pages will work correctly when accessed over
a file:// URI.

## Contact

Brian Masney [masneyb@onstation.org](mailto:masneyb@onstation.org)
