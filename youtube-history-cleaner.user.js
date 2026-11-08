// ==UserScript==
// @name         YouTube History Cleaner (YHC)
// @namespace    yhc.local
// @version      3.0.0
// @description  Adiciona "Limpar histórico" ao menu lateral do YouTube e apaga o histórico em segundo plano, sem abrir abas.
// @homepageURL  https://github.com/victormrreis/youtube-history-cleaner
// @supportURL   https://github.com/victormrreis/youtube-history-cleaner/issues
// @downloadURL  https://raw.githubusercontent.com/victormrreis/youtube-history-cleaner/main/youtube-history-cleaner.user.js
// @updateURL    https://raw.githubusercontent.com/victormrreis/youtube-history-cleaner/main/youtube-history-cleaner.user.js
// @match        https://www.youtube.com/*
// @run-at       document-start
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        unsafeWindow
// @connect      myactivity.google.com
// ==/UserScript==

(function () {
  'use strict';

  const LOG = (...a) => console.log('%c[YHC]', 'color:#3ea6ff;font-weight:bold', ...a);
  const MA = 'https://myactivity.google.com';

  // Como cada modo apaga:
  //  - all:   Google Minha Atividade, RPC "TmdDAd" (= "Excluir tudo" do produto YouTube) → exibição + pesquisa.
  //  - watch: API interna do YouTube (/youtubei/v1/feedback), o mesmo comando do botão
  //           "Limpar todo o histórico de exibição" em /feed/history.
  const CATEGORIES = {
    all:   { label: 'Histórico completo (pesquisas + visualizações)', run: deleteAllViaMyActivity },
    watch: { label: 'Apenas visualizações',                          run: deleteWatchViaInnertube },
  };

  // ---------------------------------------------------------------------------
  // Utilitários (DOM seguro para Trusted Types — o YouTube bloqueia innerHTML)
  // ---------------------------------------------------------------------------
  function h(tag, props = {}, children = []) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of [].concat(children)) if (c) el.append(c);
    return el;
  }

  function trashIcon(size = 24) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('fill', 'currentColor');
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', 'M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1zM18 7H6v12c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7z');
    svg.append(p);
    return svg;
  }

  function gmRequest(opts) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        ...opts,
        anonymous: false, // envia os cookies da sua conta Google
        timeout: 20000,
        onload: resolve,
        onerror: () => reject(new Error('Falha de rede ao acessar ' + opts.url)),
        ontimeout: () => reject(new Error('Tempo esgotado ao acessar ' + opts.url)),
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Exclusão: histórico completo (Google Minha Atividade, sem abrir página)
  // ---------------------------------------------------------------------------
  async function deleteAllViaMyActivity(progress) {
    progress('Obtendo autorização do Google Minha Atividade…');
    const page = await gmRequest({ method: 'GET', url: MA + '/product/youtube?hl=pt-BR' });
    const html = page.responseText || '';
    const pick = (k) => (html.match(new RegExp('"' + k + '":"([^"]*)"')) || [])[1];
    const at = pick('SNlM0e');   // token anti-CSRF
    const fsid = pick('FdrFJe'); // id da sessão
    const bl = pick('cfb2h');    // versão do servidor
    if (!at || !fsid || !bl) {
      throw new Error('Não consegui autorização do Google Minha Atividade (você está logado no Google neste navegador?).');
    }

    progress('Excluindo todo o histórico do YouTube…');
    const now = Date.now();
    const until = [Math.floor(now / 1000), (now % 1000) * 1e6]; // [segundos, nanos] — "até agora"
    // [[filtro: produto youtube], null, [[início vazio = desde sempre, fim = agora]]]
    const inner = JSON.stringify([[null, ['youtube'], null, [], []], null, [[[], until]]]);
    const fReq = JSON.stringify([[['TmdDAd', inner, null, 'generic']]]);
    const qs = new URLSearchParams({
      rpcids: 'TmdDAd', 'source-path': '/product/youtube', 'f.sid': fsid, bl, hl: 'pt-BR',
      'soc-app': '712', 'soc-platform': '1', 'soc-device': '1',
      _reqid: String(100000 + Math.floor(Math.random() * 900000)), rt: 'c',
    });
    const res = await gmRequest({
      method: 'POST',
      url: MA + '/_/FootprintsMyactivityUi/data/batchexecute?' + qs,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8', 'X-Same-Domain': '1' },
      data: new URLSearchParams({ 'f.req': fReq, at }).toString(),
    });
    if (res.status !== 200 || !/"wrb\.fr","TmdDAd"/.test(res.responseText || '')) {
      throw new Error('O Google recusou a exclusão (HTTP ' + res.status + ').');
    }
    return 'Todo o histórico do YouTube (exibição + pesquisa, todo o período) foi excluído.';
  }

  // ---------------------------------------------------------------------------
  // Exclusão: apenas visualizações (API interna do YouTube)
  // ---------------------------------------------------------------------------
  async function innertubeHeaders() {
    const cookies = Object.fromEntries(document.cookie.split('; ').map((c) => {
      const i = c.indexOf('=');
      return [c.slice(0, i), c.slice(i + 1)];
    }));
    const sid = cookies.SAPISID || cookies['__Secure-3PAPISID'];
    if (!sid) throw new Error('Você não parece estar logado no YouTube.');
    const ts = Math.floor(Date.now() / 1000);
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`${ts} ${sid} https://www.youtube.com`));
    const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    const ytcfg = unsafeWindow.ytcfg;
    return {
      'Content-Type': 'application/json',
      Authorization: `SAPISIDHASH ${ts}_${hex}`,
      'X-Origin': 'https://www.youtube.com',
      'X-Goog-AuthUser': String(ytcfg.get('SESSION_INDEX') || 0),
    };
  }

  async function innertube(endpoint, body) {
    const ctx = unsafeWindow.ytcfg && unsafeWindow.ytcfg.get('INNERTUBE_CONTEXT');
    if (!ctx) throw new Error('Configuração do YouTube não carregada. Recarregue a página.');
    const r = await fetch(`/youtubei/v1/${endpoint}?prettyPrint=false`, {
      method: 'POST', credentials: 'include', headers: await innertubeHeaders(),
      body: JSON.stringify({ context: JSON.parse(JSON.stringify(ctx)), ...body }),
    });
    if (!r.ok) throw new Error(`YouTube respondeu HTTP ${r.status} em ${endpoint}.`);
    return r.json();
  }

  async function deleteWatchViaInnertube(progress) {
    progress('Localizando o comando "Limpar histórico de exibição"…');
    const data = await innertube('browse', { browseId: 'FEhistory' });
    let token = null;
    (function walk(o) {
      if (!o || typeof o !== 'object' || token) return;
      const cd = o.confirmDialogRenderer;
      // Identificado pela ação localWatchHistoryCommand (independe do idioma).
      if (cd && JSON.stringify(cd).includes('localWatchHistoryCommand')) {
        token = cd.confirmEndpoint?.feedbackEndpoint?.feedbackToken
             || cd.confirmButton?.buttonRenderer?.serviceEndpoint?.feedbackEndpoint?.feedbackToken || null;
      }
      for (const k in o) walk(o[k]);
    })(data);
    if (!token) throw new Error('Não encontrei o comando de limpar histórico de exibição.');

    progress('Excluindo o histórico de exibição…');
    const res = await innertube('feedback', { feedbackTokens: [token], isFeedbackTokenUnencrypted: false, shouldMerge: false });
    if (!res.feedbackResponses?.[0]?.isProcessed) throw new Error('O YouTube não confirmou a exclusão.');
    return 'Todo o histórico de exibição foi excluído.';
  }

  // ===========================================================================
  //  INTERFACE
  // ===========================================================================
  GM_addStyle(`
    #yhc-guide-entry{display:flex;align-items:center;height:40px;padding:0 12px;border-radius:10px;
      cursor:pointer;user-select:none;color:var(--yt-spec-text-primary,#f1f1f1);
      font:400 14px/20px Roboto,Arial,sans-serif;box-sizing:border-box;width:calc(100% - 12px)}
    #yhc-guide-entry:hover{background:var(--yt-spec-10-percent-layer,rgba(255,255,255,.1))}
    #yhc-guide-entry:focus-visible{outline:2px solid #3ea6ff}
    #yhc-guide-entry .yhc-icon{display:flex;width:24px;height:24px;margin-right:24px;flex:none}
    #yhc-guide-entry .yhc-title{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    html:not([dark]) #yhc-guide-entry{color:var(--yt-spec-text-primary,#0f0f0f)}
    html:not([dark]) #yhc-guide-entry:hover{background:var(--yt-spec-10-percent-layer,rgba(0,0,0,.05))}

    #yhc-mini-entry{display:flex;flex-direction:column;align-items:center;justify-content:center;
      padding:16px 0 14px;margin:0 4px;border-radius:10px;cursor:pointer;
      color:var(--yt-spec-text-primary,#f1f1f1);font:400 10px/14px Roboto,Arial,sans-serif}
    #yhc-mini-entry:hover{background:var(--yt-spec-10-percent-layer,rgba(255,255,255,.1))}
    #yhc-mini-entry .yhc-icon{display:flex;margin-bottom:6px}

    #yhc-overlay{position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.6);
      display:flex;align-items:center;justify-content:center;font-family:Roboto,Arial,sans-serif}
    #yhc-modal{background:#212121;color:#f1f1f1;width:min(480px,calc(100vw - 32px));border-radius:12px;
      padding:24px;box-shadow:0 8px 32px rgba(0,0,0,.5);box-sizing:border-box}
    #yhc-modal h2{margin:0 0 12px;font-size:20px;font-weight:500;display:flex;align-items:center;gap:10px}
    #yhc-modal .yhc-warn{background:rgba(204,0,0,.15);border:1px solid rgba(255,78,69,.5);border-radius:8px;
      padding:12px;font-size:14px;line-height:20px;margin-bottom:16px;color:#ffb4ab}
    #yhc-modal .yhc-sec{font-size:14px;color:#aaa;margin:12px 0 8px}
    #yhc-modal label.yhc-opt{display:flex;align-items:center;gap:10px;padding:8px;border-radius:8px;font-size:14px;cursor:pointer}
    #yhc-modal label.yhc-opt:hover{background:rgba(255,255,255,.08)}
    #yhc-modal input{accent-color:#cc0000;width:18px;height:18px;margin:0}
    #yhc-modal .yhc-period{font-size:14px;padding:8px;background:rgba(255,255,255,.06);border-radius:8px}
    #yhc-modal .yhc-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}
    #yhc-modal button{border:0;border-radius:18px;height:36px;padding:0 16px;font:500 14px Roboto,Arial,sans-serif;cursor:pointer}
    #yhc-modal .yhc-cancel{background:transparent;color:#3ea6ff}
    #yhc-modal .yhc-cancel:hover{background:rgba(62,166,255,.15)}
    #yhc-modal .yhc-danger{background:#cc0000;color:#fff}
    #yhc-modal .yhc-danger:disabled{background:#3f3f3f;color:#717171;cursor:not-allowed}
    #yhc-modal .yhc-status{font-size:14px;line-height:20px;padding:12px;border-radius:8px;background:rgba(255,255,255,.06);
      margin-top:12px;white-space:pre-wrap}
    #yhc-modal .yhc-status.ok{background:rgba(43,166,64,.18);color:#9be7a8}
    #yhc-modal .yhc-status.err{background:rgba(204,0,0,.18);color:#ffb4ab}
  `);

  // --- Item no menu lateral (elemento próprio; clonar componentes Polymer gera item vazio) ---
  const ANCHOR_HREFS = ['/feed/downloads', '/feed/you/videos', '/feed/playlists', '/feed/history', '/feed/you'];

  function findAnchorEntry() {
    const guide = document.querySelector('ytd-guide-renderer');
    if (!guide) return null;
    const entries = [...guide.querySelectorAll('ytd-guide-entry-renderer')];
    for (const href of ANCHOR_HREFS) {
      const e = entries.find((en) => en.querySelector('a')?.getAttribute('href') === href);
      if (e) return e;
    }
    return null;
  }

  function ensureInjected() {
    if (!document.getElementById('yhc-guide-entry')) {
      const anchor = findAnchorEntry();
      if (anchor) {
        anchor.insertAdjacentElement('afterend', h('div', {
          id: 'yhc-guide-entry', role: 'link', tabindex: '0', title: 'Limpar histórico', onclick: openModal,
          onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(); } },
        }, [h('span', { class: 'yhc-icon' }, [trashIcon(24)]), h('span', { class: 'yhc-title', text: 'Limpar histórico' })]));
      }
    }
    if (!document.getElementById('yhc-mini-entry')) {
      const items = document.querySelector('ytd-mini-guide-renderer #items');
      if (items && items.children.length) {
        items.append(h('div', { id: 'yhc-mini-entry', role: 'link', tabindex: '0', title: 'Limpar histórico', onclick: openModal },
          [h('span', { class: 'yhc-icon' }, [trashIcon(24)]), h('span', { text: 'Limpar' })]));
      }
    }
  }

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; try { ensureInjected(); } catch (e) { LOG('erro', e); } });
  };
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('yt-navigate-finish', schedule);
  const fast = setInterval(schedule, 400);
  setTimeout(() => { clearInterval(fast); setInterval(schedule, 2000); }, 15000);

  // --- Modal ---
  let busy = false;

  function openModal() {
    if (document.getElementById('yhc-overlay')) return;

    const radios = Object.entries(CATEGORIES).map(([key, c], i) =>
      h('label', { class: 'yhc-opt' }, [h('input', { type: 'radio', name: 'yhc-cat', value: key, checked: i === 0 }), h('span', { text: c.label })]));
    const ack = h('input', { type: 'checkbox' });
    const confirmBtn = h('button', { class: 'yhc-danger', disabled: true, text: 'Excluir permanentemente' });
    const closeBtn = h('button', { class: 'yhc-cancel', text: 'Fechar' });
    const statusBox = h('div', { class: 'yhc-status', style: 'display:none' });
    ack.addEventListener('change', () => { confirmBtn.disabled = !ack.checked || busy; });

    const show = (state, msg) => {
      statusBox.style.display = '';
      statusBox.className = 'yhc-status' + (state === 'done' ? ' ok' : state === 'error' ? ' err' : '');
      statusBox.textContent = (state === 'done' ? '✓ ' : state === 'error' ? '✕ ' : '⏳ ') + msg;
    };

    const modal = h('div', { id: 'yhc-modal', role: 'dialog', 'aria-modal': 'true' }, [
      h('h2', {}, [trashIcon(24), h('span', { text: 'Limpar histórico' })]),
      h('div', { class: 'yhc-warn', text:
        'Atenção: esta ação é IRREVERSÍVEL. Todo o histórico selecionado, desde a criação da conta, será apagado ' +
        'permanentemente da sua Conta do Google e não poderá ser recuperado. As recomendações do YouTube também serão afetadas.' }),
      h('div', { class: 'yhc-sec', text: 'O que excluir' }), ...radios,
      h('div', { class: 'yhc-sec', text: 'Período' }),
      h('div', { class: 'yhc-period', text: 'Todo o período (desde o início da conta)' }),
      h('label', { class: 'yhc-opt', style: 'margin-top:12px' }, [ack, h('span', { text: 'Entendo que a exclusão não pode ser desfeita.' })]),
      statusBox,
      h('div', { class: 'yhc-actions' }, [closeBtn, confirmBtn]),
    ]);

    const overlay = h('div', { id: 'yhc-overlay' }, [modal]);
    const close = () => { if (!busy) { overlay.remove(); document.removeEventListener('keydown', onKey); } };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);

    confirmBtn.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      const key = modal.querySelector('input[name="yhc-cat"]:checked')?.value || 'all';
      confirmBtn.disabled = ack.disabled = closeBtn.disabled = true;
      modal.querySelectorAll('input[name="yhc-cat"]').forEach((r) => (r.disabled = true));
      try {
        const msg = await CATEGORIES[key].run((m) => show('running', m));
        show('done', msg);
        LOG(msg);
      } catch (e) {
        show('error', (e && e.message) || String(e));
        LOG('erro', e);
      } finally {
        busy = false;
        closeBtn.disabled = false;
      }
    });

    document.body.append(overlay);
  }

  LOG('ativo');
})();
