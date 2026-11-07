/**
 * Self-contained mobile page served on the phone HTTPS listener. No external assets; all
 * server-provided text is rendered with textContent (never innerHTML).
 */
export function phonePageHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#14141a">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>VoxMesh · Phone</title>
<style>
  :root{--bg:#121218;--panel:#1b1b23;--line:#2a2a35;--text:#ecebf3;--muted:#9a99a8;--violet:#9b7cff;--blue:#5b8dff;--green:#43d39e;--amber:#f2c86b;--red:#ff7a7a}
  *{box-sizing:border-box}
  html,body{margin:0;background:var(--bg);color:var(--text);font:16px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;-webkit-text-size-adjust:100%}
  main{max-width:560px;margin:0 auto;padding:max(16px,env(safe-area-inset-top)) 16px calc(24px + env(safe-area-inset-bottom))}
  header{display:flex;align-items:center;gap:10px;margin-bottom:14px}
  .logo{width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,var(--violet),var(--blue))}
  h1{font-size:17px;margin:0}.sub{color:var(--muted);font-size:12px}
  .pill{margin-left:auto;font-size:11px;padding:3px 8px;border-radius:99px;border:1px solid var(--line);color:var(--muted)}
  .pill.ok{color:var(--green);border-color:#2f5f4d}.pill.bad{color:var(--red);border-color:#6a3434}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:14px;margin-bottom:12px}
  .mic{display:grid;place-items:center;width:132px;height:132px;margin:10px auto 6px;border-radius:50%;border:1px solid var(--line);background:#22222c;color:var(--text);font-size:15px;font-weight:600;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
  .mic.live{background:linear-gradient(135deg,var(--violet),var(--blue));border-color:transparent;box-shadow:0 0 0 10px rgba(155,124,255,.15),0 0 0 22px rgba(155,124,255,.07);animation:pulse 1.4s ease-in-out infinite}
  .mic:disabled{opacity:.4}
  @keyframes pulse{50%{box-shadow:0 0 0 14px rgba(155,124,255,.2),0 0 0 30px rgba(155,124,255,.05)}}
  .hint{text-align:center;color:var(--muted);font-size:13px;min-height:20px}
  textarea{width:100%;min-height:84px;resize:vertical;border-radius:12px;border:1px solid var(--line);background:#14141b;color:var(--text);padding:10px;font:inherit}
  select{width:100%;border-radius:10px;border:1px solid var(--line);background:#14141b;color:var(--text);padding:9px;font:inherit;font-size:14px}
  .row{display:flex;gap:8px;margin-top:8px;align-items:center}
  button.send{flex:1;border:0;border-radius:12px;padding:12px;font:inherit;font-weight:600;color:white;background:linear-gradient(90deg,var(--violet),var(--blue))}
  button.ghost{border:1px solid var(--line);background:transparent;color:var(--muted);border-radius:12px;padding:11px 12px;font:inherit;font-size:14px}
  button:disabled{opacity:.5}
  .label{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 6px}
  .status{display:flex;align-items:center;gap:8px;font-size:14px}
  .dot{width:8px;height:8px;border-radius:50%;background:var(--muted);flex:none}
  .dot.run{background:var(--violet);animation:blink 1s infinite}.dot.ok{background:var(--green)}.dot.bad{background:var(--red)}.dot.part{background:var(--amber)}
  @keyframes blink{50%{opacity:.3}}
  .progress{color:var(--muted);font-size:13px;margin-top:6px;word-break:break-word}
  .report h3{font-size:15px;margin:10px 0 6px}.report p{margin:6px 0;font-size:14px}.report ul{margin:6px 0;padding-left:18px;font-size:14px}
  .report code{font-family:ui-monospace,Menlo,monospace;font-size:12px;background:#24242e;padding:1px 4px;border-radius:4px;word-break:break-all}
  .report a{color:#a9c1ff}
  .cmd{font-size:13px;color:var(--muted);margin-bottom:6px}
  .note{font-size:12px;color:var(--muted)}
  .warn{color:var(--amber)}.err{color:var(--red);font-size:14px}
  .history button{display:block;width:100%;text-align:left;background:none;border:0;border-top:1px solid var(--line);color:var(--text);padding:9px 0;font:inherit;font-size:13px}
  .history button:first-child{border-top:0}
  .hidden{display:none}
</style>
</head>
<body>
<main>
  <header><div class="logo"></div><div><h1>VoxMesh</h1><div class="sub">Commands run on your laptop</div></div><span id="conn" class="pill">checking…</span></header>

  <section id="unpaired" class="card hidden">
    <p class="label">Not paired</p>
    <p>Open VoxMesh on your laptop → <b>Command</b> → <b>Phone</b>, then scan the QR code with this phone's camera.</p>
  </section>

  <section id="app" class="hidden">
    <div class="card">
      <button id="mic" class="mic" aria-label="Start voice command">Tap to speak</button>
      <div id="hint" class="hint"></div>
      <textarea id="text" placeholder="Or type a command…" aria-label="Command"></textarea>
      <div class="row"><select id="sample" aria-label="Contract for analysis commands"><option value="">No contract</option></select></div>
      <div class="row"><button id="send" class="send">Run on laptop</button><button id="speak" class="ghost" aria-pressed="true">🔊 On</button></div>
      <div id="error" class="err"></div>
    </div>

    <div id="result" class="card hidden">
      <div id="resultCmd" class="cmd"></div>
      <div class="status"><span id="dot" class="dot"></span><span id="statusText"></span></div>
      <div id="progress" class="progress"></div>
      <div id="report" class="report"></div>
      <p class="note">Wallet actions such as Sepolia transfers open MetaMask on the laptop — approve or reject them there.</p>
    </div>

    <div id="historyCard" class="card hidden"><p class="label">Recent</p><div id="history" class="history"></div></div>
  </section>
</main>
<script>
(() => {
  const TOKEN_KEY = "voxmesh.phonePair";
  const HISTORY_KEY = "voxmesh.phoneHistory";
  const $ = (id) => document.getElementById(id);

  const fromHash = new URLSearchParams(location.hash.slice(1)).get("pair");
  if (fromHash) {
    localStorage.setItem(TOKEN_KEY, fromHash);
    history.replaceState(null, "", location.pathname);
  }
  const token = () => localStorage.getItem(TOKEN_KEY) || "";

  async function api(path, init) {
    const res = await fetch(path, { ...(init || {}), headers: { "content-type": "application/json", "x-voxmesh-pair": token() } });
    const body = await res.json().catch(() => null);
    if (res.status === 401) { showUnpaired(); throw new Error("This phone is not paired."); }
    if (!body || !body.ok) throw new Error((body && body.error && body.error.message) || "Request failed (" + res.status + ")");
    return body.data;
  }

  function setConn(text, cls) { const c = $("conn"); c.textContent = text; c.className = "pill " + (cls || ""); }
  let unpaired = false;
  function showUnpaired() { unpaired = true; $("app").classList.add("hidden"); $("unpaired").classList.remove("hidden"); setConn("not paired", "bad"); }

  /* ── tiny markdown → DOM (bold, code, http(s) links, lists, headings) ── */
  function inline(parent, text) {
    const re = /(\\*\\*[^*]+\\*\\*|\`[^\`]+\`|\\[[^\\]]+\\]\\(https?:\\/\\/[^)\\s]+\\))/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      const t = m[0];
      let el;
      if (t.startsWith("**")) { el = document.createElement("strong"); el.textContent = t.slice(2, -2); }
      else if (t.startsWith("\`")) { el = document.createElement("code"); el.textContent = t.slice(1, -1); }
      else { const p = t.match(/^\\[([^\\]]+)\\]\\((https?:\\/\\/[^)\\s]+)\\)$/); el = document.createElement("a"); el.textContent = p[1]; el.href = p[2]; el.target = "_blank"; el.rel = "noopener noreferrer"; }
      parent.appendChild(el);
      last = m.index + t.length;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }
  function renderMarkdown(root, md) {
    root.replaceChildren();
    let list = null;
    for (const raw of String(md).split("\\n")) {
      const line = raw.trimEnd();
      const item = line.match(/^\\s*[-*]\\s+(.*)$/);
      if (item) { if (!list) { list = document.createElement("ul"); root.appendChild(list); } const li = document.createElement("li"); inline(li, item[1]); list.appendChild(li); continue; }
      list = null;
      if (!line.trim()) continue;
      const h = line.match(/^#{1,3}\\s+(.*)$/);
      const el = document.createElement(h ? "h3" : "p");
      inline(el, h ? h[1] : line.replace(/^>\\s?/, ""));
      root.appendChild(el);
    }
  }

  /* ── voice replies ── */
  let speakOn = localStorage.getItem("voxmesh.phoneSpeak") !== "off";
  const speakBtn = $("speak");
  function paintSpeak() { speakBtn.textContent = speakOn ? "🔊 On" : "🔇 Off"; speakBtn.setAttribute("aria-pressed", String(speakOn)); }
  paintSpeak();
  speakBtn.onclick = () => { speakOn = !speakOn; localStorage.setItem("voxmesh.phoneSpeak", speakOn ? "on" : "off"); if (!speakOn && window.speechSynthesis) speechSynthesis.cancel(); paintSpeak(); };
  let ttsUnlocked = false;
  function unlockTts() { if (ttsUnlocked || !window.speechSynthesis) return; ttsUnlocked = true; const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u); }
  function say(text) { if (!speakOn || !window.speechSynthesis || !text) return; speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(String(text).slice(0, 600))); }

  /* ── speech recognition ── */
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mic = $("mic"), hint = $("hint"), text = $("text");
  let rec = null, listening = false, heard = "";
  if (!Rec || !window.isSecureContext) {
    mic.disabled = true;
    mic.textContent = "Voice unavailable";
    hint.textContent = window.isSecureContext ? "This browser has no speech recognition — use the keyboard's dictation (🎤) instead." : "Voice needs HTTPS. Open the https:// link from the QR code.";
  }
  mic.onclick = () => {
    unlockTts();
    if (listening) { rec && rec.stop(); return; }
    heard = "";
    rec = new Rec();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) heard += r[0].transcript; else interim += r[0].transcript;
      }
      text.value = (heard + interim).trim();
    };
    rec.onerror = (e) => { hint.textContent = e.error === "not-allowed" ? "Microphone permission was denied." : "Voice error: " + e.error; };
    rec.onend = () => {
      listening = false; mic.classList.remove("live"); mic.textContent = "Tap to speak";
      if (heard.trim()) { hint.textContent = "Sending…"; run(heard.trim(), "voice"); } else if (!hint.textContent.startsWith("Voice error") && !hint.textContent.startsWith("Microphone")) hint.textContent = "Didn't catch that — try again.";
    };
    try { rec.start(); listening = true; mic.classList.add("live"); mic.textContent = "Listening… tap to stop"; hint.textContent = ""; }
    catch (err) { hint.textContent = "Could not start the microphone."; }
  };

  /* ── run + poll ── */
  const TERMINAL = new Set(["completed", "partial", "failed"]);
  let pollTimer = null;
  async function run(command, channel) {
    $("error").textContent = "";
    if (!command || command.trim().length < 3) { $("error").textContent = "Say or type a longer command."; return; }
    $("send").disabled = true;
    try {
      const body = { command: command.trim(), channel };
      if ($("sample").value) body.sampleContractId = $("sample").value;
      const wf = await api("/api/orchestrator/execute", { method: "POST", body: JSON.stringify(body) });
      remember(command.trim());
      text.value = "";
      hint.textContent = "";
      show(wf, command.trim());
      watch(wf.id, command.trim());
    } catch (err) {
      $("error").textContent = err.message;
    } finally {
      $("send").disabled = false;
    }
  }
  function show(wf, command) {
    $("result").classList.remove("hidden");
    $("resultCmd").textContent = "“" + command + "”";
    const done = TERMINAL.has(wf.status);
    $("dot").className = "dot " + (!done ? "run" : wf.status === "completed" ? "ok" : wf.status === "partial" ? "part" : "bad");
    $("statusText").textContent = done ? (wf.finalReport ? wf.finalReport.title : wf.status) : wf.status === "planning" ? "Planning…" : "Running on laptop…";
    const last = wf.trace && wf.trace.length ? wf.trace[wf.trace.length - 1].detail : "Starting…";
    $("progress").textContent = done ? (wf.error || "") : last;
    if (done && wf.finalReport) renderMarkdown($("report"), wf.finalReport.markdown); else $("report").replaceChildren();
  }
  function watch(id, command) {
    clearTimeout(pollTimer);
    const tick = async () => {
      try {
        const wf = await api("/api/executions/" + encodeURIComponent(id));
        show(wf, command);
        if (TERMINAL.has(wf.status)) { if (wf.finalReport) say(wf.finalReport.spokenSummary); return; }
      } catch (err) { $("progress").textContent = err.message; }
      pollTimer = setTimeout(tick, 1500);
    };
    pollTimer = setTimeout(tick, 800);
  }

  /* ── history ── */
  function remember(cmd) {
    const list = [cmd, ...JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]").filter((c) => c !== cmd)].slice(0, 6);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    paintHistory();
  }
  function paintHistory() {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    $("historyCard").classList.toggle("hidden", list.length === 0);
    const box = $("history");
    box.replaceChildren();
    for (const cmd of list) { const b = document.createElement("button"); b.textContent = cmd; b.onclick = () => { text.value = cmd; text.focus(); }; box.appendChild(b); }
  }

  $("send").onclick = () => { unlockTts(); run(text.value, "text"); };

  /* ── boot ── */
  (async () => {
    if (!token()) return showUnpaired();
    try {
      const health = await api("/api/health");
      $("app").classList.remove("hidden");
      setConn("paired", "ok");
      if (health.workflowRequiresHuman) $("error").textContent = "The laptop requires World ID verification to start workflows; start them from the laptop.";
      paintHistory();
      const samples = await api("/api/samples").catch(() => []);
      for (const s of samples) { const o = document.createElement("option"); o.value = s.id; o.textContent = s.name; $("sample").appendChild(o); }
    } catch (err) {
      if (!unpaired) { setConn("offline", "bad"); $("app").classList.remove("hidden"); $("error").textContent = "Can't reach the laptop: " + err.message; }
    }
  })();
})();
</script>
</body>
</html>`
}
