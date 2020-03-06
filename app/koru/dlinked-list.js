define(()=>{
  const head$ = Symbol(),
        next$ = Symbol(), prev$ = Symbol(), tail$ = Symbol();

  const value$ = Symbol();

  class Node {
    constructor(value=null, prev, next) {
      this[value$] = value;
      this[prev$] = prev;
      this[next$] = next;
    }

    delete() {
      if (this[value$] === void 0) return;
      this[value$] = void 0;
      this[prev$][next$] = this[next$];
      this[next$][prev$] = this[prev$];
    }

    get value() {return this[value$]}
    set value(v=null) {this[value$] = v}
  }

  class DLinkedList {
    constructor(listEmpty) {
      this[head$] = this[tail$] = this;
      this.listEmpty = listEmpty || void 0;
    }
    set [next$](value) {
      this[head$] = value;
    }
    set [prev$](value) {
      this[tail$] = value;
      if (value === this) {
        const {listEmpty} = this;
        listEmpty === void 0 || listEmpty();
      }
    }

    get head() {return this[head$] === this ? null : this[head$]}
    get tail() {return this[tail$] === this ? null : this[tail$]}

    add(value=null) {
      const tail = this[tail$];
      const node = new Node(value, tail, this);
      this[tail$] = node;
      if (tail !== this)
        tail[next$] = node;
      if (this[head$] === this)
        this[head$] = node;

      return node;
    }

    addFront(value=null) {
      const head = this[head$];
      const node = new Node(value, this, head);
      this[head$] = node;
      if (head !== this)
        head[prev$] = node;
      if (this[tail$] === this)
        this[tail$] = node;

      return node;
    }

    forEach(callback) {
      for(let node = this[head$]; node !== this; node = node[next$]) {
        if (node[value$] !== void 0)
          callback(node[value$]);
      }
    }

    *values() {
      for(let node = this[head$]; node !== this; node = node[next$])
        if (node[value$] !== void 0) yield(node[value$]);
    }

    *nodes() {
      for(let node = this[head$]; node !== this; node = node[next$])
        yield(node);
    }

    clear() {
      let node = this[head$];
      if (node === this) return;
      while(node !== this) {
        const nn = node[next$];
        node[value$] = void 0;
        node[prev$] = node[next$] = null;
        node = nn;
      }
      this[head$] = this[tail$] = this;
      const {listEmpty} = this;
      listEmpty === void 0 || listEmpty(this.subject);
    }
  }

  DLinkedList.prototype[Symbol.iterator] = DLinkedList.prototype.values;

  return DLinkedList;
});
