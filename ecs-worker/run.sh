#!/bin/bash
export LD_LIBRARY_PATH=/usr/lib/R/library
export R_HOME=/usr/lib/R/
export R_LIBS=/usr/local/lib/R/site-library

Rscript scripts/generate.R