# -*- mode: shell-script -*-

export KORU_DB=${KORU_APP_NAME}demo
export APP_URL=http://${APP_DOMAIN}
export APP_MAILURL=""

if [[ -e build/version.sh ]]; then
    . build/version.sh
fi
