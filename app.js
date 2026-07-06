/* Crucible Companion — v1 */
"use strict";

const LS = {
  settings: "cc_settings",
  dm: "cc_dm",
  tree: "cc_tree",
  notes: "cc_notes",   // { path: {sha, text} }
  npcs: "cc_npcs"
};

const state = {
  settings: load(LS.settings, { owner: "", repo: "", branch: "main", token: "", dmPassword: "crucible88" }),
  dm: load(LS.dm, false),
  tree: load(LS.tree, null),
  notes: load(LS.notes, {}),
  npcs: load(LS.npcs, []),
  tab: "browse",
  path: "",          // current folder in browse
  imgCache: {}       // in-memory data URLs
};

function load(k, fallback) {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function save(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

/* ---------- GitHub API ---------- */
function ghHeaders() {
  const h = { Accept: "application/vnd.github+json" };
  if (state.settings.token) h.Authorization = "Bearer " + state.settings.token;
  return h;
}
function ghBase() {
  const { owner, repo } = state.settings;
  return `https://api.github.com/repos/${owner}/${repo}`;
}
async function ghJSON(url) {
  const r = await fetch(url, { headers: ghHeaders() });
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${(await r.json().catch(() => ({}))).message || r.statusText}`);
  return r.json();
}
async function fetchTree() {
  const { branch } = state.settings;
  const data = await ghJSON(`${ghBase()}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  state.tree = data.tree.filter(t => t.type === "blob");
  save(LS.tree, state.tree);
  return state.tree;
}
function b64ToUtf8(b64) {
  const bin = atob(b64.replace(/\n/g, ""));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}
async function fetchNote(path, sha) {
  const cached = state.notes[path];
  if (cached && cached.sha === sha) return cached.text;
  const data = await ghJSON(`${ghBase()}/contents/${encodePath(path)}?ref=${encodeURIComponent(state.settings.branch)}`);
  const text = b64ToUtf8(data.content);
  state.notes[path] = { sha: data.sha, text };
  save(LS.notes, state.notes);
  return text;
}
async function fetchImageDataUrl(path) {
  if (state.imgCache[path]) return state.imgCache[path];
  const data = await ghJSON(`${ghBase()}/contents/${encodePath(path)}?ref=${encodeURIComponent(state.settings.branch)}`);
  const ext = path.split(".").pop().toLowerCase();
  const mime = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml" }[ext] || "image/png";
  const url = `data:${mime};base64,${data.content.replace(/\n/g, "")}`;
  state.imgCache[path] = url;
  return url;
}
function encodePath(p) { return p.split("/").map(encodeURIComponent).join("/"); }

/* ---------- Frontmatter & visibility ---------- */
function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (kv) meta[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body: text.slice(m[0].length) };
}
function notePlayerVisible(meta) {
  return (meta.visibility || "").toLowerCase() === "player";
}
function imgPlayerVisible(path) {
  return /(^|\/)player/i.test(path);
}
const isMd = p => p.endsWith(".md");
const isImg = p => /\.(png|jpe?g|webp|gif|svg)$/i.test(p);

/* ---------- Rendering helpers ---------- */
const view = document.getElementById("view");
function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}
function escapeHtml(s) { return s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

function renderMarkdown(body) {
  // Convert Obsidian wikilinks and embeds before markdown parsing
  body = body.replace(/!\[\[([^\]]+)\]\]/g, (_, t) => `<span class="wikilink" data-link="${escapeHtml(t)}">◈ ${escapeHtml(t)}</span>`);
  body = body.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) =>
    `<span class="wikilink" data-link="${escapeHtml(target)}">${escapeHtml(label || target)}</span>`);
  return marked.parse(body, { breaks: true });
}
function resolveWikilink(name) {
  if (!state.tree) return null;
  const lower = name.toLowerCase();
  return state.tree.find(t => isMd(t.path) && t.path.toLowerCase().endsWith("/" + lower + ".md"))
      || state.tree.find(t => isMd(t.path) && t.path.toLowerCase() === lower + ".md")
      || state.tree.find(t => t.path.toLowerCase().includes(lower));
}

/* ---------- Tabs ---------- */
document.querySelectorAll("#tabbar button").forEach(b =>
  b.addEventListener("click", () => switchTab(b.dataset.tab)));
function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll("#tabbar button").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  ({ browse: renderBrowse, search: renderSearch, npcs: renderNpcs, maps: renderMaps, settings: renderSettings }[tab])();
}

