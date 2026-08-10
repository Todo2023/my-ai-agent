/* 幼児向け どうがルーレット アプリ */

const $ = (sel) => document.querySelector(sel);

const screens = {
  home: $('#home'),
  player: $('#player'),
  timeup: $('#timeup'),
};

const els = {
  tabs: $('#tabs'),
  wheel: $('#wheel'),
  wheelSvg: $('#wheelSvg'),
  spinBtn: $('#spinBtn'),
  loading: $('#loading'),
  homeBtn: $('#homeBtn'),
  playBtn: $('#playBtn'),
  nextBtn: $('#nextBtn'),
  unlockBtn: $('#unlockBtn'),
};

const ALL_KEY = '__all__';

const state = {
  player: null,
  apiReady: false,
  pendingVideo: null,   // API 準備前に押されたとき用
  tabKey: CATEGORIES[0].key,
  slots: [],            // いまルーレットに乗っている動画
  index: 0,             // 再生中のマス
  rotation: 0,          // ルーレットの回転角（増えつづける）
  spinning: false,
  skipCount: 0,         // 連続して再生できなかった回数
  watchedMs: 0,
  lastTick: 0,
  tickTimer: null,
  progressTimer: null,  // 再生が始まったかを見張る
};

/* ---------- 画面きりかえ ---------- */

function show(name) {
  Object.entries(screens).forEach(([key, el]) => {
    el.classList.toggle('is-active', key === name);
  });
}

/* ---------- タブ（どのルーレットを回すか） ---------- */

function buildTabs() {
  const tabs = CATEGORIES.filter((c) => c.videos.length > 0).map((c) => ({
    key: c.key, label: c.label, emoji: c.emoji, color: c.color,
  }));
  tabs.push({ key: ALL_KEY, label: 'ぜんぶ', emoji: '🎲', color: '#c7f0d8' });

  tabs.forEach((t) => {
    const btn = document.createElement('button');
    btn.className = 'tab';
    btn.dataset.key = t.key;
    btn.style.setProperty('--tab-color', t.color);
    btn.innerHTML = `<span class="tab__emoji">${t.emoji}</span><span></span>`;
    btn.lastElementChild.textContent = t.label;
    btn.addEventListener('click', () => selectTab(t.key));
    els.tabs.appendChild(btn);
  });
}

function selectTab(key) {
  if (state.spinning) return;
  state.tabKey = key;
  els.tabs.querySelectorAll('.tab').forEach((b) => {
    b.classList.toggle('is-on', b.dataset.key === key);
  });
  state.slots = pickSlots(key);
  drawWheel();
}

/* ---------- ルーレットに乗せる動画をえらぶ ---------- */

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickSlots(key) {
  const max = APP_CONFIG.wheelSlots;

  if (key === ALL_KEY) {
    // カテゴリの重みに応じて席を配分する
    const cats = CATEGORIES.filter((c) => c.videos.length > 0);
    const total = cats.reduce((s, c) => s + (SHUFFLE_WEIGHTS[c.key] ?? 1), 0);
    const out = [];
    cats.forEach((c) => {
      const seats = Math.max(1, Math.round(max * (SHUFFLE_WEIGHTS[c.key] ?? 1) / total));
      out.push(...take(c, seats));
    });
    return shuffle(out).slice(0, max);
  }

  const cat = CATEGORIES.find((c) => c.key === key);
  return cat ? take(cat, max) : [];
}

// はるちゃんの回をさきに、のこりを埋める
function take(cat, n) {
  const withCat = (v) => ({ ...v, color: cat.color });
  const haru = shuffle(cat.videos.filter((v) => v.haru)).map(withCat);
  const rest = shuffle(cat.videos.filter((v) => !v.haru)).map(withCat);
  return haru.concat(rest).slice(0, n);
}

/* ---------- ルーレットを描く ---------- */

const SVG_NS = 'http://www.w3.org/2000/svg';

function drawWheel() {
  const svg = els.wheelSvg;
  svg.textContent = '';
  const n = state.slots.length;
  if (n === 0) return;

  const seg = 360 / n;
  const R = 98;

  state.slots.forEach((video, i) => {
    const a0 = i * seg - 90;         // -90 で「12時の位置」から始める
    const a1 = (i + 1) * seg - 90;
    const mid = (a0 + a1) / 2;

    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'slice');

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', arcPath(R, a0, a1));
    path.setAttribute('fill', tint(video.color, i % 2 ? -0.12 : 0.12));
    path.setAttribute('stroke', '#fff');
    path.setAttribute('stroke-width', '1.5');
    g.appendChild(path);

    // 文字は円の中心から外へ向けて置く（左半分は反転して読める向きに）
    const flip = (((mid % 360) + 360) % 360) > 90 && (((mid % 360) + 360) % 360) < 270 ? 180 : 0;
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('class', 'slice__label');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('transform', `rotate(${mid}) translate(62 0) rotate(${flip})`);
    text.setAttribute('fill', '#4a3b2f');

    const emoji = document.createElementNS(SVG_NS, 'tspan');
    emoji.setAttribute('x', '0');
    emoji.setAttribute('dy', '-2');
    emoji.setAttribute('font-size', Math.min(15, 90 / n + 5));
    emoji.textContent = video.emoji || '🎬';

    const label = document.createElementNS(SVG_NS, 'tspan');
    label.setAttribute('x', '0');
    label.setAttribute('dy', '9');
    label.setAttribute('font-size', Math.min(7, 50 / n + 3));
    label.textContent = video.short || '';

    text.append(emoji, label);
    g.appendChild(text);

    // マスを直接おしても見られる（自分でえらぶとき）
    g.addEventListener('click', () => { if (!state.spinning) choose(i); });

    svg.appendChild(g);
  });
}

