// Bradley-Terry rating with a weak Gaussian prior, fitted by Newton's method.
//
// Each aggregated game is { i, j, si, sj }: item indices and the (weighted) score
// each side earned against the other. A tie is worth 0.5 to each side.
// The prior keeps items with no wins (or no games) finite and makes the
// Hessian positive definite, so the covariance below always exists.

import { cholesky, cholSolve, invertSPD } from './linalg.js';

export const sigmoid = (x) => 1 / (1 + Math.exp(-x));

const LAMBDA = 0.1;

function negHessianAndGradient(n, games, theta, lambda) {
  const g = new Float64Array(n);
  const H = new Float64Array(n * n);
  for (const { i, j, si, sj } of games) {
    const N = si + sj;
    if (N <= 0) continue;
    const p = sigmoid(theta[i] - theta[j]);
    const r = si - N * p;
    g[i] += r;
    g[j] -= r;
    const w = N * p * (1 - p);
    H[i * n + i] += w;
    H[j * n + j] += w;
    H[i * n + j] -= w;
    H[j * n + i] -= w;
  }
  for (let i = 0; i < n; i++) {
    g[i] -= lambda * theta[i];
    H[i * n + i] += lambda;
  }
  return { g, H };
}

export function fitBT(n, games, { lambda = LAMBDA, maxIter = 100 } = {}) {
  const theta = new Float64Array(n);
  for (let iter = 0; iter < maxIter; iter++) {
    const { g, H } = negHessianAndGradient(n, games, theta, lambda);
    const step = cholSolve(cholesky(H, n), n, g);
    let maxStep = 0;
    for (let i = 0; i < n; i++) {
      theta[i] += step[i];
      maxStep = Math.max(maxStep, Math.abs(step[i]));
    }
    if (maxStep < 1e-9) break;
  }
  const { H } = negHessianAndGradient(n, games, theta, lambda);
  return { theta, cov: invertSPD(H, n) };
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng) {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

// Average chance of beating each other item: an easy-to-read 0..1 preference score.
export function scoresOf(theta, n) {
  const out = new Float64Array(n);
  if (n < 2) return out.fill(0.5);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) if (j !== i) s += sigmoid(theta[i] - theta[j]);
    out[i] = s / (n - 1);
  }
  return out;
}

function ranksOf(theta, n) {
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => theta[b] - theta[a]);
  const rank = new Int32Array(n);
  order.forEach((idx, pos) => (rank[idx] = pos + 1));
  return rank;
}

function percentile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// Point estimates plus 90% intervals for score and rank, from draws of the posterior.
export function summarize(theta, cov, n, { draws = 400, seed = 1 } = {}) {
  const score = scoresOf(theta, n);
  const rank = ranksOf(theta, n);
  const jittered = Float64Array.from(cov);
  for (let i = 0; i < n; i++) jittered[i * n + i] += 1e-12;
  const L = cholesky(jittered, n);
  const rng = mulberry32(seed);
  const scoreDraws = Array.from({ length: n }, () => []);
  const rankDraws = Array.from({ length: n }, () => []);
  const z = new Float64Array(n);
  const t = new Float64Array(n);
  for (let d = 0; d < draws; d++) {
    for (let i = 0; i < n; i++) z[i] = gaussian(rng);
    for (let i = 0; i < n; i++) {
      let s = theta[i];
      for (let k = 0; k <= i; k++) s += L[i * n + k] * z[k];
      t[i] = s;
    }
    const sc = scoresOf(t, n);
    const rk = ranksOf(t, n);
    for (let i = 0; i < n; i++) {
      scoreDraws[i].push(sc[i]);
      rankDraws[i].push(rk[i]);
    }
  }
  return Array.from({ length: n }, (_, i) => {
    const s = scoreDraws[i].sort((a, b) => a - b);
    const r = rankDraws[i].sort((a, b) => a - b);
    return {
      score: score[i],
      lo: percentile(s, 0.05),
      hi: percentile(s, 0.95),
      rank: rank[i],
      rankLo: Math.round(percentile(r, 0.05)),
      rankHi: Math.round(percentile(r, 0.95)),
    };
  });
}

// Standard normal CDF (Abramowitz & Stegun 26.2.17, error < 1e-7).
export function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

// Probability that item i truly ranks above item j, given the fit's uncertainty.
export function orderProb(theta, cov, n, i, j) {
  const v = cov[i * n + i] + cov[j * n + j] - 2 * cov[i * n + j];
  return normalCdf((theta[i] - theta[j]) / Math.sqrt(Math.max(v, 1e-12)));
}

// How sure the fit is about the whole ordering, 0..1: the average chance that a pair of items is
// in the right order, rescaled so 0 = coin flips (no information) and 1 = every pair certain.
export function orderConfidence(theta, cov, n) {
  if (n < 2) return 0;
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const p = orderProb(theta, cov, n, i, j);
      sum += Math.max(p, 1 - p);
      pairs++;
    }
  return Math.max(0, 2 * (sum / pairs) - 1);
}
