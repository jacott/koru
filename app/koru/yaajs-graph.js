define(function(require, exports, module) {
  exports.findPath = function (start, goal) {
    const goalId = goal.id;

    if (! start._requires)
      return;

    if (start._requires[goalId] !== undefined)
      return [start, goal];

    const {modules} = start.ctx;
    const visited = new Map;
    visited.set(start, null);

    function buildRow(prev, row=[]) {
      const reqs = prev._requires;
      if (! reqs) return row;
      for (let i in reqs)  {
        const mod = modules[i];
        if (! mod) continue;
        if (! visited.has(mod)) {
          visited.set(mod, prev);
          row.push(mod);
        }
      }
      return row;
    }

    let currentRow = buildRow(start);
    while(currentRow.length) {
      for (let mod of currentRow) {
        if (mod._requires &&
            mod._requires[goalId] !== undefined) {
          const result = [goal];
          while (mod) {
            result.push(mod);
            mod = visited.get(mod);
          }
          return result.reverse();
        }
      }
      const nextRow = [];
      for (let mod of currentRow) {
        buildRow(mod, nextRow);
      }
      currentRow = nextRow;
    }
  };

  exports.isRequiredBy =  function (supplier, user) {
    const goalId = supplier.id;

    if (! user._requires)
      return false;

    if (user._requires[goalId] !== undefined)
      return true;

    const {modules} = user.ctx;
    const visited = new Set;
    visited.add(user);

    function buildRow(visited, prev, row=[]) {
      const reqs = prev._requires;
      if (! reqs) return row;
      for (let i in reqs)  {
        const mod = modules[i];
        if (! mod) continue;
        if (! visited.has(mod)) {
          visited.add(mod);
          row.push(mod);
        }
      }
      return row;
    }

    let currentRow = buildRow(visited, user);
    while(currentRow.length) {
      for (let mod of currentRow) {
        if (mod._requires &&
            mod._requires[goalId] !== undefined) {
          return true;
        }
      }
      const nextRow = [];
      for (let mod of currentRow) {
        buildRow(visited, mod, nextRow);
      }
      currentRow = nextRow;
    }
    return false;
  };
});
