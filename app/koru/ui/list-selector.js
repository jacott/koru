define((require, exports, module)=>{
  'use strict';
  const Dom             = require('koru/dom');

  const chooseUp = (ul, curr)=> curr == null ? ul.lastElementChild : curr.previousElementSibling;
  const chooseDown = (ul, curr)=> curr == null ? ul.firstElementChild : curr.nextElementSibling;

  const noSelect = (cl)=> cl.contains('hide') || cl.contains('disabled') || cl.contains('sep');

  const keydownHandler = (event, ul, selected=ul.getElementsByClassName('selected'), onClick) =>{
    let nextElm, sel = null, curr;
    switch(event.which) {
    case 13: // enter
      curr = selected[0];
      if (curr !== void 0 && onClick !== void 0 && ! noSelect(curr.classList)) {
        Dom.stopEvent(event);
        onClick(curr, event);
      }
      return;
    case 38: // up
      nextElm = chooseUp;
      break;
    case 40: // down
      nextElm = chooseDown;
      break;
    default:
      return;
    }

    if (nextElm !== void 0) {
      Dom.stopEvent(event);
      curr = selected[0];
      if (ul.firstElementChild === null) return;
      for (let nSel = nextElm(ul, curr);
           nSel !== null;
           nSel = nSel === curr ? null : nextElm(ul, nSel)) {
        const cl = nSel.classList;
        if (noSelect(cl)) continue;
        curr !== void 0 && curr.classList.remove('selected');
        cl.add('selected');
        Dom.ensureInView(nSel);
        break;
      }
    }
  };

  return {
    attach: ({
      ul,
      ctx=Dom.ctx(ul),
      keydownElm=ul,
      onClick,
      onHover,
    })=>{
      let firstElm, curr, nSel;

      const selected = ul.getElementsByClassName('selected');

      const click = event =>{
        Dom.stopEvent(event);
        const li = event.target.closest('.ui-ul>li');
        if (li !== null && li.parentNode === ul && ! noSelect(li.classList)) {
          onClick(li, event);
        }
      };

      const pointerover = event =>{
        const {target} = event;
        if (target.parentNode === ul) {
          const cl = target.classList;
          if (! noSelect(cl)) {
            const curr = selected[0];
            if (curr !== target) {
              curr !== void 0 && curr.classList.remove('selected');
              cl.add('selected');
              onHover !== void 0 && onHover(target, event);
            }
          }
        }
      };

      const keydown = event =>{keydownHandler(event, ul, selected, onClick)};

      ul.addEventListener('pointerover', pointerover);
      ul.addEventListener('click', click);
      keydownElm.addEventListener('keydown', keydown, true);

      ctx.onDestroy(()=>{
        ul.removeEventListener('pointerover', pointerover);
        ul.removeEventListener('click', click);
        keydownElm.removeEventListener('keydown', keydown, true);
      });
    },

    keydownHandler,
  };
});
