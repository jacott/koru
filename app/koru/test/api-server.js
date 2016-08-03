const fs = require('fs');
const path = require('path');

define(function(require, exports, module) {
  return function (API) {
    const util  = require('koru/util');
    const session = require('koru/session');

    session.provide('G', function (data) {
      const jsonFile = `${API.OUT_DIR}/api.json`;
      const json = loadApi(jsonFile);
      const cj = data[0];
      for (const testName in cj) {
        const clientTest = cj[testName];
        let serverTest = json[testName];
        json[testName] = clientTest;
        if (serverTest) {
          const serverMethods = serverTest.methods;
          const clientMethods = clientTest.methods;
          for (const methodName in serverMethods) {
            clientMethods[methodName] || (clientMethods[methodName] = serverMethods[methodName]);
          }
        } else {
        }
      }
      writeApi(jsonFile, json);
    });

    API.OUT_DIR = path.resolve(module.toUrl('.'), '../../../../doc');

    API._record = function () {
      const jsonFile = `${this.OUT_DIR}/api.json`;
      const json = loadApi(jsonFile);
      for (const api of this._apiMap.values()) {
        json[api.testCase.name] = api.serialize((json[api.testCase.name]||{}));
      }
      writeApi(jsonFile, json);
    };
  };

  function writeApi(jsonFile, json) {
    fs.writeFileSync(jsonFile, JSON.stringify(json, null, 2));
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
