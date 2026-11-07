// Keep previously published ensemble permalinks resolvable.
function openLegacyRun() {
  if (/^#sr215-s[1-9]\d*-/.test(location.hash)) {
    location.replace('./legacy.html' + location.hash);
  }
}
openLegacyRun();
window.addEventListener('hashchange', openLegacyRun);
