#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright (C) 2020-2021 Brian Masney <masneyb@onstation.org>

pylint-3 --disable=missing-module-docstring,missing-function-docstring,missing-class-docstring,no-self-use *.py
