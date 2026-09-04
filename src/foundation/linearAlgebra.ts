/**
 * Neutral linear algebra contracts shared by product adapters.
 *
 * This module intentionally has no product, model, persistence, or presentation
 * dependencies. Its error codes and diagnostics describe only numerical work.
 */

export type Matrix = number[][];

export type LinearSolverPolicy = 'auto' | 'dense';
export type LinearSolverBackend = 'dense-lu' | 'sparse-ldlt';
export type LinearSolverFallbackReason =
  | 'forced-dense'
  | 'below-size-threshold'
  | 'constraints-not-reducible'
  | 'reduced-system-below-threshold'
  | 'excessive-fill'
  | 'non-symmetric'
  | 'non-positive-pivot';

export interface LinearSolverDiagnostics {
  policy: LinearSolverPolicy;
  backend: LinearSolverBackend;
  fallbackReason?: LinearSolverFallbackReason;
  dimension: number;
  reducedDimension?: number;
}

export interface LinearSolveResult {
  x: number[];
  /** Estimate of kappa_1(A) = ||A||_1 ||A^-1||_1 using Hager iterations. */
  conditionEstimate: number;
  pivotRatio: number;
  relativeResidual: number;
  refinementIterations: number;
  diagnostics: LinearSolverDiagnostics;
}

export interface LinearSystemFactorization {
  readonly dimension: number;
  readonly diagnostics: LinearSolverDiagnostics;
  readonly minPivot: number;
  readonly maxPivot: number;
  solve(vector: readonly number[]): number[];
  solveTranspose(vector: readonly number[]): number[];
}

export type LinearAlgebraErrorCode =
  | 'dimension-mismatch'
  | 'non-square-system'
  | 'non-finite-value'
  | 'singular';

export interface LinearAlgebraErrorDetails {
  readonly pivotIndex?: number;
}

const errorMessages: Record<LinearAlgebraErrorCode, string> = {
  'dimension-mismatch': 'Las dimensiones de álgebra lineal son incompatibles.',
  'non-square-system': 'El sistema numérico debe ser cuadrado y no vacío.',
  'non-finite-value': 'El sistema numérico contiene valores no finitos.',
  singular: 'La factorización numérica es singular.',
};

/** A product-neutral numerical failure with machine-readable classification. */
export class LinearAlgebraError extends Error {
  readonly code: LinearAlgebraErrorCode;
  readonly pivotIndex?: number;

  constructor(code: LinearAlgebraErrorCode, details: LinearAlgebraErrorDetails = {}) {
    super(errorMessages[code]);
    this.name = 'LinearAlgebraError';
    this.code = code;
    this.pivotIndex = details.pivotIndex;
  }
}

/** Public numerical policy constants. Changing one changes solver behavior. */
export const LINEAR_ALGEBRA_TOLERANCES = Object.freeze({
  multiplicationZero: 1e-30,
  negligibleRelative: 1e-12,
  sparseMinimumDimension: 60,
  hagerIterations: 8,
  refinementResidual: 5e-15,
  maxRefinementIterations: 3,
  nullSpaceToleranceMultiplier: 32,
});

const assertRectangularMatrix = (matrix: Matrix): number => {
  const columns = matrix[0]?.length ?? 0;
  if (matrix.some((row) => row.length !== columns)) {
    throw new LinearAlgebraError('dimension-mismatch');
  }
  return columns;
};

export const zeros = (rows: number, cols: number): Matrix =>
  Array.from({ length: rows }, () => Array(cols).fill(0));

export const transpose = (a: Matrix): Matrix => {
  assertRectangularMatrix(a);
  if (a.length === 0) return [];
  return a[0].map((_, j) => a.map((row) => row[j]));
};

export const multiply = (a: Matrix, b: Matrix): Matrix => {
  const aColumns = assertRectangularMatrix(a);
  const bColumns = assertRectangularMatrix(b);
  if (!a.length || !b.length || aColumns !== b.length) {
    throw new LinearAlgebraError('dimension-mismatch');
  }
  const out = zeros(a.length, bColumns);
  for (let i = 0; i < a.length; i += 1) {
    for (let k = 0; k < b.length; k += 1) {
      const aik = a[i][k];
      if (Math.abs(aik) < LINEAR_ALGEBRA_TOLERANCES.multiplicationZero) continue;
      for (let j = 0; j < b[0].length; j += 1) out[i][j] += aik * b[k][j];
    }
  }
  return out;
};

