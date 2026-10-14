#!/bin/bash
# usage: render.sh in.xlsx outdir  -> outdir/x.pdf
mkdir -p "$2"; soffice -env:UserInstallation=file:///tmp/lo_pdf_profile --headless --convert-to pdf --outdir "$2" "$1" >/dev/null 2>&1
