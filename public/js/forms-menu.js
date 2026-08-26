(function () {
  const menu = document.querySelector('.forms-menu');
  const slip = document.getElementById('privilege-slip');
  if (!menu || !slip) return;

  const formLine = slip.querySelector('.privilege-form');
  const copyLine = slip.querySelector('.privilege-copy');

  function closeMenu() {
    menu.open = false;
  }

  menu.querySelectorAll('.forms-restricted').forEach((button) => {
    button.addEventListener('click', () => {
      const code = button.dataset.code || '';
      const name = button.dataset.name || '';
      formLine.textContent = `Form ${code} — ${name}`;
      copyLine.textContent = button.dataset.refusal || '';
      closeMenu();
      if (typeof slip.showModal === 'function') slip.showModal();
    });
  });

  document.addEventListener('click', (event) => {
    if (menu.open && !menu.contains(event.target)) closeMenu();
  });
})();
