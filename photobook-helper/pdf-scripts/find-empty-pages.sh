#!/usr/bin/env bash
find . -name files.txt | \
	xargs -iblah dirname blah | \
	sort | \
	xargs -iblah echo "if [ ! -f "blah/page01.png" ] ; then echo blah ; fi"  | \
	sh
