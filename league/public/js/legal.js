// ── Active TOC highlighting on scroll ──
const sections = document.querySelectorAll('.section[id]');
const tocLinks  = document.querySelectorAll('.toc-list a');

function onScroll() {
  let current = '';

  sections.forEach(section => {
    const top = section.getBoundingClientRect().top;
    if (top <= 100) current = section.id;
  });

  tocLinks.forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href') === `#${current}`) {
      link.classList.add('active');
    }
  });
}

window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// ── Smooth scroll with offset for sticky nav ──
tocLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const id  = link.getAttribute('href').slice(1);
    const el  = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 80;
    window.scrollTo({ top, behavior: 'smooth' });
  });
});