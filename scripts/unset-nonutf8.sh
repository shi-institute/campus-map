#!/usr/bin/env bash

tmpfile=$(mktemp)

# python script to find non-UTF-8 env vars and remove them
python3 - <<'PY' >"$tmpfile"
import os, sys

def is_utf8(s):
    try:
        s.encode('utf-8')
        return True
    except Exception:
        return False

for k, v in os.environ.items():
    if not is_utf8(v):
        print(f"unset {k}")
PY

# execute in the current shell context
. "$tmpfile"
rm -f "$tmpfile"
