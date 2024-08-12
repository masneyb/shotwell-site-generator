#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0
# Copyright (C) 2020-2021 Brian Masney <masneyb@onstation.org>

pylint-3 --disable=consider-using-f-string,missing-module-docstring,missing-function-docstring,missing-class-docstring *.py

if [ ! -d node_modules ] ; then
	npm install eslint eslint-config-airbnb-base eslint-plugin-html eslint-plugin-import --save-dev
fi

npx eslint index.html search.html search.js
