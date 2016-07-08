#!/bin/bash

aws s3 sync jsons/$1 s3://assets.rdocumentation.org/rpackages/unarchived/$1