export const multiplyMatrixVector = (a: Matrix, x: readonly number[]): number[] => {
  const columns = assertRectangularMatrix(a);
  if (x.length !== columns) throw new LinearAlgebraError('dimension-mismatch');
  return a.map((row) => row.reduce((sum, value, index) => sum + value * x[index], 0));
};

export const addToMatrix = (target: Matrix, source: Matrix, indices: number[]): void => {
  for (let i = 0; i < indices.length; i += 1) {
    for (let j = 0; j < indices.length; j += 1) {
      target[indices[i]][indices[j]] += source[i][j];
    }
  }
};

export const addToVector = (target: number[], source: number[], indices: number[]): void => {
  for (let i = 0; i < indices.length; i += 1) target[indices[i]] += source[i];
};

export const maxAbs = (values: readonly number[]): number =>
  values.reduce((max, value) => Math.max(max, Math.abs(value)), 0);

interface LUFactorization {
  lu: Matrix;
  permutation: number[];
  maxPivot: number;
  minPivot: number;
}

/** Compressed sparse row storage for the lower triangle and diagonal. */
export interface SparseMatrixCSR {
  n: number;
  values: number[];
  colIndices: number[];
  rowPointers: number[];
}

interface GenericSolver {
  solve: (vector: readonly number[]) => number[];
  solveTranspose: (vector: readonly number[]) => number[];
  minPivot: number;
  maxPivot: number;
}

const matrixOneNorm = (matrix: Matrix): number => {
  if (!matrix.length) return 0;
  let norm = 0;
  for (let column = 0; column < matrix[0].length; column += 1) {
    let sum = 0;
    for (let row = 0; row < matrix.length; row += 1) sum += Math.abs(matrix[row][column]);
    norm = Math.max(norm, sum);
  }
  return norm;
};

const factorizeLU = (matrix: Matrix): LUFactorization => {
  const n = matrix.length;
  const lu = matrix.map((row) => [...row]);
  const permutation = Array.from({ length: n }, (_, index) => index);
  const rowScale = lu.map((row) => Math.max(...row.map(Math.abs), Number.MIN_VALUE));
  const norm = matrixOneNorm(matrix);
  const singularTolerance = Math.max(Number.EPSILON * n * norm, Number.MIN_VALUE);
  let maxPivot = 0;
  let minPivot = Number.POSITIVE_INFINITY;

  for (let k = 0; k < n; k += 1) {
    let pivotRow = k;
    let pivotScore = -1;
    for (let i = k; i < n; i += 1) {
      const score = Math.abs(lu[i][k]) / rowScale[i];
      if (score > pivotScore) {
        pivotScore = score;
        pivotRow = i;
      }
    }

    const pivotMagnitude = Math.abs(lu[pivotRow][k]);
    if (!Number.isFinite(pivotMagnitude) || pivotMagnitude <= singularTolerance) {
      throw new LinearAlgebraError('singular', { pivotIndex: k });
    }

    if (pivotRow !== k) {
      [lu[k], lu[pivotRow]] = [lu[pivotRow], lu[k]];
      [rowScale[k], rowScale[pivotRow]] = [rowScale[pivotRow], rowScale[k]];
      [permutation[k], permutation[pivotRow]] = [permutation[pivotRow], permutation[k]];
    }

    const pivot = lu[k][k];
    maxPivot = Math.max(maxPivot, Math.abs(pivot));
    minPivot = Math.min(minPivot, Math.abs(pivot));

    for (let i = k + 1; i < n; i += 1) {
      const factor = lu[i][k] / pivot;
      lu[i][k] = factor;
      if (Math.abs(factor) < LINEAR_ALGEBRA_TOLERANCES.multiplicationZero) continue;
      for (let j = k + 1; j < n; j += 1) lu[i][j] -= factor * lu[k][j];
    }
  }

  return { lu, permutation, maxPivot, minPivot };
};

