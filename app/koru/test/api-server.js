const fs = require('fs');
const path = require('path');

define((require, exports, module)=>{
  return API =>{
    const util  = require('koru/util');
    const session = require('koru/session');

    const writeApi = (jsonFile, json)=>{
      const jsonOut = {};
      for (const key of Object.keys(json).sort()) {
        jsonOut[key] = json[key];
      }
      fs.writeFileSync(jsonFile, JSON.stringify(jsonOut, null, 2));
    };

    const loadApi = jsonFile =>{
      try {
        return JSON.parse(fs.readFileSync(jsonFile));
      }
      catch (ex) {
        return {};
      }
    };

    session.provide('G', data =>{
      const updates = data[0];
      const filename = `${API.OUT_DIR}/api-client.json`;
      const json = loadApi(filename);
      for (const testName in updates) {
        json[testName] = updates[testName];
      }
      writeApi(filename, json);
    });

    API.OUT_DIR = path.resolve(module.toUrl('.'), '../../../../doc');

    API._record = function () {
      const filename = `${this.OUT_DIR}/api-server.json`;
      const json = loadApi(filename);
      for (const api of this._moduleMap.values()) {
        json[api.moduleName] = api.serialize((json[api.moduleName]||{}));
      }
      writeApi(filename, json);
    };
  };
});
