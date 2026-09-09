<script lang="ts">
  import { onMount } from 'svelte';
  import { store } from '../model/store.svelte';

  /**
   * Firework on completion: a burst of pixel stars that explode outward, then
   * peel off into curling trails like flares, fading as they go.
   */
  interface P {
    x: number;
    y: number;
    vx: number;
    vy: number;
    t: number;
    life: number;
    curl: number;
    size: number;
    color: string;
    spin: number;
    trail: { x: number; y: number }[];
  }
  let canvas = $state<HTMLCanvasElement | null>(null);
  let particles: P[] = [];
  let raf = 0;
  let last = 0;
  const colors = ['#ff6b4a', '#ffb347', '#ffe066', '#67c26b', '#4a9bff', '#b07cff', '#ff7ab6', '#fff7c9'];

  function spawn(x: number, y: number) {
    const n = 46;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const s = 240 + Math.random() * 300;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 40,
        t: 0,
        life: 1.15 + Math.random() * 0.55,
        curl: (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 9),
        size: 3 + Math.random() * 4,
        color: colors[i % colors.length],
        spin: (Math.random() - 0.5) * 12,
        trail: []
      });
    }
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(step);
    }
  }

  function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const rr = i % 2 === 0 ? r : r * 0.42;
      const a = rot + (i * Math.PI) / 4;
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  function step(now: number) {
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) {
      raf = 0;
      return;
    }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== innerWidth * dpr || canvas.height !== innerHeight * dpr) {
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);

    particles = particles.filter((p) => p.t < p.life);
    for (const p of particles) {
      p.t += dt;
      // Phase 1 (~0.22s): straight blast. Phase 2: the flare curls, tighter as it goes.
      const curlT = Math.max(0, p.t - 0.22);
      const w = p.curl * curlT * 1.6;
      const ang = w * dt;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const vx = p.vx * c - p.vy * s;
      const vy = p.vx * s + p.vy * c;
      p.vx = vx * Math.pow(0.25, dt);
      p.vy = vy * Math.pow(0.25, dt) + 90 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 10) p.trail.shift();

      const k = 1 - p.t / p.life;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(1, p.size * 0.45);
      ctx.lineCap = 'round';
      for (let i = 1; i < p.trail.length; i++) {
        ctx.globalAlpha = k * (i / p.trail.length) * 0.6;
        ctx.beginPath();
        ctx.moveTo(p.trail[i - 1].x, p.trail[i - 1].y);
        ctx.lineTo(p.trail[i].x, p.trail[i].y);
        ctx.stroke();
      }
      ctx.globalAlpha = Math.min(1, k * 1.4);
      ctx.fillStyle = p.color;
      star(ctx, p.x, p.y, p.size * (0.7 + 0.3 * k), p.t * p.spin);
    }
    ctx.globalAlpha = 1;
    raf = particles.length ? requestAnimationFrame(step) : 0;
    if (!raf) ctx.clearRect(0, 0, innerWidth, innerHeight);
  }

  $effect(() => {
    const at = store.celebrateAt;
    if (at) spawn(at.x, at.y);
  });
  onMount(() => () => cancelAnimationFrame(raf));
</script>

<canvas bind:this={canvas} class="fx" aria-hidden="true"></canvas>

<style>
  .fx {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    z-index: 200;
  }
</style>
