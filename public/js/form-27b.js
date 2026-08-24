(function () {
  const form = document.querySelector('.ministry-form');
  const button = document.getElementById('whereabouts');
  const submitHere = document.getElementById('submit-here');
  const lat = document.getElementById('here_lat');
  const lon = document.getElementById('here_lon');
  const place = document.getElementById('place');
  const note = document.getElementById('whereabouts-note');
  if (!form || !button || !submitHere || !lat || !lon) return;

  function say(message) {
    if (!note) return;
    if (!message) {
      note.hidden = true;
      note.textContent = '';
      return;
    }
    note.hidden = false;
    note.textContent = message;
  }

  place?.addEventListener('input', () => {
    if (lat.value || lon.value) {
      lat.value = '';
      lon.value = '';
    }
  });

  button.addEventListener('click', () => {
    say('');
    if (!window.isSecureContext) {
      say(button.dataset.insecure);
      return;
    }
    if (!navigator.geolocation) {
      say(button.dataset.failed);
      return;
    }
    button.disabled = true;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        lat.value = String(position.coords.latitude);
        lon.value = String(position.coords.longitude);
        submitHere.click();
      },
      () => {
        button.disabled = false;
        say(button.dataset.denied);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  });
})();
