isServer && define((require, exports, module)=>{
  'use strict';
  const fw              = require('koru/file-watch');
  const fst             = require('koru/fs-tools');
  const koru            = require('koru/main');
  const session         = require('koru/session/main');
  const TH              = require('koru/test-helper');
  const util            = require('koru/util');
  const Future          = requirejs.nodeRequire('fibers/future');
  const fs              = requirejs.nodeRequire('fs');
  const Path            = requirejs.nodeRequire('path');

  const {stub, spy} = TH;

  const sut             = require('./less-watcher');

  let v = {};
  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      v.conn = {send: stub()};

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

      v.addTimestamps = map =>{
        let time = Date.now()+20*1000;

        for(const key in map) {
          const val = map[key];
          if (typeof val === 'object') {
            val.mtime = time-=2000;
          }
        }
        return map;
      };

      stub(fst, 'rm_f');
      sut.clearGraph(); // loader-test calls server which sets the graph
    });

    afterEach(()=>{
      sut.clearGraph();
      v = {};
    });

    group("loadRequest", ()=>{
      beforeEach(()=>{
        v.topDirLen = koru.appDir.length + 1;

        v.addTimestamps(v.expectedSources);
        const orig = fst.stat;
        stub(fst, 'stat', fn =>{
          fn = fn.slice(v.topDirLen);
          if (fn === 'koru/css/.build/less-compiler-test.less.css')
            fn = 'koru/css/less-compiler-test.less';

          const exp = v.expectedSources[fn];
          if (exp)
            return {mtime: new Date(exp.mtime)};
          else
            return orig.call(fst, fn);
        });

      });

      test("imports changed while system down", ()=>{
        v.expectedSources['koru/css/less-compiler-test-imp2.lessimport'].mtime = Date.now()+40*1000;

        session._commands.S.call(v.conn, 'LAkoru/css');

        assert.calledWith(fst.rm_f, Path.join(koru.appDir, 'koru/css/.build/less-compiler-test.less.css'));

        assert.msg("should use imp2 mtime for imp")
          .same(sut.sources['koru/css/less-compiler-test-imp.lessimport'].mtime,
                v.expectedSources['koru/css/less-compiler-test-imp2.lessimport'].mtime);

      });


      test("build graph", ()=>{
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

      });

      test("bad names", ()=>{
        'koru/.. koru/css/.build ../koru /koru koru/.dir'
          .split(' ').forEach(dir =>{
            assert.exception(()=>{
              session._commands.S.call(v.conn, 'LA'+dir);
            }, {error: 500, reason: 'Illegal directory name'});
          });
      });
    });

    group("watching", ()=>{
      beforeEach(()=>{
        v.session = {sendAll: stub()};

        v.watcher = fw.listeners.less;
        assert(v.watcher, "Should be registered with file-watch");

        v.loadDefaults = () => {
          sut.loadDirs['koru/css'] = true;
          util.merge(sut.loads, util.deepCopy(v.expectedLoads));
          util.merge(sut.imports, util.deepCopy(v.expectedImports));
          util.merge(sut.sources, util.deepCopy(v.expectedSources));
        };
      });

      test("lessimport change", ()=>{
        stub(fst, 'readFile').withArgs( koru.appDir+'/koru/css/my-imp.lessimport')
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
      });

      test("sends dependents", ()=>{
        stub(fst, 'readFile').withArgs( koru.appDir+'/koru/css/less-compiler-test-imp2.lessimport')
          .returns({toString() {return ''}});

        v.expectedImports['koru/css/less-compiler-test-imp2.lessimport']['foo/bar.less'] = true;

        v.loadDefaults();

        v.watcher('lessimport', "koru/css/less-compiler-test-imp2.lessimport", koru.appDir, v.session);

        assert.calledWith(v.session.sendAll, 'SL', 'koru/css/less-compiler-test.less foo/bar.less');

        assert.calledWith(fst.rm_f, koru.appDir+'/koru/css/.build/less-compiler-test.less.css');
        assert.calledWith(fst.rm_f, koru.appDir+'/foo/.build/bar.less.css');
      });

      test("less change", ()=>{
        stub(fst, 'readFile').withArgs( koru.appDir+'/koru/css/my-test.less')
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
      });

      test("remove", ()=>{
        stub(fst, 'readFile');
        v.loadDefaults();

        v.watcher('less', "koru/css/less-compiler-test.less", koru.appDir, v.session);

        assert.calledWith(v.session.sendAll, 'SL', 'koru/css/less-compiler-test.less');

        refute('koru/css/less-compiler-test.less' in sut.sources);
        refute('koru/css/less-compiler-test.less' in sut.loads);

        assert.equals(sut.imports['koru/css/less-compiler-test-imp.lessimport'], {});
      });
    });
  });
});
