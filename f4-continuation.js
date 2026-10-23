/* F4: only a successful explicit confirmation may start the next empty verse. */
(function(root){
  let generation=0;
  root.RelayF4={
    enabled:()=>!!root.RelayFeatures?.enabled('F4'),
    ticket:()=>generation,
    cancel:()=>{generation++;},
    current:ticket=>ticket===generation,
    next(after,count,occupied,name){
      for(let index=after+1;index<count;index++) {
        if(occupied(index)) continue;
        if(root.RelayF5?.enabled() && root.RelayF5.owner(index+1)!==name) continue;
        if(root.RelayF2?.blocked(index+1)) continue;
        return index;
      }
      return -1;
    }
  };
})(globalThis);
