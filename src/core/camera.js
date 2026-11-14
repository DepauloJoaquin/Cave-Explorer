// =====================================================================
// CÁMARA
// =====================================================================
// La cámara es un punto (x, y) del mundo que queda en el centro de la
// pantalla. apply() mueve el contenedor del mundo en sentido contrario.
//
// Hoy main.js hace que la cámara siga al jugador suavemente, así que
// solo se usan el constructor, la tecla F y apply(). update() y
// attach() son de la etapa 1 (cámara libre con teclado y arrastre) y
// quedaron por si se quiere volver a ese modo.
// =====================================================================

export class Camera {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
    this.speed = 470;      // velocidad de la cámara libre (px/s)
    this.keys = new Set();
    this.dragging = false;

    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();

      // Evitar que las flechas/espacio scrolleen la página
      if (['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright',' '].includes(k)) e.preventDefault();

      this.keys.add(k);

      // F: pantalla completa
      if (k === 'f' && !e.repeat) {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
        else document.exitFullscreen?.();
      }
    });
    window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  // (Sin uso actualmente) arrastrar la vista con el mouse
  attach(element) {
    element.addEventListener('pointerdown', e => {
      this.dragging = true;
      this.lastX = e.clientX; this.lastY = e.clientY;
      element.classList.add('dragging');
      element.setPointerCapture(e.pointerId);
    });
    element.addEventListener('pointermove', e => {
      if (!this.dragging) return;
      this.x -= e.clientX - this.lastX;
      this.y -= e.clientY - this.lastY;
      this.lastX = e.clientX; this.lastY = e.clientY;
    });
    const stop = () => { this.dragging = false; element.classList.remove('dragging'); };
    element.addEventListener('pointerup', stop);
    element.addEventListener('pointercancel', stop);
    element.addEventListener('lostpointercapture', stop);
  }

  // (Sin uso actualmente) mover la cámara libre con WASD
  update(dt) {
    const left = this.keys.has('a') || this.keys.has('arrowleft');
    const right = this.keys.has('d') || this.keys.has('arrowright');
    const up = this.keys.has('w') || this.keys.has('arrowup');
    const down = this.keys.has('s') || this.keys.has('arrowdown');
    let dx = Number(right) - Number(left);
    let dy = Number(down) - Number(up);
    // Normalizar para que en diagonal no vaya más rápido
    const length = Math.hypot(dx, dy) || 1;
    this.x += (dx / length) * this.speed * dt;
    this.y += (dy / length) * this.speed * dt;
  }

  // Desplazar el contenedor del mundo para que (x, y) quede en el
  // centro de la pantalla. Se redondea para que los píxeles no tiemblen.
  apply(container, width, height) { container.position.set(Math.round(width / 2 - this.x), Math.round(height / 2 - this.y)); }
}