const solveLU = (factorization: LUFactorization, vector: readonly number[]): number[] => {
  const { lu, permutation } = factorization;
  const n = lu.length;
  const x = permutation.map((sourceRow) => vector[sourceRow]);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < i; j += 1) x[i] -= lu[i][j] * x[j];
  }
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = i + 1; j < n; j += 1) x[i] -= lu[i][j] * x[j];
    x[i] /= lu[i][i];
  }
  return x;
};

/** Solves A^T x=b from P A=L U without forming A^T or refactorizing. */
const solveLUTranspose = (factorization: LUFactorization, vector: readonly number[]): number[] => {
  const { lu, permutation } = factorization;
  const n = lu.length;
  const z = [...vector];
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < i; j += 1) z[i] -= lu[j][i] * z[j];
    z[i] /= lu[i][i];
  }
  const y = [...z];
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = i + 1; j < n; j += 1) y[i] -= lu[j][i] * y[j];
  }
  const x = Array(n).fill(0);
  for (let i = 0; i < n; i += 1) x[permutation[i]] = y[i];
  return x;
};

interface EliminationStep {
  equationRow: number;
  variableColumn: number;
  coefficient: number;
}

interface ConstraintElimination {
  steps: EliminationStep[];
  keep: number[];
}

/**
 * Finds equations with a zero diagonal and exactly one significant coefficient.
 * Such an equation fixes one unknown directly and can be eliminated from the
 * reduced system without changing the solution of the original system.
 */
const findSingleVariableConstraints = (matrix: Matrix): ConstraintElimination | null => {
  const n = matrix.length;
  const removed = new Uint8Array(n);
  const steps: EliminationStep[] = [];
  for (let i = 0; i < n; i += 1) {
    if (removed[i] || matrix[i][i] !== 0) continue;
    const row = matrix[i];
    let rowMax = 0;
    for (let m = 0; m < n; m += 1) {
      const magnitude = Math.abs(row[m]);
      if (magnitude > rowMax) rowMax = magnitude;
    }
    if (rowMax === 0) return null;
    const tolerance = rowMax * LINEAR_ALGEBRA_TOLERANCES.negligibleRelative;
    let column = -1;
    let significant = 0;
    for (let m = 0; m < n; m += 1) {
      if (Math.abs(row[m]) <= tolerance) continue;
      significant += 1;
      if (significant > 1) break;
      column = m;
    }
    if (significant !== 1 || column === i || removed[column]) return null;
    removed[i] = 1;
    removed[column] = 1;
    steps.push({ equationRow: i, variableColumn: column, coefficient: row[column] });
  }
  if (!steps.length) return null;
  const keep: number[] = [];
  for (let i = 0; i < n; i += 1) if (!removed[i]) keep.push(i);
  return { steps, keep };
};

/** Reverse Cuthill-McKee over the reduced sparsity pattern. */
const reverseCuthillMcKee = (matrix: Matrix, keep: number[]): number[] => {
  const size = keep.length;
  const adjacency: number[][] = Array.from({ length: size }, () => []);
  for (let a = 0; a < size; a += 1) {
    const row = matrix[keep[a]];
    for (let b = 0; b < size; b += 1) {
      if (a !== b && row[keep[b]] !== 0) adjacency[a].push(b);
    }
  }
  const degree = adjacency.map((neighbours) => neighbours.length);
  for (const neighbours of adjacency) neighbours.sort((a, b) => degree[a] - degree[b]);
  const visited = new Uint8Array(size);
  const order: number[] = [];
  while (order.length < size) {
    let root = -1;
    for (let i = 0; i < size; i += 1) {
      if (!visited[i] && (root < 0 || degree[i] < degree[root])) root = i;
    }
    visited[root] = 1;
    const queue = [root];
    for (let head = 0; head < queue.length; head += 1) {
      const vertex = queue[head];
      order.push(vertex);
      for (const neighbour of adjacency[vertex]) {
        if (visited[neighbour]) continue;
        visited[neighbour] = 1;
        queue.push(neighbour);
      }
    }
  }
  return order.reverse();
};

