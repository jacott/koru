#!/bin/bash
set -e

. `dirname "$0"`/environ.sh

mongod --shutdown --dbpath $MONGO_DIR
