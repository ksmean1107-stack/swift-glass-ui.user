// ==UserScript==
// @name         Swift Glass UI
// @namespace    http://tampermonkey.net/
// @version      SGU 0.0.2-Alpha-2
// @description  0.0.2: 설정 화면을 실제 iOS 27 설정 앱 스타일로 개편(푸시 페이지·캡슐 카드·신형 스위치·글래스 렌즈 슬라이더) / 0.0.1: 최초 작성(속도 최적화 + 리퀴드 글래스 UI)
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
    const D = { l: true, s: true, p: true, u: true, g: true, t: 0.5 };
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

    // 2) 이미지·iframe 지연 로딩, 디코딩 비동기, 미디어 preload 최소화
    if (S.l) {
        let c = 0;
        const fix = e => {
            const t = e.localName;
            if (t === 'img') {
                if (++c > 4 && !e.hasAttribute('loading') && !e.hasAttribute('fetchpriority')) e.loading = 'lazy';
                if (!e.hasAttribute('decoding')) e.decoding = 'async';
            } else if (t === 'iframe') {
                if (!e.hasAttribute('loading')) e.loading = 'lazy';
            } else if ((t === 'video' || t === 'audio') && !e.autoplay && e.getAttribute('preload') !== 'none') {
                e.preload = 'metadata';
            }
        };
        const walk = n => {
            if (n.nodeType !== 1) return;
            fix(n);
            n.querySelectorAll('img,iframe,video,audio').forEach(fix);
        };
        new MutationObserver(m => m.forEach(r => r.addedNodes.forEach(walk)))
            .observe(document, { childList: true, subtree: true });
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

    /* ───── 설정 화면 (iOS 27 설정 앱 스타일: 푸시 페이지·캡슐 카드·신형 스위치·글래스 렌즈 슬라이더) ───── */

    const VER = 'SGU 0.0.2-Alpha-2';
    const SH = `
:host{all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;color:var(--c);font:16px/1.3 -apple-system,BlinkMacSystemFont,"SF Pro Text","Apple SD Gothic Neo",system-ui,sans-serif;--e:cubic-bezier(.32,.72,0,1);--bg:#f2f2f7;--card:#fff;--c:#000;--c2:rgba(60,60,67,.6);--sep:rgba(60,60,67,.2);--off:rgba(120,120,128,.16);--rail:rgba(120,120,128,.2);--lens:rgba(255,255,255,.4);--gr:#34c759;--g:255 255 255;--a:.6}
@media (prefers-color-scheme:dark){:host{--bg:#000;--card:#1c1c1e;--c:#fff;--c2:rgba(235,235,245,.6);--sep:rgba(84,84,88,.65);--off:#39393d;--rail:#3a3a3c;--lens:rgba(58,58,62,.5);--gr:#30d158;--g:44 44 46}}
[hidden]{display:none!important}
.b{all:unset;box-sizing:border-box;cursor:pointer;-webkit-tap-highlight-color:transparent}
.b:focus-visible{outline:2px solid #0a84ff;outline-offset:2px}
.glass{background:rgb(var(--g)/var(--a));-webkit-backdrop-filter:blur(28px) saturate(1.8);backdrop-filter:blur(28px) saturate(1.8);box-shadow:0 0 0 .5px rgba(0,0,0,.25),inset 0 1px .5px rgba(255,255,255,.6),inset 0 -1px .5px rgba(255,255,255,.14),0 12px 32px rgba(0,0,0,.2)}
@media (prefers-reduced-transparency:reduce),(prefers-contrast:more){.glass{background:rgb(var(--g));-webkit-backdrop-filter:none;backdrop-filter:none}}
svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.dock{position:fixed;left:max(14px,env(safe-area-inset-left,0px));bottom:calc(env(safe-area-inset-bottom,0px) + 22px);display:flex;padding:4px;border-radius:28px;pointer-events:auto;opacity:.62;transition:opacity .3s}
.dock:hover,.dock:focus-within,.dock:active{opacity:1}
.ib{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;transition:transform .35s var(--e),background .2s}
.ib:active{transform:scale(.88);background:rgb(128 128 128/.28)}
.dim{position:fixed;inset:0;background:rgba(0,0,0,.35);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .4s,visibility 0s .4s}
.page{position:fixed;inset:0;overflow:auto;overscroll-behavior:contain;background:var(--bg);pointer-events:auto;outline:0;transform:translateX(100vw);visibility:hidden;transition:transform .55s var(--e),visibility 0s .55s}
@media (min-width:700px){.page{inset:32px auto 32px 50%;width:560px;margin-left:-280px;border-radius:34px;box-shadow:0 0 0 .5px rgba(0,0,0,.3),0 30px 80px rgba(0,0,0,.45)}}
.open .dim{opacity:1;visibility:visible;pointer-events:auto;transition:opacity .4s}
.open .page{transform:none;visibility:visible;transition:transform .55s var(--e)}
.in{max-width:600px;margin:0 auto;padding-bottom:calc(env(safe-area-inset-bottom,0px) + 40px)}
.nav{position:sticky;top:0;z-index:2;box-sizing:border-box;height:calc(env(safe-area-inset-top,0px) + 68px);padding:env(safe-area-inset-top,0px) 20px 0;display:grid;grid-template-columns:44px 1fr 44px;align-items:center;gap:12px}
.nav::before{content:"";position:absolute;inset:0 0 -14px;z-index:-1;background:linear-gradient(var(--bg) 50%,transparent);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);-webkit-mask-image:linear-gradient(#000 55%,transparent);mask-image:linear-gradient(#000 55%,transparent);opacity:0;transition:opacity .25s}
.nav::after{content:""}
.sc .nav::before{opacity:1}
.ti{margin:0;font-size:17px;font-weight:600;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sec{margin-bottom:30px}
.nav+.sec{margin-top:24px}
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
.sl{gap:14px;min-height:66px}
.si{flex:none;color:var(--c2)}
.f{fill:currentColor}
.tr{--w:39px;--wa:58px;position:relative;flex:1;height:44px;touch-action:none;cursor:pointer;outline:0;-webkit-tap-highlight-color:transparent}
.rail{position:absolute;left:0;right:0;top:50%;height:6px;margin-top:-3px;border-radius:3px;background:var(--rail);overflow:hidden}
.fl{position:absolute;inset:0 auto 0 0;width:calc(var(--w)/2 + (100% - var(--w))*var(--v));background:#0a84ff;transition:width .18s}
.th{position:absolute;top:50%;left:calc((100% - var(--w))*var(--v));width:var(--w);height:23px;margin-top:-11.5px;border-radius:999px;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,.3);transition:left .18s,width .4s var(--e),height .4s var(--e),margin-top .4s var(--e),background .3s,box-shadow .3s}
.on .fl{width:calc(100%*var(--v))}
.on .th{left:calc(100%*var(--v) - var(--wa)/2);width:var(--wa);height:37px;margin-top:-18.5px;background:var(--lens);-webkit-backdrop-filter:blur(1px) saturate(1.6) brightness(1.15);backdrop-filter:blur(1px) saturate(1.6) brightness(1.15);box-shadow:inset 0 0 0 1px rgba(255,255,255,.16),inset 0 2px 2px rgba(255,255,255,.3),inset 0 -3px 4px rgba(0,0,0,.35),0 6px 18px rgba(0,0,0,.4)}
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
            '화면에 가까워질 때 이미지·iframe·영상을 불러오고, 터치·휠 이벤트는 패시브로 처리해요. 링크는 누르는 순간 같은 사이트 페이지를 먼저 요청해요.'],
        ['화면', [['u', 'iOS 스타일'], ['g', '유리 바']],
            '시스템 폰트·둥근 컨트롤·유리 팝업 배경을 쓰고, 고정 헤더와 탭 바를 반투명 유리로 바꿔요.'],
    ];
    const CIRCLE = 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16';

    const mount = () => {
        const host = document.createElement('sgu-ui'), root = host.attachShadow({ mode: 'closed' });
        const paint = () => {
            host.style.setProperty('--a', A(0.28));
            document.documentElement.style.setProperty('--sgu-a', A(0.4));
        };
        paint();
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

        // 누르는 동안 흰 알약 → 유리 렌즈로 바뀌는 iOS 27 슬라이더
        const slider = () => {
            const th = h('div', { className: 'th' });
            const tr = h('div', {
                className: 'tr', role: 'slider', tabindex: 0, 'aria-label': '유리 투명도', 'aria-valuemin': 0, 'aria-valuemax': 100,
            }, h('div', { className: 'rail' }, h('div', { className: 'fl' })), th);
            const put = v => {
                S.t = Math.min(1, Math.max(0, v));
                tr.style.setProperty('--v', S.t);
                tr.setAttribute('aria-valuenow', Math.round(S.t * 100));
                paint();
            };
            const pos = e => { const r = tr.getBoundingClientRect(); put((e.clientX - r.left) / r.width); };
            tr.addEventListener('pointerdown', e => { tr.setPointerCapture(e.pointerId); tr.classList.add('on'); pos(e); });
            tr.addEventListener('pointermove', e => { if (tr.hasPointerCapture(e.pointerId)) pos(e); });
            ['pointerup', 'pointercancel'].forEach(t => tr.addEventListener(t, () => { tr.classList.remove('on'); save(); }));
            tr.addEventListener('keydown', e => {
                const d = { ArrowRight: 0.05, ArrowUp: 0.05, ArrowLeft: -0.05, ArrowDown: -0.05 }[e.key];
                if (d) { e.preventDefault(); put(S.t + d); save(); }
            });
            put(S.t);
            return tr;
        };

        const bk = h('button', { className: 'b ib glass', 'aria-label': '닫기', onclick: () => show(false) }, icon('M15 5l-7 7 7 7'));
        const page = h('div', { className: 'page', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Swift Glass UI 설정', tabindex: -1 },
            h('div', { className: 'in' },
                h('div', { className: 'nav' }, bk, h('h1', { className: 'ti' }, 'Swift Glass UI')),
                ...R.map(([hd, rows, ft]) => sec(hd, rows.map(row), ft)),
                sec('유리 투명도', [h('div', { className: 'row sl' }, icon(CIRCLE, 'si'), slider(), icon(CIRCLE, 'si f'))],
                    '맑게부터 진하게까지 조절해요. 투명도 줄이기가 켜져 있으면 항상 불투명하게 보여요.'),
                sec(null, [h('button', { className: 'b row act', onclick: () => location.reload() }, '새로 고침하여 적용')],
                    '설정은 이 사이트에만 저장되고, 새로 고침하면 적용돼요.'),
                sec(null, [h('div', { className: 'row' }, h('span', {}, '버전'), h('span', { className: 'val' }, VER))])));

        const up = h('button', {
            className: 'b ib', hidden: true, 'aria-label': '맨 위로',
            onclick: () => scrollTo({ top: 0, behavior: 'smooth' }),
        }, icon('M6 15l6-6 6 6'));
        const gear = h('button', { className: 'b ib', 'aria-label': 'Swift Glass UI 설정', onclick: () => show(true) },
            icon('M4 8h8.5M17.5 8H20M4 16h2.5M11.5 16H20M12.5 8a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M6.5 16a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0'));
        const wrap = h('div', {}, h('div', { className: 'dim', onclick: () => show(false) }), h('div', { className: 'dock glass' }, up, gear), page);

        const show = on => {
            wrap.classList.toggle('open', on);
            (on ? page : gear).focus({ preventScroll: true });
        };
        page.addEventListener('scroll', () => page.classList.toggle('sc', page.scrollTop > 4), { passive: true });
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && wrap.classList.contains('open')) show(false); });

        let q;
        addEventListener('scroll', () => q || (q = requestAnimationFrame(() => { q = 0; up.hidden = scrollY < 600; })), { passive: true });

        root.append(wrap);
        document.documentElement.append(host);
    };

    ready(mount);

    if (S.g) {
        let t;
        const later = () => { clearTimeout(t); t = setTimeout(scan, 500); };
        const start = () => {
            scan();
            const mo = new MutationObserver(later), o = { attributes: true, attributeFilter: ['class', 'data-theme'] };
            mo.observe(document.documentElement, o);
            document.body && mo.observe(document.body, o);
            matchMedia('(prefers-color-scheme: dark)').addEventListener('change', later);
        };
        document.readyState === 'complete' ? start() : addEventListener('load', start, { once: true });
    }
})();