/** Lower triangle of a reduced, reordered matrix in compressed sparse rows. */
const buildLowerCSR = (matrix: Matrix, keep: number[], order: number[]): SparseMatrixCSR => {
  const size = order.length;
  const position = new Array<number>(size);
  for (let index = 0; index < size; index += 1) position[order[index]] = index;
  const values: number[] = [];
  const colIndices: number[] = [];
  const rowPointers = new Array<number>(size + 1).fill(0);
  for (let a = 0; a < size; a += 1) {
    const row = matrix[keep[order[a]]];
    for (let b = 0; b < size; b += 1) {
      if (position[b] > a) continue;
      const value = row[keep[b]];
      if (value === 0) continue;
      values.push(value);
      colIndices.push(position[b]);
    }
    rowPointers[a + 1] = values.length;
  }
  for (let a = 0; a < size; a += 1) {
    const start = rowPointers[a];
    const end = rowPointers[a + 1];
    const slice = [];
    for (let p = start; p < end; p += 1) slice.push({ column: colIndices[p], value: values[p] });
    slice.sort((left, right) => left.column - right.column);
    for (let p = start; p < end; p += 1) {
      colIndices[p] = slice[p - start].column;
      values[p] = slice[p - start].value;
    }
  }
  return { n: size, values, colIndices, rowPointers };
};

interface SparseSymbolic {
  parent: Int32Array;
  columnPointers: Int32Array;
  fill: number;
}

/** Elimination tree and per-column fill counts for the LDL symbolic phase. */
const symbolicLDLT = (csr: SparseMatrixCSR): SparseSymbolic => {
  const n = csr.n;
  const parent = new Int32Array(n).fill(-1);
  const flag = new Int32Array(n).fill(-1);
  const counts = new Int32Array(n);
  for (let k = 0; k < n; k += 1) {
    flag[k] = k;
    for (let p = csr.rowPointers[k]; p < csr.rowPointers[k + 1]; p += 1) {
      let i = csr.colIndices[p];
      if (i >= k) continue;
      for (; flag[i] !== k; i = parent[i]) {
        if (parent[i] === -1) parent[i] = k;
        counts[i] += 1;
        flag[i] = k;
      }
    }
  }
  const columnPointers = new Int32Array(n + 1);
  for (let k = 0; k < n; k += 1) columnPointers[k + 1] = columnPointers[k] + counts[k];
  return { parent, columnPointers, fill: columnPointers[n] };
};

interface SparseLDLT {
  columnPointers: Int32Array;
  rowIndices: Int32Array;
  values: Float64Array;
  diagonal: Float64Array;
  minPivot: number;
  maxPivot: number;
}

/** Numeric LDL^T without pivoting; null means the fast path is not applicable. */
const numericLDLT = (csr: SparseMatrixCSR, symbolic: SparseSymbolic): SparseLDLT | null => {
  const n = csr.n;
  const { parent, columnPointers } = symbolic;
  const rowIndices = new Int32Array(symbolic.fill);
  const values = new Float64Array(symbolic.fill);
  const diagonal = new Float64Array(n);
  const y = new Float64Array(n);
  const pattern = new Int32Array(n);
  const flag = new Int32Array(n).fill(-1);
  const counts = new Int32Array(n);
  let minPivot = Number.POSITIVE_INFINITY;
  let maxPivot = 0;
  let scale = 0;
  for (let k = 0; k < n; k += 1) {
    for (let p = csr.rowPointers[k]; p < csr.rowPointers[k + 1]; p += 1) {
      if (csr.colIndices[p] === k) scale = Math.max(scale, Math.abs(csr.values[p]));
    }
  }
  const pivotFloor = scale * Number.EPSILON * n;

  for (let k = 0; k < n; k += 1) {
    y[k] = 0;
    let top = n;
    flag[k] = k;
    counts[k] = 0;
    for (let p = csr.rowPointers[k]; p < csr.rowPointers[k + 1]; p += 1) {
      const column = csr.colIndices[p];
      if (column > k) continue;
      y[column] += csr.values[p];
      let length = 0;
      for (let i = column; flag[i] !== k; i = parent[i]) {
        pattern[length] = i;
        length += 1;
        flag[i] = k;
      }
      while (length > 0) {
        length -= 1;
        top -= 1;
        pattern[top] = pattern[length];
      }
    }
    let pivot = y[k];
    y[k] = 0;
    for (; top < n; top += 1) {
      const i = pattern[top];
      const yi = y[i];
      y[i] = 0;
      const end = columnPointers[i] + counts[i];
      for (let p = columnPointers[i]; p < end; p += 1) y[rowIndices[p]] -= values[p] * yi;
      const lki = yi / diagonal[i];
      pivot -= lki * yi;
      rowIndices[end] = k;
      values[end] = lki;
      counts[i] += 1;
    }
    if (!Number.isFinite(pivot) || pivot <= pivotFloor) return null;
    diagonal[k] = pivot;
    if (pivot < minPivot) minPivot = pivot;
    if (pivot > maxPivot) maxPivot = pivot;
  }
  return { columnPointers, rowIndices, values, diagonal, minPivot, maxPivot };
};

