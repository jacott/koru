define((require)=>{
  const koru            = require('koru');
  const DocChange       = require('koru/model/doc-change');
  const Query           = require('koru/model/query');
  const util            = require('koru/util');
  const Trace           = require('../trace');
  const publish         = require('./publish-client');

  const {private$} = require('koru/symbols');

  let debug_subscribe = false;
  Trace.debug_subscribe = value =>{debug_subscribe = value};

  const stopSub = sub=>{
    const {_id} = sub;
    if (_id === null) return;
    debug_subscribe && koru.logger('D', (sub.waiting ? '' : '*')+'DebugSub >',
                                   _id, sub.name, 'STOP');
    const {session} = sub;
    session.sendP(_id);
    stopped(sub);
    if (! sub.waiting) return;

    sub.waiting = false;
    session.state.decPending();
  };

  const filterStopped = doc =>{
    if (! publish.match.has(doc, 'stopped')) {
      const model = doc.constructor;
      const simDocs = Query.simDocsFor(model);
      const sim = simDocs[doc._id];
      if (sim !== undefined)
        delete simDocs[doc._id];
      delete model.docs[doc._id];
      Query.notify(DocChange.delete(doc, 'stopped'));
    }
  };

  const stopped = (sub)=>{
    if (sub._id === null) return;

    delete sub.session.subs[sub._id];
    const {_stop} = sub;
    killMatches(sub._matches);
    sub._id = sub._stop = sub._matches = sub.callback = null;
    _stop != null && _stop(sub, filterStopped);
  };

  const killMatches = (matches, models)=>{
    for (const name in matches) {
      if (models !== undefined)
        models[name] = true;
      matches[name].delete();
    };
  };

  class ClientSub {
    constructor(session, subId, name, args) {
      this.session = session;
      this._id = subId;
      this._matches = {};
      this.name = name;
      this._subscribe = publish._pubs[name];
      this.stop = ()=>{stopSub(this)};
      this.waiting = false;
      this.repeatResponse = false;
      const cb = args[args.length - 1];
      this.args = args;
      this.callback = typeof cb === 'function' ? (args.pop(), cb) : null;
      this.lastSubscribed = 0;
    }

    onResponse(callback) {
      this.callback = callback;
      this.repeatResponse = true;
    }

    onFirstResponse(callback) {
      this.callback = callback;
    }

    get userId() {
      return koru.userId();
    }

    isStopped() {
      return ! this._id;
    }

    _wait() {
      debug_subscribe && koru.logger('D', (this.waiting ? '*' : '')+'DebugSub >',
                                     this._id, this.name, JSON.stringify(this.args));
      if (this.waiting) return;

      this.waiting = true;
      this.session.state.incPending();
    }

    _received(code, data) {
      debug_subscribe && koru.logger('D', (this.waiting ? '' : '*')+'DebugSub <',
                                     this._id, this.name, code);
      const callback = this.callback;
      if (code !== 200)
        stopped(this);
      else
        this.lastSubscribed = data;
      if (! this.waiting) return;

      this.waiting = false;
      this.session.state.decPending();
      if (callback !== null) {
        code === 200 ? callback(null) : callback([code, data]);
        if (! this.repeatResponse)
          this.callback = null;
      }
    }

    error(err) {
      koru.error(err);
      this.stop();
    }

    onStop(func) {
      this._stop = func;
    }

    filterModels(...modelNames) {
      const models = {};
      util.forEach(modelNames, mn => {models[mn] = true});
      publish._filterModels(models);
    }

    match(modelName, func) {
      if (typeof modelName !== 'string')
        modelName = modelName.modelName;
      const {_matches} = this;
      if (_matches[modelName] !== undefined)
        _matches[modelName].delete();
      this._matches[modelName] = publish.match.register(modelName, func);
    }
  }

  ClientSub[private$] = {
    resubscribe: (sub, models)=>{
      const {resubscribe} = sub._subscribe;
      const matches = sub._matches;
      if (resubscribe !== undefined) {
        try {
          resubscribe.call(sub, sub);
        } catch(ex) {
          koru.unhandledException(ex);
        }
      }
      if (matches !== undefined) for (const modelName in matches)
        models[modelName] = true;
    },

    subscribe: sub =>{
      sub._subscribe.init.apply(sub, sub.args);
    },
  };

  return ClientSub;
});