/* ---------- DM mode ---------- */
let taps = 0, tapTimer;
document.getElementById("title-tap").addEventListener("click", () => {
  taps++;
  clearTimeout(tapTimer);
  tapTimer = setTimeout(() => (taps = 0), 900);
  if (taps >= 3) {
    taps = 0;
    if (state.dm) { setDm(false); toast("Sealed. Player mode."); }
    else {
      const pw = prompt("Speak the word of passage:");
      if (pw === state.settings.dmPassword) { setDm(true); toast("The deep floors open. DM mode."); }
      else if (pw !== null) toast("The door does not know that name.");
    }
  }
});
function setDm(on) {
  state.dm = on;
  save(LS.dm, on);
  document.body.classList.toggle("dm", on);
  const seal = document.getElementById("mode-seal");
  seal.textContent = on ? "DM" : "PLAYER";
  seal.classList.toggle("dm", on);
  seal.classList.toggle("player", !on);
  switchTab(state.tab === "npcs" || state.tab === "settings" ? "browse" : state.tab);
}

/* ---------- Browse ---------- */
async function ensureTree() {
  if (!state.settings.owner || !state.settings.repo) return null;
  if (!state.tree) {
    try { await fetchTree(); }
    catch (e) { view.innerHTML = `<p class="empty">Could not reach the vault.<br>${escapeHtml(e.message)}</p>`; return null; }
  }
  return state.tree;
}
function childrenOf(prefix) {
  const folders = new Set(), files = [];
  for (const t of state.tree) {
    if (!t.path.startsWith(prefix)) continue;
    const rest = t.path.slice(prefix.length);
    const slash = rest.indexOf("/");
    if (slash === -1) files.push(t);
    else folders.add(rest.slice(0, slash));
  }
  return { folders: [...folders].sort(), files: files.sort((a, b) => a.path.localeCompare(b.path)) };
}
async function renderBrowse() {
  if (!state.settings.owner) return renderWelcome();
  view.innerHTML = `<p class="empty">Descending…</p>`;
  if (!(await ensureTree())) return;

  const prefix = state.path ? state.path + "/" : "";
  const { folders, files } = childrenOf(prefix);
  view.innerHTML = "";

  const crumbs = el(`<p class="crumbs"></p>`);
  const parts = state.path ? state.path.split("/") : [];
  crumbs.append(link("Vault", () => { state.path = ""; renderBrowse(); }));
  parts.forEach((p, i) => {
    crumbs.append(" / ");
    crumbs.append(link(p, () => { state.path = parts.slice(0, i + 1).join("/"); renderBrowse(); }));
  });
  view.append(crumbs);

  for (const f of folders) {
    view.append(rowBtn("folder", f, "", () => { state.path = prefix + f; renderBrowse(); }));
  }
  let shown = 0;
  for (const t of files) {
    if (!isMd(t.path)) continue;
    const name = t.path.split("/").pop().replace(/\.md$/, "");
    view.append(rowBtn("note", name, "", () => openNote(t)));
    shown++;
  }
  if (!folders.length && !shown) view.append(el(`<p class="empty">Nothing carved here yet.</p>`));

  const refresh = el(`<button class="btn quiet">Refresh vault</button>`);
  refresh.addEventListener("click", async () => { toast("Refetching the vault…"); await fetchTree(); renderBrowse(); });
  view.append(refresh);
}
function rowBtn(kind, title, sub, fn) {
  const b = el(`<button class="row ${kind}"><span class="glyph"></span><span><strong>${escapeHtml(title)}</strong>${sub ? `<span class="sub">${escapeHtml(sub)}</span>` : ""}</span></button>`);
  b.addEventListener("click", fn);
  return b;
}
function link(text, fn) {
  const a = el(`<a href="#">${escapeHtml(text)}</a>`);
  a.addEventListener("click", e => { e.preventDefault(); fn(); });
  return a;
}

async function openNote(t) {
  view.innerHTML = `<p class="empty">Reading the stone…</p>`;
  let text;
  try { text = await fetchNote(t.path, t.sha); }
  catch (e) {
    const cached = state.notes[t.path];
    if (cached) { text = cached.text; toast("Offline — showing cached copy."); }
    else { view.innerHTML = `<p class="empty">${escapeHtml(e.message)}</p>`; return; }
  }
  const { meta, body } = parseFrontmatter(text);
  const playerOk = notePlayerVisible(meta);
  if (!state.dm && !playerOk) {
    view.innerHTML = `<p class="empty">This page is sealed to players.</p>`;
    return;
  }
  view.innerHTML = "";
  const back = el(`<p class="crumbs"></p>`);
  back.append(link("← " + (t.path.split("/").slice(0, -1).join("/") || "Vault"), () => renderBrowse()));
  view.append(back);
  view.append(el(`<span class="badge ${playerOk ? "player" : "dm"}">${playerOk ? "PLAYER-VISIBLE" : "DM ONLY"}</span>`));
  const bodyEl = el(`<div class="note-body"></div>`);
  bodyEl.innerHTML = renderMarkdown(body);
  bodyEl.querySelectorAll(".wikilink").forEach(w =>
    w.addEventListener("click", () => {
      const target = resolveWikilink(w.dataset.link);
      if (target && isMd(target.path)) openNote(target);
      else if (target && isImg(target.path)) openLightbox(target.path);
      else toast("No page by that name in the vault.");
    }));
  view.append(bodyEl);
}

