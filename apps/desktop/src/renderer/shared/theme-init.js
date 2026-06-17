(function () {
  try {
    var raw = localStorage.getItem("bailin.theme");
    var pref = raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
    var dark =
      pref === "dark" ||
      (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  } catch (_e) {
    /* ignore */
  }
})();
