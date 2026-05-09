// Smooth active nav link highlighting on scroll
const sections = document.querySelectorAll('section[id], div[id]');
const navLinks = document.querySelectorAll('.nav-links a');

function onScroll() {
  let current = '';
  sections.forEach(section => {
    const sectionTop = section.offsetTop - 100;
    if (window.scrollY >= sectionTop) {
      current = section.getAttribute('id');
    }
  });

  navLinks.forEach(link => {
    link.style.color = '';
    if (link.getAttribute('href') === `#${current}`) {
      link.style.color = '#ffffff';
    }
  });

  // Shrink nav on scroll
  const nav = document.querySelector('nav');
  if (window.scrollY > 60) {
    nav.style.padding = '0.75rem 4rem';
  } else {
    nav.style.padding = '1.2rem 4rem';
  }
}

window.addEventListener('scroll', onScroll, { passive: true });

// Fade-in on scroll for feature cards and steps
function revealOnScroll() {
  const reveals = document.querySelectorAll('.feature-card, .step, .role-card, .stat-item');
  reveals.forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight - 60) {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    }
  });
}

// Set initial hidden state for reveal elements
document.querySelectorAll('.feature-card, .step, .role-card, .stat-item').forEach((el, i) => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(20px)';
  el.style.transition = `opacity 0.5s ease ${i * 0.07}s, transform 0.5s ease ${i * 0.07}s`;
});

window.addEventListener('scroll', revealOnScroll, { passive: true });
window.addEventListener('load', revealOnScroll);