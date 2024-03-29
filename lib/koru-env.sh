#!/bin/bash

abort() {
    echo >&2 $*
    exit 1
}

[[ -v KORU_HOME ]] || abort '$KORU_HOME not set'
cd $KORU_HOME
[[ -e .koru ]] || abort ".koru file missing from project top level"

export KORU_ENV=${1-demo}

export NODE=${NODE-`type -p node`}

if [[ -e npm-shrinkwrap.json ]];then
    PKG_LOCK=npm-shrinkwrap.json
else
    PKG_LOCK=package-lock.json
fi

case "$KORU_ENV" in
    "demo" | "test")
        if [[ -e package-node.test && -e node_modules ]] && ${NODE} -v |
                   cat - ${PKG_LOCK} | diff -q - package-node.test >/dev/null;then
            :
        else
            if [[ ! -v KORU_MODULES_OKAY  ]]; then
                echo 'npm clean install...'
                PATH=${NODE%/*}:$PATH npm ci
            fi
            ${NODE} -v | cat - ${PKG_LOCK} >package-node.test
        fi;;
esac

export KORU_MODULE="$KORU_HOME/node_modules/koru"
export KORU_NODE_OPTIONS=""

if [[ $KORU_ENV = check ]]; then
    return
fi

[[ -e config/${KORU_ENV}.sh ]] && . config/${KORU_ENV}.sh

export KORU_PORT=${KORU_PORT-3000}
export NODE_PATH="${NODE%/*}"
export NPM=$NODE_PATH/npm
export KORU_DB=${KORU_DB-${KORU_APP_NAME}${KORU_ENV}}

exec_node() {
    exec ${NODE} ${KORU_NODE_OPTIONS} "$@"
}

node() {
    ${NODE} ${KORU_NODE_OPTIONS} "$@"
}

if [[ "$(type -t post_koru_env)" = "function" ]]; then
    post_koru_env
fi

if [[ "$2" = "--config" ]]; then
    env|grep -e '^KORU_'
    echo -e "NODE=$NODE\nNPM=$NPM\nNODE_PATH=$NODE_PATH"
fi
