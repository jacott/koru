#!/bin/bash
set -e

export KORU_APP_NAME=koru
export KORU_HOME=$(readlink -fm "$0"/../..)
export TZ=UTC
export LANG="en_US"
export LANGUAGE="en_US:en"
export LC_ALL="en_US.UTF-8"

export KORU_ENV="test"

. "${0%/*}"/../lib/koru-env.sh "test"

if [[ $KORU_ENV != test ]]; then
    abort "$KORU_ENV env not supported for koru development; use test"
fi
