#!/usr/bin/env python3
"""Convert a Scrapbox project export (JSON) into a single self-contained,
offline-capable HTML viewer with full-text search and backlinks.

Usage:
    python3 build.py --input export.json --output output/viewer.html
"""

import argparse
import datetime
import html
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------------------
# Scrapbox inline syntax
# ---------------------------------------------------------------------------

URL_RE = re.compile(r"https?://[^\s\]]+")
HASHTAG_RE = re.compile(r"#([^\s\[\]#]+)")
FULL_URL_RE = re.compile(r"^https?://\S+$")
IMG_EXT_RE = re.compile(r"\.(png|jpe?g|gif|webp|svg)(\?\S*)?$", re.I)
GYAZO_RE = re.compile(r"^https?://(i\.)?gyazo\.com/[0-9a-fA-F]+", re.I)
# Scrapbox treats ANY leading run of non-alphanumeric, non-underscore
# characters followed by a space as decoration marks -- not just the four
# with built-in meaning (* - / _). Anything else (", <, >, !, ~, #, $, &, ',
# (, ) ...) still becomes a decoration span (class "deco-<char>"); it just
# has no visual effect unless the project's custom CSS targets that class,
# same as in Scrapbox itself. Matching this generally (rather than a fixed
# whitelist) also means unsupported syntax like [$ math] degrades to plain
# text instead of being misparsed as a page-link.
DECORATION_MARK = r"(?:[^\w\s\[\]]|_)"
DECORATION_RE = re.compile(r"^(" + DECORATION_MARK + r"+)\s(.*)$", re.S)


def esc(s):
    return html.escape(s, quote=True)


def is_url(s):
    return bool(FULL_URL_RE.match(s))


def is_image_url(u):
    return bool(IMG_EXT_RE.search(u)) or bool(GYAZO_RE.match(u))


def find_matching_bracket(text, start):
    """text[start] must be '['. Returns index of matching ']' or -1."""
    depth = 0
    n = len(text)
    for j in range(start, n):
        c = text[j]
        if c == "[":
            depth += 1
        elif c == "]":
            depth -= 1
            if depth == 0:
                return j
    return -1


def render_link(display, target_title, link_lookup, tag=False, strong=False):
    key = target_title.strip().lower()
    page = link_lookup.get(key)
    classes = ["link"]
    if tag:
        classes.append("tag")
    if strong:
        classes.append("strong")
    if page:
        classes.append("exists")
        pid = page["id"]
        href = "#p/" + pid
    else:
        classes.append("missing")
        pid = ""
        href = "#"
    return (
        '<a class="' + " ".join(classes) + '" data-id="' + esc(pid) + '" href="'
        + esc(href) + '">' + esc(display) + "</a>"
    )


def render_external(url, text):
    return (
        '<a class="link external" href="' + esc(url) + '" target="_blank" rel="noopener">'
        + esc(text) + "</a>"
    )


def render_image(url):
    return (
        '<a class="img-embed" href="' + esc(url) + '" target="_blank" rel="noopener">'
        '<img src="' + esc(url) + '" loading="lazy" alt="">'
        '<span class="img-caption">' + esc(url) + "</span></a>"
    )


def render_url_alone(url):
    if is_image_url(url):
        return render_image(url)
    return render_external(url, url)


def render_bracket(inner, link_lookup):
    if inner == "":
        return ""

    m = DECORATION_RE.match(inner)
    if m:
        marks, content = m.group(1), m.group(2)
        rendered = render_inline(content, link_lookup)
        classes = []
        star_count = marks.count("*")
        if star_count >= 3:
            classes.append("sb-h1")
        elif star_count == 2:
            classes.append("sb-h2")
        elif star_count == 1:
            classes.append("sb-h3")
        if "-" in marks:
            classes.append("sb-strike")
        if "/" in marks:
            classes.append("sb-em")
        if "_" in marks:
            classes.append("sb-underline")
        custom_classes = []
        for ch in marks:
            if ch not in "*-/_":
                cls = "deco-" + ch
                if cls not in custom_classes:
                    custom_classes.append(cls)
        if not classes and not custom_classes:
            classes.append("sb-strong")
        return '<span class="' + esc(" ".join(classes + custom_classes)) + '">' + rendered + "</span>"

    # [[...]] -> strong link / strong image
    if inner.startswith("[") and inner.endswith("]") and len(inner) >= 2:
        j = find_matching_bracket(inner, 0)
        if j == len(inner) - 1:
            sub = inner[1:-1]
            if is_url(sub):
                return render_url_alone(sub)
            return render_link(sub, sub, link_lookup, strong=True)

    tokens = inner.split(" ")
    first, last = tokens[0], tokens[-1]

    if is_url(first):
        rest = inner[len(first):].strip()
        return render_external(first, rest) if rest else render_url_alone(first)

    if is_url(last):
        rest = inner[: -len(last)].strip()
        return render_external(last, rest) if rest else render_url_alone(last)

    if inner.endswith(".icon"):
        name = inner[:-5].strip() or "icon"
        return render_link(name, name, link_lookup)

    return render_link(inner, inner, link_lookup)


