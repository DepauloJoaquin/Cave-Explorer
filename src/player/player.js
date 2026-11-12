
import { Graphics } from 'pixi.js';
import { CELL_SIZE, MATERIAL } from '../terrain/config.js';

export class Player {
  constructor(x, y, terrain) {
    this.x = x;
    this.y = y;
    this.terrain = terrain;

    this.width = 16;
    this.height = 24;

    this.vx = 0;
    this.vy = 0;

    this.speed = 180;
    this.gravity = 650;
    this.hoverForce = 1050;
    this.maxFallSpeed = 450;
    this.maxRiseSpeed = 180;

    this.keys = new Set();

    this.graphic = new Graphics();
    this.graphic
      .roundRect(-8, -12, 16, 24, 4)
      .fill(0xf0d78b)
      .roundRect(-5, -8, 10, 6, 2)
      .fill(0x263d55);

    this.graphic.position.set(this.x, this.y);

    window.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      if (['w', 'a', 's', 'd', ' '].includes(key)) {
        event.preventDefault();
      }
      this.keys.add(key);
    });

    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.key.toLowerCase());
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
    });
  }

  isSolidAt(x, y) {
    const cellX = Math.floor(x / CELL_SIZE);
    const cellY = Math.floor(y / CELL_SIZE);

    return this.terrain.getCell(cellX, cellY) !== MATERIAL.EMPTY;
  }

  collidesAt(x, y) {
    const halfW = this.width / 2;
    const halfH = this.height / 2;
    const epsilon = 0.01;

    const left = Math.floor((x - halfW) / CELL_SIZE);
    const right = Math.floor((x + halfW - epsilon) / CELL_SIZE);
    const top = Math.floor((y - halfH) / CELL_SIZE);
    const bottom = Math.floor((y + halfH - epsilon) / CELL_SIZE);

    for (let cellY = top; cellY <= bottom; cellY++) {
      for (let cellX = left; cellX <= right; cellX++) {
        if (this.terrain.getCell(cellX, cellY) !== MATERIAL.EMPTY) {
          return true;
        }
      }
    }

    return false;
  }

  moveAxis(amount, axis) {
    const steps = Math.ceil(Math.abs(amount) / 3);
    if (steps === 0) return;

    const step = amount / steps;

    for (let i = 0; i < steps; i++) {
      const nextX = axis === 'x' ? this.x + step : this.x;
      const nextY = axis === 'y' ? this.y + step : this.y;

      if (this.collidesAt(nextX, nextY)) {
        if (axis === 'x') this.vx = 0;
        else this.vy = 0;
        break;
      }

      this.x = nextX;
      this.y = nextY;
    }
  }

  update(dt) {
    const left = this.keys.has('a') || this.keys.has('arrowleft');
    const right = this.keys.has('d') || this.keys.has('arrowright');
    const hover = this.keys.has('w') ||
                  this.keys.has(' ') ||
                  this.keys.has('arrowup');
    const descend = this.keys.has('s') ||
                    this.keys.has('arrowdown');

    this.vx = (Number(right) - Number(left)) * this.speed;

    this.vy += this.gravity * dt;

    if (hover) {
      this.vy -= this.hoverForce * dt;
    }

    if (descend) {
      this.vy += 400 * dt;
    }

    this.vy = Math.max(
      -this.maxRiseSpeed,
      Math.min(this.vy, this.maxFallSpeed)
    );

    this.moveAxis(this.vx * dt, 'x');
    this.moveAxis(this.vy * dt, 'y');

    this.graphic.position.set(
      Math.round(this.x),
      Math.round(this.y)
    );
  }
}
