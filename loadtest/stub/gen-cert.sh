#!/bin/sh
# Self-signed certificate for the stub, valid for the hosts the preload redirects to it.
# Written to loadtest/.stub/ (git-ignored). Usage: loadtest/stub/gen-cert.sh <r2-account-id>
set -e
dir=$(cd "$(dirname "$0")/.." && pwd)/.stub; mkdir -p "$dir"
acct=$1
openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=shotviva-loadtest-stub" \
  -keyout "$dir/key.pem" -out "$dir/cert.pem" \
  -addext "subjectAltName=DNS:api.openai.com,DNS:*.r2.cloudflarestorage.com,DNS:$acct.r2.cloudflarestorage.com,DNS:*.$acct.r2.cloudflarestorage.com,IP:127.0.0.1" \
  -addext "basicConstraints=critical,CA:true" 2>/dev/null
echo "$dir/cert.pem"
