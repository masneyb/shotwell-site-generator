#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2020-2024 Brian Masney <masneyb@onstation.org>

find . -name files.txt | \
	xargs -iblah dirname blah | \
	sort | \
	xargs -iblah echo "if [ ! -f "blah/page01.png" ] ; then echo blah ; fi"  | \
	sh
