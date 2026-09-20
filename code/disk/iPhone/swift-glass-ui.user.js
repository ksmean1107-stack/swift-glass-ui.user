// ==UserScript==
// @name         Swift Glass UI
// @namespace    http://github.com/ksmean1107
// @version      SGU 1.0.0-Beta-1
// @description  1.0.0: 스크롤 버벅임 수정(리사이즈·클래스 감시 부하 제거)·맨 위로 버튼 즉시 표시/즉시 이동·iOS식 고무줄 슬라이더 / 0.0.3: 슬라이더 최적화·앱 배너 숨김·모프 열기 / 0.0.1: 최초 작성
// @downloadURL  https://github.com/ksmean1107-stack/swift-glass-ui.user/code/disk/iPhone/swift-glass-ui.user.js
// @updateURL    https://github.com/ksmean1107-stack/swift-glass-ui.user/code/disk/iPhone/swift-glass-ui.user.js
// @author       ksmean1107
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
    const D = { l: true, s: true, p: true, u: true, g: true, b: true, t: 0.5 };
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

    // CSP에 막히지 않도록 constructable stylesheet 우선, 미지원 시 <style> 폴백
    const css = (text, root = document) => {
        try {
            const s = new CSSStyleSheet();
            s.replaceSync(text);
            root.adoptedStyleSheets = [...root.adoptedStyleSheets, s];
        } catch (e) {
            const el = document.createElement('style');
            el.textContent = text;
            (root.head || root.documentElement || root).append(el);
        }
    };

    /* ───── 속도 ───── */

    // 1) 터치·휠 리스너를 기본 passive로 (명시적 passive 지정은 존중)
    if (S.s) {
        const P = new Set(['touchstart', 'touchmove', 'wheel', 'mousewheel']);
        const add = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function (t, f, o) {
            if (P.has(t)) {
                const c = o && typeof o === 'object' ? o : { capture: !!o };
                if (!('passive' in c)) o = { ...c, passive: true };
            }
            return add.call(this, t, f, o);
        };
    }

    // 2) 지연 로딩 + 화면 2.5배 앞에서 미리 불러오기(Safari 기본 지연 로딩은 늦게 시작해 이미지가 뒤늦게 뜸)
    //    + Safari 스마트 앱 배너 메타 제거
    const SEL = [S.l && 'img,iframe,video,audio', S.b && 'meta[name=apple-itunes-app]'].filter(Boolean).join();
    if (SEL) {
        let c = 0;
        const io = S.l && new IntersectionObserver(es => es.forEach(r => {
            if (r.isIntersecting) { r.target.loading = 'eager'; io.unobserve(r.target); }
        }), { rootMargin: '250% 100%' });
        const lazy = e => { e.loading = 'lazy'; io.observe(e); };
        const fix = e => {
            const t = e.localName;
            if (t === 'meta') e.remove();
            else if (t === 'img') { if (++c > 4 && !e.hasAttribute('loading') && !e.hasAttribute('fetchpriority')) lazy(e); }
            else if (t === 'iframe') { if (!e.hasAttribute('loading')) lazy(e); }
            else if (!e.autoplay && e.getAttribute('preload') !== 'none') e.preload = 'metadata';
        };
        const walk = n => {
            if (n.nodeType !== 1) return;
            if (n.matches(SEL)) fix(n);
            n.querySelectorAll(SEL).forEach(fix);
        };
        new MutationObserver(m => m.forEach(r => r.addedNodes.forEach(walk)))
            .observe(document, { childList: true, subtree: true });
        document.documentElement && walk(document.documentElement);
    }

    // 3) 누르는 순간 같은 사이트 링크를 미리 요청 (같은 출처·GET·위험 경로 제외·최대 12개)
    if (S.p && !navigator.connection?.saveData) {
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
        ['touchstart', 'mousedown'].forEach(t => document.addEventListener(t, go, { passive: true, capture: true }));
    }

    /* ───── 페이지 UI: 시스템 폰트·둥근 컨트롤·유리 바 (사이트 CSS를 최대한 덜 건드림) ───── */

    const UI = `
:root{--sgu-t:#0a84ff;--sgu-e:cubic-bezier(.32,.72,0,1);--sgu-f:-apple-system,BlinkMacSystemFont,"SF Pro Text","Apple SD Gothic Neo","Helvetica Neue",system-ui,sans-serif}
:where(html){-webkit-text-size-adjust:100%;text-size-adjust:100%;-webkit-tap-highlight-color:transparent;-webkit-font-smoothing:antialiased;accent-color:var(--sgu-t);caret-color:var(--sgu-t);scrollbar-color:rgba(128,128,128,.5) transparent}
:where(*){scrollbar-width:thin}
::selection{background:rgba(10,132,255,.3)}
body :is(p,h1,h2,h3,h4,h5,h6,li,a,label,dt,dd,blockquote,figcaption,summary,button,input,select):not(pre *,code *,[class*=icon i],[class*=fa-],[class*=material i],[class*=glyph i]){font-family:var(--sgu-f)!important}
:where(button,select,textarea,input:not([type=checkbox],[type=radio],[type=range],[type=color],[type=file],[type=image],[type=hidden])){border-radius:12px}
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

    // "앱에서 열기"·앱 설치 유도 배너 숨기기: 이름이 확실한 배너 + 상단/하단 고정 얇은 띠(문구 일치)
    const NAMED = '[class*=app-banner i],[class*=appbanner i],[class*=smartbanner i],[class*=smart-banner i],[class*=open-in-app i],[class*=install-app i],[id*=app-banner i],[id*=appbanner i],[id*=smartbanner i]';
    const APP = /앱(에서|으로)\s?(열기|보기|열어)|앱\s?(열기|설치|다운로드)|open in (the )?app|get the app|(install|download) (the )?app/i;
    const sweep = () => document.querySelectorAll(NAMED + ',body>*').forEach(e => {
        const r = e.getBoundingClientRect();
        if (!r.height || r.height > 200) return;
        if (e.matches(NAMED) || (/^(fixed|sticky)$/.test(getComputedStyle(e).position) && r.height < 140
            && e.textContent.length < 120 && APP.test(e.textContent))) e.style.setProperty('display', 'none', 'important');
    });

    /* ───── 설정 창 (iOS 26·27 메뉴처럼 버튼에서 유리 방울이 커지며 열림 + iOS 27 설정 앱 스타일) ───── */

    const VER = 'SGU 1.0.0-Beta-1';
    const SH = `
