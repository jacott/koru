#!/bin/bash
set -e

export APP_NAME=koru
export KORU_HOME=$(readlink -fm "$0"/../..)
export TZ=UTC

. "${0%/*}"/../lib/koru-env.sh "$@"

if [[ $APP_ENV != test ]]; then
    abort "$APP_ENV env not supported for koru development; use test"
fi
