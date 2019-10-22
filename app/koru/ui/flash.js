define((require, exports, module)=>{
  const koru            = require('koru');
  const Dom             = require('koru/dom');
  const format          = require('koru/format');

  const Tpl = Dom.newTemplate(module, require('koru/html!./flash'));
  const {Message} = Tpl;

  const hint = Dom.h({id: 'hint', div: ['']});

  const display = ({message, transient, type='notice'}, {lang='en', timeout=7000})=>{
    if (typeof message === 'string' || (message.constructor === Array))
      message = format.translate(message, lang);
    let flash = document.getElementById('Flash');
    if (flash) {
      flash.classList.remove('remElm');

      Dom.forEach(flash, '#Flash>.m.transient:not(.remElm)', elm => {
        if (elm.textContent === message)
          Dom.remove(elm);
        else
          Dom.hideAndRemove(elm);
      });
    } else {
      flash = Tpl.$autoRender();
      document.body.appendChild(flash);
    }

    const classes = `m ${type}${transient ? ' transient' : ''}`;
    const elm = Message.$autoRender({classes, message});
    const ctx = Dom.myCtx(elm);
    flash.insertBefore(elm, flash.firstChild);
    transient && ctx.onDestroy(koru.afTimeout(() => {close(elm)}, timeout));
    return elm;
  };

  const close = (elm)=>{
    const flash = elm.parentNode;
    Dom.hideAndRemove(elm);
    if (! flash.querySelector('.m:not(.remElm)'))
      Dom.hideAndRemove(flash);
  };

  Tpl.$events({
    'click .m'(event) {
      if (event.target.closest('a') !== null)
        return;
      Dom.stopEvent();

      close(this);
    },
  });

  Tpl.$extend({
    close,
    error: (message, options={})=> display({message, type: 'error', transient: true}, options),

    notice: (message, options={})=> display({message, transient: true}, options),

    confirm: (message, options={})=> display({message, transient: false}, options),

    get hintText() {return hint.firstChild.textContent},

    hint: message =>{
      hint.firstChild.textContent = message;
      if (message != null) {
        document.body.appendChild(hint);
        Tpl.revealHint();
      }
    },

    hideHint: ()=>{hint.style.setProperty('opacity', '0')},

    revealHint: ()=>{hint.style.removeProperty('opacity')},
  });

  return Tpl;
});