const solveLDLT = (factorization: SparseLDLT, vector: readonly number[]): number[] => {
  const { columnPointers, rowIndices, values, diagonal } = factorization;
  const n = diagonal.length;
  const x = Array.from(vector);
  for (let j = 0; j < n; j += 1) {
    const xj = x[j];
    if (xj !== 0) {
      for (let p = columnPointers[j]; p < columnPointers[j + 1]; p += 1) x[rowIndices[p]] -= values[p] * xj;
    }
  }
  for (let j = 0; j < n; j += 1) x[j] /= diagonal[j];
  for (let j = n - 1; j >= 0; j -= 1) {
    let sum = x[j];
    for (let p = columnPointers[j]; p < columnPointers[j + 1]; p += 1) sum -= values[p] * x[rowIndices[p]];
    x[j] = sum;
  }
  return x;
};

const buildDenseSolver = (matrix: Matrix): GenericSolver => {
  const factorization = factorizeLU(matrix);
  return {
    solve: (vector) => solveLU(factorization, vector),
    solveTranspose: (vector) => solveLUTranspose(factorization, vector),
    minPivot: factorization.minPivot,
    maxPivot: factorization.maxPivot,
  };
};

interface HybridSolverAttempt {
  solver: GenericSolver | null;
  fallbackReason?: LinearSolverFallbackReason;
  reducedDimension?: number;
}

/**
 * The sparse LDLT path factors a symmetric matrix and reuses its solve for the
 * transpose. A relative comparison permits round-off scale differences without
 * treating a genuinely non-symmetric operator as symmetric.
 */
const isNumericallySymmetric = (matrix: Matrix): boolean => {
  for (let row = 1; row < matrix.length; row += 1) {
    for (let column = 0; column < row; column += 1) {
      const upper = matrix[column][row];
      const lower = matrix[row][column];
      const scale = Math.max(Math.abs(upper), Math.abs(lower));
      if (scale === 0) continue;
      if (Math.abs(upper - lower) > scale * LINEAR_ALGEBRA_TOLERANCES.negligibleRelative) return false;
    }
  }
  return true;
};

/**
 * Eliminates directly fixed unknowns, factorizes the remaining block sparsely,
 * and exposes a solver over the original vector length. It returns null when
 * the fast path is inapplicable so dense LU retains its established behavior.
 */
