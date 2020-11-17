# Photo Book Creation Instructions

This page details instructions about how to [photobook_helper.py](photobook_helper.py) that takes
a large list of images from a file, and sends them in batches to the
[PhotoCollage](https://github.com/adrienverge/PhotoCollage.git) project to make photo books. The
user can easily control how many images are shown on each page and go back if desired.

- Clone the PhotoCollage project from <https://github.com/adrienverge/PhotoCollage.git>. Merge
  a separate branch that adds support for choosing the image export quality.

      git remote add ojob https://github.com/ojob/PhotoCollage.git
      git fetch ojob
      git merge ojob/choose-export-quality

  I ordered a 13"x11" landscape book from <https://www.blurb.com>. Add preset for this size by
  adding the following around line 669 in `photocollage/gtkgui.py`:

      ("12.625in x 10.875in  landscape (300ppi)", (3788, 3262)),

  I have a branch at <https://github.com/masneyb/PhotoCollage> with these changes.

- Create a PhotoCollage run.sh script:

      #!/usr/bin/env bash
      PYTHONPATH=/home/masneyb/PhotoCollage /home/masneyb/PhotoCollage/bin/photocollage $@

- Start on the event or tag page for the generated HTML site for your photo library, and click
  on the Search link. Once on the search page, limit the results further if desired, and
  click the `CSV Download` link at the top of the page.

- Process the CSV file with the [csv-to-filelist.sh](csv-to-filelist.sh) script from this
  directory:

      csv-to-filelist.sh < media.csv > files.txt

- Now call the photobook helper script with the command:

      photobook_helper.py --infile files.txt --photocollage-bin ~/path/to/run.sh

  By default only 10 images are passed to PhotoCollage. If you want more or less, simply close
  the program and the [photobook_helper.py](photobook_helper.py) will prompt you for the next
  action:

      Enter new number of photos for batch (10 / 86);
          (c)ontinue to next batch, (l)ast batch, or (q)uit: 

  There's 10 photos in the current page, and 86 additional photos. Enter a new number of photos
  to pass to PhotoCollage, `c` to finish the current batch of photos and move onto the next,
  `l` to go back to the previous batch, or `q` to quit.

- Once all of the individual pages are created, a single PDF can be generated with the command:

      convert page* -background black -units PixelsPerInch -density 300x300 book.pdf
