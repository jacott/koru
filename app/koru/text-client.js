define(()=>{
  return {
    load: (name, onload)=>{
      const req = new XMLHttpRequest();

      req.addEventListener("load", ()=>{
        if (req.status == 200) { // found the file ok
          onload(req.responseText);
        } else {
          onload.error(new Error(req.statusText));
        }
      });

      req.addEventListener("error", ()=>{onload.error(new Error("Network Error"))});

      req.open('GET', name);
      req.send();
    }
  };
});
