set -e
cd `dirname "$0"`/..
if test ! -e .koru;then
    echo "First change to the toplevel directory to run this command: ($0)"
    exit 1
fi

export TZ=UTC
export KORU_HOME=$PWD

tmpdir=$KORU_HOME/tmp
if [ ! -e "$tmpdir" ];then
    mkdir -p "$tmpdir"
fi

branch=${branch-${1-demo}}
[ -e config/${branch}.sh ] && . config/${branch}.sh

export NODE=${NODE-`type -p node`}
export NODE_PATH=$(dirname $NODE)
export NPM=$NODE_PATH/npm

LOG_DIR=${LOG_DIR-$tmpdir}

if [ ! -d "$LOG_DIR" ];then
    echo "no log dir: $LOG_DIR"
    exit 1
fi

export KORU_LOG_DIR=$LOG_DIR
export PATH=$NODE_PATH:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin

if [ "$2" = "--config" ];then
    env|grep -e '^KORU_'
    echo -e "NODE=$NODE\nNPM=$NPM\nNODE_PATH=$NODE_PATH"
fi
