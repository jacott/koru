#!/bin/bash
set -e

if [ "$MONGO_DIR" = "" ];then
    . `dirname "$0"`/environ.sh
fi

mongod --shutdown --dbpath $MONGO_DIR
