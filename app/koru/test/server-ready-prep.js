define((require, exports, module)=>{
  return (koru, BuildCmd)=>{
    koru.onunload(module, ()=>{
      BuildCmd.serverReady && BuildCmd.serverReady.return('ready');
    });
  };
});
