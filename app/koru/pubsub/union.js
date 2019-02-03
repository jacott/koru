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

    const msg = message.withEncoder('W', sub.conn._session.globalDict, encode =>{
      lq.union.loadInitial((doc)=>{
        encode(['A', [doc.constructor.modelName, doc._id, doc.attributes]]);
      }, lq.discreteLastSubscribed);
    });

    lq.union[addQueue$] = void 0;

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
  };

  class LoadQueue {
    constructor(union) {
      this.union = union;
      union[addQueue$] = this;

      this.subs = new LinkedList();
      this.waitingSubs = new BTree(WaitSubCompare);
      this.discreteLastSubscribed = 0;
    }

    add(sub) {
      const time = sub.discreteLastSubscribed;
      if (this.subs.size !== 0) {
        const future = new util.Future;
        if (this.discreteLastSubscribed == time) {
          this.subs.push({sub, future});
        } else {
          const waiting = this.waitingSubs.find({time});
          if (waiting !== void 0) {
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
    loadInitial(addDoc, discreteLastSubscribed) {}

    sendEncoded(msg) {
      for (const {conn} of this[subs$]) conn.sendEncoded(msg);
    }

    buildUpdate(dc) {
      return ServerConnection.buildUpdate(dc);
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
        const upd = this.buildUpdate(dc);
        if (upd === void 0) return;
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

  return Union;
});
