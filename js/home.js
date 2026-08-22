/* Canvas UI is loaded as a browser-native CDN module; DOM remains accessible HTML. */
let CanvasPoint;
try {
  ({ Point: CanvasPoint } = await import('https://cdn.jsdelivr.net/npm/@canvas-ui/core@2.0.0/+esm'));
  document.documentElement.dataset.canvasUi = 'ready';
} catch (error) {
  CanvasPoint = class Point { constructor(x = 0, y = 0) { this.x = x; this.y = y; } };
  document.documentElement.dataset.canvasUi = 'fallback';
}
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const gsap = window.gsap, ScrollTrigger = window.ScrollTrigger;
if (gsap && ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
const $ = (s, scope = document) => scope.querySelector(s);
const $$ = (s, scope = document) => [...scope.querySelectorAll(s)];
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function intro() {
  if (!gsap) { $('.loading-screen')?.remove(); return; }
  gsap.timeline({ defaults: { ease: 'power3.out' } }).to('.loading-screen>i b', { width: '100%', duration: .75 }).to('.loader-mark', { scale: 1.12, duration: .35 }, '-=.15').to('.loading-screen', { yPercent: -100, duration: .9, ease: 'power4.inOut' }).from('.site-header', { y: -90, duration: .7 }, '-=.35').from('.hero-line', { yPercent: 115, opacity: 0, stagger: .1, duration: .9 }, '-=.5').from('.hero .eyebrow,.hero-sub,.question-orb,.scroll-cue', { opacity: 0, y: 22, stagger: .08, duration: .6 }, '-=.55').set('.loading-screen', { display: 'none' });
}
function cursor() {
  const el = $('.cursor'); if (!el || innerWidth < 800 || reduceMotion || !gsap) return;
  const x = gsap.quickTo(el, 'x', { duration: .24, ease: 'power3' }), y = gsap.quickTo(el, 'y', { duration: .24, ease: 'power3' });
  addEventListener('pointermove', e => { x(e.clientX); y(e.clientY); });
  $$('a,button,.principle-row').forEach(target => { target.addEventListener('mouseenter', () => gsap.to(el, { scale: 1.7, duration: .25 })); target.addEventListener('mouseleave', () => gsap.to(el, { scale: 1, duration: .25 })); });
  $$('.magnetic').forEach(target => { target.addEventListener('pointermove', e => { const b = target.getBoundingClientRect(); gsap.to(target, { x: (e.clientX - b.left - b.width / 2) * .18, y: (e.clientY - b.top - b.height / 2) * .18, duration: .35 }); }); target.addEventListener('pointerleave', () => gsap.to(target, { x: 0, y: 0, duration: .6, ease: 'elastic.out(1,.35)' })); });
}
class ThoughtField {
  constructor(canvas) { this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.nodes = []; this.pointer = new CanvasPoint(-999, -999); this.active = true; this.resize = this.resize.bind(this); this.render = this.render.bind(this); addEventListener('resize', this.resize); addEventListener('pointermove', e => { this.pointer.x = e.clientX; this.pointer.y = e.clientY; }); document.addEventListener('visibilitychange', () => this.active = !document.hidden); this.resize(); this.render(); }
  resize() { const dpr = Math.min(devicePixelRatio, 2), box = this.canvas.getBoundingClientRect(); this.w = box.width; this.h = box.height; this.canvas.width = this.w * dpr; this.canvas.height = this.h * dpr; this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); const count = clamp(Math.round(this.w / 34), 24, 56); this.nodes = Array.from({ length: count }, () => ({ p: new CanvasPoint(Math.random() * this.w, Math.random() * this.h), vx: (Math.random() - .5) * .18, vy: (Math.random() - .5) * .18, r: Math.random() * 2 + .7 })); }
  burst(x = this.w * .75, y = this.h * .3) { this.nodes.forEach(n => { const a = Math.atan2(n.p.y - y, n.p.x - x); n.vx += Math.cos(a) * 1.8; n.vy += Math.sin(a) * 1.8; }); }
  render() { requestAnimationFrame(this.render); if (!this.active || reduceMotion) return; const c = this.ctx; c.clearRect(0, 0, this.w, this.h); for (let i = 0; i < this.nodes.length; i++) { const n = this.nodes[i], dx = n.p.x - this.pointer.x, dy = n.p.y - this.pointer.y, d = Math.hypot(dx, dy); if (d < 150) { n.vx += dx / Math.max(d, 1) * .012; n.vy += dy / Math.max(d, 1) * .012; } n.vx *= .985; n.vy *= .985; n.p.x += n.vx; n.p.y += n.vy; if (n.p.x < -20) n.p.x = this.w + 20; if (n.p.x > this.w + 20) n.p.x = -20; if (n.p.y < -20) n.p.y = this.h + 20; if (n.p.y > this.h + 20) n.p.y = -20; c.beginPath(); c.arc(n.p.x, n.p.y, n.r, 0, Math.PI * 2); c.fillStyle = i % 8 ? 'rgba(240,238,231,.42)' : '#c7ff32'; c.fill(); for (let j = i + 1; j < this.nodes.length; j++) { const m = this.nodes[j], distance = Math.hypot(n.p.x - m.p.x, n.p.y - m.p.y); if (distance < 125) { c.beginPath(); c.moveTo(n.p.x, n.p.y); c.lineTo(m.p.x, m.p.y); c.strokeStyle = `rgba(132,143,190,${(1 - distance / 125) * .2})`; c.stroke(); } } } }
}
function signalField(canvas) {
  const ctx = canvas.getContext('2d'); let width, height, progress = 0;
  const draw = () => { ctx.clearRect(0, 0, width, height); ctx.strokeStyle = 'rgba(9,10,12,.13)'; ctx.lineWidth = 1; for (let x = 0; x < width; x += 55) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); } for (let y = 0; y < height; y += 55) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); } const points = Array.from({ length: 26 }, (_, i) => new CanvasPoint((i / 25) * width, height * (.68 - .3 * (i / 25)) + Math.sin(i * 1.17) * height * .085)); ctx.beginPath(); points.forEach((p, i) => { if (i > progress * 25 + 1) return; if (!i) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }); ctx.strokeStyle = '#3f5cff'; ctx.lineWidth = 3; ctx.stroke(); points.forEach((p, i) => { if (i > progress * points.length) return; ctx.beginPath(); ctx.arc(p.x, p.y, i === 25 ? 8 : 3, 0, Math.PI * 2); ctx.fillStyle = i === 25 ? '#090a0c' : '#3f5cff'; ctx.fill(); }); };
  const resize = () => { const dpr = Math.min(devicePixelRatio, 2), box = canvas.getBoundingClientRect(); width = box.width; height = box.height; canvas.width = width * dpr; canvas.height = height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw(); }; addEventListener('resize', resize); resize();
  if (gsap) ScrollTrigger.create({ trigger: '.signals', start: 'top 75%', end: 'bottom 40%', scrub: true, onUpdate: self => { progress = self.progress; draw(); } }); else { progress = 1; draw(); }
}
function scrollMotion() {
  if (!gsap || reduceMotion) return;
  $$('.manifesto-line').forEach((line, i) => gsap.from(line, { xPercent: i % 2 ? 18 : -18, opacity: .1, scrollTrigger: { trigger: line, start: 'top 92%', end: 'top 45%', scrub: 1 } }));
  gsap.from('.manifesto-note', { y: 100, opacity: 0, scrollTrigger: { trigger: '.manifesto-note', start: 'top 90%', end: 'top 60%', scrub: 1 } });
  const journey = gsap.timeline({ scrollTrigger: { trigger: '.journey', start: 'top top', end: 'bottom bottom', scrub: 1 } });
  journey.to('.journey-title', { opacity: .12, scale: .84, transformOrigin: 'left center', duration: .7 }).to('.path-progress', { strokeDashoffset: 0, duration: 4 }, 0).to('.journey-progress b', { width: '100%', duration: 4 }, 0).to('.card-ask', { opacity: 1, scale: 1, rotate: -3, duration: .5 }, .1).to('.card-probe', { opacity: 1, scale: 1, rotate: 2, duration: .5 }, 1).to('.note-a', { opacity: 1, duration: .35 }, 1.45).to('.card-link', { opacity: 1, scale: 1, rotate: -2, duration: .5 }, 2).to('.note-b', { opacity: 1, duration: .35 }, 2.5).to('.card-own', { opacity: 1, scale: 1, rotate: 1, duration: .55 }, 3).to('.thought-card:not(.card-own)', { opacity: .38, filter: 'blur(2px)', duration: .45 }, 3.6);
  gsap.to('.product-shell', { rotateX: 0, scale: 1, ease: 'none', scrollTrigger: { trigger: '.product-shell', start: 'top 90%', end: 'center center', scrub: 1 } });
  gsap.from('.chat-block,.document-panel>*', { y: 35, opacity: 0, stagger: .06, scrollTrigger: { trigger: '.product-shell', start: 'top 55%' } });
  gsap.from('.workspace-features article', { y: 80, opacity: 0, stagger: .14, scrollTrigger: { trigger: '.workspace-features', start: 'top 80%' } });
  gsap.from('.principle-row', { xPercent: -10, opacity: 0, stagger: .12, scrollTrigger: { trigger: '.principles', start: 'top 65%' } });
  gsap.to('.final-orbit', { scale: 1.35, rotate: 210, scrollTrigger: { trigger: '.final-cta', start: 'top bottom', end: 'bottom top', scrub: 1 } });
  gsap.from('.final-cta h2', { scale: .6, opacity: 0, scrollTrigger: { trigger: '.final-cta', start: 'top 70%', end: 'center 55%', scrub: 1 } });
}
function controls(field) {
  const menu = $('.menu-button'), panel = $('.mobile-menu'); menu?.addEventListener('click', () => { const open = menu.getAttribute('aria-expanded') !== 'true'; menu.setAttribute('aria-expanded', String(open)); panel.classList.toggle('open', open); });
  $$('.mobile-menu a').forEach(link => link.addEventListener('click', () => { menu?.setAttribute('aria-expanded', 'false'); panel?.classList.remove('open'); }));
  $('.question-orb')?.addEventListener('click', e => field?.burst(e.clientX, e.clientY)); if (gsap && !reduceMotion) gsap.to('.question-orb', { x: 12, y: -18, duration: 3.2, repeat: -1, yoyo: true, ease: 'sine.inOut' });
}
const field = $('#question-canvas') ? new ThoughtField($('#question-canvas')) : null;
if ($('#signal-canvas')) signalField($('#signal-canvas'));
cursor(); controls(field); scrollMotion();
if (document.fonts?.ready) document.fonts.ready.then(intro); else addEventListener('load', intro, { once: true });
