#!/usr/bin/env sh
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2020-2024 Brian Masney <masneyb@onstation.org>

find . -name files.txt | \
	grep -v done | \
	xargs -iblah echo "echo -n 'blah ' ; cat blah | wc -l" | \
	sh | \
	awk '{print $2" "$1}' | \
	sed "s/\/files.txt$//" | \
	sed "s/\.\///" | \
	sort -nr