def render_inline(text, link_lookup):
    out = []
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch == "`":
            j = text.find("`", i + 1)
            if j == -1:
                out.append(esc(text[i:]))
                i = n
                continue
            out.append('<code class="inline-code">' + esc(text[i + 1:j]) + "</code>")
            i = j + 1
            continue
        if ch == "[":
            j = find_matching_bracket(text, i)
            if j == -1:
                out.append(esc(ch))
                i += 1
                continue
            out.append(render_bracket(text[i + 1:j], link_lookup))
            i = j + 1
            continue
        if ch == "#":
            m = HASHTAG_RE.match(text, i)
            if m:
                out.append(render_link(m.group(1), m.group(1), link_lookup, tag=True))
                i = m.end()
                continue
        if text.startswith("http://", i) or text.startswith("https://", i):
            m = URL_RE.match(text, i)
            out.append(render_url_alone(m.group(0)))
            i = m.end()
            continue

        j = i
        while j < n and text[j] not in "`[#" and not (
            text.startswith("http://", j) or text.startswith("https://", j)
        ):
            j += 1
        if j == i:
            j += 1
        out.append(esc(text[i:j]))
        i = j
    return "".join(out)


# ---------------------------------------------------------------------------
# Block level: indentation tree, code/table/quote blocks
# ---------------------------------------------------------------------------


def leading_spaces(s):
    return len(s) - len(s.lstrip(" "))


def strip_common_indent(block_lines):
    if not block_lines:
        return ""
    indents = [leading_spaces(l) for l in block_lines if l.strip() != ""]
    base = min(indents) if indents else 0
    return "\n".join(l[base:] if len(l) >= base else "" for l in block_lines)


def tokenize_body(body_lines):
    """Yield (indent, type, payload) logical nodes, folding code:/table: blocks."""
    nodes = []
    n = len(body_lines)
    i = 0
    while i < n:
        raw = body_lines[i]
        indent = leading_spaces(raw)
        content = raw[indent:]

        if content == "":
            nodes.append((indent, "empty", None))
            i += 1
            continue

        code_m = re.match(r"^code:(.*)$", content)
        table_m = re.match(r"^table:(.*)$", content)

        if code_m:
            lang = code_m.group(1).strip()
            block = []
            j = i + 1
            while j < n:
                raw2 = body_lines[j]
                if raw2.strip() == "" or leading_spaces(raw2) <= indent:
                    break
                block.append(raw2)
                j += 1
            nodes.append((indent, "code", {"lang": lang, "text": strip_common_indent(block)}))
            i = j
            continue

        if table_m:
            name = table_m.group(1).strip()
            block = []
            j = i + 1
            while j < n:
                raw2 = body_lines[j]
                if raw2.strip() == "" or leading_spaces(raw2) <= indent:
                    break
                block.append(raw2)
                j += 1
            stripped = strip_common_indent(block).split("\n") if block else []
            rows = [r.split("\t") for r in stripped]
            nodes.append((indent, "table", {"name": name, "rows": rows}))
            i = j
            continue

        if content.startswith(">"):
            qtext = content[1:]
            if qtext.startswith(" "):
                qtext = qtext[1:]
            nodes.append((indent, "quote", qtext))
            i += 1
            continue

        nodes.append((indent, "normal", content))
        i += 1

    return nodes


def render_body(body_lines, link_lookup):
    nodes = tokenize_body(body_lines)

    root = {"indent": -1, "children": []}
    stack = [root]
    for indent, typ, payload in nodes:
        while stack[-1]["indent"] >= indent:
            stack.pop()
        node = {"indent": indent, "children": []}
        if typ == "empty":
            node["html"] = "&nbsp;"
            node["empty"] = True
        elif typ == "code":
            lang = payload["lang"]
            lang_html = ('<span class="lang">' + esc(lang) + "</span>") if lang else ""
            node["html"] = (
                '<pre class="sb-code">' + lang_html + "<code>" + esc(payload["text"]) + "</code></pre>"
            )
        elif typ == "table":
            rows_html = "".join(
                "<tr>" + "".join("<td>" + esc(c) + "</td>" for c in row) + "</tr>"
                for row in payload["rows"]
            )
            cap = ("<caption>" + esc(payload["name"]) + "</caption>") if payload["name"] else ""
            node["html"] = '<table class="sb-table">' + cap + rows_html + "</table>"
        elif typ == "quote":
            node["html"] = '<blockquote class="sb-quote">' + render_inline(payload, link_lookup) + "</blockquote>"
        else:
            node["html"] = render_inline(payload, link_lookup)
        stack[-1]["children"].append(node)
        stack.append(node)

    def render(node):
        children_html = "".join(render(c) for c in node["children"])
        if node is root:
            return children_html
        li_class = ' class="line-empty"' if node.get("empty") else ""
        inner = node["html"] + (('<ul class="outline">' + children_html + "</ul>") if children_html else "")
        return "<li" + li_class + ">" + inner + "</li>"

    return '<ul class="outline">' + render(root) + "</ul>"


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------


