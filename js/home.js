const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

const demos = {
  math: {
    icon: '∫', goal: 'Understand derivatives',
    messages: [
      ['user', 'Can you explain derivatives?'],
      ['socra', 'You already know slope. What does slope tell you about a straight line?'],
      ['user', 'How quickly it rises or falls.'],
      ['socra', 'Good. A curve keeps changing—how might you measure its slope at one exact point?']
    ]
  },
  code: {
    icon: '{ }', goal: 'Build an intuition for recursion',
    messages: [
      ['user', 'I never understand recursion.'],
      ['socra', 'What must every repeating process eventually do?'],
      ['user', 'Stop somewhere.'],
      ['socra', 'Exactly. In a recursive function, what could define that stopping point?']
    ]
  },
  writing: {
    icon: 'Aa', goal: 'Strengthen an argument',
    messages: [
      ['user', 'Can you improve my thesis?'],
      ['socra', 'Before we rewrite it: what do you most want your reader to believe?'],
      ['user', 'That ambition needs social permission.'],
      ['socra', 'Interesting. Which moment in your evidence makes that claim hardest to dismiss?']
    ]
  }
};

let demoTimers = [];
function playDemo(topic = 'math') {
  const data = demos[topic];
  const chat = $('#demo-chat');
  if (!data || !chat) return;
  demoTimers.forEach(clearTimeout);
  demoTimers = [];
  chat.innerHTML = '';
  $('#demo-goal').textContent = data.goal;
  $('.topic-icon').textContent = data.icon;
  data.messages.forEach((item, index) => {
    const timer = setTimeout(() => {
      const message = document.createElement('div');
      message.className = `message ${item[0]}`;
      message.innerHTML = `<small>${item[0] === 'socra' ? 'Socra asks' : 'You'}</small>${item[1]}`;
      chat.appendChild(message);
      if (window.gsap && !reduced) gsap.to(message, { opacity: 1, y: 0, duration: .55, ease: 'power3.out' });
      else { message.style.opacity = 1; message.style.transform = 'none'; }
    }, reduced ? 0 : index * 720);
    demoTimers.push(timer);
  });
}

function setupUI() {
  const nav = $('.site-nav');
  const menu = $('.menu-button');
  menu?.addEventListener('click', () => {
    const open = nav.classList.toggle('menu-open');
    menu.setAttribute('aria-expanded', String(open));
  });
  $$('.nav-center a').forEach(link => link.addEventListener('click', () => nav.classList.remove('menu-open')));
  $$('.topic-tabs button').forEach(button => button.addEventListener('click', () => {
    $$('.topic-tabs button').forEach(item => {
      item.classList.toggle('active', item === button);
      item.setAttribute('aria-selected', String(item === button));
    });
    playDemo(button.dataset.topic);
  }));

  if (!reduced && matchMedia('(pointer:fine)').matches) {
    const cursor = $('.cursor-glow');
    addEventListener('pointermove', event => gsap.to(cursor, { x: event.clientX, y: event.clientY, duration: .22, ease: 'power2.out' }));
    $$('a,button,.price-card,.outcome-grid article').forEach(element => {
      element.addEventListener('pointerenter', () => cursor.classList.add('hover'));
      element.addEventListener('pointerleave', () => cursor.classList.remove('hover'));
    });
    $$('.magnetic').forEach(element => {
      element.addEventListener('pointermove', event => {
        const rect = element.getBoundingClientRect();
        gsap.to(element, { x: (event.clientX - rect.left - rect.width / 2) * .16, y: (event.clientY - rect.top - rect.height / 2) * .16, duration: .3 });
      });
      element.addEventListener('pointerleave', () => gsap.to(element, { x: 0, y: 0, duration: .6, ease: 'elastic.out(1,.35)' }));
    });
  }
}

function splitHeading(element) {
  if (!element || element.dataset.split) return;
  element.dataset.split = 'true';
  [...element.childNodes].forEach(node => {
    if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) return;
    const fragment = document.createDocumentFragment();
    node.textContent.split(/(\s+)/).forEach(part => {
      if (/^\s+$/.test(part)) fragment.appendChild(document.createTextNode(part));
      else {
        const clip = document.createElement('span');
        const word = document.createElement('i');
        clip.className = 'word-clip';
        word.textContent = part;
        clip.appendChild(word);
        fragment.appendChild(clip);
      }
    });
    node.replaceWith(fragment);
  });
}

