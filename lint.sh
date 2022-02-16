#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright (C) 2020-2021 Brian Masney <masneyb@onstation.org>

pylint-3 --disable=missing-module-docstring,missing-function-docstring,missing-class-docstring,no-self-use *.py

if [ ! -d node_modules ] ; then
	npm install eslint eslint-config-airbnb-base eslint-plugin-html eslint-plugin-import --save-dev
fi

npx eslint index.html search.html search*.js
