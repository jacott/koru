const fs = require('fs');
const path = require('path');

define(function(require, exports, module) {
  return function (API) {
    const util  = require('koru/util');
    const session = require('koru/session');

    session.provide('G', function (data) {
      const updates = data[0];
      const filename = `${API.OUT_DIR}/api-client.json`;
      const json = loadApi(filename);
      for (let testName in updates) {
        json[testName] = updates[testName];
      }
      writeApi(filename, json);
    });

    API.OUT_DIR = path.resolve(module.toUrl('.'), '../../../../doc');

    API._record = function () {
      const filename = `${this.OUT_DIR}/api-server.json`;
      const json = loadApi(filename);
      for (let api of this._moduleMap.values()) {
        json[api.moduleName] = api.serialize((json[api.moduleName]||{}));
      }
      writeApi(filename, json);
    };
  };

  function writeApi(jsonFile, json) {
    const jsonOut = {};
    for (let key of Object.keys(json).sort()) {
      jsonOut[key] = json[key];
    }
    fs.writeFileSync(jsonFile, JSON.stringify(jsonOut, null, 2));
  }

  function loadApi(jsonFile) {
    try {
      return JSON.parse(fs.readFileSync(jsonFile));
    }
    catch (ex) {
      return {};
    }
  }
});
