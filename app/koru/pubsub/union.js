define((require, exports, module)=>{
  const koru            = require('koru');
  const BTree           = require('koru/btree');
  const DLinkedList     = require('koru/dlinked-list');
  const LinkedList      = require('koru/linked-list');
  const TransQueue      = require('koru/model/trans-queue');
  const Session         = require('koru/session');
  const message         = require('koru/session/message');
  const ServerConnection = require('koru/session/server-connection');
  const util            = require('koru/util');

  const subs$ = Symbol(), addQueue$ = Symbol(), unionNode$ = Symbol();

  const WaitSubCompare = (a, b)=> a.time - b.time;

  const loadDocs = (lq, sub)=>{
    lq.discreteLastSubscribed = sub.discreteLastSubscribed;
    lq.minLastSubscribed = sub.lastSubscribed;

    const msg = sub.conn._session.withBatch(encode =>{
      lq.union.loadInitial(
        (doc)=>{encode(['A', [doc.constructor.modelName, doc.attributes]])},
        (doc, flag)=>{encode(['R', [doc.constructor.modelName, doc._id, flag]])},
        lq.minLastSubscribed);
    });

    lq.discreteLastSubscribed = NaN;

    let node = lq.subs.front;
    lq.subs.clear();
    const wnode = lq.waitingSubs.lastNode;
    if (wnode !== null) {
      lq.waitingSubs.deleteNode(wnode);
      lq.subs = wnode.value.queue;
    }

    for(; node !== void 0; node = node.next) {
      const {sub, future} = node.value;
      sub.conn.sendEncoded(msg);
      future !== void 0 && future.return();
    }

    if (lq.subs.size != 0) koru.runFiber(()=>{
      loadDocs(lq, lq.subs.back.value.sub);
    });

    lq.union[addQueue$] = void 0;
    const {msgQueue, union} = lq;
    for(let i = 0; i < msgQueue.length; ++i) {
      union.sendEncoded(msgQueue[i]);
    }
  };

  class LoadQueue {
    constructor(union) {
      this.union = union;
      union[addQueue$] = this;
      this.msgQueue = [];

      this.subs = new LinkedList();
      this.waitingSubs = new BTree(WaitSubCompare);
      this.discreteLastSubscribed = 0;
    }

    add(sub) {
      const time = sub.discreteLastSubscribed;
      if (this.subs.size !== 0) {
        const future = new util.Future;
        if (this.discreteLastSubscribed == time &&
            sub.lastSubscribed >= this.minLastSubscribed) {
          this.subs.push({sub, future});
        } else {
          const waiting = this.waitingSubs.find({time});
          if (waiting !== void 0) {
            const oldestSub = waiting.queue.back.value.sub;
            if (sub.lastSubscribed < oldestSub.lastSubscribed)
              waiting.queue.addBack({sub, future});
            else
              waiting.queue.push({sub, future});
          } else {
            const waiting = {time, queue: new LinkedList()};
            waiting.queue.push({sub, future});
            this.waitingSubs.add(waiting);
          }
        }
        future.wait();
      } else {
        this.subs.push({sub, future: void 0});
        loadDocs(this, sub);
      }
    }
  }

  const sendEncodedWhenIdle = (union, msg) => {
    const lq = union[addQueue$];
    if (lq === void 0)
      union.sendEncoded(msg);
    else
      lq.msgQueue.push(msg);
  };

  class Union {
    constructor() {
      this[subs$] = new DLinkedList(()=>{this.onEmpty()});
      this.handles = [];
      this.batchUpdate = this.buildBatchUpdate();
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

    onEmpty() {
      for (const h of this.handles) h.stop();
      this.handles.length = 0;
    }
    initObservers() {}
    loadInitial(addDoc, remDoc, minLastSubscribed) {}

    sendEncoded(msg) {
      for (const {conn} of this[subs$]) conn.sendEncoded(msg);
    }

    buildUpdate(dc) {
      return ServerConnection.buildUpdate(dc);
    }

    batchUpdate() {} // overriden during construction

    buildBatchUpdate() {
      let encoder = null;
      let future = null;

      const tidyUp = ()=>{
        future.return();
        encoder = future = null;
      };

      return dc =>{
        const upd = this.buildUpdate(dc);
        if (upd === void 0) return;
        if (TransQueue.isInTransaction()) {
          if (encoder === null) {
            future = new util.Future;
            let msg;
            koru.runFiber(()=>{
              msg = Session.withBatch(_encoder => {
                encoder = _encoder;
                future.wait();
              });
            });
            TransQueue.onSuccess(()=>{
              tidyUp();
              sendEncodedWhenIdle(this, msg);
            });
            TransQueue.onAbort(tidyUp);
          }
          encoder(upd);
        } else {
          sendEncodedWhenIdle(this, message.encodeMessage(...upd, Session.globalDict));
        }
      };
    }
  }

  return Union;
});
