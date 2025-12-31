Instructions how to add GPS tags to the older media in your shotwell library
that's missing the GPS EXIF tags.

- Backup shotwell's photo.db since it'll be needed later for stage3-update-transformations.py

- Download media.csv file from the JS web interface for the media that you would like add the
  GPS coordinate to.

- Run stage1-update.sh and pass in the lat/lon and base directory for your media. This calls
  stage2-gps-set.sh.

- Start shotwell. The underlying photo files changed because of the new EXIF tags, so
  shotwell will update it. It removes the transformations.

- Run stage3-update-transformations.py with the old and new sqlite3 database and it will add
  the missing transformations back.

- I checksum my photos to look files that have changed. Get the list of changed photos and run
  the following to remove them:

     grep -Fv -f ~/patterns SHA256SUMs.txt > ~/new