def build(input_path, output_path, title_override=None):
    with open(input_path, encoding="utf-8") as f:
        data = json.load(f)

    pages = data["pages"]
    project_name = title_override or data.get("displayName") or data.get("name") or "Scrapbox Viewer"
    exported_ts = data.get("exported")

    title_to_page = {}
    for p in pages:
        title_to_page[p["title"].strip().lower()] = p

    backlinks = {p["id"]: [] for p in pages}
    for p in pages:
        seen = set()
        for lc in p.get("linksLc", []):
            target = title_to_page.get(lc)
            if target and target["id"] != p["id"] and target["id"] not in seen:
                seen.add(target["id"])
                backlinks[target["id"]].append(p["id"])

    pages_out = {}
    for idx, p in enumerate(pages):
        lines = [l.get("text", "") for l in p.get("lines", [])]
        body_lines = lines[1:] if lines else []
        body_html = render_body(body_lines, title_to_page)
        pages_out[p["id"]] = {
            "t": p["title"],
            "h": body_html,
            "c": p.get("created", 0),
            "u": p.get("updated", 0),
            "v": p.get("views", 0),
            "b": backlinks.get(p["id"], []),
        }
        if (idx + 1) % 1000 == 0:
            print("  parsed %d / %d pages" % (idx + 1, len(pages)), file=sys.stderr)

    order = sorted(pages_out.keys(), key=lambda pid: pages_out[pid]["u"], reverse=True)

    exported_str = ""
    if exported_ts:
        exported_str = datetime.datetime.fromtimestamp(exported_ts).strftime("%Y-%m-%d %H:%M")

    payload = {
        "pages": pages_out,
        "order": order,
        "meta": {
            "projectName": project_name,
            "exportedAt": exported_str,
        },
    }

    json_str = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    json_str = json_str.replace("</", "<\\/")

    with open(os.path.join(HERE, "templates", "shell.html"), encoding="utf-8") as f:
        shell = f.read()
    with open(os.path.join(HERE, "templates", "style.css"), encoding="utf-8") as f:
        style = f.read()
    with open(os.path.join(HERE, "templates", "app.js"), encoding="utf-8") as f:
        app_js = f.read()

    out_html = (
        shell.replace("{{TITLE}}", esc(project_name))
        .replace("{{STYLE}}", style)
        .replace("{{DATA_JSON}}", json_str)
        .replace("{{APP_JS}}", app_js)
        .replace("{{EXPORTED_AT}}", esc(exported_str or "不明"))
    )

    out_dir = os.path.dirname(os.path.abspath(output_path))
    os.makedirs(out_dir, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(out_html)

    cache_version = str(exported_ts) if exported_ts else "0"
    with open(os.path.join(HERE, "templates", "sw.js"), encoding="utf-8") as f:
        sw_js = f.read().replace("{{CACHE_VERSION}}", cache_version)
    with open(os.path.join(out_dir, "sw.js"), "w", encoding="utf-8") as f:
        f.write(sw_js)

    manifest = {
        "name": project_name,
        "short_name": project_name[:12],
        "start_url": "./" + os.path.basename(output_path),
        "scope": "./",
        "display": "standalone",
        "background_color": "#ffffff",
        "theme_color": "#2b7de9",
    }
    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print("Wrote %s (%.1f MB), %d pages" % (output_path, size_mb, len(pages)))
    print("Wrote %s and %s alongside it" % (
        os.path.join(out_dir, "sw.js"), os.path.join(out_dir, "manifest.json")
    ))


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--input", "-i", required=True, help="Scrapbox export JSON path")
    ap.add_argument("--output", "-o", default=os.path.join(HERE, "docs", "index.html"),
                     help="Output HTML path (sw.js / manifest.json are written next to it)")
    ap.add_argument("--title", default=None, help="Override the viewer title")
    args = ap.parse_args()
    build(args.input, args.output, args.title)


if __name__ == "__main__":
    main()
