isServer && define(function (require, exports, module) {
  var test, v;

  var sut = require('./less-watcher');
  var koru = require('../main');
  var Future = require('fibers/future');
  var TH = require('../test');
  var fw = require('../file-watch');
  var Path = require('path');
  var session = require('../session/main');
  var fst = require('../fs-tools');
  var fs = require('fs');
  var util = require('koru/util');

  TH.testCase(module, {
    setUp: function () {
      test = this;
      v = {};
      v.conn = {send: test.stub()};

      v.expectedLoads = {
        "koru/css/loader-test.css": true,
        "koru/css/loader-test2.css": true,
        "koru/css/less-compiler-test.less": true,
      };

      v.expectedImports = {
          'koru/css/less-compiler-test-imp.lessimport': {
            'koru/css/less-compiler-test.less': true
          },
          'koru/css/less-compiler-test-imp2.lessimport': {
            'koru/css/less-compiler-test-imp.lessimport': true,
          },
        };

      v.expectedSources = {
        'koru/css/less-compiler-test.less': {
          'koru/css/less-compiler-test-imp.lessimport': true,
        },
        'koru/css/less-compiler-test-imp.lessimport': {
          'koru/css/less-compiler-test-imp2.lessimport': true,
        },
        'koru/css/less-compiler-test-imp2.lessimport': {
        },
      };

      v.addTimestamps = function(map) {
        var time = Date.now()+20*1000;

        for(var key in map) {
          var val = map[key];
          if (typeof val === 'object') {
            val.mtime = time-=2000;
          }
        }
        return map;
      };

      test.stub(fst, 'rm_f');
      sut.clearGraph(); // loader-test calls server which sets the graph
    },

    tearDown: function () {
      sut.clearGraph();
      v = null;
    },

    "loadRequest": {
      setUp: function () {
        v.topDirLen = koru.appDir.length + 1;

        v.addTimestamps(v.expectedSources);
        test.stub(fst, 'stat', function (fn) {
          fn = fn.slice(v.topDirLen);
          if (fn === 'koru/css/.build/less-compiler-test.less.css')
            fn = 'koru/css/less-compiler-test.less';

          return {mtime: new Date(v.expectedSources[fn].mtime)};
        });

      },

      "test imports changed while system down": function () {
        v.expectedSources['koru/css/less-compiler-test-imp2.lessimport'].mtime = Date.now()+40*1000;

        session._commands.S.call(v.conn, 'LAkoru/css');

        assert.calledWith(fst.rm_f, Path.join(koru.appDir, 'koru/css/.build/less-compiler-test.less.css'));

        assert.msg("should use imp2 mtime for imp")
          .same(sut.sources['koru/css/less-compiler-test-imp.lessimport'].mtime,
                v.expectedSources['koru/css/less-compiler-test-imp2.lessimport'].mtime);

      },


      "test build graph": function () {
        session._commands.S.call(v.conn, 'LAkoru/css');

        assert.calledWith(v.conn.send, 'SL', "koru/css/less-compiler-test.less " +
                          "koru/css/loader-test.css koru/css/loader-test2.css");

        assert.equals(sut.loadDirs, {
          'koru/css': true,
        });

        assert.equals(sut.loads, v.expectedLoads);
        assert.equals(sut.imports, v.expectedImports);
        assert.equals(sut.sources, v.expectedSources);


        delete sut.loads["koru/css/loader-test2.css"];

        v.conn.send.reset();
        session._commands.S.call(v.conn, 'LAkoru/css');

        assert.calledWith(v.conn.send, 'SL', "koru/css/less-compiler-test.less " +
                          "koru/css/loader-test.css");

      },

      "test bad names": function () {
        'koru/.. koru/css/.build ../koru /koru koru/.dir'
          .split(' ').forEach(function (dir) {
            assert.exception(function () {
              session._commands.S.call(v.conn, 'LA'+dir);
            }, {error: 500, reason: 'Illegal directory name'});
          });
      },
    },

    "watching": {
      setUp: function () {
        v.session = {sendAll: test.stub()};

        v.watcher = fw.listeners.less;
        assert(v.watcher, "Should be registered with file-watch");

        v.loadDefaults = function () {
          sut.loadDirs['koru/css'] = true;
          util.extend(sut.loads, util.deepCopy(v.expectedLoads));
          util.extend(sut.imports, util.deepCopy(v.expectedImports));
          util.extend(sut.sources, util.deepCopy(v.expectedSources));
        };
      },

      "test lessimport change": function () {
        test.stub(fst, 'readFile').withArgs( koru.appDir+'/koru/css/my-imp.lessimport')
          .returns('@import "imp3.lessimport";\n\n@import "imp4.lessimport";');

        v.loadDefaults();

        fw.listeners.lessimport('lessimport', "koru/css/my-imp.lessimport", koru.appDir, v.session);

        refute('koru/css/my-imp.lessimport' in sut.loads);

        assert.equals(sut.imports["koru/css/imp3.lessimport"], {'koru/css/my-imp.lessimport': true});

        assert.equals(Object.keys(sut.sources['koru/css/my-imp.lessimport']).sort(), [
          "koru/css/imp3.lessimport",
          "koru/css/imp4.lessimport",
          "mtime",
        ]);
        refute('koru/css/imp3.lessimport' in sut.sources);

        refute.called(v.session.sendAll);
      },

      "test sends dependents": function () {
        test.stub(fst, 'readFile').withArgs( koru.appDir+'/koru/css/less-compiler-test-imp2.lessimport')
          .returns({toString: function () {return ''}});

        v.expectedImports['koru/css/less-compiler-test-imp2.lessimport']['foo/bar.less'] = true;

        v.loadDefaults();

        v.watcher('lessimport', "koru/css/less-compiler-test-imp2.lessimport", koru.appDir, v.session);

        assert.calledWith(v.session.sendAll, 'SL', 'koru/css/less-compiler-test.less foo/bar.less');

        assert.calledWith(fst.rm_f, koru.appDir+'/koru/css/.build/less-compiler-test.less.css');
        assert.calledWith(fst.rm_f, koru.appDir+'/foo/.build/bar.less.css');
      },

      "test less change": function () {
        test.stub(fst, 'readFile').withArgs( koru.appDir+'/koru/css/my-test.less')
          .returns('@import "imp3.lessimport"');

        v.watcher('less', "koru/css/compiler-test.less", koru.appDir, v.session);

        refute.called(v.session.sendAll);
        refute.called(fst.readFile);

        v.loadDefaults();

        v.watcher('less', "koru/css/my-test.less", koru.appDir, v.session);

        assert.calledWith(v.session.sendAll, 'SL', 'koru/css/my-test.less');

        assert.isTrue(sut.loads['koru/css/my-test.less']);

        assert.equals(sut.imports["koru/css/imp3.lessimport"], {'koru/css/my-test.less': true});

        assert.equals(sut.sources['koru/css/my-test.less'], {mtime: undefined, "koru/css/imp3.lessimport": true});
        refute('koru/css/imp3.lessimport' in sut.sources);
      },

      "test remove": function () {
        test.stub(fst, 'readFile');
        v.loadDefaults();

        v.watcher('less', "koru/css/less-compiler-test.less", koru.appDir, v.session);

        assert.calledWith(v.session.sendAll, 'SL', 'koru/css/less-compiler-test.less');

        refute('koru/css/less-compiler-test.less' in sut.sources);
        refute('koru/css/less-compiler-test.less' in sut.loads);

        assert.equals(sut.imports['koru/css/less-compiler-test-imp.lessimport'], {});
      },
    },
  });
});
