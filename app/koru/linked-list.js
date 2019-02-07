define(()=>{
  const size$ = Symbol();

  class LinkedList {
    constructor() {this.clear()}

    get frontValue() {
      const {front} = this;
      return front && front.value;
    }

    get backValue() {
      const {back} = this;
      return back && back.value;
    }

    clear() {
      this.front = this.back = void 0;
      this[size$] = 0;
    }

    get size() {return this[size$]}

    push(value) {
      ++this[size$];
      if (this.front === void 0)
        return this.front = this.back = {value, next: void 0};
      else
        return this.front = {value, next: this.front};
    }

    popNode() {
      const node = this.front;
      if (node !== void 0) {
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
      if (prev === void 0)
        return this.addFront(value);
      else
        return prev.next = {value, next: prev.next};
    }

    addBack(value) {
      ++this[size$];
      if (this.front === void 0)
        return this.front = this.back = {value, next: void 0};
      else
        return this.back.next = this.back = {value, next: void 0};
    }

    removeNode(node, prev) {
      for (let curr = prev === void 0 ? this.front : prev.next;
           curr !== void 0; prev = curr, curr = curr.next ) {
        if (curr === node) {
          --this[size$];
          if (prev === void 0)
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
      for(let node = this.front; node !== void 0; node = node.next) {
        if (node.value !== void 0)
          callback(node.value);
      }
    }

    *values() {
      for(let node = this.front; node !== void 0; node = node.next)
        if (node.value !== void 0) yield(node.value);
    }

    *nodes() {
      for(let node = this.front; node !== void 0; node = node.next)
        yield(node);
    }
  }

  LinkedList.prototype.addFront = LinkedList.prototype.push;
  LinkedList.prototype[Symbol.iterator] = LinkedList.prototype.values;

  return LinkedList;
});
