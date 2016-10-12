#!/bin/bash
set -e

. `dirname "$0"`/../config/environ.sh

mongod --shutdown --dbpath $MONGO_DIR
