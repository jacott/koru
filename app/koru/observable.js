define(()=>{
  const head$ = Symbol(),
        next$ = Symbol(), prev$ = Symbol(), tail$ = Symbol();

  class Node {
    constructor(callback, prev, next) {
      this.callback = callback;
      this[prev$] = prev;
      this[next$] = next;

      this.stop = ()=>{
        if (this.callback === null) return;
        this.callback = null;
        this[prev$][next$] = this[next$];
        this[next$][prev$] = this[prev$];
      };
    }

    delete() {this.stop()}
  }

  class Observable {
    constructor(allStopped) {
      this[head$] = this[tail$] = this;
      this.allStopped = allStopped || undefined;
    }
    set [next$](value) {
      this[head$] = value;
    }
    set [prev$](value) {
      this[tail$] = value;
      if (value === this) {
        const {allStopped} = this;
        allStopped === undefined || allStopped();
      }
    }

    add(callback) {
      if (typeof callback !== 'function')
        throw new TypeError('callback is not a function');

      const tail = this[tail$];
      const node = new Node(callback, tail, this);
      this[tail$] = node;
      if (tail !== this)
        tail[next$] = node;
      if (this[head$] === this)
        this[head$] = node;

      return node;
    }

    notify(...args) {
      for(let node = this[head$]; node !== this; node = node[next$]) {
        if (node.callback !== null)
          node.callback(...args);
      }

      return args[0];
    }

    forEach(callback) {
      for(let node = this[head$]; node !== this; node = node[next$]) {
        if (node.callback !== null)
          callback(node);
      }
    }

    [Symbol.iterator]() {
      let node = null;
      return {next: ()=>{
        if (node !== this)
          node = node === null ? this[head$] : node[next$];

        return {done: node === this, value: node === this ? undefined : node};
      }};
    }

    stopAll() {
      let node = this[head$];
      if (node === this) return;
      while(node !== this) {
        const nn = node[next$];
        node[prev$] = node[next$] = null;
        node = nn;
      }
      this[head$] = this[tail$] = this;
      const {allStopped} = this;
      allStopped === undefined || allStopped(this.subject);
    }
  }

  Observable.prototype.onChange = Observable.prototype.add;

  return Observable;
});
