#!/bin/bash
set -e

export KORU_APP_NAME=koru
export KORU_HOME=$(readlink -fm "$0"/../..)
export TZ=UTC

. "${0%/*}"/../lib/koru-env.sh "$@"

if [[ $KORU_ENV != test ]]; then
    abort "$KORU_ENV env not supported for koru development; use test"
fi
