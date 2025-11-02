#!/usr/bin/perl -w
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2015 Brian Masney <masneyb@onstation.org>

# This script is useful when scanning a large number of images.
# Name your files like: yyyy-name, yyyMM-name or yyyMMdd-name.
# Pass the filenames through this script and it will add an
# Exif DateTime tag to all of your photos.

while (<>) {
  chop;

  my $num = `exiv2 -pa $_ | grep Exif.Image.DateTime | wc -l`;
  next if $num != 0;

  my ($datestr) = /(^[\d-]+)/;
  $datestr =~ s/-//g;

  my $year;
  my $month;
  my $day;
  if (length($datestr) == 4) {
    $year = $datestr;
    $month = 7;
    $day = 1;
  }
  elsif (length($datestr) == 6) {
    ($year, $month) = $datestr =~ /^(\d{4})(\d{2})/;
    $day = 1;
  }
  elsif (length($datestr) == 8) {
    ($year, $month, $day) = $datestr =~ /^(\d{4})(\d{2})(\d{2})/;
  }
  else {
    print STDERR "Invalid date string $datestr\n";
    exit 1;
  }
  printf("exiv2 -M\"set Exif.Image.DateTime Ascii %04d:%02d:%02d 00:00:00\" \"$_\"\n", $year, $month, $day);
}
