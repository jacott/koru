define((require, exports, module)=>{
  'use strict';

  const Dom             = require('koru/dom');

  const rippleElm = Dom.h({div: {}, class: 'ripple'});

  const ripple = event =>{
    const button = event.target;
    if (button.tagName !== 'BUTTON' && ! button.classList.contains('ripple-button')) return;

    rippleElm.classList.remove('animate', 'ripple-finished');
    const rect = button.getBoundingClientRect();

    let st = rippleElm.style;
    st.setProperty('width', rect.width + 'px');
    st.setProperty('height', rect.height + 'px');
    st = rippleElm.firstChild.style;
    if (st === null) return;
    const rippleSize = Math.sqrt(rect.width * rect.width +
                                 rect.height * rect.height) * 2 + 2;
    st.setProperty('width', rippleSize + 'px');
    st.setProperty('height', rippleSize + 'px');
    const translate = 'translate(-50%, -50%) ' +
          'translate(' + (event.clientX - rect.left) + 'px, ' + (event.clientY - rect.top) + 'px)';
    st.setProperty('transform', translate + ' scale(0.0001, 0.0001)');

    button.insertBefore(rippleElm, button.firstChild);
    window.requestAnimationFrame(()=>{
      rippleElm.classList.add('animate');
      st.setProperty('transform', translate);
    });

    const removeRipple = event =>{
      document.removeEventListener('pointerup', removeRipple, true);
      rippleElm.classList.add('ripple-finished');

    };
    document.addEventListener('pointerup', removeRipple, true);
  };

  return {
    stop: ()=>{document.removeEventListener('pointerdown', ripple, true)},
    start: ()=>{document.addEventListener('pointerdown', ripple, true)},
  };
});
