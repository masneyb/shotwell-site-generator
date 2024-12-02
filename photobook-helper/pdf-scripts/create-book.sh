#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2020-2024 Brian Masney <masneyb@onstation.org>

set -e
set -x

# Note: If imagemagick stops without fully creating a PDF, then this most likely
# means the system ran out of memory. Add more swap temporarily with:
#
#     sudo dd if=/dev/zero of=~/swapfile bs=1M count=10240
#     sudo mkswap ~/swapfile
#     sudo chmod 0600 ~/swapfile
#     sudo swapon ~/swapfile

find . -name page*.png -exec magick {} -quality 95 {}.jpg \;

magick $(find . -name page*.jpg | sort) \
	-gravity center \
	-background black \
	-extent 3788x3262 \
	-units PixelsPerInch \
	-density 300x300 \
	book.pdf
