set -e
cd `dirname "$0"`/..
if test ! -e .koru;then
    echo "First change to the toplevel directory to run this command: ($0)"
    exit 1
fi

export KORU_HOME=$PWD

tmpdir=$KORU_HOME/tmp
if [ ! -e "$tmpdir" ];then
    mkdir -p "$tmpdir"
fi

branch=$1
. config/${branch}.cfg

if [ "$LOG_DIR" = "" ];then
    LOG_DIR=/u/log
fi

if [ ! -d "$LOG_DIR" ];then
    echo "no log dir: $LOG_DIR"
    exit 1
fi