/* ---------- Search ---------- */
function renderSearch() {
  view.innerHTML = "";
  const box = el(`<input type="search" placeholder="Search names, notes, lore…" autocomplete="off">`);
  const results = el(`<div></div>`);
  view.append(el(`<h2>Search the Vault</h2>`), box, el(`<p class="hint">Titles search instantly. Full-text results come from GitHub and need a connection.</p>`), results);
  box.focus();

  let timer;
  box.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => runSearch(box.value.trim(), results), 350);
  });
}
async function runSearch(q, out) {
  out.innerHTML = "";
  if (q.length < 2 || !state.tree) return;
  const ql = q.toLowerCase();

  const titleHits = state.tree.filter(t => isMd(t.path) && t.path.toLowerCase().includes(ql)).slice(0, 20);
  if (titleHits.length) {
    out.append(el(`<h2>Pages</h2>`));
    for (const t of titleHits) out.append(rowBtn("note", t.path.split("/").pop().replace(/\.md$/, ""), t.path, () => visibleOpen(t)));
  }

  // Cached full-text
  const cachedHits = Object.entries(state.notes)
    .filter(([p, n]) => n.text.toLowerCase().includes(ql) && !titleHits.some(t => t.path === p)).slice(0, 20);
  if (cachedHits.length) {
    out.append(el(`<h2>In cached pages</h2>`));
    for (const [p] of cachedHits) {
      const t = state.tree.find(x => x.path === p);
      if (t) out.append(rowBtn("note", p.split("/").pop().replace(/\.md$/, ""), p, () => visibleOpen(t)));
    }
  }

  // GitHub code search (requires auth + network)
  if (state.settings.token) {
    try {
      const { owner, repo } = state.settings;
      const data = await ghJSON(`https://api.github.com/search/code?q=${encodeURIComponent(q)}+repo:${owner}/${repo}`);
      const extra = data.items.filter(i => isMd(i.path) && !titleHits.some(t => t.path === i.path) && !cachedHits.some(([p]) => p === i.path)).slice(0, 20);
      if (extra.length) {
        out.append(el(`<h2>Elsewhere in the vault</h2>`));
        for (const i of extra) {
          const t = state.tree.find(x => x.path === i.path);
          if (t) out.append(rowBtn("note", i.name.replace(/\.md$/, ""), i.path, () => visibleOpen(t)));
        }
      }
    } catch { /* offline or rate-limited — silent */ }
  }
  if (!out.children.length) out.append(el(`<p class="empty">Nothing answers to "${escapeHtml(q)}".</p>`));
}
async function visibleOpen(t) {
  // In player mode, peek at frontmatter before opening
  if (state.dm) return openNote(t);
  try {
    const text = await fetchNote(t.path, t.sha);
    if (notePlayerVisible(parseFrontmatter(text).meta)) return openNote(t);
    toast("That page is sealed to players.");
  } catch { toast("Could not open that page."); }
}

/* ---------- NPC log (DM only, local) ---------- */
function renderNpcs() {
  view.innerHTML = "";
  view.append(el(`<h2>NPC Log</h2>`));
  const name = el(`<input placeholder="Who? e.g. Varrik, Owain Mercer" autocomplete="off">`);
  const note = el(`<textarea placeholder="What happened? What do they now know, want, or hold against the party?"></textarea>`);
  const add = el(`<button class="btn">Log it</button>`);
  add.addEventListener("click", () => {
    if (!name.value.trim() || !note.value.trim()) return toast("Name and note both needed.");
    state.npcs.unshift({ who: name.value.trim(), what: note.value.trim(), when: new Date().toISOString() });
    save(LS.npcs, state.npcs);
    renderNpcs();
    toast("Logged.");
  });
  view.append(el(`<label>NPC</label>`), name, el(`<label>Entry</label>`), note, add);

  if (state.npcs.length) {
    const exp = el(`<button class="btn quiet" style="margin-left:8px">Copy all as Markdown</button>`);
    exp.addEventListener("click", () => {
      const md = state.npcs.map(n => `### ${n.who}\n*${n.when.slice(0, 10)}* — ${n.what}`).join("\n\n");
      navigator.clipboard.writeText(md).then(() => toast("Copied — paste into your vault."));
    });
    view.append(exp, el(`<h2>Entries</h2>`));
    state.npcs.forEach((n, i) => {
      const entry = el(`<div class="log-entry"><button class="del">✕</button><span class="when">${n.when.slice(0, 10)}</span><span class="who">${escapeHtml(n.who)}</span><p>${escapeHtml(n.what)}</p></div>`);
      entry.querySelector(".del").addEventListener("click", () => {
        state.npcs.splice(i, 1); save(LS.npcs, state.npcs); renderNpcs();
      });
      view.append(entry);
    });
  } else {
    view.append(el(`<p class="empty">No entries yet. Log grudges, debts and secrets as they happen.</p>`));
  }
}