:host{all:initial;position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;color:var(--c);font:16px/1.3 -apple-system,BlinkMacSystemFont,"SF Pro Text","Apple SD Gothic Neo",system-ui,sans-serif;--e:cubic-bezier(.32,.72,0,1);--bgc:242 242 247;--card:#fff;--c:#000;--c2:rgba(60,60,67,.6);--sep:rgba(60,60,67,.2);--off:rgba(120,120,128,.16);--rail:rgba(120,120,128,.2);--lens:rgba(255,255,255,.4);--gr:#34c759;--g:255 255 255;--a:.6}
@media (prefers-color-scheme:dark){:host{--bgc:0 0 0;--card:#1c1c1e;--c:#fff;--c2:rgba(235,235,245,.6);--sep:rgba(84,84,88,.65);--off:#39393d;--rail:#3a3a3c;--lens:rgba(58,58,62,.5);--gr:#30d158;--g:44 44 46}}
[hidden]{display:none!important}
.b{all:unset;box-sizing:border-box;cursor:pointer;-webkit-tap-highlight-color:transparent}
.b:focus-visible{outline:2px solid #0a84ff;outline-offset:2px}
.glass{background:rgb(var(--g)/var(--a));-webkit-backdrop-filter:blur(28px) saturate(1.8);backdrop-filter:blur(28px) saturate(1.8);box-shadow:0 0 0 .5px rgba(0,0,0,.25),inset 0 1px .5px rgba(255,255,255,.6),inset 0 -1px .5px rgba(255,255,255,.14),0 12px 32px rgba(0,0,0,.2)}
@media (prefers-reduced-transparency:reduce),(prefers-contrast:more){.glass{background:rgb(var(--g));-webkit-backdrop-filter:none;backdrop-filter:none}.page{background:rgb(var(--bgc));-webkit-backdrop-filter:none;backdrop-filter:none}}
svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.dock{position:fixed;left:max(14px,env(safe-area-inset-left,0px));bottom:calc(env(safe-area-inset-bottom,0px) + 22px);display:flex;gap:8px;pointer-events:none;transition:opacity .3s,transform .4s var(--e)}
.dock>*{pointer-events:auto}
.open .dock{opacity:0;transform:scale(.7)}
.open .dock>*{pointer-events:none}
.ib{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;transition:transform .35s var(--e),background .2s}
.ib:active{transform:scale(.88);background:rgb(128 128 128/.28)}
.dk{width:48px;height:48px;opacity:.72;transition:opacity .3s,transform .35s var(--e),background .2s}
.dk:hover,.dk:focus-visible{opacity:1}
.up{opacity:0;visibility:hidden;transform:scale(.6)}
.up.show{opacity:.72;visibility:visible;transform:none}
@supports (animation-timeline:scroll()){.up{animation:upin linear both;animation-timeline:scroll(root);animation-range:400px 520px}}
@keyframes upin{from{opacity:0;visibility:hidden;transform:scale(.6)}to{opacity:.72;visibility:visible;transform:none}}
.dim{position:fixed;inset:0;background:rgba(0,0,0,.2);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .4s,visibility 0s .4s}
.open .dim{opacity:1;visibility:visible;pointer-events:auto;transition:opacity .4s}
.page{position:fixed;left:max(12px,env(safe-area-inset-left,0px));bottom:calc(env(safe-area-inset-bottom,0px) + 12px);width:min(392px,calc(100% - 24px));height:min(740px,calc(100% - 72px));overflow:hidden;border-radius:50%;background:rgb(var(--bgc)/.86);-webkit-backdrop-filter:blur(30px) saturate(1.8);backdrop-filter:blur(30px) saturate(1.8);box-shadow:0 0 0 .5px rgba(0,0,0,.3),inset 0 1px .5px rgba(255,255,255,.35),0 24px 64px rgba(0,0,0,.4);pointer-events:auto;outline:0;opacity:0;visibility:hidden;transform:scale(.1);transition:transform .45s var(--e),border-radius .45s var(--e),opacity .18s .12s,visibility 0s .45s}
.open .page{opacity:1;visibility:visible;transform:none;border-radius:36px;transition:transform .5s var(--e),border-radius .5s var(--e),opacity .12s}
.idle{content-visibility:hidden}
.sv{position:absolute;inset:0;overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
.in{padding-bottom:20px;opacity:0;filter:blur(8px);transition:opacity .2s,filter .2s}
.open .in{opacity:1;filter:none;transition:opacity .3s .12s,filter .35s .1s}
.nav{position:sticky;top:0;z-index:2;box-sizing:border-box;height:64px;padding:0 16px;display:grid;grid-template-columns:44px 1fr 44px;align-items:center;gap:12px}
.nav::before{content:"";position:absolute;inset:0 0 -12px;z-index:-1;background:linear-gradient(rgb(var(--bgc)/.92) 55%,transparent);opacity:0;transition:opacity .25s}
.nav::after{content:""}
.sc .nav::before{opacity:1}
.ti{margin:0;font-size:17px;font-weight:600;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sec{margin-bottom:30px}
.nav+.sec{margin-top:8px}
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
.fl{position:absolute;inset:0;background:#0a84ff;transform-origin:0 50%;transform:scaleX(0);will-change:transform}
.pt{position:absolute;left:0;top:50%;width:0;height:0;will-change:transform}
.th{position:absolute;left:0;top:0;width:39px;height:23px;transform:translate(-50%,-50%);border-radius:999px;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.3);transition:width .35s var(--e),height .35s var(--e),background-color .25s,box-shadow .25s,transform .55s cubic-bezier(.34,1.56,.64,1)}
.th::before{content:"";position:absolute;inset:0;border-radius:inherit;background:linear-gradient(rgba(255,255,255,.18),rgba(255,255,255,0) 50%),var(--lens);box-shadow:inset 0 0 0 1px rgba(255,255,255,.16),inset 0 2px 2px rgba(255,255,255,.28),inset 0 -3px 4px rgba(0,0,0,.35);opacity:0;transition:opacity .25s}
.th::after{content:"";position:absolute;left:14%;right:14%;top:50%;height:8px;margin-top:-4px;border-radius:4px;background:rgba(255,255,255,.14);filter:blur(1px);opacity:0;transition:opacity .25s}
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
        ['속도', [['l', '지연 로딩'], ['s', '스크롤 최적화'], ['p', '링크 미리 준비']],
            '이미지·iframe·영상은 화면 2~3장 앞에서 미리 불러오고, 터치·휠 이벤트는 패시브로 처리해요. 링크는 누르는 순간 같은 사이트 페이지를 먼저 요청해요.'],
        ['화면', [['u', 'iOS 스타일'], ['g', '유리 바']],
            '시스템 폰트·둥근 컨트롤·유리 팝업 배경을 쓰고, 고정 헤더와 탭 바를 반투명 유리로 바꿔요.'],
        ['정리', [['b', '앱 열기 배너 숨기기']],
            '"앱에서 열기"·앱 설치 유도 배너와 Safari 스마트 앱 배너를 숨겨요.'],
    ];
    const CIRCLE = 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16';

    const mount = () => {
        const host = document.createElement('sgu-ui'), root = host.attachShadow({ mode: 'closed' });
        const paintHost = () => host.style.setProperty('--a', A(0.28));
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

        // iOS 슬라이더: 흰 알약 → 글래스 렌즈, 끝을 넘겨 당기면 전체가 고무줄처럼 늘어났다가 튕겨 돌아옴
        // 버벅임 방지: 드래그 중엔 transform(합성 전용)만 갱신, 레이아웃 읽기는 터치 시작 때 1번, 문서 스타일은 손 뗄 때 1번
        const slider = () => {
            const TW = 39, MAX = 24; // 평소 손잡이 너비, 최대 늘어남(px)
            const th = h('div', { className: 'th' }), pt = h('div', { className: 'pt' }, th), fl = h('div', { className: 'fl' });
            const tr = h('div', {
                className: 'tr', role: 'slider', tabindex: 0, 'aria-label': '유리 투명도', 'aria-valuemin': 0, 'aria-valuemax': 100,
            }, h('div', { className: 'rail' }, fl), pt);
            const sb = h('div', { className: 'sb' }, icon(CIRCLE, 'si'), tr, icon(CIRCLE, 'si f'));
            let w = 0, bw = 0, x0 = 0, off = 0, cx = 0, st = 0, raf = 0;
            const rb = o => Math.sign(o) * MAX * (1 - 1 / (Math.abs(o) * 0.55 / MAX + 1)); // iOS식 고무줄 감쇠
            const draw = () => {
                raf = 0;
                if (!w) return;
                const k = 1 + Math.abs(st) / (bw || 1);
                if (st) sb.style.transformOrigin = st > 0 ? '0 50%' : '100% 50%';
                pt.style.transform = `translate3d(${cx}px,0,0)`;
                fl.style.transform = `scaleX(${cx / w})`;
                sb.style.transform = `scaleX(${k})`;
                th.style.transform = `translate(-50%,-50%) scaleX(${(1 - 0.12 * Math.min(1, Math.abs(st) / 16)) / k})`;
                tr.setAttribute('aria-valuenow', Math.round(S.t * 100));
            };
            const go = () => { raf || (raf = requestAnimationFrame(draw)); };
            const put = v => {
                S.t = Math.min(1, Math.max(0, v));
                cx = TW / 2 + S.t * (w - TW);
                st = 0;
                go();
            };
            const sync = () => { w = tr.clientWidth; bw = sb.clientWidth; put(S.t); };
            const pos = e => {
                const raw = e.clientX - x0 + off, c = Math.min(w - TW / 2, Math.max(TW / 2, raw));
                S.t = (c - TW / 2) / (w - TW);
                cx = c;
                st = rb(raw - c);
                go();
            };
            const end = () => { sb.classList.remove('on'); st = 0; go(); paintHost(); paintPage(); save(); };
            tr.addEventListener('pointerdown', e => {
                w = tr.clientWidth;
                bw = sb.clientWidth;
                x0 = tr.getBoundingClientRect().left;
                const x = e.clientX - x0;
                off = Math.abs(x - cx) < TW / 2 + 8 ? cx - x : 0; // 손잡이를 잡으면 튀지 않고, 트랙을 누르면 그 위치로
                tr.setPointerCapture(e.pointerId);
                sb.classList.add('on');
                pos(e);
            });
            tr.addEventListener('pointermove', e => { if (tr.hasPointerCapture(e.pointerId)) pos(e); });
            tr.addEventListener('pointerup', end);
            tr.addEventListener('pointercancel', end);
            tr.addEventListener('keydown', e => {
                const d = { ArrowRight: 0.05, ArrowUp: 0.05, ArrowLeft: -0.05, ArrowDown: -0.05 }[e.key];
                if (d) { e.preventDefault(); put(S.t + d); paintHost(); paintPage(); save(); }
            });
            return [sb, sync];
        };
        const [sl, sync] = slider();

        const bk = h('button', { className: 'b ib glass', 'aria-label': '닫기', onclick: () => show(false) }, icon('M6 6l12 12M18 6L6 18'));
        const page = h('div', { className: 'page idle', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Swift Glass UI 설정', tabindex: -1 },
            h('div', { className: 'sv' }, h('div', { className: 'in' },
                h('div', { className: 'nav' }, bk, h('h1', { className: 'ti' }, 'Swift Glass UI')),
                ...R.map(([hd, rows, ft]) => sec(hd, rows.map(row), ft)),
                sec('유리 투명도', [h('div', { className: 'row sl' }, sl)],
                    '맑게부터 진하게까지 조절해요. 투명도 줄이기가 켜져 있으면 항상 불투명하게 보여요.'),
                sec(null, [h('button', { className: 'b row act', onclick: () => location.reload() }, '새로 고침하여 적용')],
                    '설정은 이 사이트에만 저장되고, 새로 고침하면 적용돼요.'),
                sec(null, [h('div', { className: 'row' }, h('span', {}, '버전'), h('span', { className: 'val' }, VER))]))));

        // 맨 위로: 스크롤 타임라인(CSS)으로 표시 → 메인 스레드가 바빠도(관성 스크롤 중에도) 즉시 나타남. 이동은 즉시(부드러운 스크롤 X)
        const up = h('button', {
            className: 'b ib dk up glass', 'aria-label': '맨 위로',
            onclick: () => scrollTo({ top: 0, behavior: 'instant' }),
        }, icon('M6 15l6-6 6 6'));
        const gear = h('button', { className: 'b ib dk glass', 'aria-label': 'Swift Glass UI 설정', onclick: () => show(true) },
            icon('M4 8h8.5M17.5 8H20M4 16h2.5M11.5 16H20M12.5 8a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M6.5 16a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0'));
        const wrap = h('div', {}, h('div', { className: 'dim', onclick: () => show(false) }), h('div', { className: 'dock' }, gear, up), page);

        // 열기/닫기: 설정 버튼 위치에서 유리 방울이 커지고, 닫을 땐 다시 버튼으로 빨려 들어감. 닫힌 동안엔 내부 렌더링 생략
        const show = on => {
            if (on) {
                page.classList.remove('idle');
                const g = gear.getBoundingClientRect();
                page.style.transformOrigin = `${g.left + g.width / 2 - page.offsetLeft}px ${g.top + g.height / 2 - page.offsetTop}px`;
                wrap.classList.add('open');
                sync();
            } else {
                wrap.classList.remove('open');
                setTimeout(() => wrap.classList.contains('open') || page.classList.add('idle'), 650);
            }
            (on ? page : gear).focus({ preventScroll: true });
        };
        page.firstChild.addEventListener('scroll', e => page.classList.toggle('sc', e.target.scrollTop > 4), { passive: true });
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && wrap.classList.contains('open')) show(false); });
        // 스크롤 타임라인 미지원 브라우저용 폴백 (resize 리스너는 Safari 툴바 접힘마다 강제 레이아웃을 일으켜 제거)
        if (!CSS.supports('animation-timeline', 'scroll()')) addEventListener('scroll', () => up.classList.toggle('show', scrollY > 460), { passive: true });

        root.append(wrap);
        document.documentElement.append(host);
        sync();
    };

    ready(mount);

    if (S.g || S.b) {
        let t, ls = 0;
        const run = () => { S.g && scan(); S.b && sweep(); };
        const later = () => { clearTimeout(t); t = setTimeout(() => Date.now() - ls < 400 ? later() : run(), 600); }; // 스크롤 중엔 강제 레이아웃 방지
        addEventListener('scroll', () => { ls = Date.now(); }, { passive: true });
        const start = () => {
            run();
            const mo = new MutationObserver(later);
            if (S.g) {
                mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
                matchMedia('(prefers-color-scheme: dark)').addEventListener('change', later);
            }
            if (document.body) {
                mo.observe(document.body, S.g
                    ? { attributes: true, attributeFilter: ['class', 'data-theme'], childList: S.b }
                    : { childList: true });
            }
        };
        document.readyState === 'complete' ? start() : addEventListener('load', start, { once: true });
    }
})();
