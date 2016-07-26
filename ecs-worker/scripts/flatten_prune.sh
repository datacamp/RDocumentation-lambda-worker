#!/bin/bash


package=$1

find packages/$package/man -mindepth 2 -type f -exec mv -t packages/$package/man -i '{}' +

rm -R -- packages/$package/man/*/