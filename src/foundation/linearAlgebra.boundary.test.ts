import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve, sep } from 'node:path';

import { describe, expect, it } from 'vitest';
import * as ts from 'typescript';

const sourceRoot = resolve(import.meta.dirname, '..');
const space3dRoot = join(sourceRoot, 'space3d');
const bridge2dCompatibilityException = join(space3dRoot, 'data', 'bridge2d.ts');
const deprecatedMathAdapter = join(sourceRoot, 'engine', 'math');

const sourceFiles = (directory: string): string[] => readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });

const dependencyTarget = (expression: ts.Expression | undefined): string | null =>
  expression && ts.isStringLiteral(expression) ? expression.text : null;

const importSpecifiersIn = (source: string): string[] => {
  const sourceFile = ts.createSourceFile('space3d-boundary.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const specifiers: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const specifier = dependencyTarget(node.moduleSpecifier);
      if (specifier) specifiers.push(specifier);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      const specifier = dependencyTarget(node.moduleSpecifier);
      if (specifier) specifiers.push(specifier);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const specifier = dependencyTarget(node.moduleReference.expression);
      if (specifier) specifiers.push(specifier);
    } else if (ts.isImportTypeNode(node)) {
      if (ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
        specifiers.push(node.argument.literal.text);
      }
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const specifier = dependencyTarget(node.arguments[0]);
        if (specifier) specifiers.push(specifier);
      } else if (
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')
        || (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'require')
      ) {
        const specifier = dependencyTarget(node.arguments[0]);
        if (specifier) specifiers.push(specifier);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return specifiers;
};

const resolveSourceSpecifier = (sourceFile: string, specifier: string): string | null => {
  if (specifier.startsWith('.')) return normalize(resolve(dirname(sourceFile), specifier));
  if (specifier.startsWith('/src/')) return join(sourceRoot, specifier.slice('/src/'.length));
  if (specifier.startsWith('@/') || specifier.startsWith('~/')) return join(sourceRoot, specifier.slice(2));
  if (specifier.startsWith('src/')) return join(sourceRoot, specifier.slice('src/'.length));
  return null;
};

const isForbiddenFoundationBoundary = (resolvedSpecifier: string): boolean => {
  const normalized = normalize(resolvedSpecifier);
  const engineRoot = `${join(sourceRoot, 'engine')}${sep}`;
  const typesPath = join(sourceRoot, 'types');
  return normalized.startsWith(engineRoot)
    || normalized === typesPath
    || normalized.startsWith(`${typesPath}.`);
};

const forbiddenImportsIn = (sourceFile: string): string[] => importSpecifiersIn(readFileSync(sourceFile, 'utf8'))
  .filter((specifier) => {
    const resolved = resolveSourceSpecifier(sourceFile, specifier);
    return resolved !== null && isForbiddenFoundationBoundary(resolved);
  });

describe('Space3D Foundation import boundary', () => {
  it('does not reach 2D engine or root product types through static, type-only, dynamic, require or supported alias imports', () => {
    const violations = sourceFiles(space3dRoot)
      .filter((sourceFile) => normalize(sourceFile) !== normalize(bridge2dCompatibilityException))
      .flatMap((sourceFile) => forbiddenImportsIn(sourceFile)
        .map((specifier) => `${relative(sourceRoot, sourceFile)} -> ${specifier}`));

    expect(violations).toEqual([]);
  });

  it('keeps internal consumers off the deprecated engine/math compatibility adapter', () => {
    const normalizedAdapter = normalize(deprecatedMathAdapter);
    const violations = sourceFiles(sourceRoot)
      .filter((sourceFile) => normalize(sourceFile) !== `${normalizedAdapter}.ts` && !/\.test\.tsx?$/.test(sourceFile))
      .flatMap((sourceFile) => importSpecifiersIn(readFileSync(sourceFile, 'utf8'))
        .filter((specifier) => {
          const resolved = resolveSourceSpecifier(sourceFile, specifier);
          return resolved !== null && (normalize(resolved) === normalizedAdapter || normalize(resolved) === `${normalizedAdapter}.ts`);
        })
        .map((specifier) => `${relative(sourceRoot, sourceFile)} -> ${specifier}`));

    expect(violations).toEqual([]);
  });

  it('documents the sole bridge2d compatibility exception instead of silently widening the boundary', () => {
    expect(forbiddenImportsIn(bridge2dCompatibilityException)).toEqual(['../../types']);
  });
});
