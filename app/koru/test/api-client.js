define((require)=>{
  const util            = require('koru/util');
  const TH              = require('./main');

  return API =>{
    API._record = function () {
      const json = {};
      for (const api of this._moduleMap.values()) {
        json[api.moduleName] = api.serialize((json[api.moduleName]||{}));
      }
      TH.session.sendBinary('G', [json]);
    };
  };
});
