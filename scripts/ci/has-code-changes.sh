#!/usr/bin/env bash
# Reads changed paths (one per line) on stdin and prints `true` when any of them is code, or
# `false` when every path is docs/spec only: 规范/, seo资料/, docs/, design/ or a *.md file.
# No paths at all prints `true`, so an unexpected empty diff runs everything.
set -u

any=false
while IFS= read -r path || [ -n "$path" ]; do
  [ -n "$path" ] || continue
  any=true
  case "$path" in
    规范/* | seo资料/* | docs/* | design/* | *.md) ;;
    *) echo true; exit 0 ;;
  esac
done

if [ "$any" = true ]; then echo false; else echo true; fi
