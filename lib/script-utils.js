const path = require('path');
const fs = require('fs');
const execFileSync = require('child_process').execFileSync;

const koruTop = path.resolve(__dirname, '..');
let _topDir;

function pathExists(filename) {
  try {
    fs.accessSync(filename);
  } catch(ex) {
    if (ex.code !== 'ENOENT')
      throw ex;
    return false;
  }
  return true;
}

function stat(filename) {
  try {
    return fs.statSync(filename);
  } catch(ex) {
    if (ex.code !== 'ENOENT')
      throw ex;
  }
}

function updateFile(filename, func) {
  fs.writeFileSync(filename, func(fs.readFileSync(filename).toString()));
}

function system(cmd, ...args) {
  return execFileSync(cmd, args);
}

function fileizeString(value) {
  return value.replace(/[^\w]+/g, '-')
    .replace(/([a-z])(?=[A-Z])/g, '$1-').toLowerCase();
}

function classifyString(value) {
  return value.replace(/(?:-|^)([a-z])/g, (m, c) => c.toUpperCase());
}

function camelizeString(value) {
  return value.replace(/-([a-z])/g, (m, c) => c.toUpperCase());
}

function findTop() {
  let dir = process.cwd(), n;
  while (dir !== (n=path.dirname(dir))) {
    if (pathExists(path.resolve(dir, '.koru'))) {
      return dir;
    }
    dir = n;
  }
  throw new Error("You are not in a koru application directory!");
}

function skelDir(filename) {
  return path.resolve(koruTop+'/skel', filename);
}

function skelDir(filename) {
  return path.resolve(koruTop+'/skel', filename);
}

function topDir(filename) {
  return path.resolve(_topDir || (_topDir = findTop()), filename);
}

function template(inFilename, outFilename, opts) {
  if (! opts.force && pathExists(outFilename))
    throw new Error(`path: ${outFilename} exists! Not overwriting`);
  const inStat = fs.statSync(inFilename);
  let data = fs.readFileSync(inFilename).toString();

  fs.writeFileSync(outFilename, templateString(data, opts, inFilename));
  fs.chmodSync(outFilename, inStat.mode);
}

function templateString(code, opts, inFilename) {
  let charPos = 0;
  return code.split(/(\{\{(?:[^}]+)\}\}|\$\$(?:[\S]+)\$\$)/)
    .map((text, i) => {
      charPos += text.length;
      if (i%2 === 0) return text;
      text = text.slice(2,-2);
      const func = opts[text.split(/\W+/, 1)[0]];
      switch (typeof func) {
      case 'undefined':
        throw new Error(`No matching function for ${text} in template ${inFilename}`);
      case 'function':
        return func(text, charPos - text.length - 4);
      default:
        return func.toString();
      }
    }).join('');
}

function mkdir_p(dir) {
  var st = stat(dir);
  if (st) {
    if (st.isDirectory())
      return;
    const error = new Error('Not a direcorty');
    error.code = 'ENOTDIR';
    throw error;
  }

  var idx = 0;
  while((idx = dir.indexOf('/', idx+1)) !== -1) {
    var tpath = dir.slice(0, idx);
    var st = stat(tpath);
    if (st && ! st.isDirectory()) {
      var error = new Error('Not a direcorty');
      error.code = 'ENOTDIR';
      throw error;
    }
    if (! st) fs.mkdirSync(tpath);
  }
  fs.mkdirSync(dir);
}

function findFiles(dir, visitor) {
  const filenames = fs.readdirSync(dir).forEach(fn => {
    const fullname = path.join(dir, fn);
    const info = stat(fullname);
    if (info && info.isDirectory())
      return findFiles(fullname, visitor);
    visitor(dir, fn);
  });
}

function loadEnv(env) {
  system(topDir('config/environ.sh'), env, '--config').toString()
    .split('\n').forEach(l => {
      const m = /^([^=]+)=(.*$)$/.exec(l);
      if (m)
        process.env[m[1]]=m[2];
    });
}

module.exports = {
  camelizeString,
  classifyString,
  fileizeString,
  findFiles,
  findTop,
  koruTop,
  loadEnv,
  mkdir_p,
  pathExists,
  skelDir,
  system,
  template,
  topDir,
  updateFile,
};