function arcPath(r, a0, a1) {
  const p0 = polar(r, a0);
  const p1 = polar(r, a1);
  const large = (a1 - a0) > 180 ? 1 : 0;
  return `M 0 0 L ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y} Z`;
}

function polar(r, deg) {
  const rad = (deg * Math.PI) / 180;
  return { x: r * Math.cos(rad), y: r * Math.sin(rad) };
}

// 色をすこし明るく／暗くする（#rrggbb 前提）
function tint(hex, amount) {
  const num = parseInt((hex || '#cccccc').slice(1), 16);
  const ch = [(num >> 16) & 255, (num >> 8) & 255, num & 255].map((c) => {
    const v = amount >= 0 ? c + (255 - c) * amount : c * (1 + amount);
    return Math.round(Math.min(255, Math.max(0, v)));
  });
  return `rgb(${ch.join(',')})`;
}

/* ---------- まわす ---------- */

function weightedTargetIndex() {
  const weights = state.slots.map((v) => (v.haru ? APP_CONFIG.haruWeight : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

function spin() {
  if (state.spinning || state.slots.length === 0) return;
  state.spinning = true;
  els.spinBtn.disabled = true;

  const n = state.slots.length;
  const seg = 360 / n;
  const target = weightedTargetIndex();
  const center = target * seg + seg / 2;               // 12時から時計まわりの角度
  const want = (360 - center) % 360;                   // 針（12時）に来る回転量
  const turns = 5 * 360;
  const delta = ((want - (state.rotation % 360)) + 360) % 360;

  state.rotation += turns + delta;
  els.wheel.style.transform = `rotate(${state.rotation}deg)`;

  const done = () => {
    els.wheel.removeEventListener('transitionend', done);
    state.spinning = false;
    els.spinBtn.disabled = false;
    choose(target);
  };
  els.wheel.addEventListener('transitionend', done);
}

/* ---------- 再生 ---------- */

function choose(index) {
  state.index = index;
  state.skipCount = 0;
  show('player');
  els.loading.classList.remove('is-hidden');
  els.loading.textContent = 'よみこみちゅう…';
  playCurrent();
  startTick();
}

function playCurrent() {
  const video = state.slots[state.index];
  if (!video) return goHome();

  startProgressWatch();

  if (!state.apiReady || !state.player) {
    state.pendingVideo = video; // API が来たら再生する
    return;
  }
  state.player.loadVideoById(video.id);
}

/*
 * 「よみこみちゅう」の覆いを外す判断を、プレイヤーからのイベントだけに頼らない。
 * イベントが届かない環境でも、再生位置が進んでいれば映っているとみなして覆いを外す。
 * いつまでも進まないときは、その動画が再生できないものとみなして次へ送る。
 */
function startProgressWatch() {
  clearInterval(state.progressTimer);
  let waited = 0;
  state.progressTimer = setInterval(() => {
    waited++;
    let t = 0;
    try { t = state.player && state.player.getCurrentTime ? state.player.getCurrentTime() : 0; } catch (_) { t = 0; }

    if (t > 0) {
      els.loading.classList.add('is-hidden');
      setPlayButton(true);
      hideCaptions();
      clearInterval(state.progressTimer);
      state.progressTimer = null;
    } else if (waited >= 12) {
      clearInterval(state.progressTimer);
      state.progressTimer = null;
      skipBroken();
    }
  }, 1000);
}

function stopProgressWatch() {
  clearInterval(state.progressTimer);
  state.progressTimer = null;
}

function playNext() {
  state.index = (state.index + 1) % state.slots.length;
  els.loading.classList.remove('is-hidden');
  els.loading.textContent = 'つぎの どうが…';
  playCurrent();
}

// 再生できない動画（埋め込み禁止・削除ずみなど）は自動でとばす
function skipBroken() {
  state.skipCount++;
  if (state.skipCount >= state.slots.length) {
    els.loading.textContent = 'いま どうがが みられません';
    return;
  }
  playNext();
}

function goHome() {
  stopTick();
  stopProgressWatch();
  if (state.player && state.player.stopVideo) state.player.stopVideo();
  show('home');
}

/* ---------- YouTube IFrame API ---------- */

function loadYouTubeApi() {
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  tag.onerror = () => {
    els.loading.textContent = 'インターネットに つながっていません';
  };
  document.head.appendChild(tag);
}

// API 側から呼ばれる
window.onYouTubeIframeAPIReady = function () {
  // host は既定（www.youtube.com）のままにする。youtube-nocookie を指定すると
  // 再生などの命令は届くのに、プレイヤーからのイベントが別オリジン扱いで捨てられ、
  // 「よみこみちゅう」の覆いが外れないまま音だけ鳴る状態になる。
  state.player = new YT.Player('ytplayer', {
    playerVars: {
      autoplay: 1,
      cc_load_policy: 0, // 字幕は出さない
      controls: 0,       // YouTube 側のUIは出さない（自前の大きなボタンを使う）
      disablekb: 1,
      fs: 0,
      iv_load_policy: 3, // アノテーション非表示
      modestbranding: 1,
      playsinline: 1,
      rel: 0,            // 関連動画を出さない
    },
    events: {
      onReady: () => {
        state.apiReady = true;
        hideCaptions();
        if (state.pendingVideo) {
          state.player.loadVideoById(state.pendingVideo.id);
          state.pendingVideo = null;
        }
      },
      onStateChange: onPlayerStateChange,
      onError: skipBroken,
    },
  });
};

/*
 * 字幕を消す。cc_load_policy だけでは、端末側で字幕を既定オンにしていると出てしまう。
 * 字幕の部品は動画を読み込むたびに戻ってくるので、再生が始まるたびに外す。
 */
function hideCaptions() {
  if (!state.player) return;
  try {
    state.player.unloadModule('captions'); // 古い名前
    state.player.unloadModule('cc');       // 今の名前
  } catch (_) { /* まだ用意できていないときは何もしない */ }
}

function onPlayerStateChange(e) {
  // 再生が始まっていなくても、動き出していれば覆いは外す
  if (e.data !== YT.PlayerState.UNSTARTED) els.loading.classList.add('is-hidden');

  if (e.data === YT.PlayerState.PLAYING) {
    state.skipCount = 0;
    stopProgressWatch();
    setPlayButton(true);
    hideCaptions();
  }
  if (e.data === YT.PlayerState.PAUSED) setPlayButton(false);
  if (e.data === YT.PlayerState.ENDED) {
    if (APP_CONFIG.autoPlayNext) playNext();
    else goHome();
  }
}

function setPlayButton(isPlaying) {
  els.playBtn.firstChild.nodeValue = isPlaying ? '⏸' : '▶️';
  els.playBtn.querySelector('span').textContent = isPlaying ? 'とめる' : 'さいせい';
}

function togglePlay() {
  if (!state.player) return;
  const s = state.player.getPlayerState();
  if (s === YT.PlayerState.PLAYING) state.player.pauseVideo();
  else state.player.playVideo();
}

/* ---------- みまもりタイマー ---------- */

function startTick() {
  if (!APP_CONFIG.sessionMinutes) return;
  state.lastTick = Date.now();
  if (state.tickTimer) return;
  state.tickTimer = setInterval(() => {
    const now = Date.now();
    // 再生中だけ時間をカウントする
    if (state.player && state.player.getPlayerState &&
        state.player.getPlayerState() === YT.PlayerState.PLAYING) {
      state.watchedMs += now - state.lastTick;
    }
    state.lastTick = now;
    if (state.watchedMs >= APP_CONFIG.sessionMinutes * 60 * 1000) timeUp();
  }, 1000);
}

function stopTick() {
  clearInterval(state.tickTimer);
  state.tickTimer = null;
}

function timeUp() {
  stopTick();
  stopProgressWatch();
  if (state.player && state.player.pauseVideo) state.player.pauseVideo();
  show('timeup');
}

// おうちの人だけが解除できるように長押し（1.5秒）
function setupUnlock() {
  let timer = null;
  const start = (e) => {
    e.preventDefault();
    els.unlockBtn.classList.add('is-holding');
    timer = setTimeout(() => {
      els.unlockBtn.classList.remove('is-holding');
      state.watchedMs = 0;
      show('home');
    }, 1500);
  };
  const cancel = () => {
    clearTimeout(timer);
    els.unlockBtn.classList.remove('is-holding');
  };
  els.unlockBtn.addEventListener('pointerdown', start);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) =>
    els.unlockBtn.addEventListener(ev, cancel));
}

/* ---------- 起動 ---------- */

buildTabs();
setupUnlock();
selectTab(state.tabKey);
els.spinBtn.addEventListener('click', spin);
els.homeBtn.addEventListener('click', goHome);
els.nextBtn.addEventListener('click', playNext);
els.playBtn.addEventListener('click', togglePlay);
loadYouTubeApi();
