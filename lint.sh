#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2020-2024 Brian Masney <masneyb@onstation.org>

set -x

pylint-3 *.py

if [ ! -d node_modules ] ; then
	npm install eslint eslint-config-airbnb-base eslint-plugin-html eslint-plugin-import --save-dev
fi

npx eslint static/search.js static/map.js
