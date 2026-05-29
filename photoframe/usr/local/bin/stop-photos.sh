#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2024 Brian Masney <masneyb@onstation.org>

# Power all outputs off via the running labwc compositor.
wlopm --off '*' || true

killall chromium || true
