define((require, exports, module)=>{
  const Dom             = require('koru/dom');

  const COUNTER = Dom.h({class: 'ui-charCounter', div: {div: [{span: ''}, {span: ''}]}});

  const OB_DataChange = {
    subtree: true, childList: true,
    characterData: true,
  };

  const countText = (editor)=>{
    let size = 0;
    for (let node = editor.firstChild; node !== null; node = node.nextSibling) {
      const {nodeType} = node;
      if (nodeType === document.TEXT_NODE)
        size += node.nodeValue.length;
      else if (nodeType === 1) {
        if (node.tagName === 'BR') ++size;
        else size += countText(node);
      }
    }
    return size;
  };


  class CharacterCounter {
    constructor({maxlength=0, warninglength=Math.floor(maxlength*.9)}) {
      this.maxlength = maxlength;
      this.warninglength = warninglength;
      this.element = COUNTER.cloneNode(true);
      this.mutationObserver = new window.MutationObserver(muts =>{
        if (muts.length == 0) return;
        this.checkNow();
      });
      this.editor = null;
    }

    attach(editor=null) {
      if (this.editor !== null) this.mutationObserver.disconnect();
      this.editor = editor;
      if (editor == null) return;


      const counter = this.element.firstChild;
      counter.classList.remove('ui-error', 'ui-warn');
      if (this.maxlength != 0) counter.lastChild.textContent = ''+this.maxlength;
      this.prevSize = 0;
      this.mutationObserver.observe(editor, OB_DataChange);
      this.checkNow();
    }

    checkNow() {
      if (this.editor === null || this.editor.parentNode === null) {
        this.mutationObserver.disconnect();
        this.editor = null;
        return;
      }
      const size = countText(this.editor);

      const counter = this.element.firstChild;
      counter.firstChild.textContent = ''+size;

      const {warninglength, maxlength, prevSize} = this;

      if (warninglength <= size) {
        warninglength > prevSize && counter.classList.add('ui-warn');

        if (maxlength < size)
          maxlength >= prevSize && counter.classList.add('ui-error');
        else
          maxlength < prevSize && counter.classList.remove('ui-error');
      } else {
        warninglength <= prevSize && counter.classList.remove('ui-warn');
        maxlength < prevSize && counter.classList.remove('ui-error');
      }
      this.prevSize = size;
    }
  };

  return CharacterCounter;
});
