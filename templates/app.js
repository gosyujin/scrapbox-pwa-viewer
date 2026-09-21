(function () {
  "use strict";

  var raw = document.getElementById("sb-data").textContent;
  var DATA = JSON.parse(raw);
  var pages = DATA.pages; // { id: {t: title, h: html, c: created, u: updated, v: views, b: [backlink ids]} }
  var order = DATA.order; // array of ids, sorted by updated desc
  var meta = DATA.meta || {};

  var searchTextCache = Object.create(null);
  function tagStrip(html) {
    return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }
  function searchTextOf(id) {
    var cached = searchTextCache[id];
    if (cached !== undefined) return cached;
    var p = pages[id];
    var t = (p.t + "\n" + tagStrip(p.h)).toLowerCase();
    searchTextCache[id] = t;
    return t;
  }

  var appEl = document.getElementById("app");
  var listEl = document.getElementById("page-list");
  var mainEl = document.getElementById("main");
  var searchBox = document.getElementById("search-box");
  var searchMeta = document.getElementById("search-meta");
  var homeBtn = document.getElementById("home-btn");
  var updateBtn = document.getElementById("update-btn");
  var toastEl = document.getElementById("toast");
  var MOBILE_WIDTH = 760;

  function fmtDate(ts) {
    if (!ts) return "";
    var d = new Date(ts * 1000);
    function p2(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + "/" + p2(d.getMonth() + 1) + "/" + p2(d.getDate()) +
      " " + p2(d.getHours()) + ":" + p2(d.getMinutes());
  }

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function highlight(text, q) {
    if (!q) return escapeHtml(text);
    try {
      var re = new RegExp("(" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "ig");
      return escapeHtml(text).replace(re, "<mark>$1</mark>");
    } catch (e) {
      return escapeHtml(text);
    }
  }

  function snippetFor(id, q) {
    var p = pages[id];
    if (!q) return "";
    var txt = searchTextOf(id);
    var idx = txt.indexOf(q);
    if (idx === -1) return "";
    var start = Math.max(0, idx - 20);
    var plain = tagStrip(p.h);
    var seg = plain.slice(start, start + 80).trim();
    return seg;
  }

  var currentQuery = "";

  function renderList() {
    var q = currentQuery.trim().toLowerCase();
    var ids;
    var matchedByBody = false;
    if (!q) {
      ids = order;
    } else {
      var titleMatches = [];
      var bodyMatches = [];
      for (var i = 0; i < order.length; i++) {
        var id = order[i];
        var p = pages[id];
        if (p.t.toLowerCase().indexOf(q) !== -1) {
          titleMatches.push(id);
        } else if (searchTextOf(id).indexOf(q) !== -1) {
          bodyMatches.push(id);
        }
      }
      ids = titleMatches.concat(bodyMatches);
      matchedByBody = true;
    }

    var total = ids.length;
    var shown = ids.slice(0, 300);
    searchMeta.textContent = q
      ? total + " 件ヒット" + (total > shown.length ? "（先頭 " + shown.length + " 件を表示）" : "")
      : total + " ページ";

    var html = [];
    for (var j = 0; j < shown.length; j++) {
      var pid = shown[j];
      var pg = pages[pid];
      var snip = q ? snippetFor(pid, q) : "";
      html.push('<a class="page-list-item" data-id="' + pid + '" href="#p/' + encodeURIComponent(pid) + '">' +
        '<div class="title">' + highlight(pg.t, q) + '</div>' +
        '<div class="updated">' + fmtDate(pg.u) + '</div>' +
        (snip ? '<div class="snippet">' + highlight(snip, q) + '</div>' : '') +
        '</a>');
    }
    listEl.innerHTML = html.join("");
    markActive();
  }

  function markActive() {
    var current = location.hash.match(/^#p\/(.+)$/);
    var id = current ? decodeURIComponent(current[1]) : null;
    var items = listEl.querySelectorAll(".page-list-item");
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle("active", items[i].getAttribute("data-id") === id);
    }
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () {
      toastEl.classList.remove("show");
    }, 1800);
  }

  function renderHome() {
    document.title = meta.projectName || "Scrapbox Viewer";
    mainEl.innerHTML =
      '<div class="home-stats">' + order.length + ' ページ / エクスポート日時: ' + escapeHtml(meta.exportedAt || "") + '</div>' +
      '<p>左のリストからページを選択するか、検索してください。（「/」キーで検索欄にフォーカス）</p>';
    mainEl.scrollTop = 0;
  }

  function renderPage(id) {
    var p = pages[id];
    if (!p) {
      mainEl.innerHTML = '<p>ページが見つかりません。</p>';
      return;
    }
    document.title = p.t;
    var backlinksHtml = "";
    if (p.b && p.b.length) {
      var items = p.b.map(function (bid) {
        var bp = pages[bid];
        if (!bp) return "";
        return '<li><a class="link" data-id="' + bid + '" href="#p/' + encodeURIComponent(bid) + '">' + escapeHtml(bp.t) + '</a></li>';
      }).join("");
      backlinksHtml = '<div class="backlinks"><h2>このページを参照しているページ（' + p.b.length + '）</h2><ul>' + items + '</ul></div>';
    }
    mainEl.innerHTML =
      '<div class="page-header">' +
      '<h1>' + escapeHtml(p.t) + '</h1>' +
      '<div class="page-meta">更新: ' + fmtDate(p.u) + ' ／ 作成: ' + fmtDate(p.c) + ' ／ 閲覧数: ' + (p.v || 0) + '</div>' +
      '</div>' +
      '<div class="page-body">' + p.h + '</div>' +
      backlinksHtml;
    mainEl.scrollTop = 0;
  }

  function route() {
    var m = location.hash.match(/^#p\/(.+)$/);
    if (m) {
      appEl.classList.add("mode-page");
      renderPage(decodeURIComponent(m[1]));
    } else {
      appEl.classList.remove("mode-page");
      renderHome();
    }
    markActive();
  }

  // On mobile, using the search box always reveals the list (even while a
  // page is open), since the bottom bar stays on screen in both modes.
  function revealListOnMobile() {
    if (window.innerWidth <= MOBILE_WIDTH) {
      appEl.classList.remove("mode-page");
    }
  }

  // Delegated click handling for internal links rendered inside page bodies / backlinks.
  document.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest("a") : null;
    if (!a) return;
    if (a.classList.contains("link")) {
      var id = a.getAttribute("data-id");
      if (!id) {
        e.preventDefault();
        showToast("このページはまだ存在しません: " + a.textContent);
        return;
      }
      // let default hash navigation happen (href already set)
    }
  });

  searchBox.addEventListener("input", function () {
    currentQuery = searchBox.value;
    renderList();
    revealListOnMobile();
  });
  searchBox.addEventListener("focus", revealListOnMobile);

  window.addEventListener("hashchange", route);

  homeBtn.addEventListener("click", function () {
    searchBox.value = "";
    currentQuery = "";
    renderList();
    if (location.hash === "" || location.hash === "#") {
      appEl.classList.remove("mode-page");
      renderHome();
    } else {
      location.hash = "";
    }
    searchBox.blur();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && document.activeElement !== searchBox) {
      e.preventDefault();
      searchBox.focus();
    } else if (e.key === "Escape" && document.activeElement === searchBox) {
      searchBox.value = "";
      currentQuery = "";
      renderList();
      searchBox.blur();
    }
  });

  renderList();
  route();

  // ---------------------------------------------------------------------
  // Service worker: offline caching + update detection.
  //
  // Each rebuild embeds the export timestamp AND the build commit into
  // sw.js's CACHE_NAME, so its bytes differ from the previously installed
  // worker whenever either the Scrapbox data or the code changed. The
  // browser diffs sw.js on every registration.update() call; a diff
  // installs the new worker (which re-caches the page under the new cache
  // name), and since it calls self.skipWaiting() it takes over almost
  // immediately. When that happens the "controllerchange" listener below
  // reloads the page, so a fresh build applies itself automatically the
  // next time the app is opened/foregrounded while online. That soft check
  // isn't always prompt in every browser though, so the update button below
  // does a hard reset instead (unregister + clear caches + reload) as a
  // guaranteed fallback.
  // ---------------------------------------------------------------------
  var swReg = null;

  // Drop the update button's cache-busting "?_r=..." param once it's done
  // its job, so the cached page URL (and the address bar) stay clean.
  if (/[?&]_r=\d+/.test(location.search)) {
    history.replaceState(null, "", location.pathname + location.hash);
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      var page = encodeURIComponent(location.pathname.split("/").pop() + location.search);
      navigator.serviceWorker.register("sw.js?page=" + page).then(function (reg) {
        swReg = reg;
      }).catch(function () {});
    });

    navigator.serviceWorker.addEventListener("controllerchange", function () {
      location.reload();
    });

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && swReg) {
        swReg.update().catch(function () {});
      }
    });
  }

  if (updateBtn) {
    // A soft registration.update() check turned out to be unreliable in
    // practice (some browsers -- notably iOS Safari as a home-screen app --
    // don't always run it promptly), so the button does a hard reset
    // instead: drop the service worker and its caches entirely, then
    // reload with a cache-busting query so the network fetch can't be
    // served from anywhere stale, and re-register fresh from scratch.
    updateBtn.addEventListener("click", function () {
      if (navigator.onLine === false) {
        showToast("オフラインのため更新できません");
        return;
      }
      showToast("最新データを取得中…");
      var cleanup = Promise.resolve();
      if ("serviceWorker" in navigator) {
        cleanup = navigator.serviceWorker.getRegistrations().then(function (regs) {
          return Promise.all(regs.map(function (r) { return r.unregister(); }));
        });
      }
      if ("caches" in window) {
        cleanup = cleanup.then(function () {
          return caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (k) { return caches.delete(k); }));
          });
        });
      }
      cleanup.then(function () {
        location.href = location.pathname + "?_r=" + Date.now() + location.hash;
      }).catch(function () {
        location.reload();
      });
    });
  }
})();
