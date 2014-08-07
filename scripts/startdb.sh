#!/bin/bash
set -e

. `dirname "$0"`/environ.sh

if [ ! -e "$MONGO_DIR" ];then
    mkdir -p "$MONGO_DIR"
fi

echo "Starting mongo $branch"

mongod --config "$KORU_HOME/config/${MONGO_CFG-mongo-default.yml}" --fork --port ${MONGO_PORT}  --logpath ${LOG_DIR}/mongo-${branch}.log --dbpath $MONGO_DIR
