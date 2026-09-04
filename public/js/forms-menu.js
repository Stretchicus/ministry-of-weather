(function () {
  const menu = document.querySelector('.forms-menu');
  const toggle = menu && menu.querySelector('.forms-toggle');
  const panel = menu && menu.querySelector('.forms-panel');
  const slip = document.getElementById('privilege-slip');
  if (!menu || !toggle || !panel || !slip) return;

  const formLine = slip.querySelector('.privilege-form');
  const copyLine = slip.querySelector('.privilege-copy');
  const narrow = window.matchMedia('(max-width: 40rem)');

  function isOpen() {
    return !panel.hasAttribute('hidden');
  }

  function closeMenu() {
    panel.setAttribute('hidden', '');
    toggle.setAttribute('aria-expanded', 'false');
  }

  function positionPanel() {
    const rect = toggle.getBoundingClientRect();
    const top = Math.min(rect.bottom + 8, window.innerHeight - 96);
    panel.style.top = `${Math.max(8, top)}px`;
    panel.style.maxHeight = `${Math.max(120, window.innerHeight - top - 16)}px`;
    if (narrow.matches) {
      panel.style.left = '1rem';
      panel.style.right = '1rem';
      panel.style.width = 'auto';
    } else {
      panel.style.left = 'auto';
      panel.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
      panel.style.width = '';
    }
  }

  function openMenu() {
    panel.removeAttribute('hidden');
    toggle.setAttribute('aria-expanded', 'true');
    positionPanel();
  }

  toggle.addEventListener('click', (event) => {
    event.stopPropagation();
    if (isOpen()) closeMenu();
    else openMenu();
  });

  window.addEventListener('resize', () => {
    if (isOpen()) positionPanel();
  });

  menu.querySelectorAll('.forms-restricted').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      formLine.textContent = `Form ${button.dataset.code || ''} — ${button.dataset.name || ''}`;
      copyLine.textContent = button.dataset.refusal || '';
      closeMenu();
      if (typeof slip.showModal === 'function') slip.showModal();
    });
  });

  document.addEventListener('pointerdown', (event) => {
    if (!isOpen()) return;
    if (menu.contains(event.target) || slip.contains(event.target)) return;
    closeMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen()) closeMenu();
  });
})();
