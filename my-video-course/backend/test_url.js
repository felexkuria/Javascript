try {
  new URL("invalid://::::");
} catch(e) { console.log(e.name, e.message); }