function setupMotion() {
  if (!window.gsap || !window.ScrollTrigger || reduced) return;
  gsap.registerPlugin(ScrollTrigger);

  const hero = gsap.timeline({ defaults: { ease: 'power4.out' } });
  hero.to('.hero-line i', { y: 0, duration: 1.25, stagger: .14 })
    .from('.eyebrow', { opacity: 0, x: -25, duration: .7 }, .45)
    .from('.hero-bottom', { opacity: 0, y: 25, duration: .8 }, .6)
    .from('.hero-orbit', { opacity: 0, scale: .7, rotation: -35, duration: 1.4 }, .15);

  gsap.to('.orbit-a', { rotation: 360, duration: 28, repeat: -1, ease: 'none' });
  gsap.to('.orbit-b', { rotation: -332, duration: 19, repeat: -1, ease: 'none' });
  gsap.to('.orbit-c', { rotation: 342, duration: 38, repeat: -1, ease: 'none' });
  gsap.to('.thought-core', { y: -12, duration: 2.2, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  gsap.to('.hero-orbit', { yPercent: 28, rotation: 24, scale: 1.12, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 1 } });
  gsap.to('.ticker', { xPercent: -24, ease: 'none', scrollTrigger: { trigger: '.belief-strip', start: 'top bottom', end: 'bottom top', scrub: 1 } });

  $$('.split-text').forEach(heading => {
    splitHeading(heading);
    gsap.from($('.word-clip i', heading) ? $$('.word-clip i', heading) : [], {
      yPercent: 115, duration: .9, stagger: .045, ease: 'power4.out',
      scrollTrigger: { trigger: heading, start: 'top 83%' }
    });
  });

  const compare = gsap.timeline({
    scrollTrigger: { trigger: '.comparison-stage', start: 'top top', end: '+=260%', pin: true, scrub: .7, anticipatePin: 1 }
  });
  compare.to('.answer-sheet', { scale: .82, opacity: .12, rotation: -8, filter: 'blur(5px)', duration: 1 })
    .to('.regular-copy', { opacity: .12, x: -30, duration: .6 }, .2)
    .to('.socra-copy', { opacity: 1, x: 0, duration: .7 }, .35)
    .to('.question-node', { opacity: 1, scale: 1, stagger: .12, duration: .6, ease: 'back.out(1.6)' }, .35)
    .to('.comparison-visual path', { opacity: 1, strokeDashoffset: 0, stagger: .12, duration: .9 }, .45)
    .to('.understanding-core', { opacity: 1, scale: 1, duration: .65, ease: 'back.out(1.8)' }, .78)
    .to('.question-node', { y: index => index % 2 ? -8 : 8, stagger: .1, duration: .5 }, 1.1);

  const methodTrack = $('.method-track');
  const methodDistance = () => Math.max(0, methodTrack.scrollWidth - innerWidth + parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pad')) * 2);
  const methodTween = gsap.to(methodTrack, {
    x: () => -methodDistance(), ease: 'none',
    scrollTrigger: { trigger: '.method', start: 'top top', end: () => `+=${Math.max(innerWidth * 2.4, methodDistance() * 1.35)}`, pin: true, scrub: .6, invalidateOnRefresh: true }
  });
  gsap.to('.method-progress i', { width: '100%', ease: 'none', scrollTrigger: { trigger: '.method', start: 'top top', end: () => methodTween.scrollTrigger.end, scrub: true } });
  $$('.method-card').forEach((card, index) => gsap.from(card, { rotation: index % 2 ? 4 : -4, y: 80, opacity: .15, duration: 1, scrollTrigger: { trigger: card, containerAnimation: methodTween, start: 'left 90%' } }));

  gsap.from('.outcome-grid article', { y: 70, opacity: 0, stagger: .12, duration: .9, ease: 'power3.out', scrollTrigger: { trigger: '.outcome-grid', start: 'top 76%' } });
  $$('.mini-visual').forEach((visual, index) => gsap.to(visual, { rotation: index % 2 ? -18 : 18, y: -18, ease: 'none', scrollTrigger: { trigger: visual, start: 'top bottom', end: 'bottom top', scrub: 1 } }));
  gsap.from('.product-window', { y: 120, rotation: -5, opacity: 0, duration: 1.2, ease: 'power3.out', scrollTrigger: { trigger: '.experience', start: 'top 64%' } });
  gsap.to('.product-window', { rotation: -1.5, y: -30, ease: 'none', scrollTrigger: { trigger: '.experience', start: 'top bottom', end: 'bottom top', scrub: 1 } });

  $$('.feature-card').forEach((card, index) => {
    gsap.from(card, { y: 100, rotation: index % 2 ? 3 : -3, opacity: 0, duration: 1, scrollTrigger: { trigger: card, start: 'top 84%' } });
    gsap.to($('.feature-art', card), { y: -25, rotation: index % 2 ? -4 : 4, ease: 'none', scrollTrigger: { trigger: card, start: 'top bottom', end: 'bottom top', scrub: 1 } });
  });
  gsap.to('.growth-rings i:first-child', { rotation: 180, duration: 12, repeat: -1, ease: 'none' });
  gsap.from('.price-card', { y: 90, opacity: 0, rotation: index => index === 1 ? 0 : index ? 3 : -3, stagger: .13, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: '.pricing-grid', start: 'top 80%' } });
  gsap.to('.final-orbits', { rotation: 90, scale: 1.18, ease: 'none', scrollTrigger: { trigger: '.final-cta', start: 'top bottom', end: 'bottom bottom', scrub: 1 } });
  gsap.from('.final-cta h2', { scale: .7, opacity: 0, filter: 'blur(12px)', duration: 1.2, scrollTrigger: { trigger: '.final-cta', start: 'top 60%' } });

  let lastY = scrollY;
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: self => {
    const current = self.scroll();
    $('.site-nav').classList.toggle('hidden', current > lastY && current > 180);
    lastY = current;
  }});
}

document.addEventListener('DOMContentLoaded', () => {
  setupUI();
  playDemo();
  setupMotion();
});
