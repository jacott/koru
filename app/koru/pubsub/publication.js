define((require, exports, module)=>{
  const koru            = require('koru');
  const DLinkedList     = require('koru/dlinked-list');
  const LinkedList      = require('koru/linked-list');
  const TransQueue      = require('koru/model/trans-queue');
  const Session         = require('koru/session');
  const message         = require('koru/session/message');
  const util            = require('koru/util');

  const pubName$ = Symbol(), unionNode$ = Symbol(), addQueue$ = Symbol(),
        subs$ = Symbol(), stopped$ = Symbol(), module$ = Symbol();

  const _pubs = Object.create(null);

  const deletePublication = (name)=>{
    delete _pubs[name];
  };

  const stopped = (sub)=>{
    sub[stopped$] = true;
    if (sub.conn._subs !== void 0) delete sub.conn._subs[sub.id];
  };

  class LoadQueue {
    constructor(union) {
      this.union = union;
      union[addQueue$] = this;

      this.subs = new LinkedList();
      // FIXME this.waitingSubs = new BTree();
    }

    add(sub) {
      // FIXME can be added to subs or waitingSubs?
      this.subs.push(sub);
      if (this.subs.size != 1) return;

      const msg = message.withEncoder('W', sub.conn._session.globalDict, encode =>{
        this.union.loadInitial((doc)=>{
          encode(['A', [doc.constructor.modelName, doc._id, doc.attributes]]);
        });
      });

      this.union[addQueue$] = void 0;

      for (const {conn} of this.subs) conn.sendEncoded(msg);
    }
  }

  class Union {
    constructor(pubClass) {
      this.pubClass = pubClass;
      this[subs$] = new DLinkedList(()=>{this.stopListeners()});
    }

    addSub(sub) {
      const subs = this[subs$];
      subs.head === null && this.initObservers();
      sub[unionNode$] = this[subs$].add(sub);

      (this[addQueue$] || new LoadQueue(this)).add(sub);
    }

    removeSub(sub) {
      const node = sub[unionNode$];
      if (node === void 0) return;
      sub[unionNode$] = void 0;
      node.delete();
    }

    stopListeners() {}
    initObservers() {}
    loadInitial() {}

    sendEncoded(msg) {
      for (const {conn} of this[subs$]) conn.sendEncoded(msg);
    }

    buildBatchUpdate() {
      let encoder = null;
      let future = null;

      const tidyUp = ()=>{
        future.return();
        encoder = future = null;
      };

      const {globalDict} = Session;

      return dc =>{
        const upd = this.pubClass.buildUpdate(dc);
        if (TransQueue.isInTransaction()) {
          if (encoder === null) {
            future = new util.Future;
            let msg;
            koru.runFiber(()=>{
              msg = message.withEncoder('W', globalDict, _encoder => {
                encoder = _encoder;
                future.wait();
              });
            });
            TransQueue.onSuccess(()=>{
              tidyUp();
              this.sendEncoded(msg);
            });
            TransQueue.onAbort(tidyUp);
          }
          encoder(upd);
        } else {
          this.sendEncoded(message.encodeMessage(...upd, globalDict));
        }
      };
    }
  }

  class Publication {
    constructor({id, conn, lastSubscribed}) {
      this.conn = conn;

      this.id = id;
      this.lastSubscribed = lastSubscribed;
      this[stopped$] = false;
    }

    init(args) {} // override me

    stop() {
      if (this[stopped$]) return;
      stopped(this);
      this.conn.sendBinary('Q', [this.id]);
    }

    get isStopped() {return this[stopped$]}

    get userId() {return koru.userId()}

    static get pubName() {return this[pubName$]}
    static set pubName(v) {
      if (Session._commands.Q !== subscribe)
        Session.provide('Q', subscribe);

      if (this[pubName$] !== void 0) {
        delete _pubs[this[pubName$]];
      }

      this[pubName$] = v;
      if (v !== void 0) _pubs[v] = this;
    }

    static set module(module) {
      this[module$] = module;
      const name = this.pubName = util.moduleName(module).replace(/Pub(?:lication)?$/, '');
      module.onUnload(()=>{deletePublication(name)});
    }

    static get module() {return this[module$]}

    static buildUpdate(dc) {
      const {doc, model: {modelName}} = dc;
      if (dc.isAdd)
        return ['A', [modelName, doc._id, doc.attributes]];
      else if (dc.isDelete)
        return ['R', [modelName, doc._id]];
      else  {
        return ['C', [modelName, doc._id, dc.changes]];
      }
    }
  }
  Publication.Union = Union;

  Publication.delete = deletePublication;

  function subscribe([id, msgId, name, args=[], lastSubscribed]) {
    const subs = this._subs;
    if (subs == null) return; // we are closed

    if (name === void 0) {
      const sub = subs[id];
      if (sub !== void 0) {
        stopped(sub);
        sub.stop();
      }
      return;
    }

    this.batchMessages();
    try {
      const Sub = _pubs[name];
      if (Sub === void 0) {
        const msg = 'unknown publication: ' + name;
        this.sendBinary('Q', [id, msgId, 500, msg]);
        koru.info(msg);
      } else {
        let sub;
        try {
          sub = subs[id] || (subs[id] = new Sub({id, conn: this, lastSubscribed}));
          sub.init(...args);
          subs[id] !== void 0 && this.sendBinary('Q', [
            id, msgId, 200, sub.lastSubscribed = util.dateNow()]); // ready

        } catch (ex) {
          if (ex.error === void 0)
            koru.unhandledException(ex);
          this.sendBinary('Q', [id, msgId, ex.error || 500, ex.reason]);
          if (sub !== void 0) {
            stopped(sub);
            sub.stop();
          }
        }
      }

      this.releaseMessages();
    } catch(ex) {
      this.abortMessages();
      throw ex;
    }
  }

  return Publication;
});
