define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const GlobalDict      = require('koru/session/global-dict');
  const util            = require('koru/util');

  const VERSION_RELOAD = 1;
  const VERSION_CLIENT_AHEAD = 2;
  const VERSION_CLIENT_BEHIND = 3;
  const VERSION_GOOD_DICTIONARY = 4;
  const VERSION_BAD_DICTIONARY = 5;

  const MARKER = 'ws/';
  const stripedWsPath = (path) => {
    const index = path.indexOf(MARKER);

    if (index === -1) return [];

    const result = [];
    const len = path.length;
    // Start searching immediately after '/ws/'
    let start = index + 3;

    for (let i = start; i <= len; i++) {
      const pi = path[i];
      if (i === len || pi === '/' || pi === '?') {
        if (i > start) {
          result.push(path.slice(start, i));
          if (result.length === 3) {
            break;
          }
        }
        if (pi === '?') {
          break;
        }
        start = i + 1;
      }
    }

    return result;
  };
  return {
    VERSION_RELOAD,
    VERSION_CLIENT_AHEAD,
    VERSION_CLIENT_BEHIND,
    VERSION_GOOD_DICTIONARY,
    VERSION_BAD_DICTIONARY,

    comparePathVersion(session, url) {
      if (url === null) return VERSION_BAD_DICTIONARY;
      const gd = GlobalDict.main;
      const gdict = gd.globalDictEncoded(), dictHash = gd.dictHashStr;

      const [clientProtocol, clientVersion = '', clientHash = ''] = stripedWsPath(url);
      if (+clientProtocol !== koru.PROTOCOL_VERSION) {
        return VERSION_RELOAD;
      }

      if (clientHash !== '' && clientHash !== session.versionHash) {
        if (session.version === 'dev') {
          return VERSION_CLIENT_BEHIND;
        } else {
          const cmp = session.compareVersion?.(clientVersion, clientHash) ??
            util.compareVersion(clientVersion, session.version);
          if (cmp < 0) {
            if (cmp == -2) {
              return VERSION_RELOAD;
            }
            return VERSION_CLIENT_BEHIND;
          } else if (cmp > 0) {
            return VERSION_CLIENT_AHEAD;
          }
        }
      } else {
        const i = url.indexOf('?');
        if (i !== -1) {
          const search = util.searchStrToMap(url.slice(i + 1));
          if (search.dict === gd.dictHashStr) {
            return VERSION_GOOD_DICTIONARY;
          }
        }
      }
      return VERSION_BAD_DICTIONARY;
    },
  };
});
