#!/bin/bash

function abort {
    echo $*
    exit 1
}

[[ -v KORU_HOME ]] || abort '$KORU_HOME not set'
cd $KORU_HOME
[[ -e .koru ]] || abort ".koru file missing from project top level"

APP_ENV=${1-demo}

export NODE=${NODE-`type -p node`}

if [[ -e npm-shrinkwrap.json ]];then
    PKG_LOCK=npm-shrinkwrap.json
else
    PKG_LOCK=package-lock.json
fi

case "$APP_ENV" in
    "demo" | "test")
        [[ -d tmp ]] || mkdir tmp
        if [[ -e package-node.test && -e node_modules ]] && ${NODE} -v |
                   cat - ${PKG_LOCK} | diff -q - package-node.test >/dev/null;then
            :
        else
            if [[ ! -v KORU_MODULES_OKAY  ]]; then
                echo 'npm install...'
                npm ci
            fi
            ${NODE} -v | cat - ${PKG_LOCK} >package-node.test
        fi;;
esac

export KORU_MODULE="$KORU_HOME/node_modules/koru"
export KORU_NODE_OPTIONS=""
export KORU_LOG_DIR=${KORU_LOG_DIR-tmp}

[[ -e config/${APP_ENV}.sh ]] && . config/${APP_ENV}.sh

export KORU_PORT=${KORU_PORT-3000}
export NODE_PATH="${NODE%/*}"
export NPM=$NODE_PATH/npm
export APP_DB=${APP_DB-${APP_NAME}${APP_ENV}}

if [[ ! -d "$KORU_LOG_DIR" ]];then
    echo "no log dir: $KORU_LOG_DIR"
    exit 1
fi

function exec_node {
    exec ${NODE} ${KORU_NODE_OPTIONS} "$@"
}

function node {
    ${NODE} ${KORU_NODE_OPTIONS} "$@"
}

if [[ "$(type -t post_koru_env)" = "function" ]]; then
    post_koru_env
fi

if [[ "$2" = "--config" ]]; then
    env|grep -e '^KORU_'
    echo -e "NODE=$NODE\nNPM=$NPM\nNODE_PATH=$NODE_PATH"
fi
