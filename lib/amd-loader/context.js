const contexts = {};

class Context {
  constructor(opts) {
    this.modules = {};
    this.paths = {};
    this.resolvingCount = 0;
    this.loadingCount = 0;
    this.waitReady = {};
    this.depCount = 0;
    this.moduleConfig = {};
    this.enforceDefine = false;
    contexts[this.name = opts.context ?? ''] = this;
    this.config(opts);
    this.require = new Context.Module(this, '').require;
  }

  uri(id, suffix='.js') {
    if (id == null) return;
    if (/(?:^(?:[a-z]+:\/)?\/|\.js$)/i.test(id)) {
      return id;
    }

    let {paths} = this;
    if (paths !== undefined) {
      const parts = id.split('/');
      let path;
      let i = 0;
      for (;i < parts.length; ++i) {
        paths = paths[parts[i]];
        if (! paths) break;
        if (paths['/location']) {
          path = [paths['/location']];
        } else {
          path?.push(parts[i]);
        }
      }
      if (path) {
        --i;
        while (++i < parts.length) path.push(parts[i]);
        id = path.join('/');
        if (/^(?:[a-z]+:\/)?\//i.test(path[0])) {
          return id + suffix;
        }
      }
    }

    return this.baseUrl + id + suffix;
  }

  normalizeId(id, dir) {
    const parts = [];
    if (id[0] === '.') {
      switch (id[1]) {
      case '/':
        id = dir ? dir + id.slice(2) : id.slice(2);
        break;
      case '.':
        const m = /^(?:\.\.\/)+/.exec(id);
        if (! m) break;
        const split = dir.split('/');
        const len = m[0].length;
        if (split.length * 3 < len + 3) {
          throw new Error(id + ': does not resolve within baseUrl');
        }
        split.length -= len / 3 + 1;
        if (split.length === 0) {
          id = id.slice(len);
        } else {
          id = split.join('/') + id.slice(len - 1);
        }
        break;
      case undefined:
        id = dir ? dir.slice(0, -1) : '';
        break;
      }
    }
    const path = this.packages?.[id];
    if (path !== undefined) {
      id += '/' + path;
    }

    return id;
  }

  exportsModule(value) {return this._exportMap.get(value)}

  static remove(name) {delete contexts[name]}

  config(opts) {
    if (! opts) return this;
    const name = opts.context;
    if (name !== undefined && name !== this.name) {
      return contexts[name] ? contexts[name].config(opts) : new Context(opts);
    }
    const value = opts.baseUrl;
    if (value !== undefined) {
      this.baseUrl = value;
      if (this.baseUrl.charAt(this.baseUrl.length - 1) !== '/') {
        this.baseUrl += '/';
      }
    }

    this.enforceAcyclic = !! opts.enforceAcyclic;
    opts.config && setNameValue(this, 'moduleConfig', opts.config);
    opts.paths && setPaths(this, opts.paths);
    opts.packages && setPackages(this, opts.packages);
    opts.shim && setNameValue(this, 'shim', opts.shim);
    if (opts.enforceDefine !== undefined) {
      this.enforceDefine = !! opts.enforceDefine;
    }
    if (opts.nodeRequire) this.nodeRequire = opts.nodeRequire;
    if (Context._onConfig) {
      Context._onConfig(this);
    }

    if (opts.recordExports) {
      this._exportMap = new WeakMap();
    }

    return this;
  }
}

const setPaths = (ctx, value) => {
  const paths = ctx.paths = {};
  for (const id in value) setPath(paths, id, value[id]);
};

const setPath = (paths, name, location) => {
  name.split('/').forEach((part) => {
    paths = paths[part] ??= {};
  });
  paths['/location'] = location;
};

const setNameValue = (ctx, name, value) => {
  const field = ctx[name] = {};
  for (const id in value) {
    field[ctx.normalizeId(id)] = value[id];
  }
};

const setPackages = (ctx, value) => {
  const packages = ctx.packages = {};
  value.forEach((entry) => {
    if (typeof entry === 'string') {
      packages[ctx.normalizeId(entry)] = 'main';
    } else {
      const {name, main='main'} = entry;
      if (entry.location != null) {
        setPath(ctx.paths, name, entry.location);
      }
      packages[ctx.normalizeId(name)] = main;
    }
  });
};

module.exports = Context;
