// Format labels for display while preserving the spelling stored on the repair.
window.ShopDisplay = (() => {
  function name(value) {
    return String(value ?? "").replace(/[\p{L}\p{M}]+/gu, word =>
      word === word.toLowerCase() ? word[0].toUpperCase() + word.slice(1) : word);
  }
  function vehicle(value) {
    return String(value ?? "").replace(/\S+/g, word => {
      if (word !== word.toLowerCase()) return word;
      if (/^(?:bmw|gmc|ram|vw)$/i.test(word)) return word.toUpperCase();
      if (/^(?=.*\d)[a-z]{1,3}[-\d]+[a-z]*$/i.test(word)) return word.toUpperCase();
      return word[0].toUpperCase() + word.slice(1);
    });
  }
  return { name, vehicle };
})();
