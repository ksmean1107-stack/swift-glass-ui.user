// ==UserScript==
// @name         Swift Glass UI
// @namespace    http://tampermonkey.net/
// @version      SGU 3.2.0
// @description  3.2.0: 하단 늘리기가 화면 끝보다 넉넉히 더 내려가 어떤 상황(고무줄 스크롤 등)에도 흰 여백이 안 보이게·감지 기준 완화로 더 많은 사이트에서 동일하게 동작·적용 시점을 이미지 등 다 받은 뒤(load)가 아니라 HTML 해석 직후(DOMContentLoaded)로 앞당겨 바뀌는 모습이 거의 안 보이게·재적용 속도 단축·이미지·연결 최적화 강화 / 3.1.3: 기능별 오류 분리 / 0.0.1: 최초 작성
// @author       You
// @match        https://*/*
// @run-at       document-start
// @noframes
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    if (document.contentType !== 'text/html') return;

    /* ───── 설정 (사이트별 localStorage 저장, 알려진 키만 타입 검증 후 사용) ───── */
    const KEY = '__sgu';
    const D = { l: true, s: true, p: true, k: true, u: true, g: true, f: true, t: 0.3 };
    const S = { ...D };
    try {
        const v = JSON.parse(localStorage.getItem(KEY));
        for (const k in D) if (typeof v[k] === typeof D[k]) S[k] = v[k];
        S.t = Math.min(1, Math.max(0, S.t));
    } catch (e) {}
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
    const A = k => (k + (0.95 - k) * S.t).toFixed(2); // 유리 불투명도: k(맑음) → 0.95(진함)
    const ready = f => document.readyState === 'loading'
        ? document.addEventListener('DOMContentLoaded', f, { once: true }) : f();

    // CSP에 막히지 않도록 constructable stylesheet 사용 (Safari 16.4+)
    const css = (text, root = document) => {
        try {
            const sh = new CSSStyleSheet();
            sh.replaceSync(text);
            root.adoptedStyleSheets = [...root.adoptedStyleSheets, sh];
        } catch (e) {
            const el = document.createElement('style');
            el.textContent = text;
            (root.head || root.documentElement || root).append(el);
        }
    };

    /* ───── 속도 ───── */

    // 1) 터치·휠 리스너를 기본 passive로 (명시적 passive 지정은 존중)
    if (S.s) {
        try {
            const P = new Set(['touchstart', 'touchmove', 'wheel', 'mousewheel']);
            const add = EventTarget.prototype.addEventListener;
            EventTarget.prototype.addEventListener = function (t, f, o) {
                if (P.has(t)) {
                    const c = o && typeof o === 'object' ? o : { capture: !!o };
                    if (!('passive' in c)) o = { ...c, passive: true };
                }
                return add.call(this, t, f, o);
            };        } catch (e) {}
    
    }

    // 2) 이미지·iframe 지연 로딩 + 화면 2.5배 앞에서 미리 불러오기(Safari 기본 지연 로딩은 늦게 시작해 뒤늦게 뜸), 디코딩 비동기, 장식 영상 정지
    if (S.l) {
        try {
            const SEL = 'img,iframe,video,audio';
            const saveData = !!navigator.connection?.saveData;
            let c = 0;
            const io = new IntersectionObserver(es => es.forEach(r => {
                if (r.isIntersecting) { r.target.loading = 'eager'; r.target.removeAttribute('fetchpriority'); io.unobserve(r.target); }
            }), { rootMargin: saveData ? '60% 60%' : '400% 150%' }); // 데이터 절약 모드가 아니면 더 멀리서부터 미리 불러옴
            const vio = new IntersectionObserver(es => es.forEach(r => r.isIntersecting ? r.target.play().catch(() => {}) : r.target.pause()));
            const lazy = e => {
                e.loading = 'lazy';
                if (e.localName === 'img') e.setAttribute('fetchpriority', 'low');
                io.observe(e);
            };
            const fix = e => {
                const t = e.localName;
                if (t === 'img') {
                    if (!e.hasAttribute('decoding')) e.decoding = 'async'; // 디코딩을 메인 스레드 밖에서
                    if (e.hasAttribute('loading') || e.hasAttribute('fetchpriority')) return;
                    ++c > 4 ? lazy(e) : c < 3 && e.setAttribute('fetchpriority', 'high'); // 첫 2장은 우선, 5번째부터 지연
                } else if (t === 'iframe') { if (!e.hasAttribute('loading')) lazy(e); }
                else if (e.autoplay) { if (t === 'video' && e.muted && e.loop) vio.observe(e); } // 장식용 자동재생 영상은 화면 밖에서 정지
                else if (e.getAttribute('preload') !== 'none') e.preload = 'metadata';
            };
            const walk = n => {
                if (n.nodeType !== 1) return;
                if (n.matches(SEL)) fix(n);
                n.querySelectorAll(SEL).forEach(fix);
            };
            new MutationObserver(m => m.forEach(r => r.addedNodes.forEach(walk)))
                .observe(document, { childList: true, subtree: true });
            document.documentElement && walk(document.documentElement);        } catch (e) {}
    
    }

    // 3) 다른 도메인 이미지·스크립트·스타일시트의 서버 연결을 미리 맺어 둠 (DNS·TLS 핸드셰이크를 화면에 그리기 전에 끝내 둠)
    if (S.l) {
        try {
            const seen = new Set([location.hostname]), MAXH = 10;
            const pc = h => {
                if (seen.has(h) || seen.size > MAXH) return;
                seen.add(h);
                document.head.append(Object.assign(document.createElement('link'), { rel: 'preconnect', href: 'https://' + h, crossOrigin: 'anonymous' }));
            };
            const scanHosts = n => {
                if (n.nodeType !== 1) return;
                n.matches?.('img[src],script[src],link[rel=stylesheet][href]') && host(n);
                n.querySelectorAll?.('img[src],script[src],link[rel=stylesheet][href]').forEach(host);
            };
            const host = e => { try { pc(new URL(e.src || e.href, location.href).hostname); } catch (err) {} };
            document.documentElement && scanHosts(document.documentElement);
            new MutationObserver(m => seen.size <= MAXH && m.forEach(r => r.addedNodes.forEach(scanHosts)))
                .observe(document, { childList: true, subtree: true });        } catch (e) {}
    
    }

    // 3) 누르는 순간 같은 사이트 링크를 미리 요청 (같은 출처·GET·위험 경로 제외·최대 12개)
    if (S.p && !navigator.connection?.saveData) {
        try {
            const seen = new Set();
            const bad = /log-?(out|off)|sign-?(out|off)|delet|remov|unsub|cancel|confirm|verif|token|revoke|checkout|pay|order/i;
            const canLink = document.createElement('link').relList?.supports?.('prefetch');
            const go = e => {
                const a = e.target.closest?.('a[href]');
                if (!a || a.origin !== location.origin || a.hasAttribute('download') || seen.size >= 12) return;
                const p = a.pathname + a.search;
                if (p === location.pathname + location.search || seen.has(p) || bad.test(p)) return;
                seen.add(p);
                canLink
                    ? document.head.append(Object.assign(document.createElement('link'), { rel: 'prefetch', href: a.href }))
                    : fetch(a.href, { priority: 'low', credentials: 'same-origin' }).catch(() => {});
            };
            ['touchstart', 'mousedown'].forEach(t => document.addEventListener(t, go, { passive: true, capture: true }));        } catch (e) {}
    
    }

    // 4) 서드파티 추적·광고 요청 차단 (동적 스크립트·픽셀·fetch·XHR·beacon): 네트워크·CPU 절약. 같은 사이트 도메인은 건드리지 않음
    if (S.k) {
        try {
            const T = /(^|\.)(googletagmanager\.com|google-analytics\.com|analytics\.google\.com|googlesyndication\.com|googleadservices\.com|doubleclick\.net|connect\.facebook\.net|hotjar\.com|clarity\.ms|scorecardresearch\.com|quantserve\.com|taboola\.com|outbrain\.com|criteo\.(com|net)|adnxs\.com|amazon-adsystem\.com|moatads\.com|mixpanel\.com|amplitude\.com|fullstory\.com|mouseflow\.com|nr-data\.net|segment\.(io|com)|adsrvr\.org|rubiconproject\.com|pubmatic\.com|openx\.net|casalemedia\.com|teads\.tv|ads-twitter\.com|snap\.licdn\.com|px\.ads\.linkedin\.com|analytics\.tiktok\.com|wcs\.naver\.net)$/;
            const site = location.hostname.split('.').slice(-2).join('.');
            const bad = u => { try { const h = new URL(u, location.href).hostname; return T.test(h) && !h.endsWith(site); } catch (e) { return false; } };
            for (const C of [HTMLScriptElement, HTMLImageElement]) {
                const d = Object.getOwnPropertyDescriptor(C.prototype, 'src');
                Object.defineProperty(C.prototype, 'src', { ...d, set(v) { if (!bad(v)) d.set.call(this, v); } });
            }
            const sa = Element.prototype.setAttribute;
            Element.prototype.setAttribute = function (n, v) { return n === 'src' && /^(script|img)$/.test(this.localName) && bad(v) ? undefined : sa.call(this, n, v); };
            const sb = Navigator.prototype.sendBeacon;
            Navigator.prototype.sendBeacon = function (u, d) { return bad(u) ? true : sb.call(this, u, d); };
            const ft = window.fetch;
            window.fetch = function (i) { return bad(i instanceof Request ? i.url : i) ? Promise.resolve(new Response(null, { status: 204 })) : ft.apply(this, arguments); };
            const xo = XMLHttpRequest.prototype.open, xs = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.open = function (m, u) { this._b = bad(u); return xo.apply(this, arguments); };
            XMLHttpRequest.prototype.send = function () { return this._b ? undefined : xs.apply(this, arguments); };        } catch (e) {}
    
    }

    /* ───── 페이지 UI: 시스템 폰트·둥근 컨트롤·유리 바 (사이트 CSS를 최대한 덜 건드림) ───── */

    const UI = `
:root{--sgu-t:#0a84ff;--sgu-e:cubic-bezier(.32,.72,0,1);--sgu-f:-apple-system,BlinkMacSystemFont,"SF Pro Text","Apple SD Gothic Neo","Helvetica Neue",system-ui,sans-serif}
:where(html){-webkit-text-size-adjust:100%;text-size-adjust:100%;-webkit-tap-highlight-color:transparent;-webkit-font-smoothing:antialiased;accent-color:var(--sgu-t);caret-color:var(--sgu-t)}
@media (hover:hover) and (pointer:fine){:where(html){scrollbar-color:rgba(128,128,128,.5) transparent}:where(*){scrollbar-width:thin}}
::selection{background:rgba(10,132,255,.3)}
body :is(p,h1,h2,h3,h4,h5,h6,li,a,label,dt,dd,blockquote,figcaption,summary,button,input,select,textarea,span,div):not(pre *,code *,[class*=icon i],[class*=material i]){font-family:var(--sgu-f)!important}
:where(button,select,textarea,[role=button],input:not([type=checkbox],[type=radio],[type=range],[type=color],[type=file],[type=image],[type=hidden])){border-radius:12px!important}
:where(a,button,summary,[role=button]){transition:opacity .25s var(--sgu-e)}
:where(a,button,summary,[role=button]):active{opacity:.55}
:where(:focus-visible){outline:2px solid var(--sgu-t);outline-offset:2px}
:where(dialog){border:0;border-radius:22px;box-shadow:0 24px 64px rgba(0,0,0,.35)}
dialog::backdrop{background:rgba(0,0,0,.28);-webkit-backdrop-filter:blur(16px) saturate(1.6);backdrop-filter:blur(16px) saturate(1.6)}
@media (prefers-reduced-motion:reduce){:where(a,button,summary,[role=button]){transition:none}}
`;

    // ::before에 blur를 걸어 fixed 자손의 containing block이 바뀌는 부작용을 피함
    const GL = `
[data-sgu]{background-color:rgb(var(--sgu-c)/var(--sgu-a,.7))!important}
[data-sgu]::before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;-webkit-backdrop-filter:blur(22px) saturate(1.8);backdrop-filter:blur(22px) saturate(1.8)}
@media (prefers-reduced-transparency:reduce),(prefers-contrast:more){[data-sgu]{background-color:rgb(var(--sgu-c))!important}[data-sgu]::before{display:none}}
`;

    if (S.u || S.g) css((S.u ? UI : '') + (S.g ? GL : ''));

    // 상단·하단에 고정된 얇은 헤더/탭 바를 찾아 유리 효과 표시 (원래 배경색 유지)
    const scan = () => {
        const els = [...document.querySelectorAll('header,nav,footer,[role=banner],[role=navigation]')].slice(0, 40);
        els.forEach(e => e.removeAttribute('data-sgu'));
        els.map(e => {
            const m = getComputedStyle(e), b = m.backgroundColor, r = e.getBoundingClientRect(), c = b.match(/[\d.]+/g);
            return /^(fixed|sticky)$/.test(m.position) && m.backgroundImage === 'none' && b[0] === 'r' && c[3] !== '0'
                && r.height > 0 && r.height < 180 && r.width > innerWidth * 0.6
                && getComputedStyle(e, '::before').content === 'none' && [e, c];
        }).forEach(x => {
            if (!x) return;
            x[0].style.setProperty('--sgu-c', x[1].slice(0, 3).join(' '));
            x[0].setAttribute('data-sgu', '');
        });
    };

    // 서로 맞닿아 있는(카드 목록·세그먼트 버튼처럼) 우리가 둥글게 만든 UI는 이음매를 각지게, 바깥쪽만 둥글게 — iOS 설정 목록처럼 하나로 이어진 모양으로
    const RSEL = 'button,select,textarea,[role=button],input:not([type=checkbox],[type=radio],[type=range],[type=color],[type=file],[type=image],[type=hidden])';
    const bg = e => { const c = getComputedStyle(e).backgroundColor, m = c.match(/[\d.]+/g); return m && m[3] !== '0' ? c : null; };
    const round = () => {
        // 배경색이 칠해진 <a>(로그인·CTA 버튼처럼 쓰는 링크)도 포함 — 배경이 없는 일반 글자 링크는 밑줄 등 원래 모양을 지키기 위해 건드리지 않음
        const els = [...document.querySelectorAll(RSEL + ',a')].filter(e => e.localName !== 'a' || bg(e)).slice(0, 1500);
        els.forEach(e => e.style.setProperty('border-radius', '12px', 'important')); // 인라인 !important로: 사이트가 버튼에 !important로 각지게 걸어 둔 경우도 이김
        // 같은 부모 밑일 필요 없음 — 대부분 사이트는 각 항목을 <li>·<div>로 한 번 더 감싸서 실제 버튼의 부모가 서로 다름. 화면 위치가 맞닿아 있으면 그룹으로 봄
        const rows = els.map(e => [e, e.getBoundingClientRect(), bg(e)]).sort((a, b) => a[1].top - b[1].top || a[1].left - b[1].left);
        for (let i = 0; i < rows.length - 1; i++) {
            const [e1, r1, c1] = rows[i], [e2, r2, c2] = rows[i + 1];
            if (!c1 || c1 !== c2 || e1.contains(e2) || e2.contains(e1)) continue;
            const vTouch = Math.abs(r1.bottom - r2.top) < 2 && Math.abs(r1.left - r2.left) < 2 && Math.abs(r1.right - r2.right) < 2; // 세로로 맞닿음(목록)
            const hTouch = Math.abs(r1.right - r2.left) < 2 && Math.abs(r1.top - r2.top) < 2 && Math.abs(r1.bottom - r2.bottom) < 2; // 가로로 맞닿음(세그먼트)
            if (vTouch) { e1.style.setProperty('border-bottom-left-radius', '0', 'important'); e1.style.setProperty('border-bottom-right-radius', '0', 'important'); e2.style.setProperty('border-top-left-radius', '0', 'important'); e2.style.setProperty('border-top-right-radius', '0', 'important'); }
            else if (hTouch) { e1.style.setProperty('border-top-right-radius', '0', 'important'); e1.style.setProperty('border-bottom-right-radius', '0', 'important'); e2.style.setProperty('border-top-left-radius', '0', 'important'); e2.style.setProperty('border-bottom-left-radius', '0', 'important'); }
        }
    };

    // 맨 아래 배경(푸터 등) 블록 자체를 문서 끝(툴바 뒤 포함)까지 아래로만 늘림. 다른 요소는 손대지 않음(페이지의 html/body 배경은 그대로 둠)
    let undo = null;
    const fill = () => {
        undo && undo();
        undo = null;
        const de = document.documentElement, body = document.body;
        if (!body) return;
        const bgOf = e => {
            const m0 = getComputedStyle(e), c = m0.backgroundColor, m = c.match(/[\d.]+/g);
            if (m && m[3] !== '0') return c;
            const g = m0.backgroundImage.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]+\)/gi); // 단색에 가까운 그러데이션(예: 흰 배경을 살짝 어둡게 하는 연출)
            return g && g.every(v => v === g[0]) ? g[0] : null;
        };
        const hb = bgOf(de), bb = bgOf(body), base = bb || hb, end = de.scrollHeight;
        const all = [...body.querySelectorAll('*')].slice(0, 9000).map(e => [e, e.getBoundingClientRect()]);
        let E = null, c = null, best = -1;
        for (const [e, r] of all) { // A) 문서 끝 700px 안쪽·전폭·배경색이 있는 가장 아래 블록 (fixed 제외)
            const b = r.bottom + scrollY;
            if (r.width < innerWidth * 0.7 || r.height < 20 || r.height > 3000 || end - b > 2000 || b <= best
                || !bgOf(e) || getComputedStyle(e).position === 'fixed') continue;
            E = e;
            best = b;
        }
        if (E) c = bgOf(E);
        else if (scrollY + innerHeight >= end - 2) { // B) 맨 아래(또는 짧은 페이지)면 화면 아래에서 위로 훑어 처음 만나는 색 블록
            search: for (let y = innerHeight - 4; y > innerHeight * 0.3; y -= 6) {
                for (const e of document.elementsFromPoint(6, y)) {
                    const k = e === de || e === body || e.localName === 'sgu-ui' ? null : bgOf(e);
                    if (k && k !== base) { E = e; c = k; break search; }
                }
            }
        }
        if (!E) { // C) 그래도 못 찾았으면 기준을 더 낮춰 문서 맨 끝에서 가장 가까운 배경색 블록을 찾음 (사이트마다 결과가 들쭉날쭉하지 않도록)
            best = -1;
            for (const [e, r] of all) {
                const b = r.bottom + scrollY, k = bgOf(e);
                if (!k || k === base || r.height < 8 || end - b > 4000 || b <= best || getComputedStyle(e).position === 'fixed') continue;
                E = e;
                c = k;
                best = b;
            }
        }
        if (!E || c === base) return;
        const bot = e => e.getBoundingClientRect().bottom;
        for (let p = E.parentElement; p && p !== body && bgOf(p) === c && Math.abs(bot(p) - bot(E)) < 2; p = p.parentElement) E = p; // 같은 색·같은 아래끝인 바깥 요소로
        const eb = bot(E);
        for (const [e, r] of all) { // 아래쪽에 보이는 내용(글자·이미지·버튼 등)이 있으면 덮지 않음 (1px짜리 숨김 요소는 무시)
            if (r.top < eb - 1 || r.width < 12 || r.height < 8 || r.right < 0 || r.left > innerWidth || E.contains(e) || e.contains(E)) continue;
            if ([...e.childNodes].some(n => n.nodeType === 3 && n.data.trim()) || e.matches('img,svg,canvas,video,iframe,input,button,select,textarea')) {
                const m = getComputedStyle(e);
                if (m.position !== 'fixed' && m.visibility !== 'hidden' && m.opacity !== '0') return;
            }
        }
        // 뷰포트 픽셀값 대신 100dvh(동적 뷰포트 높이)로 계산: Safari는 주소창이 접혔다 펼쳐질 때 innerHeight가 실제 화면과 어긋나는 경우가 있는데,
        // dvh는 브라우저가 주소창 상태에 맞춰 실시간으로 값을 다시 계산해 주기 때문에 우리가 다시 실행하지 않아도 항상 화면 끝에 맞음.
        // 화면 정확히 끝까지가 아니라 그보다 넉넉히(BUF) 더 내려가게 해서, 고무줄처럼 당겨 보거나 화면 회전·키보드 표시 등으로 순간적으로 생기는 여백도 항상 같은 색으로 덮음
        const BUF = 1200;
        const top = E.getBoundingClientRect().top + scrollY;
        const oe = E.style.cssText;
        E.style.setProperty('min-height', `calc(100dvh - ${Math.round(top)}px + ${BUF}px)`, 'important'); // 그 블록 자신의 높이만 늘림 — 배경·다른 요소는 그대로
        E.style.setProperty('box-sizing', 'border-box', 'important');
        undo = () => { E.style.cssText = oe; };
    };

    /* ───── 설정 창 (iOS 26·27 메뉴처럼 버튼에서 유리 방울이 커지며 열림 + iOS 27 설정 앱 스타일) ───── */

    const VER = 'SGU 3.2.0';
    const SH = `
:host{all:initial;position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;color:var(--c);font:16px/1.3 -apple-system,BlinkMacSystemFont,"SF Pro Text","Apple SD Gothic Neo",system-ui,sans-serif;--e:cubic-bezier(.32,.72,0,1);--sp:cubic-bezier(.32,.72,0,1);--g:255 255 255;--bgc:242 242 247;--card:rgb(255 255 255/.62);--c:#000;--c2:rgba(60,60,67,.6);--sep:rgba(60,60,67,.16);--off:rgba(120,120,128,.28);--rail:rgba(120,120,128,.3);--lens:rgba(255,255,255,.3);--gr:#34c759;--ring:rgba(0,0,0,.14);--hi:rgba(255,255,255,.75);--a:.4;--pa:.5;--tb:0px;--bo:max(env(safe-area-inset-bottom,0px),var(--tb))}
@supports (-webkit-touch-callout:none){:host{--tb:100px}}
:host([data-t=d]){--g:40 40 44;--bgc:0 0 0;--card:rgb(88 88 96/.34);--c:#fff;--c2:rgba(235,235,245,.62);--sep:rgba(255,255,255,.13);--off:rgba(120,120,128,.42);--rail:rgba(255,255,255,.2);--lens:rgba(76,76,82,.42);--gr:#30d158;--ring:rgba(255,255,255,.2);--hi:rgba(255,255,255,.28)}
@supports (transition-timing-function:linear(0,1)){:host{--sp:linear(0, 0.065, 0.208, 0.376, 0.537, 0.676, 0.787, 0.871, 0.93, 0.969, 0.993, 1.007, 1.013, 1.015, 1.014, 1.012, 1.01, 1.007, 1.005, 1.003, 1.002, 1.001, 1.001, 1, 1, 1, 1, 1, 1)}}
[hidden]{display:none!important}
.b{all:unset;box-sizing:border-box;cursor:pointer;-webkit-tap-highlight-color:transparent}
.b:focus-visible{outline:2px solid #0a84ff;outline-offset:2px}
.glass{background:rgb(var(--g)/var(--a));-webkit-backdrop-filter:blur(20px) saturate(1.8);backdrop-filter:blur(20px) saturate(1.8);box-shadow:0 0 0 .5px var(--ring),inset 0 1px .5px var(--hi),inset 0 -1px .5px rgba(255,255,255,.12),0 8px 24px rgba(0,0,0,.16)}
@media (prefers-reduced-transparency:reduce),(prefers-contrast:more){.glass{background:rgb(var(--g));-webkit-backdrop-filter:none;backdrop-filter:none}.page{background:rgb(var(--g));-webkit-backdrop-filter:none;backdrop-filter:none}}
svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.dock{position:fixed;left:max(14px,env(safe-area-inset-left,0px));bottom:calc(var(--bo) + 22px);display:flex;gap:8px;pointer-events:none;transition:opacity .4s .3s,transform .55s .25s var(--e)}
.dock>*{pointer-events:auto}
.open .dock{opacity:0;transform:scale(.7);transition:opacity .2s,transform .35s var(--e)}
.open .dock>*{pointer-events:none}
.ib{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;transition:transform .35s var(--e),background .2s}
.ib:active{transform:scale(.88);background:rgb(128 128 128/.28)}
.dk{width:48px;height:48px;opacity:.92;transition:opacity .3s,transform .35s var(--e),background .2s}
.up{opacity:0;visibility:hidden;transform:scale(.6);transition:opacity .25s,transform .3s var(--e),visibility 0s .25s}
.up.show{opacity:.92;visibility:visible;transform:none;transition:opacity .25s,transform .3s var(--e)}
.dim{position:fixed;inset:0;background:transparent;opacity:0;visibility:hidden;pointer-events:none;transition:visibility 0s .6s}
.open .dim{visibility:visible;pointer-events:auto}
.page{position:fixed;left:max(12px,env(safe-area-inset-left,0px));bottom:calc(var(--bo) + 12px);width:min(392px,calc(100% - 24px));height:min(740px,calc(100% - var(--bo) - 84px));overflow:hidden;border-radius:50%;background:rgb(var(--g)/var(--pa));-webkit-backdrop-filter:blur(28px) saturate(1.8);backdrop-filter:blur(28px) saturate(1.8);box-shadow:0 0 0 .5px var(--ring),inset 0 1px .5px var(--hi),0 24px 64px rgba(0,0,0,.28);will-change:transform;pointer-events:auto;outline:0;opacity:0;visibility:hidden;transform:translate(var(--dx,0px),var(--dy,0px)) scale(var(--sx,.1),var(--sy,.1));transition:transform .65s cubic-bezier(.4,0,.15,1),border-radius .65s cubic-bezier(.4,0,.15,1),opacity .4s .25s,visibility 0s .7s}
.open .page{opacity:1;visibility:visible;transform:none;border-radius:36px;transition:transform .8s var(--sp),border-radius .55s var(--e),opacity .18s}
.idle{content-visibility:hidden}
.sv{position:absolute;left:0;right:0;top:64px;bottom:36px;overflow:auto;overscroll-behavior-y:contain;-webkit-overflow-scrolling:touch;-webkit-mask-image:linear-gradient(transparent,#000 14px,#000 calc(100% - 22px),transparent);mask-image:linear-gradient(transparent,#000 14px,#000 calc(100% - 22px),transparent)}
.sv,.nav{opacity:0;filter:blur(10px);transition:opacity .3s,filter .3s}
.open .sv,.open .nav{opacity:1;filter:none;transition:opacity .4s .12s,filter .5s .1s}
.in{padding:8px 0 20px}
.nav{position:absolute;top:0;left:0;right:0;z-index:2;box-sizing:border-box;height:64px;padding:0 16px;display:grid;grid-template-columns:44px 1fr 44px;align-items:center;gap:12px}
.nav::after{content:""}
.ti{margin:0;font-size:17px;font-weight:600;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sec{margin-bottom:30px}
.hd{margin:0;padding:0 36px 8px;color:var(--c2);font-size:15px;font-weight:600}
.ft{padding:8px 36px 0;color:var(--c2);font-size:13px;line-height:1.4}
.card{margin:0 16px;background:var(--card);border-radius:27px;overflow:hidden}
.row{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;box-sizing:border-box;min-height:54px;padding:0 20px}
.row+.row::before{content:"";position:absolute;top:0;left:20px;right:20px;border-top:1px solid var(--sep)}
.act{width:100%;color:#0a84ff}
.act:active{background:rgb(128 128 128/.18)}
.act:focus-visible{outline-offset:-2px}
.val{color:var(--c2)}
.sw{flex:none;position:relative;width:62px;height:28px;border-radius:14px;background:var(--off);box-shadow:inset 0 0 0 1px rgba(0,0,0,.12);transition:background .3s}
.sw::after{content:"";position:absolute;top:2.5px;left:2.5px;width:39px;height:23px;border-radius:12px;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.28);transition:transform .4s var(--e),width .3s var(--e)}
.sw[aria-checked=true]{background:var(--gr)}
.sw[aria-checked=true]::after{transform:translateX(18px)}
.sw:active::after{width:45px}
.sw[aria-checked=true]:active::after{transform:translateX(12px)}
.sl{min-height:66px}
.sb{display:flex;align-items:center;gap:14px;flex:1;min-width:0;will-change:transform;transition:transform .65s cubic-bezier(.34,1.56,.64,1)}
.sb.on{transition:none}
.si{flex:none;color:var(--c2)}
.f{fill:currentColor}
.tr{position:relative;flex:1;height:44px;touch-action:none;cursor:pointer;outline:0;-webkit-tap-highlight-color:transparent}
.rail{position:absolute;left:0;right:0;top:50%;height:6px;margin-top:-3px;border-radius:3px;background:var(--rail);overflow:hidden}
.fl{position:absolute;inset:0;border-radius:3px;background:#0a84ff;transform:translateX(-100%);will-change:transform}
.rail{isolation:isolate}
.pt{position:absolute;left:0;top:50%;width:0;height:0;will-change:transform}
.th{position:absolute;left:0;top:0;width:39px;height:23px;transform:translate(-50%,-50%);border-radius:999px;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.3);transition:width .35s var(--e),height .35s var(--e),background-color .25s,box-shadow .25s,transform .55s cubic-bezier(.34,1.56,.64,1)}
.th::before{content:"";position:absolute;inset:0;z-index:1;border-radius:inherit;background:linear-gradient(rgba(255,255,255,.18),rgba(255,255,255,0) 50%),var(--lens);box-shadow:inset 0 0 0 1px rgba(255,255,255,.16),inset 0 2px 2px rgba(255,255,255,.28),inset 0 -3px 4px rgba(0,0,0,.35);opacity:0;transition:opacity .25s}
.th::after{content:"";z-index:1;position:absolute;left:14%;right:14%;top:50%;height:8px;margin-top:-4px;border-radius:4px;background:rgba(255,255,255,.14);filter:blur(1px);opacity:0;transition:opacity .25s}
.on .th{width:58px;height:37px;background-color:transparent;box-shadow:0 6px 16px rgba(0,0,0,.4);transition:width .35s var(--e),height .35s var(--e),background-color .25s,box-shadow .25s}
.on .th::before,.on .th::after{opacity:1}
.tr:focus-visible .th{outline:2px solid #0a84ff;outline-offset:2px}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
@media print{:host{display:none}}
`;

    const NS = 'http://www.w3.org/2000/svg';
    // innerHTML 없이 DOM API만 사용 (XSS·Trusted Types 안전)
    const h = (tag, a = {}, ...kids) => {
        const e = document.createElement(tag);
        for (const k in a) k in e ? (e[k] = a[k]) : e.setAttribute(k, a[k]);
        e.append(...kids);
        return e;
    };
    const icon = (d, c) => {
        const s = document.createElementNS(NS, 'svg'), p = document.createElementNS(NS, 'path');
        s.setAttribute('viewBox', '0 0 24 24');
        if (c) s.setAttribute('class', c);
        p.setAttribute('d', d);
        s.append(p);
        return s;
    };

    const R = [
        ['속도', [['l', '지연 로딩'], ['s', '스크롤 최적화'], ['p', '링크 미리 준비'], ['k', '추적·광고 요청 차단']],
            '이미지·iframe은 화면 여러 장 앞에서 미리 불러오고(데이터 절약 모드면 줄여요) 디코딩은 비동기로 해요. 화면 밖 자동재생 영상은 멈추고, 다른 도메인은 미리 연결해 두고, 서드파티 추적·광고 요청은 차단하고, 링크는 누르는 순간 미리 요청해요.'],
        ['화면', [['u', 'iOS 스타일'], ['g', '유리 바']],
            '시스템 폰트·둥근 컨트롤·유리 팝업 배경을 쓰고, 서로 맞닿은 UI는 이음매를 각지게 이어 붙여요. 고정 헤더와 탭 바는 반투명 유리로 바꿔요.'],
        ['정리', [['f', '하단 배경 늘리기']],
            '푸터 등 맨 아래 블록이 흰 여백으로 끊기는 사이트에서, 그 블록만 화면 끝보다 넉넉히 더 아래로 늘려요. 다른 곳은 건드리지 않아요.'],
    ];
    const CIRCLE = 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16';

    let tone = () => {}; // 페이지 밝기에 맞춰 글래스 색조(밝음/어두움) 자동 전환

    const mount = () => {
        const host = document.createElement('sgu-ui'), root = host.attachShadow({ mode: 'closed' });
        const paintHost = () => { host.style.setProperty('--a', A(0.1)); host.style.setProperty('--pa', A(0.3)); };
        const paintPage = () => document.documentElement.style.setProperty('--sgu-a', A(0.4)); // 전체 문서 스타일 재계산 → 드래그 중엔 호출 안 함
        paintHost();
        paintPage();
        css(SH, root);


        const sec = (hd, card, ft) => h('section', { className: 'sec' }, ...[
            hd && h('h2', { className: 'hd' }, hd),
            h('div', { className: 'card' }, ...card),
            ft && h('div', { className: 'ft' }, ft),
        ].filter(Boolean));

        const row = ([k, t]) => h('div', { className: 'row' },
            h('span', {}, t),
            h('button', {
                className: 'b sw', role: 'switch', 'aria-checked': String(S[k]), 'aria-label': t,
                onclick() { this.setAttribute('aria-checked', String((S[k] = !S[k]))); save(); },
            }));

        // iOS 슬라이더: 흰 알약 → 글래스 렌즈(안쪽에서 채움이 확대돼 보임). 움직이면 렌즈가 좁아지고 멈추면 스프링으로 "도잉"
        // 끝을 넘겨 당기면 고무줄처럼 늘어났다 튕김. 버벅임 방지: 드래그 중엔 transform만 갱신, 레이아웃 읽기는 터치 시작 때 1번, 문서 스타일은 손 뗄 때 1번
        const slider = () => {
            const TW = 39, MAX = 28, EDGE = 0.06; // 평소 손잡이 너비, 최대 늘어남(px), 끝 판정 구간
            const th = h('div', { className: 'th' });
            const pt = h('div', { className: 'pt' }, th), fl = h('div', { className: 'fl' });
            const tr = h('div', {
                className: 'tr', role: 'slider', tabindex: 0, 'aria-label': '유리 투명도', 'aria-valuemin': 0, 'aria-valuemax': 100,
            }, h('div', { className: 'rail' }, fl), pt);
            const ic = [icon(CIRCLE, 'si'), icon(CIRCLE, 'si f')], sb = h('div', { className: 'sb' }, ic[0], tr, ic[1]);
            let w = 0, bw = 0, x0 = 0, off = 0, cx = 0, st = 0, fv = 0, edge = 0, ea = 0; // fv: 화면에 그려지는 채움 끝, edge: -1 최소·1 최대·0 중간, ea: 애니메이션 유지 시각
            let vel = 0, pt0 = 0, sq = 1, sv = 0, raf = 0, lt = 0, drag = false; // vel: 손잡이 속도, sq/sv: 손잡이 폭 스프링(멈추면 도잉)
            const rb = o => Math.sign(o) * MAX * (1 - 1 / (Math.abs(o) * 0.4 / MAX + 1)); // iOS식 고무줄 감쇠
            const fTarget = () => edge < 0 ? 0 : edge > 0 ? w : cx; // 채움 끝 = 손잡이 중심, 끝에선 자동으로 가득/사라짐
            const tick = now => {
                raf = 0;
                if (!w) return;
                const dt = lt ? Math.min(0.04, (now - lt) / 1000) : 0.016;
                lt = now;
                vel *= Math.exp(-dt * 26); // 손가락이 멈추면 속도가 빨리 0 → 스프링으로 되돌아오며 살짝 도잉
                const tg = 1 - 0.16 * Math.min(1, Math.abs(vel) / 900), ft = fTarget();
                sv += (-420 * (sq - tg) - 10 * sv) * dt;
                sq += sv * dt;
                fv += (ft - fv) * (1 - Math.exp(-dt * (now < ea ? 14 : 300)));
                const k = 1 + Math.abs(st) / (bw || 1);
                if (st) sb.style.transformOrigin = st > 0 ? '0 50%' : '100% 50%';
                pt.style.transform = `translate3d(${cx}px,0,0)`;
                fl.style.transform = `translate3d(${fv - w}px,0,0)`;
                sb.style.transform = `scaleX(${k})`;
                th.style.transform = `translate(-50%,-50%) scale(${sq * (1 - 0.12 * Math.min(1, Math.abs(st) / 16)) / k},${1 + (1 - sq) * 0.6})`;
                tr.setAttribute('aria-valuenow', Math.round(S.t * 100));
                paintHost(); // 유리 투명도는 매 프레임(드래그 중 실시간) 반영 — 셰도우 루트 안 커스텀 프로퍼티라 가벼움
                if (drag || now < ea || Math.abs(sq - tg) > 0.0008 || Math.abs(sv) > 0.02 || Math.abs(vel) > 1 || Math.abs(fv - ft) > 0.3) raf = requestAnimationFrame(tick);
                else { lt = 0; paintPage(); } // 페이지 전체에 영향을 주는 쪽은 멈췄을 때만
            };
            const go = () => { raf || (raf = requestAnimationFrame(tick)); };
            // 끝 도달: 채움 애니메이션 + 끝 아이콘 보잉(커졌다 돌아옴)
            const setEdge = fx => {
                const e = edge < 0 ? (S.t < EDGE * 1.6 ? -1 : 0) : edge > 0 ? (S.t > 1 - EDGE * 1.6 ? 1 : 0) : S.t <= EDGE ? -1 : S.t >= 1 - EDGE ? 1 : 0;
                if (e === edge) return;
                edge = e;
                ea = performance.now() + 340;
                if (e && fx) ic[e < 0 ? 0 : 1].animate([{ transform: 'scale(1)' }, { transform: 'scale(1.42)', offset: 0.28 }, { transform: 'scale(.88)', offset: 0.62 }, { transform: 'scale(1)' }], { duration: 600, easing: 'cubic-bezier(.3,.7,.3,1)' });
            };
            const put = (v, fx) => {
                S.t = Math.min(1, Math.max(0, v));
                cx = TW / 2 + S.t * (w - TW);
                st = 0;
                setEdge(fx);
                if (!fx) fv = fTarget();
                go();
            };
            const sync = () => { w = tr.clientWidth; bw = sb.clientWidth; put(S.t); };
            const pos = e => {
                const raw = e.clientX - x0 + off, c = Math.min(w - TW / 2, Math.max(TW / 2, raw)), now = performance.now();
                if (pt0) vel = 0.5 * vel + 0.5 * (c - cx) / Math.max(0.008, (now - pt0) / 1000);
                pt0 = now;
                S.t = (c - TW / 2) / (w - TW);
                cx = c;
                st = rb(raw - c);
                setEdge(true);
                go();
            };
            const end = () => { drag = false; sb.classList.remove('on'); st = 0; go(); save(); };
            tr.addEventListener('pointerdown', e => {
                w = tr.clientWidth;
                bw = sb.clientWidth;
                x0 = tr.getBoundingClientRect().left;
                const x = e.clientX - x0;
                off = Math.abs(x - cx) < TW / 2 + 8 ? cx - x : 0; // 손잡이를 잡으면 튀지 않고, 트랙을 누르면 그 위치로
                tr.setPointerCapture(e.pointerId);
                drag = true;
                pt0 = 0;
                vel = 0;
                sb.classList.add('on');
                pos(e);
            });
            tr.addEventListener('pointermove', e => { if (tr.hasPointerCapture(e.pointerId)) pos(e); });
            tr.addEventListener('pointerup', end);
            tr.addEventListener('pointercancel', end);
            tr.addEventListener('keydown', e => {
                const d = { ArrowRight: 0.05, ArrowUp: 0.05, ArrowLeft: -0.05, ArrowDown: -0.05 }[e.key];
                if (d) { e.preventDefault(); put(S.t + d, true); paintHost(); paintPage(); save(); }
            });
            return [sb, sync];
        };
        const [sl, sync] = slider();

        const bk = h('button', { className: 'b ib glass', 'aria-label': '닫기', onclick: () => show(false) }, icon('M6 6l12 12M18 6L6 18'));
        const page = h('div', { className: 'page idle', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Swift Glass UI 설정', tabindex: -1 },
            h('div', { className: 'nav' }, bk, h('h1', { className: 'ti' }, 'Swift Glass UI')),
            h('div', { className: 'sv' }, h('div', { className: 'in' },
                ...R.map(([hd, rows, ft]) => sec(hd, rows.map(row), ft)),
                sec('유리 투명도', [h('div', { className: 'row sl' }, sl)],
                    '맑게부터 진하게까지 조절해요. 투명도 줄이기가 켜져 있으면 항상 불투명하게 보여요.'),
                sec(null, [h('button', { className: 'b row act', onclick: () => location.reload() }, '새로 고침하여 적용')],
                    '설정은 이 사이트에만 저장되고, 새로 고침하면 적용돼요.'),
                sec(null, [h('div', { className: 'row' }, h('span', {}, '버전'), h('span', { className: 'val' }, VER))]))));

        // 맨 위로: 직접 애니메이션(감속 이징)으로 스크롤. requestAnimationFrame으로 표시 여부도 매 프레임 갱신해 모든 사이트에서 신뢰성 있게 동작
        let upA = 0;
        const toTop = ts => {
            if (!upA) upA = ts;
            const p = Math.min(1, (ts - upA) / 600), e = 1 - Math.pow(1 - p, 3); // ease-out cubic
            scrollTo(0, y0 * (1 - e));
            if (p < 1 && scrollY > 0) requestAnimationFrame(toTop);
            else upA = 0;
        };
        let y0 = 0;
        const up = h('button', {
            className: 'b ib dk up glass', 'aria-label': '맨 위로',
            onclick: () => { if (!upA) { y0 = scrollY; requestAnimationFrame(toTop); } },
        }, icon('M6 15l6-6 6 6'));
        const gear = h('button', { className: 'b ib dk glass', 'aria-label': 'Swift Glass UI 설정', onclick: () => show(true) },
            icon('M4 8h8.5M17.5 8H20M4 16h2.5M11.5 16H20M12.5 8a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M6.5 16a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0'));
        const wrap = h('div', {}, h('div', { className: 'dim', onclick: () => show(false) }), h('div', { className: 'dock' }, gear, up), page);

        // 열기/닫기: 패널이 설정 버튼의 위치·크기에서 시작해 정확히 그 자리로 돌아감(FLIP). 닫힌 동안엔 내부 렌더링 생략
        const show = on => {
            if (on) {
                page.classList.remove('idle');
                tone();
                page.style.cssText = 'transition:none;transform:none';
                const p = page.getBoundingClientRect(), g = gear.getBoundingClientRect();
                page.style.cssText = `--dx:${g.left + g.width / 2 - p.left - p.width / 2}px;--dy:${g.top + g.height / 2 - p.top - p.height / 2}px;--sx:${g.width / p.width};--sy:${g.height / p.height};transition:none`;
                void page.offsetWidth;
                page.style.transition = '';
                wrap.classList.add('open');
                sync();
            } else {
                wrap.classList.remove('open');
                setTimeout(() => wrap.classList.contains('open') || page.classList.add('idle'), 850);
            }
            (on ? page : gear).focus({ preventScroll: true });
        };
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && wrap.classList.contains('open')) show(false); });
        let uq;
        addEventListener('scroll', () => uq || (uq = requestAnimationFrame(() => { uq = 0; up.classList.toggle('show', scrollY > 460); })), { passive: true });
        root.append(wrap);
        document.documentElement.append(host);

        // 설정 버튼 뒤에 실제로 보이는 배경색의 밝기로 판단 (Safari 툴바처럼 페이지에 어울리게)
        tone = () => {
            const r = gear.getBoundingClientRect();
            let l = 1;
            for (const e of document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)) {
                const c = e === host ? 0 : getComputedStyle(e).backgroundColor.match(/[\d.]+/g);
                if (c && c[3] !== '0') { l = (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; break; }
            }
            host.dataset.t = l < 0.45 ? 'd' : 'l';
        };
        tone();
        addEventListener('load', tone, { once: true });
        addEventListener('scrollend', tone, { passive: true });
        matchMedia('(prefers-color-scheme: dark)').addEventListener('change', tone);
    };

    ready(() => { try { mount(); } catch (e) {} }); // 설정창 하나가 실패해도 위의 속도·화면 기능은 계속 동작

    if (S.g || S.f || S.u) {
        let t, ls = 0, tried = 0;
        const safe = f => { try { f(); } catch (e) {} };
        const run = () => { S.g && safe(scan); S.u && safe(round); S.f && safe(fill); safe(tone); };
        const idle = f => 'requestIdleCallback' in window ? requestIdleCallback(f, { timeout: 300 }) : f(); // 메인 스레드가 한가할 때 처리해 다른 동작을 막지 않음
        const sched = ms => { clearTimeout(t); t = setTimeout(() => Date.now() - ls < 250 ? sched(250) : idle(run), ms); }; // 스크롤 중엔 강제 레이아웃 방지
        const later = () => sched(180); // 짧게: 내용이 나타난 모습 그대로 오래 보이지 않도록 빨리 맞춰줌
        addEventListener('scroll', () => { ls = Date.now(); }, { passive: true });
        // 맨 아래에 도달했는데 아직 채움이 없으면 그 화면 기준으로 다시 시도 (같은 문서 높이에선 1번만)
        addEventListener('scrollend', () => {
            const de = document.documentElement;
            if ((S.f && !undo || S.u) && scrollY + innerHeight >= de.scrollHeight - 2 && tried !== de.scrollHeight) { tried = de.scrollHeight; sched(200); }
        }, { passive: true });
        const start = () => {
            run();
            [400, 900, 1800, 3200, 5500].forEach(ms => setTimeout(later, ms)); // 뒤늦게 그려지는 UI(느린 네트워크·지연 렌더링) 대응
            document.fonts?.ready?.then(later); // 웹폰트 교체로 레이아웃이 바뀌는 경우 대응
            addEventListener('orientationchange', later);
            addEventListener('pageshow', later); // 뒤로/앞으로 가기로 캐시에서 복원될 때도 다시 확인
            const mo = new MutationObserver(later);
            if (S.g) {
                mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
                matchMedia('(prefers-color-scheme: dark)').addEventListener('change', later);
            }
            // subtree:true 필수 — 대부분의 사이트는 <body> 바로 아래가 아니라 깊은 곳에 내용을 렌더링해서, 이게 없으면 나중에 그려지는 UI를 놓침
            document.body && mo.observe(document.body, { childList: true, subtree: true });
        };
        ready(start); // DOMContentLoaded 시점(문서 해석 직후) — 이미지 등 나머지 자원을 기다리는 'load'보다 훨씬 빠르게 첫 적용
    }
})();