const attemptHybridSolver = (matrix: Matrix): HybridSolverAttempt => {
  const n = matrix.length;
  if (n < LINEAR_ALGEBRA_TOLERANCES.sparseMinimumDimension) {
    return { solver: null, fallbackReason: 'below-size-threshold' };
  }
  if (!isNumericallySymmetric(matrix)) return { solver: null, fallbackReason: 'non-symmetric' };
  const elimination = findSingleVariableConstraints(matrix);
  if (!elimination) return { solver: null, fallbackReason: 'constraints-not-reducible' };
  const { steps, keep } = elimination;
  const size = keep.length;
  if (size < LINEAR_ALGEBRA_TOLERANCES.sparseMinimumDimension) {
    return { solver: null, fallbackReason: 'reduced-system-below-threshold', reducedDimension: size };
  }

  const order = reverseCuthillMcKee(matrix, keep);
  const csr = buildLowerCSR(matrix, keep, order);
  const symbolic = symbolicLDLT(csr);
  if (symbolic.fill > 0.25 * size * size) {
    return { solver: null, fallbackReason: 'excessive-fill', reducedDimension: size };
  }
  const factorization = numericLDLT(csr, symbolic);
  if (!factorization) {
    return { solver: null, fallbackReason: 'non-positive-pivot', reducedDimension: size };
  }

  const position = new Array<number>(size);
  for (let index = 0; index < size; index += 1) position[order[index]] = index;

  const solve = (vector: readonly number[]): number[] => {
    const x = new Array<number>(n).fill(0);
    for (const step of steps) x[step.variableColumn] = vector[step.equationRow] / step.coefficient;
    const reduced = new Array<number>(size);
    for (let a = 0; a < size; a += 1) {
      const row = matrix[keep[a]];
      let value = vector[keep[a]];
      for (const step of steps) value -= row[step.variableColumn] * x[step.variableColumn];
      reduced[position[a]] = value;
    }
    const solved = solveLDLT(factorization, reduced);
    for (let a = 0; a < size; a += 1) x[keep[a]] = solved[position[a]];
    for (const step of steps) {
      const row = matrix[step.variableColumn];
      let sum = vector[step.variableColumn];
      for (let m = 0; m < n; m += 1) {
        if (m === step.equationRow) continue;
        if (row[m] !== 0) sum -= row[m] * x[m];
      }
      x[step.equationRow] = sum / step.coefficient;
    }
    return x;
  };

  return {
    solver: {
      solve,
      solveTranspose: solve,
      minPivot: factorization.minPivot,
      maxPivot: factorization.maxPivot,
    },
    reducedDimension: size,
  };
};

const buildHybridSolver = (matrix: Matrix): GenericSolver | null => attemptHybridSolver(matrix).solver;

const estimateInverseOneNorm = (solver: GenericSolver, n: number): number => {
  let x = Array(n).fill(1 / n);
  let estimate = 0;
  let previousIndex = -1;
  for (let iteration = 0; iteration < LINEAR_ALGEBRA_TOLERANCES.hagerIterations; iteration += 1) {
    const y = solver.solve(x);
    estimate = Math.max(estimate, y.reduce((sum, value) => sum + Math.abs(value), 0));
    const signs = y.map((value) => value >= 0 ? 1 : -1);
    const z = solver.solveTranspose(signs);
    let index = 0;
    for (let i = 1; i < n; i += 1) if (Math.abs(z[i]) > Math.abs(z[index])) index = i;
    if (index === previousIndex) break;
    previousIndex = index;
    x = Array(n).fill(0);
    x[index] = 1;
  }
  return estimate;
};

const relativeResidual = (matrix: Matrix, x: number[], vector: readonly number[]): number => {
  const residual = multiplyMatrixVector(matrix, x).map((value, index) => vector[index] - value);
  const numerator = maxAbs(residual);
  const matrixInfinityNorm = matrix.reduce(
    (maximum, row) => Math.max(maximum, row.reduce((sum, value) => sum + Math.abs(value), 0)),
    0,
  );
  return numerator / Math.max(Number.MIN_VALUE, matrixInfinityNorm * maxAbs(x) + maxAbs(vector));
};

const assertSquareFiniteMatrix = (matrix: Matrix): void => {
  const n = matrix.length;
  if (n === 0 || matrix.some((row) => row.length !== n)) {
    throw new LinearAlgebraError('non-square-system');
  }
  if (matrix.some((row) => row.some((value) => !Number.isFinite(value)))) {
    throw new LinearAlgebraError('non-finite-value');
  }
};

const assertFiniteVector = (vector: readonly number[], dimension: number): void => {
  if (vector.length !== dimension) throw new LinearAlgebraError('non-square-system');
  if (vector.some((value) => !Number.isFinite(value))) throw new LinearAlgebraError('non-finite-value');
};

