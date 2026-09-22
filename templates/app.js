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
  var randomBtn = document.getElementById("random-btn");
  var toastEl = document.getElementById("toast");
  var notesCountEl = document.getElementById("notes-count");
  var notesCopyBtn = document.getElementById("notes-copy-btn");
  var notesClearBtn = document.getElementById("notes-clear-btn");
  var notesFallback = document.getElementById("notes-fallback");
  var notesFallbackText = document.getElementById("notes-fallback-text");
  var notesFallbackClose = document.getElementById("notes-fallback-close");
  var MOBILE_WIDTH = 760;

  // -----------------------------------------------------------------------
  // Per-page memo, kept in this browser's localStorage only (not part of
  // the Scrapbox export). Meant as a scratchpad while offline -- write
  // corrections/additions per page, then use "メモを全部コピー" once back
  // online to pull everything into one block of text and paste it into the
  // real Scrapbox project by hand.
  // -----------------------------------------------------------------------
  var NOTE_PREFIX = "sbnote:";

  function getNote(id) {
    try {
      return localStorage.getItem(NOTE_PREFIX + id) || "";
    } catch (e) {
      return "";
    }
  }

  function setNote(id, text) {
    try {
      if (text.trim() === "") {
        localStorage.removeItem(NOTE_PREFIX + id);
      } else {
        localStorage.setItem(NOTE_PREFIX + id, text);
      }
    } catch (e) {}
  }

  function allNoteIds() {
    var ids = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(NOTE_PREFIX) === 0) ids.push(k.slice(NOTE_PREFIX.length));
      }
    } catch (e) {}
    return ids;
  }

  // A single always-available scratchpad, independent of whatever page is
  // open -- shown under the notes bar on mobile (the list screen) or large
  // in #main on desktop (the home screen), never both at once. Uses a key
  // that can't collide with the per-page "sbnote:<id>" ones above.
  var GLOBAL_NOTE_KEY = "sbnote_global";
  var GLOBAL_NOTE_TITLE = "作業用ページ";

  function getGlobalNote() {
    try {
      return localStorage.getItem(GLOBAL_NOTE_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  function setGlobalNote(text) {
    try {
      if (text.trim() === "") {
        localStorage.removeItem(GLOBAL_NOTE_KEY);
      } else {
        localStorage.setItem(GLOBAL_NOTE_KEY, text);
      }
    } catch (e) {}
  }

  function updateNotesBar() {
    var ids = allNoteIds();
    var total = ids.length + (getGlobalNote().trim() ? 1 : 0);
    if (notesCountEl) notesCountEl.textContent = total ? total + " 件のメモ" : "メモなし";
    if (notesCopyBtn) notesCopyBtn.disabled = total === 0;
    if (notesClearBtn) notesClearBtn.disabled = total === 0;
  }

  function buildNotesText() {
    var parts = [];
    var globalText = getGlobalNote().trim();
    if (globalText) {
      parts.push("[" + GLOBAL_NOTE_TITLE + "]\n" + globalText);
    }
    allNoteIds().forEach(function (id) {
      var text = getNote(id).trim();
      if (!text) return;
      var title = pages[id] ? pages[id].t : id;
      parts.push("[" + title + "]\n" + text);
    });
    return parts.join("\n\n");
  }

  function showNotesFallback(text) {
    if (!notesFallback) return;
    notesFallbackText.value = text;
    notesFallback.classList.remove("hidden");
    notesFallbackText.focus();
    notesFallbackText.select();
  }

  // -----------------------------------------------------------------------
  // Bracket-link autocomplete for memo textareas (not the read-only page
  // bodies): typing "[" auto-closes it, wrapping any current selection like
  // Scrapbox does, and while the caret sits inside an unfinished "[...]" a
  // plain list of matching page titles appears below the textarea.
  //
  // Deliberately not caret-anchored -- positioning a popup at the caret
  // inside a <textarea> needs a hidden mirror-div to measure pixel offsets,
  // which is fiddly and easy to get subtly wrong, especially once the
  // mobile on-screen keyboard resizes the viewport. A fixed spot under the
  // field is a little less slick but far more robust.
  // -----------------------------------------------------------------------
  var titleList = order.map(function (id) { return pages[id].t; });

  function findBracketContext(value, caret) {
    var openIdx = -1;
    for (var i = caret - 1; i >= 0; i--) {
      var ch = value.charAt(i);
      if (ch === "]" || ch === "\n") return null;
      if (ch === "[") { openIdx = i; break; }
    }
    if (openIdx === -1) return null;
    var closeIdx = value.indexOf("]", caret);
    if (closeIdx === -1) return null;
    var between = value.slice(caret, closeIdx);
    if (between.indexOf("[") !== -1 || between.indexOf("\n") !== -1) return null;
    return { openIdx: openIdx, closeIdx: closeIdx, query: value.slice(openIdx + 1, caret) };
  }

  function matchTitles(query) {
    var q = query.trim().toLowerCase();
    if (!q) return [];
    var starts = [];
    var contains = [];
    for (var i = 0; i < titleList.length; i++) {
      var lc = titleList[i].toLowerCase();
      var idx = lc.indexOf(q);
      if (idx === 0 && starts.length < 8) starts.push(titleList[i]);
      else if (idx > 0 && contains.length < 8) contains.push(titleList[i]);
      if (starts.length >= 8 && contains.length >= 8) break;
    }
    return starts.concat(contains).slice(0, 8);
  }

  function attachBracketAutocomplete(textareaEl) {
    if (!textareaEl || textareaEl._bracketWired) return;
    textareaEl._bracketWired = true;

    var box = document.createElement("div");
    box.className = "note-suggest hidden";
    textareaEl.insertAdjacentElement("afterend", box);

    function hide() {
      box.classList.add("hidden");
      box.innerHTML = "";
    }

    function refresh() {
      if (textareaEl.selectionStart !== textareaEl.selectionEnd) { hide(); return; }
      var ctx = findBracketContext(textareaEl.value, textareaEl.selectionStart);
      if (!ctx) { hide(); return; }
      var matches = matchTitles(ctx.query);
      if (!matches.length) { hide(); return; }
      box.innerHTML = matches.map(function (t) {
        return '<div class="note-suggest-item">' + escapeHtml(t) + "</div>";
      }).join("");
      box.classList.remove("hidden");
    }

    function applyChoice(title) {
      var ctx = findBracketContext(textareaEl.value, textareaEl.selectionStart);
      if (!ctx) return;
      var val = textareaEl.value;
      textareaEl.value = val.slice(0, ctx.openIdx + 1) + title + val.slice(ctx.closeIdx);
      var pos = ctx.openIdx + 1 + title.length + 1;
      textareaEl.selectionStart = textareaEl.selectionEnd = pos;
      hide();
      textareaEl.focus();
      textareaEl.dispatchEvent(new Event("input"));
    }

    box.addEventListener("mousedown", function (e) {
      var item = e.target.closest ? e.target.closest(".note-suggest-item") : null;
      if (!item) return;
      e.preventDefault();
      applyChoice(item.textContent);
    });

    // beforeinput (not keydown) is what actually intercepts insertion
    // reliably on mobile: iOS Safari's software keyboard doesn't reliably
    // honor preventDefault() on keydown for plain character keys, so the
    // original "[" character would still land right where we'd just placed
    // the caret between our own auto-inserted brackets, producing "[[]"
    // instead of "[]". beforeinput is the modern, IME/soft-keyboard-safe
    // way to cancel and replace an about-to-happen text insertion.
    textareaEl.addEventListener("beforeinput", function (e) {
      if (e.inputType !== "insertText") return;
      if (e.data === "[") {
        e.preventDefault();
        var start = textareaEl.selectionStart, end = textareaEl.selectionEnd;
        var val = textareaEl.value;
        var inner = val.slice(start, end);
        textareaEl.value = val.slice(0, start) + "[" + inner + "]" + val.slice(end);
        var pos = start + 1 + inner.length;
        textareaEl.selectionStart = textareaEl.selectionEnd = pos;
        textareaEl.dispatchEvent(new Event("input"));
        refresh();
      } else if (e.data === "]") {
        var p = textareaEl.selectionStart;
        if (textareaEl.selectionStart === textareaEl.selectionEnd && textareaEl.value.charAt(p) === "]") {
          e.preventDefault();
          textareaEl.selectionStart = textareaEl.selectionEnd = p + 1;
          hide();
        }
      }
    });

    textareaEl.addEventListener("keydown", function (e) {
      if (e.key === "Escape") hide();
    });

    textareaEl.addEventListener("input", refresh);
    textareaEl.addEventListener("keyup", function (e) {
      if (e.key.indexOf("Arrow") === 0) refresh();
    });
    textareaEl.addEventListener("click", refresh);
    textareaEl.addEventListener("blur", function () {
      setTimeout(hide, 150); // let a suggestion's mousedown land first
    });
  }

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
      var noteBadge = getNote(pid) ? '<span class="note-badge" title="メモあり">&#9998;</span> ' : "";
      html.push('<a class="page-list-item" data-id="' + pid + '" href="#p/' + encodeURIComponent(pid) + '">' +
        '<div class="title">' + noteBadge + highlight(pg.t, q) + '</div>' +
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
      '<p>左のリストからページを選択するか、検索してください。（「/」キーで検索欄にフォーカス）</p>' +
      '<div class="global-note">' +
      '<h2>作業用メモ（この端末にのみ保存）</h2>' +
      '<textarea id="global-note-desktop" placeholder="ページに紐付かないメモを入力…"></textarea>' +
      '</div>';
    mainEl.scrollTop = 0;
    wireGlobalNote(document.getElementById("global-note-desktop"));
  }

  function wireGlobalNote(el) {
    if (!el) return;
    el.value = getGlobalNote();
    attachBracketAutocomplete(el);
    var timer = null;
    el.addEventListener("input", function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        setGlobalNote(el.value);
        updateNotesBar();
      }, 400);
    });
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
      '<div class="page-notes">' +
      '<h2>メモ（この端末にのみ保存）</h2>' +
      '<textarea class="note-textarea" placeholder="このページへのメモを入力…"></textarea>' +
      '</div>' +
      backlinksHtml;
    mainEl.scrollTop = 0;

    var noteEl = mainEl.querySelector(".note-textarea");
    noteEl.value = getNote(id);
    attachBracketAutocomplete(noteEl);
    var noteTimer = null;
    noteEl.addEventListener("input", function () {
      clearTimeout(noteTimer);
      noteTimer = setTimeout(function () {
        setNote(id, noteEl.value);
        updateNotesBar();
      }, 400);
    });
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

  if (randomBtn) {
    randomBtn.addEventListener("click", function () {
      if (!order.length) return;
      var currentId = (location.hash.match(/^#p\/(.+)$/) || [])[1];
      var pick = order[Math.floor(Math.random() * order.length)];
      // One retry so it doesn't visibly "land on the same page" when you
      // already happen to be there -- not a big deal either way with 10000+
      // pages, but cheap to avoid.
      if (currentId && decodeURIComponent(currentId) === pick && order.length > 1) {
        pick = order[Math.floor(Math.random() * order.length)];
      }
      location.hash = "p/" + encodeURIComponent(pick);
    });
  }

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

  if (notesCopyBtn) {
    notesCopyBtn.addEventListener("click", function () {
      var text = buildNotesText();
      if (!text) {
        showToast("メモがありません");
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          showToast("コピーしました");
        }).catch(function () {
          showNotesFallback(text);
        });
      } else {
        showNotesFallback(text);
      }
    });
  }

  if (notesClearBtn) {
    notesClearBtn.addEventListener("click", function () {
      var ids = allNoteIds();
      var hasGlobal = !!getGlobalNote().trim();
      var total = ids.length + (hasGlobal ? 1 : 0);
      if (!total) return;
      if (!confirm(total + " 件のメモを全て削除します。よろしいですか？")) return;
      ids.forEach(function (id) { setNote(id, ""); });
      setGlobalNote("");
      updateNotesBar();
      renderList();
      var noteEl = mainEl.querySelector(".note-textarea");
      if (noteEl) noteEl.value = "";
      var globalDesktopEl = document.getElementById("global-note-desktop");
      if (globalDesktopEl) globalDesktopEl.value = "";
      if (globalMobileEl) globalMobileEl.value = "";
      showToast("削除しました");
    });
  }

  if (notesFallbackClose) {
    notesFallbackClose.addEventListener("click", function () {
      notesFallback.classList.add("hidden");
    });
  }

  var globalMobileEl = document.getElementById("global-note-mobile");
  wireGlobalNote(globalMobileEl);

  renderList();
  route();
  updateNotesBar();

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
