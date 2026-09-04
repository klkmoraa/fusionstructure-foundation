import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import * as ts from 'typescript';
import * as algebraModule from './linearAlgebra';

type Matrix = number[][];

interface NumericalError extends Error {
  readonly code: 'dimension-mismatch' | 'non-square-system' | 'non-finite-value' | 'singular';
  readonly pivotIndex?: number;
}

interface LinearFactorization {
  readonly dimension: number;
  readonly diagnostics: {
    readonly policy: 'auto' | 'dense';
    readonly backend: 'dense-lu' | 'sparse-ldlt';
    readonly fallbackReason?: string;
    readonly reducedDimension?: number;
  };
  readonly minPivot: number;
  readonly maxPivot: number;
  solve(vector: readonly number[]): number[];
  solveTranspose(vector: readonly number[]): number[];
}

interface LinearAlgebraApi {
  readonly LINEAR_ALGEBRA_TOLERANCES: {
    readonly multiplicationZero: number;
    readonly negligibleRelative: number;
    readonly sparseMinimumDimension: number;
    readonly hagerIterations: number;
    readonly refinementResidual: number;
    readonly maxRefinementIterations: number;
    readonly nullSpaceToleranceMultiplier: number;
  };
  readonly LinearAlgebraError: new (code: NumericalError['code'], details?: { readonly pivotIndex?: number }) => NumericalError;
  zeros(rows: number, columns: number): Matrix;
  transpose(matrix: Matrix): Matrix;
  multiply(left: Matrix, right: Matrix): Matrix;
  multiplyMatrixVector(matrix: Matrix, vector: number[]): number[];
  addToMatrix(target: Matrix, source: Matrix, indices: number[]): void;
  addToVector(target: number[], source: number[], indices: number[]): void;
  maxAbs(values: number[]): number;
  factorizeLinearSystem(matrix: Matrix, options?: { readonly backend?: 'auto' | 'dense' }): LinearFactorization;
  solveLinearSystem(matrix: Matrix, vector: number[], options?: { readonly backend?: 'auto' | 'dense' }): {
    readonly x: number[];
    readonly conditionEstimate: number;
    readonly pivotRatio: number;
    readonly relativeResidual: number;
    readonly refinementIterations: number;
    readonly diagnostics: LinearFactorization['diagnostics'];
  };
  findNullSpaceVector(matrix: Matrix, preferredLength?: number): {
    readonly rank: number;
    readonly nullity: number;
    readonly vector: number[] | null;
    readonly residual: number;
  };
  submatrix(matrix: Matrix, rows: number[], columns: number[]): Matrix;
  subvector(vector: number[], indices: number[]): number[];
  readonly __testables: unknown;
}

const algebra = algebraModule as unknown as LinearAlgebraApi;

const dependencyTarget = (expression: ts.Expression | undefined, sourceFile: ts.SourceFile): string =>
  expression && ts.isStringLiteral(expression) ? expression.text : expression?.getText(sourceFile) ?? '<missing>';

const typeDependencyTarget = (argument: ts.TypeNode, sourceFile: ts.SourceFile): string =>
  ts.isLiteralTypeNode(argument) && ts.isStringLiteral(argument.literal)
    ? argument.literal.text
    : argument.getText(sourceFile);