const assertSolveInput = (matrix: Matrix, vector: readonly number[]): void => {
  const n = matrix.length;
  if (n === 0 || matrix.some((row) => row.length !== n) || vector.length !== n) {
    throw new LinearAlgebraError('non-square-system');
  }
  if (
    matrix.some((row) => row.some((value) => !Number.isFinite(value)))
    || vector.some((value) => !Number.isFinite(value))
  ) {
    throw new LinearAlgebraError('non-finite-value');
  }
};

interface ValidatedFactorization {
  factorization: LinearSystemFactorization;
  solver: GenericSolver;
}

const buildValidatedFactorization = (
  matrix: Matrix,
  options: { backend?: LinearSolverPolicy },
): ValidatedFactorization => {
  const n = matrix.length;
  const policy = options.backend ?? 'auto';
  const hybridAttempt = policy === 'auto' ? attemptHybridSolver(matrix) : null;
  const solver = hybridAttempt?.solver ?? buildDenseSolver(matrix);
  const diagnostics: LinearSolverDiagnostics = hybridAttempt?.solver
    ? {
        policy,
        backend: 'sparse-ldlt',
        fallbackReason: undefined,
        dimension: n,
        reducedDimension: hybridAttempt.reducedDimension,
      }
    : {
        policy,
        backend: 'dense-lu',
        fallbackReason: policy === 'dense' ? 'forced-dense' : hybridAttempt?.fallbackReason,
        dimension: n,
        ...(hybridAttempt?.reducedDimension === undefined ? {} : { reducedDimension: hybridAttempt.reducedDimension }),
      };

  return {
    solver,
    factorization: {
      dimension: n,
      diagnostics,
      minPivot: solver.minPivot,
      maxPivot: solver.maxPivot,
      solve: (vector) => {
        assertFiniteVector(vector, n);
        return solver.solve(vector);
      },
      solveTranspose: (vector) => {
        assertFiniteVector(vector, n);
        return solver.solveTranspose(vector);
      },
    },
  };
};

/** Factorizes a square finite system once for repeated direct or transpose solves. */
export const factorizeLinearSystem = (
  matrix: Matrix,
  options: { backend?: LinearSolverPolicy } = {},
): LinearSystemFactorization => {
  assertSquareFiniteMatrix(matrix);
  const snapshot = matrix.map((row) => [...row]);
  return buildValidatedFactorization(snapshot, options).factorization;
};

/**
 * Solves a system with Hager 1-norm condition estimation and iterative
 * refinement. The sparse attempt and its dense fallback preserve the original
 * numerical policy and are measured against the same input matrix.
 */
export const solveLinearSystem = (
  matrix: Matrix,
  vector: number[],
  options: { backend?: LinearSolverPolicy } = {},
): LinearSolveResult => {
  assertSolveInput(matrix, vector);

  const { factorization, solver } = buildValidatedFactorization(matrix, options);
  let x = solver.solve(vector);
  let residual = relativeResidual(matrix, x, vector);
  let refinementIterations = 0;
  for (
    let iteration = 0;
    iteration < LINEAR_ALGEBRA_TOLERANCES.maxRefinementIterations
      && residual > LINEAR_ALGEBRA_TOLERANCES.refinementResidual;
    iteration += 1
  ) {
    const correctionRhs = multiplyMatrixVector(matrix, x).map((value, index) => vector[index] - value);
    const correction = solver.solve(correctionRhs);
    const candidate = x.map((value, index) => value + correction[index]);
    const candidateResidual = relativeResidual(matrix, candidate, vector);
    if (candidateResidual >= residual) break;
    x = candidate;
    residual = candidateResidual;
    refinementIterations += 1;
  }

  const pivotRatio = factorization.maxPivot / Math.max(factorization.minPivot, Number.MIN_VALUE);
  const conditionEstimate = matrixOneNorm(matrix) * estimateInverseOneNorm(solver, matrix.length);
  return {
    x,
    conditionEstimate,
    pivotRatio,
    relativeResidual: residual,
    refinementIterations,
    diagnostics: factorization.diagnostics,
  };
};

export interface NullSpaceResult {
  rank: number;
  nullity: number;
  vector: number[] | null;
  residual: number;
}

