#!/bin/bash
set -e
cd `dirname "$0"`/..

export KORU_APP_NAME=$$appName$$
export TZ=UTC
export KORU_HOME=$PWD
export KORU_MODULE=$(readlink -f .)/node_modules/koru
tmpdir=$KORU_HOME/tmp
branch=${branch-${1-demo}}
LOG_DIR=${tmpdir}/log
export KORU_LOG_DIR=$LOG_DIR
. config/${branch}.sh
if [ "$2" = "--config" ];then
    env|grep -e '^KORU_'
    echo -e "NODE=$NODE\nNPM=$NPM\nNODE_PATH=$NODE_PATH"
fi
