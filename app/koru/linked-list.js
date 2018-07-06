define(()=>{
  class LinkedList {
    constructor() {
      this.head = this.tail = undefined;
    }

    addFront(value) {
      if (this.head === undefined)
        return this.head = this.tail = {value, next: undefined};
      else
        return this.head = {value, next: this.head};
    }

    addAfter(prev, value) {
      if (prev === undefined)
        return this.addFront(value);
      else
        return prev.next = {value, next: prev.next};
    }

    addBack(value) {
      if (this.head === undefined)
        return this.head = this.tail = {value, next: undefined};
      else
        return this.tail.next = this.tail = {value, next: undefined};
    }

    find(comp, prev) {
      for (let node = prev === undefined ? this.head : prev.next;
           node !== undefined; node = node.next ) {
        if (comp(node)) {
          return {prev, node};
        }
      }
    }

    removeNode(node, prev) {
      for (let curr = prev === undefined ? this.head : prev.next;
           curr !== undefined; curr = curr.next ) {
        if (curr === node) {
          if (prev === undefined)
            this.head = curr.next;
          else
            prev.next = curr.next;

          if (this.tail === curr)
            this.tail = prev;
          return curr;
        }
      }
    }

    remove(comp, arg) {
      let prev;
      for (let curr = this.head; curr !== undefined; curr = curr.next ) {
        if (comp(curr, arg)) {
          if (prev === undefined)
            this.head = curr.next;
          else
            prev.next = curr.next;

          if (this.tail === curr)
            this.tail = prev;
          return curr;
        }
      }
    }
  }

  return LinkedList;
});
