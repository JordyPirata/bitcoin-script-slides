/* Navegación del deck: teclado y hash. Nada más, a propósito.

   La decisión que importa: → no siempre pasa de diapositiva. Si la que se está
   viendo tiene una máquina a medio ejecutar, → avanza un opcode. Así se habla toda
   la charla con una sola tecla.

   No hay clic-para-avanzar ni temporizador: delante de la sala, cuantas menos formas
   de mover el deck haya, menos formas hay de moverlo sin querer. El ratón solo sirve
   para lo que se ve —los botones de la máquina, el acordeón—, y un mando de proyector
   funciona igual porque manda PageUp/PageDown, que sí están. */
(function (global) {
  'use strict';

  const CL = (global.CL = global.CL || {});
  const $ = (id) => document.getElementById(id);

  const slides = [...document.querySelectorAll('.slide')];
  const barra = $('progressBar');
  const contador = $('contador');
  const ayuda = $('ayuda');

  let actual = -1;

  // ---------- diapositivas ----------

  function ir(n, empujarHash) {
    const i = Math.max(0, Math.min(slides.length - 1, n));
    if (i === actual) return;
    if (actual >= 0) slides[actual].classList.remove('on');
    actual = i;
    slides[i].classList.add('on');

    // Cada entrada deja la máquina como nueva: volver atrás no debe encontrarse la
    // pila a medias de la vez anterior.
    if (CL.vmui) CL.vmui.reiniciarEn(slides[i]);

    barra.style.width = ((i + 1) / slides.length * 100) + '%';
    contador.textContent = `${i + 1} / ${slides.length}`;
    if (empujarHash !== false) global.location.hash = String(i + 1);
  }

  const siguiente = () => {
    const ctrl = CL.vmui && CL.vmui.runnerFor(slides[actual]);
    if (ctrl && ctrl.paso()) return;
    ir(actual + 1);
  };
  const anterior = () => ir(actual - 1);

  const desdeHash = () => {
    const n = parseInt(String(global.location.hash).replace('#', ''), 10);
    return Number.isFinite(n) && n >= 1 ? n - 1 : 0;
  };

  // ---------- teclado ----------

  const escribiendo = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');

  document.addEventListener('keydown', (e) => {
    if (escribiendo(e.target)) return;

    if (ayuda.classList.contains('show') && (e.key === 'Escape' || e.key === '?')) {
      ayuda.classList.remove('show');
      return;
    }

    switch (e.key) {
      case 'ArrowRight': case ' ': case 'PageDown':
        e.preventDefault(); siguiente(); break;
      case 'ArrowLeft': case 'PageUp':
        e.preventDefault(); anterior(); break;
      case 'Home':
        e.preventDefault(); ir(0); break;
      case 'End':
        e.preventDefault(); ir(slides.length - 1); break;
      case 'r': case 'R':
        if (CL.vmui) CL.vmui.reiniciarEn(slides[actual]); break;
      case '?':
        ayuda.classList.add('show'); break;
      case 'Escape':
        ayuda.classList.remove('show'); break;
    }
  });

  $('cerrarAyuda').onclick = () => ayuda.classList.remove('show');
  ayuda.onclick = (e) => { if (e.target === ayuda) ayuda.classList.remove('show'); };

  // ---------- arranque ----------

  global.addEventListener('hashchange', () => ir(desdeHash(), false));

  if (CL.montarDemos) CL.montarDemos();
  ir(desdeHash(), false);
})(window);