const foundationDependencyViolations = (source: string): string[] => {
  const sourceFile = ts.createSourceFile('foundation-boundary.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const violations: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      violations.push(`static import: ${dependencyTarget(node.moduleSpecifier, sourceFile)}`);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      violations.push(`re-export: ${dependencyTarget(node.moduleSpecifier, sourceFile)}`);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      violations.push(`require import: ${dependencyTarget(node.moduleReference.expression, sourceFile)}`);
    } else if (ts.isImportTypeNode(node)) {
      violations.push(`type import: ${typeDependencyTarget(node.argument, sourceFile)}`);
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        violations.push(`dynamic import: ${dependencyTarget(node.arguments[0], sourceFile)}`);
      } else if (
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')
        || (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'require')
      ) {
        violations.push(`require call: ${dependencyTarget(node.arguments[0], sourceFile)}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
};

const expectNumericalError = (operation: () => unknown, code: NumericalError['code'], pivotIndex?: number): void => {
  try {
    operation();
    throw new Error('Expected a structured numerical error.');
  } catch (error) {
    expect(error).toBeInstanceOf(algebra.LinearAlgebraError);
    expect(error).toMatchObject({ code, ...(pivotIndex === undefined ? {} : { pivotIndex }) });
  }
};

const sparseCompatibleSystem = (): { matrix: Matrix; vector: number[] } => {
  const physicalDofs = 120;
  const constraints = 60;
  const dimension = physicalDofs + constraints;
  const matrix = Array.from({ length: dimension }, () => Array(dimension).fill(0));
  const vector = Array(dimension).fill(0);
  for (let index = 0; index < physicalDofs; index += 1) matrix[index][index] = 2;
  for (let index = 0; index < constraints; index += 1) {
    matrix[physicalDofs + index][index] = 1;
    matrix[index][physicalDofs + index] = 1;
  }
  for (let index = constraints; index < physicalDofs; index += 1) vector[index] = 4;
  return { matrix, vector };
};

const nonSymmetricSparseCandidate = (): { matrix: Matrix; vector: number[] } => {
  const candidate = sparseCompatibleSystem();
  candidate.matrix[60][61] = 1;
  return candidate;
};

const tinyScaleSparseCandidate = (): { matrix: Matrix; vector: number[] } => {
  const candidate = sparseCompatibleSystem();
  for (let index = 60; index < 120; index += 1) {
    candidate.matrix[index][index] = 1e-12;
    candidate.vector[index] = 1e-12;
  }
  return candidate;
};

const tinyScaleNonSymmetricSparseCandidate = (): { matrix: Matrix; vector: number[] } => {
  const candidate = tinyScaleSparseCandidate();
  candidate.matrix[60][61] = 9e-13;
  return candidate;
};

describe('Foundation linear algebra public boundary', () => {
  it('declares a neutral public linear algebra module', () => {
    expect(existsSync(new URL('./linearAlgebra.ts', import.meta.url))).toBe(true);
  });

  it('rejects every dependency syntax from Foundation source', () => {
    const samples: ReadonlyArray<readonly [string, readonly string[]]> = [
      ["import value from 'dependency';", ['static import: dependency']],
      ["import type { Value } from 'dependency';", ['static import: dependency']],
      ["type Value = import('dependency').Value;", ['type import: dependency']],
      ["void import('dependency');", ['dynamic import: dependency']],
      ["void require('dependency');", ['require call: dependency']],
      ["import value = require('dependency');", ['require import: dependency']],
      ["export { value } from 'dependency';", ['re-export: dependency']],
      ["const prose = \"import('not-a-dependency') require('not-a-dependency')\";", []],
    ];
    for (const [source, expected] of samples) expect(foundationDependencyViolations(source), source).toEqual(expected);
  });

  it('keeps Foundation linear algebra free of all dependency syntax', () => {
    const sourcePath = new URL('./linearAlgebra.ts', import.meta.url);
    expect(existsSync(sourcePath)).toBe(true);
    if (!existsSync(sourcePath)) return;
    expect(foundationDependencyViolations(readFileSync(sourcePath, 'utf8'))).toEqual([]);
  });

  it('exposes the complete neutral runtime API', () => {
    expect(Object.keys(algebraModule).sort()).toEqual([
      'LINEAR_ALGEBRA_TOLERANCES', 'LinearAlgebraError', '__testables',
      'addToMatrix', 'addToVector', 'factorizeLinearSystem', 'findNullSpaceVector',
      'maxAbs', 'multiply', 'multiplyMatrixVector', 'solveLinearSystem',
      'submatrix', 'subvector', 'transpose', 'zeros',
    ]);
  });

  it('keeps primitive matrix and vector operations compatible without mutating inputs', () => {
    const matrix = [[1, 2], [3, 4]];
    const vector = [5, 6];
    const matrixBefore = matrix.map((row) => [...row]);
    const vectorBefore = [...vector];

    expect(algebra.zeros(2, 3)).toEqual([[0, 0, 0], [0, 0, 0]]);
    expect(algebra.transpose(matrix)).toEqual([[1, 3], [2, 4]]);
    expect(algebra.multiply(matrix, [[2], [3]])).toEqual([[8], [18]]);
    expect(algebra.multiplyMatrixVector(matrix, vector)).toEqual([17, 39]);
    expect(algebra.submatrix(matrix, [1, 0], [0])).toEqual([[3], [1]]);
    expect(algebra.subvector(vector, [1, 0])).toEqual([6, 5]);
    expect(algebra.maxAbs([-4, 2, 3])).toBe(4);
    expect(algebra.multiply([[1e-31]], [[1]])).toEqual([[0]]);
    const assemblyTarget = [[0, 0], [0, 0]];
    const assemblySource = [[2, 3], [4, 5]];
    algebra.addToMatrix(assemblyTarget, assemblySource, [1, 0]);
    expect(assemblyTarget).toEqual([[5, 4], [3, 2]]);
    expect(assemblySource).toEqual([[2, 3], [4, 5]]);
    const assembledVector = [0, 0];
    const sourceVector = [7, 8];
    algebra.addToVector(assembledVector, sourceVector, [1, 0]);
    expect(assembledVector).toEqual([8, 7]);
    expect(sourceVector).toEqual([7, 8]);
    expect(matrix).toEqual(matrixBefore);
    expect(vector).toEqual(vectorBefore);
  });

  it('factorizes once and solves direct and transpose systems without mutating the matrix', () => {
    const matrix = [[3, 1], [2, 4]];
    const matrixBefore = matrix.map((row) => [...row]);
    const rightHandSide = [7, 10];
    const rightHandSideBefore = [...rightHandSide];
    const factorization = algebra.factorizeLinearSystem(matrix, { backend: 'dense' });

    expect(factorization.dimension).toBe(2);
    expect(factorization.diagnostics).toMatchObject({ policy: 'dense', backend: 'dense-lu', fallbackReason: 'forced-dense', dimension: 2 });
    const direct = factorization.solve(rightHandSide);
    const transposed = factorization.solveTranspose(rightHandSide);
    expect(direct[0]).toBeCloseTo(1.8, 12);
    expect(direct[1]).toBeCloseTo(1.6, 12);
    expect(transposed[0]).toBeCloseTo(0.8, 12);
    expect(transposed[1]).toBeCloseTo(2.3, 12);
    expect(matrix).toEqual(matrixBefore);
    expect(rightHandSide).toEqual(rightHandSideBefore);
  });

  it('retains the sparse and dense policy gates in the public factorization entry point', () => {
    const dense = algebra.factorizeLinearSystem([[2, 0], [0, 3]]);
    const sparseCandidate = sparseCompatibleSystem();
    const sparse = algebra.factorizeLinearSystem(sparseCandidate.matrix);

    expect(dense.diagnostics).toMatchObject({ policy: 'auto', backend: 'dense-lu', fallbackReason: 'below-size-threshold', dimension: 2 });
    expect(sparse.diagnostics).toMatchObject({ policy: 'auto', backend: 'sparse-ldlt', dimension: 180, reducedDimension: 60 });
    expect(sparse.solve(sparseCandidate.vector).slice(60, 120)).toEqual(Array(60).fill(2));
  });

  it('falls back to dense LU for a non-symmetric large system and keeps transpose solving distinct', () => {
    const candidate = nonSymmetricSparseCandidate();
    const factorization = algebra.factorizeLinearSystem(candidate.matrix);
    const direct = factorization.solve(candidate.vector);
    const transposed = factorization.solveTranspose(candidate.vector);

    expect(factorization.diagnostics).toMatchObject({
      policy: 'auto',
      backend: 'dense-lu',
      fallbackReason: 'non-symmetric',
      dimension: 180,
    });
    expect(direct[60]).toBeCloseTo(1, 12);
    expect(direct[61]).toBeCloseTo(2, 12);
    expect(transposed[60]).toBeCloseTo(2, 12);
    expect(transposed[61]).toBeCloseTo(1, 12);
    expect(transposed).not.toEqual(direct);
  });

  it('keeps a symmetric tiny constrained free block eligible for the sparse path', () => {
    const candidate = tinyScaleSparseCandidate();
    const factorization = algebra.factorizeLinearSystem(candidate.matrix);

    expect(factorization.diagnostics).toMatchObject({ backend: 'sparse-ldlt', dimension: 180, reducedDimension: 60 });
    expect(factorization.solve(candidate.vector).slice(60, 120)).toEqual(Array(60).fill(1));
  });

  it('treats unilateral asymmetry relative to a tiny constrained free block as non-symmetric', () => {
    const candidate = tinyScaleNonSymmetricSparseCandidate();
    const automatic = algebra.factorizeLinearSystem(candidate.matrix);
    const dense = algebra.factorizeLinearSystem(candidate.matrix, { backend: 'dense' });

    expect(automatic.diagnostics).toMatchObject({
      policy: 'auto',
      backend: 'dense-lu',
      fallbackReason: 'non-symmetric',
      dimension: 180,
    });
    expect(automatic.solve(candidate.vector)).toEqual(dense.solve(candidate.vector));
    expect(automatic.solveTranspose(candidate.vector)).toEqual(dense.solveTranspose(candidate.vector));
  });

  it('snapshots a constrained sparse system before later caller mutations', () => {
    const candidate = sparseCompatibleSystem();
    candidate.vector[120] = 1;
    const factorization = algebra.factorizeLinearSystem(candidate.matrix);
    const directBeforeMutation = factorization.solve(candidate.vector);
    const transposeBeforeMutation = factorization.solveTranspose(candidate.vector);

    expect(factorization.diagnostics).toMatchObject({ backend: 'sparse-ldlt', dimension: 180, reducedDimension: 60 });
    candidate.matrix[60][0] = 1_000;
    candidate.matrix[0][60] = 1_000;

    expect(factorization.solve(candidate.vector)).toEqual(directBeforeMutation);
    expect(factorization.solveTranspose(candidate.vector)).toEqual(transposeBeforeMutation);
  });

  it('reports neutral structured errors for dimensions, non-finite values and singular pivots', () => {
    expectNumericalError(() => algebra.multiply([[1]], [[1], [2]]), 'dimension-mismatch');
    expectNumericalError(() => algebra.solveLinearSystem([], []), 'non-square-system');
    expectNumericalError(() => algebra.solveLinearSystem([[Number.NaN]], []), 'non-square-system');
    expectNumericalError(() => algebra.factorizeLinearSystem([[1, 2], [3]]), 'non-square-system');
    expectNumericalError(() => algebra.solveLinearSystem([[1, 0], [0, 1]], [Number.NaN, 1]), 'non-finite-value');
    expectNumericalError(() => algebra.solveLinearSystem([[1, 2], [2, 4]], [1, 2]), 'singular', 1);
    expectNumericalError(() => algebra.factorizeLinearSystem([[1, 2], [2, 4]]), 'singular', 1);
    const factorization = algebra.factorizeLinearSystem([[1, 0], [0, 1]]);
    expectNumericalError(() => factorization.solve([1]), 'non-square-system');
  });

  it('rejects ragged matrices and mismatched vectors with classified numerical errors', () => {
    expectNumericalError(() => algebra.transpose([[1, 2], [3]]), 'dimension-mismatch');
    expectNumericalError(() => algebra.multiply([[1, 2], [3]], [[1], [2]]), 'dimension-mismatch');
    expectNumericalError(() => algebra.multiplyMatrixVector([[1, 2], [3]], [1, 2]), 'dimension-mismatch');
    expectNumericalError(() => algebra.multiplyMatrixVector([[1, 2]], [1]), 'dimension-mismatch');
    expectNumericalError(() => algebra.factorizeLinearSystem([[1, 2], [3]]), 'non-square-system');
    expectNumericalError(() => algebra.solveLinearSystem([[1, 0], [0, 1]], [1]), 'non-square-system');
  });

  it('publishes stable numerical tolerances and a null-space witness', () => {
    expect(algebra.LINEAR_ALGEBRA_TOLERANCES).toEqual({
      multiplicationZero: 1e-30,
      negligibleRelative: 1e-12,
      sparseMinimumDimension: 60,
      hagerIterations: 8,
      refinementResidual: 5e-15,
      maxRefinementIterations: 3,
      nullSpaceToleranceMultiplier: 32,
    });
    const nullSpace = algebra.findNullSpaceVector([[1, 2], [2, 4]]);
    expect(nullSpace).toMatchObject({ rank: 1, nullity: 1 });
    expect(nullSpace.vector).not.toBeNull();
    expect(nullSpace.residual).toBeLessThanOrEqual(1e-12);
  });
});
