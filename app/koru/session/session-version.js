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

  return {
    VERSION_RELOAD,
    VERSION_CLIENT_AHEAD,
    VERSION_CLIENT_BEHIND,
    VERSION_GOOD_DICTIONARY,
    VERSION_BAD_DICTIONARY,

    comparePathVersion(session, url) {
      const gd = GlobalDict.main;

      const gdict = gd.globalDictEncoded(), dictHash = gd.dictHashStr;
      const parts = url === null ? null : url.split('?', 2);
      const [clientProtocol, clientVersion, clientHash] = url === null
        ? []
        : parts[0].split('/').slice(2);
      if (url === null) return VERSION_BAD_DICTIONARY;
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
        const search = util.searchStrToMap(parts[1]);
        if (search.dict === gd.dictHashStr) {
          return VERSION_GOOD_DICTIONARY;
        }
      }
      return VERSION_BAD_DICTIONARY;
    },
  };
});
