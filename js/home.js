const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const aborter = new AbortController();
const listenerOptions = { signal: aborter.signal };

const trails = {
  math: {
    start: 'Derivatives still feel abstract.',
    q1: 'What does slope tell you about a straight line?',
    you: 'How quickly it rises or falls.',
    q2: 'How could we measure that on a curve at one exact point?'
  },
  code: {
    start: 'Recursion keeps tying my brain in knots.',
    q1: 'What must every repeating process eventually do?',
    you: 'Reach a place where it stops.',
    q2: 'What could make each call move closer to that place?'
  },
  writing: {
    start: 'My argument feels true, but not convincing.',
    q1: 'What do you most want your reader to believe?',
    you: 'That ambition needs social permission.',
    q2: 'Which moment in your evidence makes that hardest to dismiss?'
  }
};

function setupInterface() {
  const menu = $('.menu-toggle');
  const nav = $('.journey-nav');
  const themeToggle = $('.theme-toggle');
  const syncThemeToggle = () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    themeToggle?.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} theme`);
    const icon = themeToggle ? $('i', themeToggle) : null;
    if (icon) icon.textContent = dark ? '☀' : '◐';
    const themeMeta = $('meta[name="theme-color"]');
    const canvasColor = getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim();
    if (themeMeta && canvasColor) themeMeta.setAttribute('content', canvasColor);
  };
  syncThemeToggle();
  themeToggle?.addEventListener('click', () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    window.SocraTheme?.applyTheme(dark ? 'light' : 'dark');
    syncThemeToggle();
  }, listenerOptions);
  menu?.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menu.setAttribute('aria-expanded', String(open));
  }, listenerOptions);
  $$('.journey-nav a').forEach(link => link.addEventListener('click', () => {
    nav.classList.remove('open');
    menu?.setAttribute('aria-expanded', 'false');
  }, listenerOptions));

  $$('.trail-picker button').forEach(button => button.addEventListener('click', () => {
    const data = trails[button.dataset.trail];
    if (!data) return;
    $$('.trail-picker button').forEach(item => {
      item.classList.toggle('active', item === button);
      item.setAttribute('aria-selected', String(item === button));
    });
    const targets = [['#trail-start', data.start], ['#trail-q1', data.q1], ['#trail-you', data.you], ['#trail-q2', data.q2]];
    if (window.gsap && !reduced) {
      gsap.to('.talk-node p', { opacity: 0, y: -5, duration: .18, stagger: .04, onComplete: () => {
        targets.forEach(([selector, value]) => $(selector).textContent = value);
        gsap.to('.talk-node p', { opacity: 1, y: 0, duration: .35, stagger: .05, ease: 'power2.out' });
      }});
    } else targets.forEach(([selector, value]) => $(selector).textContent = value);
  }, listenerOptions));

  if (!reduced && matchMedia('(pointer:fine)').matches && window.gsap) {
    const pointer = $('.pointer');
    addEventListener('pointermove', event => gsap.to(pointer, { x: event.clientX, y: event.clientY, duration: .2, ease: 'power2.out' }), listenerOptions);
    $$('a,button,.talk-node,.plan-stop').forEach(element => {
      element.addEventListener('pointerenter', () => pointer.classList.add('active'), listenerOptions);
      element.addEventListener('pointerleave', () => pointer.classList.remove('active'), listenerOptions);
    });
    $$('.magnet').forEach(element => {
      element.addEventListener('pointermove', event => {
        const box = element.getBoundingClientRect();
        gsap.to(element, { x: (event.clientX - box.left - box.width / 2) * .14, y: (event.clientY - box.top - box.height / 2) * .14, duration: .25 });
      }, listenerOptions);
      element.addEventListener('pointerleave', () => gsap.to(element, { x: 0, y: 0, duration: .65, ease: 'elastic.out(1,.35)' }), listenerOptions);
    });
  }
}

function setupThoughtField() {
  const canvas = $('#thought-field');
  if (!canvas || reduced) return;
  const context = canvas.getContext('2d', { alpha: true });
  let width = 0, height = 0, dpr = 1, frame = 0, last = 0;
  let thread = '#383631', soft = 'rgba(56,54,49,.14)', cyan = '#668de8', orange = '#ff704d';
  const nodes = Array.from({ length: 24 }, (_, index) => ({
    x: .08 + ((index * 47) % 83) / 100,
    y: .08 + ((index * 71) % 84) / 100,
    phase: index * .77,
    parent: index ? Math.max(0, index - 1 - (index % 4 === 0 ? 2 : 0)) : -1
  }));
  const ambient = Array.from({ length: innerWidth < 700 ? 26 : 44 }, (_, index) => ({
    x: ((index * 37) % 97) / 100,
    y: ((index * 61 + 13) % 97) / 100,
    vx: ((index % 5) - 2) * .000018,
    vy: (((index * 3) % 5) - 2) * .000014,
    size: 1 + (index % 3) * .55
  }));
  const mouse = { x: -1000, y: -1000, active: false };

  function readTheme() {
    const styles = getComputedStyle(document.documentElement);
    thread = styles.getPropertyValue('--thread').trim() || thread;
    soft = styles.getPropertyValue('--thread-soft').trim() || soft;
    cyan = styles.getPropertyValue('--cyan').trim() || cyan;
    orange = styles.getPropertyValue('--orange').trim() || orange;
  }
  function resize() {
    width = innerWidth; height = innerHeight; dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function draw(now) {
    frame = requestAnimationFrame(draw);
    if (document.hidden || now - last < 32) return;
    last = now;
    context.clearRect(0, 0, width, height);
    const scrollMax = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const progress = Math.min(1, scrollY / scrollMax);
    const visibleCount = Math.max(2, Math.floor(2 + progress * (nodes.length - 2)));
    const time = now * .00018;

    ambient.forEach((particle, index) => {
      particle.x = (particle.x + particle.vx + 1) % 1;
      particle.y = (particle.y + particle.vy + 1) % 1;
      let x = particle.x * width, y = particle.y * height;
      if (mouse.active) {
        const dx = x - mouse.x, dy = y - mouse.y, distance = Math.hypot(dx, dy) || 1;
        if (distance < 145) {
          const force = (145 - distance) / 145;
          particle.x = Math.min(1, Math.max(0, particle.x + dx / distance * force * .004));
          particle.y = Math.min(1, Math.max(0, particle.y + dy / distance * force * .004));
          x = particle.x * width; y = particle.y * height;
          context.beginPath(); context.moveTo(mouse.x, mouse.y); context.lineTo(x, y);
          context.strokeStyle = soft; context.globalAlpha = force * .55; context.stroke(); context.globalAlpha = 1;
        }
      }
      context.beginPath(); context.arc(x, y, particle.size, 0, Math.PI * 2);
      context.fillStyle = index % 7 === 0 ? cyan : thread;
      context.globalAlpha = index % 7 === 0 ? .34 : .12;
      context.fill(); context.globalAlpha = 1;
    });

    context.lineWidth = 1;
    for (let index = 1; index < visibleCount; index++) {
      const node = nodes[index], parent = nodes[node.parent];
      const x = node.x * width + Math.sin(time * 3 + node.phase) * 8;
      const y = node.y * height + Math.cos(time * 2 + node.phase) * 7;
      const px = parent.x * width + Math.sin(time * 3 + parent.phase) * 8;
      const py = parent.y * height + Math.cos(time * 2 + parent.phase) * 7;
      context.beginPath();
      context.moveTo(px, py);
      context.quadraticCurveTo((px + x) / 2 + Math.sin(node.phase) * 30, (py + y) / 2, x, y);
      context.strokeStyle = soft;
      context.stroke();
    }
    for (let index = 0; index < visibleCount; index++) {
      const node = nodes[index];
      const x = node.x * width + Math.sin(time * 3 + node.phase) * 8;
      const y = node.y * height + Math.cos(time * 2 + node.phase) * 7;
      context.beginPath(); context.arc(x, y, index === visibleCount - 1 ? 4.5 : 2.1, 0, Math.PI * 2);
      context.fillStyle = index === visibleCount - 1 ? (index % 2 ? cyan : orange) : thread;
      context.globalAlpha = index === visibleCount - 1 ? .85 : .22;
      context.fill(); context.globalAlpha = 1;
    }
  }
  readTheme(); resize(); frame = requestAnimationFrame(draw);
  addEventListener('resize', resize, listenerOptions);
  addEventListener('pointermove', event => { mouse.x = event.clientX; mouse.y = event.clientY; mouse.active = true; }, listenerOptions);
  document.documentElement.addEventListener('pointerleave', () => { mouse.active = false; }, listenerOptions);
  new MutationObserver(readTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });
  addEventListener('pagehide', () => cancelAnimationFrame(frame), { once: true });
}

function preparePaths() {
  $$('svg path').forEach(path => {
    if (typeof path.getTotalLength !== 'function') return;
    const length = path.getTotalLength();
    path.style.strokeDasharray = `${length}`;
    path.style.strokeDashoffset = `${length}`;
  });
}

function setupMotion() {
  if (!window.gsap || !window.ScrollTrigger || reduced) return;
  gsap.registerPlugin(ScrollTrigger);
  preparePaths();

  gsap.timeline({ defaults: { ease: 'power4.out' } })
    .to('.title-row i', { y: 0, duration: 1.2, stagger: .11 })
    .from('.overline', { opacity: 0, x: -25, duration: .7 }, .4)
    .from('.arrival-note', { opacity: 0, y: 20, duration: .7 }, .62)
    .from('.arrival-question', { opacity: 0, scale: .4, rotation: -30, duration: 1.1, ease: 'back.out(1.5)' }, .25)
    .from('.subject-cloud span', { opacity: 0, scale: .5, stagger: .08, duration: .5 }, .7);

  gsap.to('.arrival-question', { yPercent: 125, rotation: 80, scale: .65, ease: 'none', scrollTrigger: { trigger: '.arrival', start: 'top top', end: 'bottom top', scrub: .8 } });
  gsap.to('.arrival-copy', { yPercent: -18, opacity: .1, filter: 'blur(8px)', ease: 'none', scrollTrigger: { trigger: '.arrival', start: '45% top', end: 'bottom top', scrub: .7 } });

  const fork = gsap.timeline({ scrollTrigger: { trigger: '.fork', start: 'top top', end: 'bottom bottom', pin: '.fork-pin', pinSpacing: false, scrub: .65, anticipatePin: 1 } });
  fork.fromTo('.route-short path', { strokeDashoffset: () => $('.route-short path').getTotalLength() }, { strokeDashoffset: 0, duration: .16, ease: 'none' })
    .to('.route-result', { opacity: 1, duration: .08 }, .13)
    .to('.shortcut-copy', { opacity: 1, y: 0, duration: .1 }, .15)
    .to('.route-short', { opacity: .14, filter: 'blur(4px)', duration: .12 }, .3)
    .to('.shortcut-copy', { opacity: .08, duration: .1 }, .3)
    .fromTo('.main-route', { strokeDashoffset: () => $('.main-route').getTotalLength() }, { strokeDashoffset: 0, duration: .42, ease: 'none' }, .33)
    .to('.route-socra .route-stop', { opacity: 1, scale: 1, stagger: .055, duration: .09, ease: 'back.out(1.8)' }, .36)
    .to('.route-socra .branch', { strokeDashoffset: 0, opacity: 1, stagger: .07, duration: .18 }, .52)
    .to('.side-thought', { opacity: 1, y: -8, stagger: .08, duration: .1 }, .58)
    .to('.journey-copy', { opacity: 1, y: 0, duration: .15 }, .68)
    .to('.fork-prompt', { scale: .82, opacity: .35, duration: .12 }, .76);

  const dialogue = gsap.timeline({ scrollTrigger: { trigger: '.dialogue', start: 'top top', end: 'bottom bottom', pin: '.dialogue-pin', pinSpacing: false, scrub: .65, anticipatePin: 1 } });
  dialogue.fromTo('.conversation-line', { strokeDashoffset: () => $('.conversation-line').getTotalLength() }, { strokeDashoffset: 0, duration: .72, ease: 'none' })
    .to('.talk-node', { opacity: 1, y: 0, scale: 1, stagger: .14, duration: .16, ease: 'back.out(1.4)' }, .06)
    .to('.dialogue-progress i', { backgroundColor: 'var(--yellow)', stagger: .16, duration: .16 }, .15)
    .to('.aha-node', { opacity: 1, scale: 1, rotation: 360, duration: .22, ease: 'back.out(1.8)' }, .74)
    .to('.conversation-map', { scale: 1.06, duration: .15 }, .84);

  gsap.to('.talk-node', { y: index => index % 2 ? -7 : 7, duration: 2.5, yoyo: true, repeat: -1, stagger: .3, ease: 'sine.inOut' });

  const model = gsap.timeline({ scrollTrigger: { trigger: '.model', start: 'top top', end: 'bottom bottom', pin: '.model-pin', pinSpacing: false, scrub: .65, anticipatePin: 1 } });
  model.to('.model-seed', { boxShadow: '0 0 0 42vw var(--thread-soft)', scale: 2, duration: .25 })
    .from('.model-word', { x: index => index % 2 ? 120 : -120, y: index => index === 4 ? -100 : 60, scale: .5, duration: .35, stagger: .05 }, .1)
    .to('.model-word', { opacity: 1, duration: .25, stagger: .05 }, .1)
    .to('.model-word', { x: index => index % 2 ? -innerWidth * .28 : innerWidth * .28, y: index => index < 2 ? innerHeight * .24 : -innerHeight * .22, scale: .25, opacity: 0, duration: .35, stagger: .025 }, .5)
    .to('.model-center', { opacity: 1, scale: 1, duration: .35, ease: 'power3.out' }, .58)
    .from('.model-center strong', { letterSpacing: '.15em', filter: 'blur(12px)', duration: .28 }, .62);

  const product = gsap.timeline({ scrollTrigger: { trigger: '.product', start: 'top top', end: 'bottom bottom', scrub: .65 } });
  product.to('.socra-interface', { opacity: .72, scale: .68, rotation: -2, duration: .14, ease: 'power2.out' }, 0)
    .to('.product-copy', { y: -innerHeight * .42, opacity: 0, filter: 'blur(8px)', duration: .24 }, .12)
    .to('.socra-interface', { opacity: 1, scale: 1, rotation: -1, duration: .32, ease: 'power3.out' }, .14)
    .from('.ui-message', { opacity: 0, y: 20, stagger: .08, duration: .16 }, .38)
    .to('.capability-orbit', { opacity: 1, x: 0, stagger: .1, duration: .18 }, .52)
    .to('.socra-interface', { scale: .72, yPercent: -4, duration: .3 }, .72)
    .to('.capability-one', { x: innerWidth * .19, y: innerHeight * .28, duration: .25 }, .73)
    .to('.capability-two', { x: -innerWidth * .18, y: innerHeight * .33, duration: .25 }, .73)
    .to('.capability-three', { x: -innerWidth * .2, y: -innerHeight * .1, duration: .25 }, .73);

  gsap.to('.plan-line i', { height: '100%', ease: 'none', scrollTrigger: { trigger: '.plan-journey', start: 'top 65%', end: 'bottom 45%', scrub: true } });
  $$('.plan-stop').forEach((stop, index) => gsap.from(stop.querySelector('.plan-copy'), { opacity: 0, x: index % 2 ? 70 : -70, duration: .8, ease: 'power3.out', scrollTrigger: { trigger: stop, start: 'top 72%' } }));
  gsap.to('.launch-thought', { rotation: 110, scale: 1.28, ease: 'none', scrollTrigger: { trigger: '.launch', start: 'top bottom', end: 'bottom bottom', scrub: 1 } });
  gsap.from('.launch h2', { scale: .55, opacity: 0, filter: 'blur(15px)', duration: 1.1, scrollTrigger: { trigger: '.launch', start: 'top 60%' } });

  const setTopbarContrast = active => $('.topbar').classList.toggle('invert', active);
  ScrollTrigger.create({ trigger: '.dialogue', start: 'top top', end: 'bottom bottom', onEnter: () => setTopbarContrast(true), onEnterBack: () => setTopbarContrast(true), onLeave: () => setTopbarContrast(false), onLeaveBack: () => setTopbarContrast(false) });
  ScrollTrigger.create({ trigger: '.launch', start: 'top top', end: 'max', onEnter: () => setTopbarContrast(true), onEnterBack: () => setTopbarContrast(true), onLeaveBack: () => setTopbarContrast(false) });

  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: self => gsap.set('.journey-meter b', { width: `${self.progress * 100}%` }) });
}

document.addEventListener('DOMContentLoaded', () => {
  setupInterface();
  setupThoughtField();
  setupMotion();
});
addEventListener('pagehide', () => aborter.abort(), { once: true });
