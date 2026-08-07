(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.documentElement;
  const toggle = document.querySelector('.lost-theme');
  const syncTheme = () => {
    const dark = root.getAttribute('data-theme') === 'dark';
    toggle.setAttribute('aria-label', `Switch to ${dark ? 'light' : 'dark'} theme`);
    toggle.querySelector('i').textContent = dark ? '☀' : '◐';
    const color = getComputedStyle(root).getPropertyValue('--canvas').trim();
    if (color) document.querySelector('meta[name="theme-color"]').content = color;
  };
  syncTheme();
  toggle.addEventListener('click', () => {
    const dark = root.getAttribute('data-theme') === 'dark';
    window.SocraTheme?.applyTheme(dark ? 'light' : 'dark');
    syncTheme();
  });

  if (reduced) return;
  const canvas = document.querySelector('#lost-particles');
  const context = canvas.getContext('2d');
  const pointer = { x: -1000, y: -1000 };
  const particles = Array.from({ length: innerWidth < 700 ? 32 : 58 }, (_, index) => ({
    x: ((index * 43) % 97) / 100,
    y: ((index * 67 + 7) % 97) / 100,
    vx: ((index % 7) - 3) * .000025,
    vy: (((index * 2) % 7) - 3) * .000019,
    size: 1 + index % 3
  }));
  let width, height, dpr, frame;
  const resize = () => {
    width = innerWidth; height = innerHeight; dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = width * dpr; canvas.height = height * dpr;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const draw = () => {
    context.clearRect(0, 0, width, height);
    const styles = getComputedStyle(root);
    const accent = styles.getPropertyValue('--primary').trim();
    const ink = styles.getPropertyValue('--ink').trim();
    particles.forEach((particle, index) => {
      particle.x = (particle.x + particle.vx + 1) % 1;
      particle.y = (particle.y + particle.vy + 1) % 1;
      let x = particle.x * width, y = particle.y * height;
      const dx = x - pointer.x, dy = y - pointer.y, distance = Math.hypot(dx, dy) || 1;
      if (distance < 160) {
        const force = (160 - distance) / 160;
        particle.x = Math.max(0, Math.min(1, particle.x + dx / distance * force * .005));
        particle.y = Math.max(0, Math.min(1, particle.y + dy / distance * force * .005));
        x = particle.x * width; y = particle.y * height;
        context.beginPath(); context.moveTo(pointer.x, pointer.y); context.lineTo(x, y);
        context.strokeStyle = accent; context.globalAlpha = force * .22; context.stroke();
      }
      context.beginPath(); context.arc(x, y, particle.size, 0, Math.PI * 2);
      context.fillStyle = index % 6 ? ink : accent; context.globalAlpha = index % 6 ? .1 : .42; context.fill(); context.globalAlpha = 1;
    });
    frame = requestAnimationFrame(draw);
  };
  addEventListener('pointermove', event => { pointer.x = event.clientX; pointer.y = event.clientY; });
  addEventListener('resize', resize);
  addEventListener('pagehide', () => cancelAnimationFrame(frame), { once: true });
  resize(); draw();
})();
