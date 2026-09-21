// Dymas Alfin Portfolio Interaction Logic

document.addEventListener('DOMContentLoaded', () => {
  // 1. Scroll Progress Bar
  const scrollBar = document.getElementById('scrollProgress');
  window.addEventListener('scroll', () => {
    const totalScroll = document.documentElement.scrollHeight - window.innerHeight;
    const progress = totalScroll > 0 ? (window.scrollY / totalScroll) : 0;
    if (scrollBar) {
      scrollBar.style.transform = `scaleX(${progress})`;
    }
  }, { passive: true });

  // 2. Service Accordion Toggle
  const serviceItems = document.querySelectorAll('.service-item');
  serviceItems.forEach((item) => {
    const collapsedRow = item.querySelector('.service-collapsed-row');
    const closeBtn = item.querySelector('.service-close-toggle');

    if (collapsedRow) {
      collapsedRow.addEventListener('click', () => {
        serviceItems.forEach((other) => other.classList.remove('active'));
        item.classList.add('active');
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        item.classList.remove('active');
      });
    }
  });

  // 3. Project Filter Tabs
  const filterTabs = document.querySelectorAll('.filter-tab');
  const projectCards = document.querySelectorAll('.portfolio-card');

  filterTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      filterTabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');

      const filter = tab.getAttribute('data-filter');

      projectCards.forEach((card) => {
        const category = card.getAttribute('data-category');
        if (filter === 'all' || category === filter) {
          card.style.display = 'flex';
          card.style.opacity = '0';
          setTimeout(() => {
            card.style.transition = 'opacity 0.3s ease';
            card.style.opacity = '1';
          }, 20);
        } else {
          card.style.display = 'none';
        }
      });
    });
  });

  // 4. Smooth Anchor Scrolling
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href');
      if (!targetId || targetId === '#') return;
      const targetElement = document.querySelector(targetId);
      if (targetElement) {
        e.preventDefault();
        targetElement.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });
// 5. Interactive Color Spotlight Lens on Hover
  const heroPortrait = document.getElementById('heroPortrait');
  const colorLayer = document.querySelector('.portrait-layer-color');

  if (heroPortrait && colorLayer) {
    const handleMove = (clientX, clientY) => {
      const rect = heroPortrait.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      heroPortrait.style.setProperty('--lens-x', `${x}px`);
      heroPortrait.style.setProperty('--lens-y', `${y}px`);
    };

    heroPortrait.addEventListener('mousemove', (e) => {
      handleMove(e.clientX, e.clientY);
    });

    heroPortrait.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches[0]) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });

    heroPortrait.addEventListener('mouseleave', () => {
      heroPortrait.style.setProperty('--lens-x', '-200px');
      heroPortrait.style.setProperty('--lens-y', '-200px');
    });

    heroPortrait.addEventListener('touchend', () => {
      heroPortrait.style.setProperty('--lens-x', '-200px');
      heroPortrait.style.setProperty('--lens-y', '-200px');
    });
  }
});