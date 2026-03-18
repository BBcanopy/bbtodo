#!/bin/sh
set -eu

echo "Waiting for server on http://server:3000/health..."
until wget -q -O /dev/null http://server:3000/health; do
  sleep 1
done

exec nginx -g 'daemon off;'
