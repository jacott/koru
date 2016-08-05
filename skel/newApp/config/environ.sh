set -e
cd `dirname "$0"`/..

export KORU_APP_NAME=_{app_name}_
export TZ=UTC
export KORU_HOME=$PWD
export KORU_MODULE=$(realpath node_modules/koru)
tmpdir=$KORU_HOME/tmp
branch=${branch-${1-demo}}
LOG_DIR=${tmpdir}/log
. config/${branch}.sh
