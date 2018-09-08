define(()=>{
  const size$ = Symbol();

  class LinkedList {
    constructor() {this.clear()}


    clear() {
      this.front = this.back = undefined;
      this[size$] = 0;
    }

    get size() {return this[size$]}

    push(value) {
      ++this[size$];
      if (this.front === undefined)
        return this.front = this.back = {value, next: undefined};
      else
        return this.front = {value, next: this.front};
    }

    popNode() {
      const node = this.front;
      if (node !== undefined) {
        --this[size$];
        if (this.back === this.front)
          this.back = this.front.next;
        this.front = this.front.next;
      };
      return node;
    }

    pop() {
      const node = this.popNode();
      return node && node.value;
    }

    addAfter(prev, value) {
      ++this[size$];
      if (prev === undefined)
        return this.addFront(value);
      else
        return prev.next = {value, next: prev.next};
    }

    addBack(value) {
      ++this[size$];
      if (this.front === undefined)
        return this.front = this.back = {value, next: undefined};
      else
        return this.back.next = this.back = {value, next: undefined};
    }

    removeNode(node, prev) {
      for (let curr = prev === undefined ? this.front : prev.next;
           curr !== undefined; prev = curr, curr = curr.next ) {
        if (curr === node) {
          --this[size$];
          if (prev === undefined)
            this.front = curr.next;
          else
            prev.next = curr.next;

          if (this.back === curr)
            this.back = prev;
          return curr;
        }
      }
    }

    forEach(callback) {
      for(let node = this.front; node !== undefined; node = node.next) {
        if (node.value !== undefined)
          callback(node.value);
      }
    }

    *values() {
      for(let node = this.front; node !== undefined; node = node.next)
        if (node.value !== undefined) yield(node.value);
    }

    *nodes() {
      for(let node = this.front; node !== undefined; node = node.next)
        yield(node);
    }
  }

  LinkedList.prototype.addFront = LinkedList.prototype.push;
  LinkedList.prototype[Symbol.iterator] = LinkedList.prototype.values;

  return LinkedList;
});
