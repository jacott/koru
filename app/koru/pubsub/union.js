define((require, exports, module)=>{
  'use strict';
  const koru            = require('koru');
  const BTree           = require('koru/btree');
  const DLinkedList     = require('koru/dlinked-list');
  const LinkedList      = require('koru/linked-list');
  const TransQueue      = require('koru/model/trans-queue');
  const Session         = require('koru/session');
  const message         = require('koru/session/message');
  const ServerConnection = require('koru/session/server-connection');
  const util            = require('koru/util');

  const subs$ = Symbol(), unionSym$ = Symbol(),
        loadQueue$ = Symbol();

  const WaitSubCompare = (a, b)=> a.time - b.time;

  class Encoder {
    constructor(session) {
      Object.assign(this, session.openBatch());
    }

    addDoc(doc) {
      this.push(['A', [doc.constructor.modelName, doc.attributes]]);
    }

    remDoc(doc, flag) {
      this.push(['R', [doc.constructor.modelName, doc._id, flag]]);
    }
  }

  class LoadQueueBase {
    constructor(union) {
      this.union = union;
      this.subs = new LinkedList();
    }

    static addSub(union, sub, token) {
      const subs = union[subs$];
      subs.head === null && union.initObservers();
      sub[union[unionSym$]] = subs.add(sub);

      let loadQueue = union[loadQueue$];
      let myQueue;
      if (loadQueue === null)
        loadQueue = union[loadQueue$] = {msgQueue: [], map: new Map()};
      else
        myQueue = loadQueue.map.get(this);
      myQueue === void 0 && loadQueue.map.set(this, myQueue = new this(union));
      myQueue.add(sub, token);
    }

    _loadDocsPart1(sub, loadInitial, token) {
      const encoder = new Encoder(sub.conn._session);
      const {encode, close} = sub.conn._session.openBatch();
      loadInitial.call(this.union, encoder, token);
      return encoder.encode();
    }

    _loadDocsPart2(msg, node) {
      const send = String.fromCharCode(msg[0]) !== 'W' || msg.length > 2;
      for(; node !== void 0; node = node.next) {
        const {sub, future} = node.value;
        send && sub.conn.sendEncoded(msg);
        future !== void 0 && future.return();
      }

      if (this.subs.size != 0) {
        const {value} = this.subs.back;
        const {future} = value;
        value.future = void 0;
        future.return(value);
      }

      const {union} = this;

      const loadQueue = union[loadQueue$];
      if (loadQueue !== null) {
        loadQueue.map.delete(this.constructor);
        if (loadQueue.map.size == 0) {
          union[loadQueue$] = null;
          const {msgQueue} = loadQueue;
          for(let i = 0; i < msgQueue.length; ++i) {
            union.sendEncoded(msgQueue[i]);
          }
        }
      }
    }
  }

  class LoadQueue extends LoadQueueBase {
    constructor(union) {
      super(union);
      this.waitingSubs = new BTree(WaitSubCompare);
      this.discreteLastSubscribed = 0;
    }

    add(sub, lastSubscribed) {
      const time = sub.constructor.discreteLastSubscribed(lastSubscribed);
      if (this.subs.size !== 0) {
        // loadDocs is running
        const future = new util.Future;
        if (this.discreteLastSubscribed == time &&
            lastSubscribed >= this.minLastSubscribed) {
          // My loadDocs is running
          this.subs.push({sub, future});
          future.wait();
          return;
        } else {
          const waiting = this.waitingSubs.find({time});
          if (waiting !== void 0) {
            // My loadDocs is queued
            const oldestSub = waiting.queue.back.value;
            if (lastSubscribed < oldestSub.lastSubscribed)
              waiting.queue.addBack({sub, lastSubscribed, future});
            else
              waiting.queue.push({sub, lastSubscribed, future});
          } else {
            const waiting = {time, queue: new LinkedList()};
            waiting.queue.push({sub, lastSubscribed, future});
            this.waitingSubs.add(waiting);
          }
          const value = future.wait();
          if (value !== void 0)
            this.loadDocs(sub, value);
        }
      } else {
        // no loadDocs in progress
        const value = {sub, lastSubscribed, future: void 0};
        this.subs.push(value);
        this.loadDocs(sub, value);
      }
    }

    loadDocs(sub, {lastSubscribed}) {
      this.discreteLastSubscribed = sub.constructor.discreteLastSubscribed(lastSubscribed);
      this.minLastSubscribed = lastSubscribed;

      const msg = this._loadDocsPart1(sub, this.union.loadInitial, this.minLastSubscribed);

      this.discreteLastSubscribed = NaN;

      let node = this.subs.front;
      this.subs.clear();
      const wnode = this.waitingSubs.lastNode;
      if (wnode !== null) {
        this.waitingSubs.deleteNode(wnode);
        this.subs = wnode.value.queue;
      }

      this._loadDocsPart2(msg, node);
    }
  }

  class LoadQueueByToken extends LoadQueueBase {
    constructor(union) {
      super(union);
      this.waitingSubs = new Map();
      this.token = null;
    }

    add(sub, token) {
      if (this.subs.size !== 0) {
        // loadDocs is running
        const future = new util.Future;
        if (this.token === token) {
          // My loadDocs is running
          this.subs.push({sub, future});
        } else {
          const waiting = this.waitingSubs.get(token);
          if (waiting !== void 0) {
            // My loadDocs is queued
            waiting.queue.push({sub, future});
          } else {
            const waiting = {token, queue: new LinkedList()};
            waiting.queue.push({sub, future});
            this.waitingSubs.set(token, waiting);
          }
        }
        const value = future.wait();
        if (value !== void 0)
          this.loadDocs(sub, token);
      } else {
        this.subs.push({sub, future: void 0});
        this.loadDocs(sub, token);
      }
    }

    loadDocs(sub, token) {
      this.token = token;

      const msg = this._loadDocsPart1(sub, this.union.loadByToken, token);

      this.token = null;

      let node = this.subs.front;
      this.subs.clear();
      for (const waiting of this.waitingSubs.values()) {
        token = waiting.token;
        this.waitingSubs.delete(token);
        this.subs = waiting.queue;
        break;
      }

      this._loadDocsPart2(msg, node);
    }
  }

  class Union {
    constructor() {
      this[subs$] = new DLinkedList(()=>{this.onEmpty()});
      this.handles = [];
      this[loadQueue$] = null;
      this.batchUpdate = this.buildBatchUpdate();
      this.count = 0;
      this[unionSym$] = Symbol();
    }

    hasSub(sub) {
      return sub[this[unionSym$]] !== void 0;
    }

    addSub(sub, lastSubscribed=sub.lastSubscribed) {
      if (sub[this[unionSym$]] !== void 0) return;
      this.count++;
      LoadQueue.addSub(this, sub, lastSubscribed);
    }

    addSubByToken(sub, token) {
      if (sub[this[unionSym$]] !== void 0) return;
      this.count++;
      LoadQueueByToken.addSub(this, sub, token);
    }

    removeSub(sub) {
      const node = sub[this[unionSym$]];
      if (node === void 0) return;
      this.count--;
      sub[this[unionSym$]] = void 0;
      node.delete();
    }

    onEmpty() {
      for (const h of this.handles) h.stop();
      this.handles.length = 0;
    }

    // overriden by subclasses
    initObservers() {}
    loadInitial(encoder, minLastSubscribed) {}
    loadByToken(encoder, token) {}

    encodeUpdate(dc) {
      return message.encodeMessage(...this.buildUpdate(dc), Session.globalDict);
    }

    sendEncoded(msg) {
      for (const {conn} of this[subs$]) conn.sendEncoded(msg);
    }

    sendEncodedWhenIdle(msg) {
      const loadQueue = this[loadQueue$];
      if (loadQueue === null)
        this.sendEncoded(msg);
      else
        loadQueue.msgQueue.push(msg);
    }

    subs() {return this[subs$].values()}

    buildUpdate(dc) {return ServerConnection.buildUpdate(dc)}

    batchUpdate() {} // overriden during construction

    buildBatchUpdate() {
      let push = null;

      const tidyUp = ()=>{push = null};

      return dc =>{
        const upd = this.buildUpdate(dc);
        if (upd === void 0) return;
        if (TransQueue.isInTransaction()) {
          if (push === null) {
            let msg;
            const obj = Session.openBatch();
            push = obj.push;
            push(upd);
            TransQueue.onSuccess(()=>{
              msg = obj.encode();
              tidyUp();
              this.sendEncodedWhenIdle(msg);
            });
            TransQueue.onAbort(tidyUp);
          } else
            push(upd);
        } else {
          this.sendEncodedWhenIdle(message.encodeMessage(...upd, Session.globalDict));
        }
      };
    }
  }

  return Union;
});
