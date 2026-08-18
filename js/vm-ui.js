/* La cinta de opcodes y la pila, en pantalla.
   Es el mismo render que el modal de ejecución de candado-lan —mismas clases, misma
   animación— pero montado una vez por diapositiva en lugar de una vez por modal, y
   con la cinta más grande porque esto se proyecta.

   Este archivo sí toca el DOM: por eso los tests no lo cargan. Toda la lógica de
   ejecución vive en vm.js, que se puede correr sin navegador. */
(function (global) {
  'use strict';

  const CL = (global.CL = global.CL || {});
  const vmui = (CL.vmui = {});

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Un controlador por widget. deck.js pregunta por sección para saber si → tiene
     que avanzar un opcode o pasar a la diapositiva siguiente. */
  const controladores = [];

  vmui.esc = esc;

  /** Pinta una pila suelta, sin cinta. La diapositiva de la pila desnuda no ejecuta nada todavía. */
  vmui.renderStack = function (el, stack) {
    el.innerHTML = stack.map((item, i) => {
      const tono = item.good ? 'good' : item.bad ? 'bad' : '';
      const fresh = i === stack.length - 1 ? ' fresh' : '';
      return `<div class="stack-item ${tono}${fresh}">${esc(item.label)}</div>`;
    }).join('');
  };

  /**
   * Monta cinta + pila + controles dentro de `contenedor` y los cablea a `runner`.
   * @returns {{runner:object, paso:Function, todo:Function, reiniciar:Function, render:Function}}
   */
  vmui.montar = function (contenedor, runner) {
    contenedor.innerHTML =
      '<div class="sim-grid">' +
        '<div class="tape"></div>' +
        '<div><div class="stack-label">Pila</div><div class="stack"></div></div>' +
      '</div>' +
      '<div class="result"></div>' +
      '<div class="run-controls">' +
        '<button data-paso>Siguiente paso ▸</button>' +
        '<button class="secondary" data-todo>Ejecutar todo</button>' +
        '<button class="secondary" data-reset>Reiniciar</button>' +
      '</div>';

    const tape = contenedor.querySelector('.tape');
    const stackEl = contenedor.querySelector('.stack');
    const resultEl = contenedor.querySelector('.result');
    const btnPaso = contenedor.querySelector('[data-paso]');
    const btnTodo = contenedor.querySelector('[data-todo]');

    const ctrl = {
      contenedor,
      runner,
      render() {
        // El opcode que mató el script se queda marcado: es lo que hay que señalar
        // al hablar, y sin esto el rojo solo aparece abajo, en el resultado.
        const muerto = runner.finished && runner.result && !runner.result.ok &&
          runner.result.reason !== 'falso-final' ? runner.index - 1 : -1;

        tape.innerHTML = runner.ops.map((op, i) => {
          const cls = i === muerto ? ' muerto'
            : i === runner.index && !runner.finished ? ' current'
            : i < runner.index ? ' done' : '';
          return `<div class="op-row${cls}"><span class="name">${esc(op.name)}</span>` +
            `<span class="desc">${esc(op.desc)}</span></div>`;
        }).join('');

        vmui.renderStack(stackEl, runner.stack);

        if (runner.finished) {
          resultEl.className = 'result show ' + (runner.result.ok ? 'ok' : 'fail');
          resultEl.textContent = runner.result.ok
            ? '✔ El script pasa: el candado se abre.'
            : '✘ ' + CL.reasonText(runner.result.reason);
        } else {
          resultEl.className = 'result';
          resultEl.textContent = '';
        }
        btnPaso.disabled = runner.finished;
        btnTodo.disabled = runner.finished;

        // Dentro del acordeón las cintas no caben enteras. Que se traiga solo lo que toca
        // mirar —el opcode en curso, o el veredicto al acabar— evita tocar el ratón. Va al
        // final porque el resultado no existe para scrollIntoView hasta que se le pone .show.
        if (runner.index > 0 && visible(contenedor)) {
          const foco = runner.finished ? resultEl : tape.querySelector('.op-row.current, .op-row.muerto');
          if (foco) foco.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      },
      paso() {
        if (runner.finished) return false;
        runner.step();
        ctrl.render();
        return true;
      },
      todo() {
        while (!runner.finished) runner.step();
        ctrl.render();
      },
      reiniciar() {
        runner.reset();
        ctrl.render();
      },
      /** Sustituye el script sin volver a montar el DOM (la de los dos fallos alterna tres intentos). */
      cargar(nuevoRunner) {
        ctrl.runner = runner = nuevoRunner;
        ctrl.render();
      },
    };

    btnPaso.onclick = () => ctrl.paso();
    btnTodo.onclick = () => ctrl.todo();
    contenedor.querySelector('[data-reset]').onclick = () => ctrl.reiniciar();

    controladores.push(ctrl);
    ctrl.render();
    return ctrl;
  };

  /* Una diapositiva puede tener más de un widget (el multisig vive dentro de
     un <details>); solo cuenta el que se está viendo. Un <details> cerrado se oculta
     con content-visibility y sigue teniendo offsetParent, así que hace falta
     checkVisibility(); el offsetParent queda de reserva para navegadores viejos. */
  const visible = (el) => (el.checkVisibility ? el.checkVisibility() : !!el.offsetParent);

  vmui.runnerFor = function (section) {
    const ctrl = controladores.find((c) => section.contains(c.contenedor) && visible(c.contenedor));
    return ctrl || null;
  };

  vmui.reiniciarEn = function (section) {
    controladores.filter((c) => section.contains(c.contenedor)).forEach((c) => c.reiniciar());
  };
})(window);
