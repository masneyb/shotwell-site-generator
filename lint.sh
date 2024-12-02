#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0
# Copyright (C) 2020-2024 Brian Masney <masneyb@onstation.org>

set -x

pylint-3 *.py

if [ ! -d node_modules ] ; then
	npm install eslint eslint-config-airbnb-base eslint-plugin-html eslint-plugin-import --save-dev
fi

npx eslint search.js
