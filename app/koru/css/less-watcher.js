const Path = require('path');

define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const fw              = require('koru/file-watch');
  const fst             = require('koru/fs-tools');
  const queue           = require('koru/queue')();
  const session         = require('koru/session');
  const util            = require('koru/util');

  const topDir = koru.appDir;
  const topDirLen = koru.appDir.length + 1;

  let loads = Object.create(null);
  let imports = Object.create(null);
  let sources = Object.create(null);
  let loadDirs = Object.create(null);

  session.provide('S', async function loadRequest(data) {
    if (data.slice(0, 2).toString() === 'LA') {
      this.send('SL', (await findAll(data.slice(2).toString())).join(' '));
    }
  });

  const findAll = async (dir) => {
    if (dir.match(/(^[./]|[./]\.)/)) throw new koru.Error(500, 'Illegal directory name');

    loadDirs[dir] || await queue(dir, async (isNew, result) => {
      if (loadDirs[dir]) return;

      const findAll1 = async (dir) => {
        let m;
        const dirPath = Path.join(topDir, dir);
        const filenames = (await fst.readdir(dirPath))
              .filter((fn) => /^[\w-]*(?:\.(css|less)$|$)/.test(fn));
        const stats = filenames.map((filename) => fst.stat(Path.join(dirPath, filename)));

        for (let i = 0; i < filenames.length; ++i) {
          const fn = Path.join(dir, filenames[i]);
          if (fn in loads) continue;

          if (m = filenames[i].match(/^\w.*(less|css)$/)) {
            if (m[1] === 'less') {
              await extractInfo(fn);
            } else {
              loads[fn] = true;
            }
          } else if ((await stats[i]).isDirectory()) {
            await findAll1(fn);
          }
        }
      };

      const prefixLen = dir.length + 1;
      await findAll1(dir);

      loadDirs[dir] = true;
    });

    const re = new RegExp('^' + util.regexEscape(dir));

    const results = [];

    for (const key in loads) {
      re.test(key) && results.push(key);
    }

    return results;
  };

  const extractInfo = async (srcName, fromName) => {
    let fullname, src;
    if (srcName[0] !== '.') {
      fullname = Path.join(topDir, srcName);
      try {
        src = await fst.readFile(fullname);
      } catch (ex) {}
    }
    if (! src) {
      fullname = Path.resolve(topDir, Path.dirname(fromName || ''), srcName);
      try {
        src = await fst.readFile(fullname);
        srcName = fullname.slice(topDirLen);
        fullname = Path.join(topDir, srcName);
        src = await fst.readFile(fullname);
      } catch (ex) {
        if (ex.code === 'ENOENT') {
          ex.message = "ENOENT @import '" + srcName + "' from '" + fromName + '"';
          koru.error(ex);
        }
      }
    }

    let provs = sources[srcName];
    if (! src) {
      if (provs) for (const id in provs) {
        const imp = imports[id];
        if (imp) delete imp[srcName];
      }

      delete sources[srcName];

      fromName || delete loads[srcName];

      return;
    }

    let st;
    if (fromName) {
      st = await fst.stat(fullname);
    } else {
      st = await fst.stat(buildName(fullname));
      loads[srcName] = true;
    }

    st = st && + st.mtime;

    src = src.toString();

    const dir = Path.dirname(fullname);

    const re = /(?:^|\n)\s*@import[\s]*"([^"]*\.lessimport)"/g;

    let m;

    if (! provs) provs = sources[srcName] = {};
    provs.mtime = st;

    while (m = re.exec(src)) {
      const imp = Path.resolve(Path.join(dir, m[1])).slice(topDirLen);
      let deps = imports[imp], imt;
      if (! deps) {
        imports[imp] = deps = Object.create(null);
        imt = await extractInfo(imp, srcName);
      } else {
        imt = sources[imp] && sources[imp].mtime;
      }

      if (st && imt && imt > st) {
        st = imt;
      }

      provs[imp] = true;
      deps[srcName] = true;
    }

    if (st && provs.mtime && st > provs.mtime) {
      if (fromName) {
        provs.mtime = st; // propagate most recent time
      } else {
        await fst.rm_f(buildName(fullname));
      }
    }

    return st;
  };

  const buildName = (fullname) => {
    return Path.join(Path.dirname(fullname),
                     '.build', Path.basename(fullname) + '.css');
  };

  const watchLess = async (type, path, top, session) => {
    let prefix = Path.dirname(path);
    while (prefix.length > 1 && ! loadDirs[prefix]) {
      prefix = Path.dirname(prefix);
    }

    if (! loadDirs[prefix]) return;

    await queue(path, async (queue) => {
      await extractInfo(path, type === 'less' ? null : path);
      if (queue.isPending) return;
      if (type === 'less') {
        session.sendAll('SL', path);
      } else {
        const list = [];

        let count = 0;

        const findDeps = async (name) => {
          const deps = imports[name];

          if (deps) for (const key in deps) {
            if (/\.lessimport$/.test(key)) {
              ++count < 20 && await findDeps(key);
            } else {
              list.push(key);
              await fst.rm_f(buildName(Path.join(topDir, key)));
            }
          }
        };
        await findDeps(path);
        if (queue.isPending || list.length === 0) {
          return;
        }
        session.sendAll('SL', list.join(' '));
      }
    });
  };

  koru.onunload(module, 'reload');

  fw.listeners['less'] = watchLess;
  fw.listeners['lessimport'] = watchLess;

  return {
    get loads() {return loads},
    get imports() {return imports},
    get sources() {return sources},
    get loadDirs() {return loadDirs},
    clearGraph() {
      loads = Object.create(null);
      imports = Object.create(null);
      sources = Object.create(null);
      loadDirs = Object.create(null);
    },
  };
});
