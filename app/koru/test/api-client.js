define((require) => {
  'use strict';
  const util            = require('koru/util');
  const TH              = require('./main');

  return (API) => {
    API._record = async function () {
      await 1;
      const json = {};
      for (const api of this._moduleMap.values()) {
        json[api.moduleName] = await api.serialize((json[api.moduleName] || {}));
      }
      TH.session.sendBinary('G', [json]);
    }
  };
});
