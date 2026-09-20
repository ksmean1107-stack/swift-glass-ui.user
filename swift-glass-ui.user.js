// ==UserScript==
// @name         Swift Glass UI
// @namespace    http://tampermonkey.net/
// @version      SGU 0.0.1-Alpha-1
// @description  최초 작성: 지연 로딩·스크롤 최적화·링크 미리 준비로 로딩 속도 향상, iOS 27 리퀴드 글래스 스타일 UI(유리 바·설정 시트·투명도 슬라이더) 적용
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

    /* ───── 설정 시트 (iOS 27 Liquid Glass: 더 확산된 유리, 어두운 테두리, 밝은 하이라이트, 투명도 슬라이더) ───── */

    const SH = `
:host{all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;color:var(--c);font:15px/1.35 -apple-system,BlinkMacSystemFont,"SF Pro Text","Apple SD Gothic Neo",system-ui,sans-serif;--e:cubic-bezier(.32,.72,0,1);--c:#1c1c1e;--c2:rgba(60,60,67,.6);--g:255 255 255;--sep:rgba(60,60,67,.2);--a:.6;--as:.75}
@media (prefers-color-scheme:dark){:host{--c:#fff;--c2:rgba(235,235,245,.6);--g:44 44 46;--sep:rgba(84,84,88,.65)}}
[hidden]{display:none!important}
.glass{background:rgb(var(--g)/var(--al,var(--a)));-webkit-backdrop-filter:blur(28px) saturate(1.8);backdrop-filter:blur(28px) saturate(1.8);box-shadow:0 0 0 .5px rgba(0,0,0,.25),inset 0 1px .5px rgba(255,255,255,.6),inset 0 -1px .5px rgba(255,255,255,.14),0 12px 32px rgba(0,0,0,.2)}
@media (prefers-reduced-transparency:reduce),(prefers-contrast:more){.glass{background:rgb(var(--g));-webkit-backdrop-filter:none;backdrop-filter:none}}
.dock{position:fixed;left:max(14px,env(safe-area-inset-left,0px));bottom:calc(env(safe-area-inset-bottom,0px) + 22px);display:flex;padding:4px;border-radius:28px;pointer-events:auto;opacity:.62;transition:opacity .3s}
.dock:hover,.dock:focus-within,.dock:active{opacity:1}
.b{all:unset;box-sizing:border-box;cursor:pointer;-webkit-tap-highlight-color:transparent}
.b:focus-visible{outline:2px solid #0a84ff;outline-offset:2px}
.ib{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;transition:transform .35s var(--e),background .2s}
.ib:active{transform:scale(.88);background:rgb(128 128 128/.28)}
svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.dim{position:fixed;inset:0;background:rgba(0,0,0,.3);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .4s,visibility 0s .4s}
.sheet{position:fixed;left:0;right:0;bottom:calc(env(safe-area-inset-bottom,0px) + 8px);width:min(560px,calc(100% - 16px));max-height:calc(100% - 40px);overflow:auto;margin:0 auto;padding:8px 16px 16px;border-radius:34px;--al:var(--as);pointer-events:auto;outline:0;transform:translateY(calc(100% + 40px));visibility:hidden;transition:transform .55s var(--e),visibility 0s .55s}
.open .dim{opacity:1;visibility:visible;pointer-events:auto;transition:opacity .4s}
.open .sheet{transform:none;visibility:visible;transition:transform .55s var(--e)}
.top{padding-bottom:6px;touch-action:none}
.grab{width:36px;height:5px;border-radius:3px;margin:0 auto 12px;background:rgb(128 128 128/.5)}
h2{margin:0 4px 10px;font-size:20px;font-weight:600}
.grp{border-radius:22px;background:rgb(128 128 128/.16);overflow:hidden}
.grp+.grp{margin-top:14px}
.row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:11px 16px;min-height:52px}
.row+.row{border-top:.5px solid var(--sep)}
.col{flex-direction:column;align-items:stretch;gap:4px}
small{display:block;margin-top:2px;color:var(--c2);font-size:12.5px}
.ends{display:flex;justify-content:space-between;color:var(--c2);font-size:12px}
input{width:100%;margin:6px 0 0;accent-color:#0a84ff}
.sw{flex:none;position:relative;width:51px;height:31px;border-radius:16px;background:rgb(120 120 128/.32);transition:background .3s}
.sw::after{content:"";position:absolute;top:2px;left:2px;width:27px;height:27px;border-radius:50%;background:#fff;box-shadow:0 3px 8px rgba(0,0,0,.15),0 1px 1px rgba(0,0,0,.16);transition:transform .35s var(--e)}
.sw[aria-checked=true]{background:#34c759}
.sw[aria-checked=true]::after{transform:translateX(20px)}
.apply{display:block;width:100%;margin-top:14px;padding:15px;border-radius:999px;background:#0a84ff;color:#fff;font-weight:600;text-align:center;transition:transform .35s var(--e)}
.apply:active{transform:scale(.97)}
.note{text-align:center;margin-top:10px}
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
    const icon = d => {
        const s = document.createElementNS(NS, 'svg'), p = document.createElementNS(NS, 'path');
        s.setAttribute('viewBox', '0 0 24 24');
        p.setAttribute('d', d);
        s.append(p);
        return s;
    };

    const R = [
        ['l', '지연 로딩', '이미지·iframe·영상을 필요할 때 불러와요'],
        ['s', '스크롤 최적화', '터치·휠 이벤트를 패시브로 처리해요'],
        ['p', '링크 미리 준비', '누르는 순간 같은 사이트 페이지를 먼저 요청해요'],
        ['u', 'iOS 스타일', '시스템 폰트·둥근 컨트롤·유리 팝업 배경'],
        ['g', '유리 바', '고정 헤더·탭 바를 반투명 유리로'],
    ];

    const mount = () => {
        const host = document.createElement('sgu-ui'), root = host.attachShadow({ mode: 'closed' });
        const paint = () => {
            host.style.setProperty('--a', A(0.28));
            host.style.setProperty('--as', A(0.7));
            document.documentElement.style.setProperty('--sgu-a', A(0.4));
        };
        paint();
        css(SH, root);

        const row = ([k, t, d]) => h('div', { className: 'row' },
            h('div', {}, t, h('small', {}, d)),
            h('button', {
                className: 'b sw', role: 'switch', 'aria-checked': String(S[k]), 'aria-label': t,
                onclick() { this.setAttribute('aria-checked', String((S[k] = !S[k]))); save(); },
            }));

        const top = h('div', { className: 'top' }, h('div', { className: 'grab' }), h('h2', {}, 'Swift Glass UI'));
        const sheet = h('div', { className: 'sheet glass', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Swift Glass UI 설정', tabindex: -1 },
            top,
            h('div', { className: 'grp' }, ...R.map(row)),
            h('div', { className: 'grp' }, h('div', { className: 'row col' },
                h('div', {}, '유리 투명도'),
                h('input', {
                    type: 'range', min: 0, max: 100, value: Math.round(S.t * 100), 'aria-label': '유리 투명도',
                    oninput() { S.t = this.value / 100; paint(); },
                    onchange: save,
                }),
                h('div', { className: 'ends' }, h('span', {}, '맑게'), h('span', {}, '진하게')))),
            h('button', { className: 'b apply', onclick: () => location.reload() }, '새로고침하여 적용'),
            h('small', { className: 'note' }, '설정은 이 사이트에만 저장돼요'));

        const dim = h('div', { className: 'dim', onclick: () => show(false) });
        const up = h('button', {
            className: 'b ib', hidden: true, 'aria-label': '맨 위로',
            onclick: () => scrollTo({ top: 0, behavior: 'smooth' }),
        }, icon('M6 15l6-6 6 6'));
        const gear = h('button', { className: 'b ib', 'aria-label': 'Swift Glass UI 설정', onclick: () => show(true) },
            icon('M4 8h8.5M17.5 8H20M4 16h2.5M11.5 16H20M12.5 8a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M6.5 16a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0'));
        const wrap = h('div', {}, dim, sheet, h('div', { className: 'dock glass' }, up, gear));

        const show = on => {
            wrap.classList.toggle('open', on);
            (on ? sheet : gear).focus();
        };
        let y;
        top.addEventListener('touchstart', e => { y = e.touches[0].clientY; }, { passive: true });
        top.addEventListener('touchend', e => { if (e.changedTouches[0].clientY - y > 60) show(false); }, { passive: true });
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
