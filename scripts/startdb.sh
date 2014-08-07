#!/bin/bash
set -e

if [ "$MONGO_DIR" = "" ];then
    . `dirname "$0"`/environ.sh
fi

if [ ! -e "$MONGO_DIR" ];then
    mkdir -p "$MONGO_DIR"
fi

mongod --config "$KORU_HOME/config/${MONGO_CFG-mongo-default.yml}" --fork --port ${MONGO_PORT}  --logpath ${LOG_DIR}/mongo-${branch}.log --dbpath $MONGO_DIR
