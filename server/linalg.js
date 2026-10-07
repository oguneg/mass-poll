// Small dense symmetric-positive-definite helpers. Matrices are flat row-major Float64Arrays.

export function cholesky(A, n) {
  const L = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = A[i * n + j];
      for (let k = 0; k < j; k++) sum -= L[i * n + k] * L[j * n + k];
      if (i === j) {
        if (sum <= 0) throw new Error('matrix is not positive definite');
        L[i * n + i] = Math.sqrt(sum);
      } else {
        L[i * n + j] = sum / L[j * n + j];
      }
    }
  }
  return L;
}

export function cholSolve(L, n, b) {
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k];
    y[i] = s / L[i * n + i];
  }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k];
    x[i] = s / L[i * n + i];
  }
  return x;
}

export function invertSPD(A, n) {
  const L = cholesky(A, n);
  const inv = new Float64Array(n * n);
  const e = new Float64Array(n);
  for (let c = 0; c < n; c++) {
    e.fill(0);
    e[c] = 1;
    const col = cholSolve(L, n, e);
    for (let r = 0; r < n; r++) inv[r * n + c] = col[r];
  }
  return inv;
}
