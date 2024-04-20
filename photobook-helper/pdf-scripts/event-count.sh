#!/usr/bin/env sh

find . -name files.txt | \
	grep -v done | \
	xargs -iblah echo "echo -n 'blah ' ; cat blah | wc -l" | \
	sh | \
	awk '{print $2" "$1}' | \
	sed "s/\/files.txt$//" | \
	sed "s/\.\///" | \
	sort -nr