/* ---------- Maps ---------- */
async function renderMaps() {
  if (!state.settings.owner) return renderWelcome();
  view.innerHTML = `<p class="empty">Unrolling the maps…</p>`;
  if (!(await ensureTree())) return;
  const imgs = state.tree.filter(t => isImg(t.path) && (state.dm || imgPlayerVisible(t.path)));
  view.innerHTML = "";
  view.append(el(`<h2>Maps &amp; Images</h2>`));
  if (!state.dm) view.append(el(`<p class="hint">Showing player maps only (paths containing "player").</p>`));
  if (!imgs.length) return view.append(el(`<p class="empty">No images found in the vault.</p>`));
  const grid = el(`<div class="map-grid"></div>`);
  view.append(grid);
  for (const t of imgs.slice(0, 60)) {
    const cell = el(`<div class="map-thumb"><div class="ph" style="height:110px;display:flex;align-items:center;justify-content:center;color:var(--ember)">◈</div><span class="sub">${escapeHtml(t.path.split("/").pop())}</span></div>`);
    cell.addEventListener("click", () => openLightbox(t.path));
    grid.append(cell);
    fetchImageDataUrl(t.path).then(url => {
      const img = el(`<img alt="${escapeHtml(t.path)}">`); img.src = url;
      cell.querySelector(".ph").replaceWith(img);
    }).catch(() => {});
  }
}
async function openLightbox(path) {
  const lb = el(`<div id="lightbox"><button class="close" aria-label="Close">✕</button></div>`);
  lb.querySelector(".close").addEventListener("click", () => lb.remove());
  document.body.append(lb);
  try {
    const img = el(`<img alt="">`);
    img.src = await fetchImageDataUrl(path);
    lb.append(img);
  } catch { lb.remove(); toast("Could not load that image."); }
}

/* ---------- Settings (DM only) ---------- */
function renderSettings() {
  const s = state.settings;
  view.innerHTML = "";
  view.append(el(`<h2>Vault Connection</h2>`));
  const owner = field("GitHub username / org", s.owner, "e.g. joncowan");
  const repo = field("Repository name", s.repo, "your Obsidian vault repo");
  const branch = field("Branch", s.branch, "main");
  const token = field("GitHub token (read-only, fine-grained)", s.token, "github_pat_…", "password");
  view.append(el(`<h2>DM Mode</h2>`));
  const pw = field("Word of passage", s.dmPassword, "");
  const saveBtn = el(`<button class="btn">Save &amp; connect</button>`);
  saveBtn.addEventListener("click", async () => {
    Object.assign(s, {
      owner: owner.q.value.trim(), repo: repo.q.value.trim(),
      branch: branch.q.value.trim() || "main",
      token: token.q.value.trim(), dmPassword: pw.q.value.trim() || "crucible88"
    });
    save(LS.settings, s);
    state.tree = null;
    toast("Testing the door…");
    try { await fetchTree(); toast(`Connected — ${state.tree.length} files found.`); switchTab("browse"); }
    catch (e) { toast(e.message); }
  });
  const wipe = el(`<button class="btn quiet" style="margin-left:8px">Clear cached pages</button>`);
  wipe.addEventListener("click", () => { state.notes = {}; save(LS.notes, {}); toast("Cache cleared."); });
  view.append(saveBtn, wipe);
  view.append(el(`<p class="hint">Token needs only <em>Contents: read</em> on this one repo. Everything is stored on this device — nothing is sent anywhere except GitHub.</p>`));

  function field(labelText, val, ph, type = "text") {
    const wrap = el(`<div></div>`);
    const q = el(`<input type="${type}" placeholder="${escapeHtml(ph)}" autocomplete="off">`);
    q.value = val || "";
    wrap.append(el(`<label>${escapeHtml(labelText)}</label>`), q);
    view.append(wrap);
    return { q };
  }
}

/* ---------- Welcome ---------- */
function renderWelcome() {
  view.innerHTML = `
    <div class="empty" style="padding-top:60px">
      <p style="font-family:Cinzel,serif;letter-spacing:.1em;color:var(--ember)">FIFTY FLOORS AWAIT</p>
      <p>No vault connected yet.<br>Triple-tap the title, speak the word of passage,<br>then open Settings.</p>
    </div>`;
}

/* ---------- Boot ---------- */
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
setDm(state.dm);
switchTab("browse");
