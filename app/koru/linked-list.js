define(()=>{
  class LinkedList {
    constructor() {
      this.front = this.back = undefined;
    }

    push(value) {
      if (this.front === undefined)
        return this.front = this.back = {value, next: undefined};
      else
        return this.front = {value, next: this.front};
    }

    popNode() {
      const node = this.front;
      if (node !== undefined) {
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
      if (prev === undefined)
        return this.addFront(value);
      else
        return prev.next = {value, next: prev.next};
    }

    addBack(value) {
      if (this.front === undefined)
        return this.front = this.back = {value, next: undefined};
      else
        return this.back.next = this.back = {value, next: undefined};
    }

    removeNode(node, prev) {
      for (let curr = prev === undefined ? this.front : prev.next;
           curr !== undefined; prev = curr, curr = curr.next ) {
        if (curr === node) {
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
  }

  LinkedList.prototype.addFront = LinkedList.prototype.push;

  return LinkedList;
});