/** Rank-revealing Gauss-Jordan reduction that returns one normalized null vector. */
export const findNullSpaceVector = (matrix: Matrix, preferredLength = matrix[0]?.length ?? 0): NullSpaceResult => {
  if (!matrix.length || !matrix[0].length || matrix.some((row) => row.length !== matrix[0].length)) {
    return { rank: 0, nullity: 0, vector: null, residual: Number.NaN };
  }
  const rows = matrix.length;
  const columns = matrix[0].length;
  const reduced = matrix.map((row) => [...row]);
  const scale = Math.max(Number.MIN_VALUE, ...matrix.flatMap((row) => row.map(Math.abs)));
  const tolerance = Math.max(
    Number.EPSILON * Math.max(rows, columns) * scale * LINEAR_ALGEBRA_TOLERANCES.nullSpaceToleranceMultiplier,
    Number.MIN_VALUE,
  );
  const pivotColumns: number[] = [];
  let pivotRow = 0;

  for (let column = 0; column < columns && pivotRow < rows; column += 1) {
    let bestRow = pivotRow;
    for (let row = pivotRow + 1; row < rows; row += 1) {
      if (Math.abs(reduced[row][column]) > Math.abs(reduced[bestRow][column])) bestRow = row;
    }
    if (Math.abs(reduced[bestRow][column]) <= tolerance) continue;
    if (bestRow !== pivotRow) [reduced[pivotRow], reduced[bestRow]] = [reduced[bestRow], reduced[pivotRow]];
    const pivot = reduced[pivotRow][column];
    for (let j = column; j < columns; j += 1) reduced[pivotRow][j] /= pivot;
    for (let row = 0; row < rows; row += 1) {
      if (row === pivotRow) continue;
      const factor = reduced[row][column];
      if (Math.abs(factor) <= tolerance) continue;
      reduced[row][column] = 0;
      for (let j = column + 1; j < columns; j += 1) reduced[row][j] -= factor * reduced[pivotRow][j];
    }
    pivotColumns.push(column);
    pivotRow += 1;
  }

  const pivotSet = new Set(pivotColumns);
  const freeColumns = Array.from({ length: columns }, (_, index) => index).filter((index) => !pivotSet.has(index));
  if (!freeColumns.length) return { rank: pivotColumns.length, nullity: 0, vector: null, residual: 0 };

  let selected: number[] | null = null;
  let selectedScore = -1;
  for (const freeColumn of freeColumns) {
    const candidate = Array(columns).fill(0);
    candidate[freeColumn] = 1;
    for (let row = pivotColumns.length - 1; row >= 0; row -= 1) {
      const column = pivotColumns[row];
      let sum = 0;
      for (let j = column + 1; j < columns; j += 1) sum += reduced[row][j] * candidate[j];
      candidate[column] = -sum;
    }
    const norm = Math.hypot(...candidate);
    if (norm <= tolerance) continue;
    const normalized = candidate.map((value) => value / norm);
    const preferredNorm = Math.hypot(...normalized.slice(0, Math.min(preferredLength, columns)));
    if (preferredNorm > selectedScore) {
      selected = normalized;
      selectedScore = preferredNorm;
    }
  }

  const residual = selected ? maxAbs(multiplyMatrixVector(matrix, selected)) / scale : Number.NaN;
  return { rank: pivotColumns.length, nullity: freeColumns.length, vector: selected, residual };
};

/** Test-only internals retained for compatibility with existing solver tests. */
export const __testables = {
  findSingleVariableConstraints,
  reverseCuthillMcKee,
  buildLowerCSR,
  symbolicLDLT,
  numericLDLT,
  solveLDLT,
  buildHybridSolver,
  SPARSE_MIN_SIZE: LINEAR_ALGEBRA_TOLERANCES.sparseMinimumDimension,
};

export const submatrix = (matrix: Matrix, rows: number[], cols: number[]): Matrix =>
  rows.map((r) => cols.map((c) => matrix[r][c]));

export const subvector = (vector: number[], indices: number[]): number[] =>
  indices.map((index) => vector[index]);
