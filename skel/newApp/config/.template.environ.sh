#!/bin/bash
set -e

export KORU_APP_NAME=$$appName$$
export KORU_HOME=$(readlink -fm "$0"/../..)
export TZ=UTC
export LANG="en_US"
export LANGUAGE="en_US:en"
export LC_ALL="en_US.UTF-8"

case "$1" in
    "demo" | "test" | "check")
        if [[ ! -e $KORU_HOME/node_modules ]]; then
            npm ic
            KORU_MODULES_OKAY=1
        else
            unset KORU_MODULES_OKAY
        fi;;
esac

. $KORU_HOME/node_modules/koru/lib/koru-env.sh "$@"
