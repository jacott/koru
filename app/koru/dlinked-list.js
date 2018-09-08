define(()=>{
  const head$ = Symbol(),
        next$ = Symbol(), prev$ = Symbol(), tail$ = Symbol();

  class Node {
    constructor(value, prev, next) {
      this.value = value;
      this[prev$] = prev;
      this[next$] = next;
    }

    delete() {
      if (this.value === undefined) return;
      this.value = undefined;
      this[prev$][next$] = this[next$];
      this[next$][prev$] = this[prev$];
    }
  }

  class DLinkedList {
    constructor(listEmpty) {
      this[head$] = this[tail$] = this;
      this.listEmpty = listEmpty || undefined;
    }
    set [next$](value) {
      this[head$] = value;
    }
    set [prev$](value) {
      this[tail$] = value;
      if (value === this) {
        const {listEmpty} = this;
        listEmpty === undefined || listEmpty();
      }
    }

    add(value) {
      const tail = this[tail$];
      const node = new Node(value, tail, this);
      this[tail$] = node;
      if (tail !== this)
        tail[next$] = node;
      if (this[head$] === this)
        this[head$] = node;

      return node;
    }

    forEach(callback) {
      for(let node = this[head$]; node !== this; node = node[next$]) {
        if (node.value !== undefined)
          callback(node.value);
      }
    }

    *values() {
      for(let node = this[head$]; node !== this; node = node[next$])
        if (node.value !== undefined) yield(node.value);
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
        node[prev$] = node[next$] = null;
        node = nn;
      }
      this[head$] = this[tail$] = this;
      const {listEmpty} = this;
      listEmpty === undefined || listEmpty(this.subject);
    }
  }

  DLinkedList.prototype[Symbol.iterator] = DLinkedList.prototype.values;

  return DLinkedList;
});
