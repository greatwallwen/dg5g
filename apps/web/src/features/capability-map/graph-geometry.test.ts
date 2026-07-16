import assert from 'node:assert/strict';
import test from 'node:test';
import {
  edgeBoundaryPoints,
  placeEdgeLabel,
  routeSemanticEdge,
  semanticZoomLevel,
  type GraphPoint,
  type GraphRect,
} from './graph-geometry.ts';
import {
  curriculumGraphNodes,
  curriculumSemanticEdges,
} from '../../platform/fixtures/curriculum-graph-fixtures.ts';

test('edgeBoundaryPoints terminates a horizontal edge at both node borders', () => {
  const points = edgeBoundaryPoints(
    { x: 100, y: 100, width: 120, height: 60 },
    { x: 340, y: 100, width: 140, height: 60 },
  );
  assert.deepEqual(points, { x1: 220, y1: 130, x2: 340, y2: 130 });
});

test('edgeBoundaryPoints chooses vertical borders for a vertical relationship', () => {
  const points = edgeBoundaryPoints(
    { x: 100, y: 100, width: 120, height: 60 },
    { x: 110, y: 300, width: 120, height: 60 },
  );
  assert.deepEqual(points, { x1: 160, y1: 160, x2: 170, y2: 300 });
});

test('semanticZoomLevel progressively reveals overview, route and detail labels', () => {
  assert.equal(semanticZoomLevel(0.42), 'overview');
  assert.equal(semanticZoomLevel(0.78), 'route');
  assert.equal(semanticZoomLevel(1.2), 'detail');
});

test('routeSemanticEdge anchors on real node borders and uses only orthogonal segments', () => {
  const source = { x: 100, y: 100, width: 120, height: 60 };
  const target = { x: 420, y: 260, width: 140, height: 60 };
  const route = routeSemanticEdge(source, target, [
    { x: 260, y: 80, width: 100, height: 220 },
  ]);

  assert.equal(pointOnBoundary(route.points[0], source), true);
  assert.equal(pointOnBoundary(route.points.at(-1)!, target), true);
  for (let index = 0; index < route.points.length - 1; index += 1) {
    const start = route.points[index];
    const end = route.points[index + 1];
    assert.ok(start.x === end.x || start.y === end.y, `${index} is orthogonal`);
  }
});

test('P1 semantic routes do not cut through unrelated graph nodes', () => {
  const nodesById = new Map(curriculumGraphNodes.map((node) => [node.id, node]));
  const p1Ids = new Set(curriculumGraphNodes
    .filter((node) => /^(?:P0[123]|P1T[123]-N0[1234]|game-|evidence-|achievement-p0)/.test(node.id))
    .map((node) => node.id));
  const p1Edges = curriculumSemanticEdges.filter((edge) => p1Ids.has(edge.from) && p1Ids.has(edge.to));
  assert.ok(p1Edges.length >= 12);

  for (const edge of p1Edges) {
    const source = nodesById.get(edge.from)!;
    const target = nodesById.get(edge.to)!;
    const obstacles = curriculumGraphNodes.filter((node) => node.id !== edge.from && node.id !== edge.to);
    const route = routeSemanticEdge(source, target, obstacles);
    assert.equal(pointOnBoundary(route.points[0], source), true, `${edge.edgeId} source`);
    assert.equal(pointOnBoundary(route.points.at(-1)!, target), true, `${edge.edgeId} target`);
    for (let index = 0; index < route.points.length - 1; index += 1) {
      const start = route.points[index];
      const end = route.points[index + 1];
      for (const obstacle of obstacles) {
        assert.equal(segmentIntersectsRect(start, end, obstacle), false, `${edge.edgeId} crosses ${obstacle.id}`);
      }
    }
  }
});

test('P1 semantic edge labels stay clear of nodes and their own routes', () => {
  const nodesById = new Map(curriculumGraphNodes.map((node) => [node.id, node]));
  const p1Ids = new Set(curriculumGraphNodes
    .filter((node) => /^(?:P0[123]|P1T[123]-N0[1234]|game-|evidence-|achievement-p0)/.test(node.id))
    .map((node) => node.id));
  const p1Edges = curriculumSemanticEdges.filter((edge) => p1Ids.has(edge.from) && p1Ids.has(edge.to));

  for (const edge of p1Edges) {
    const source = nodesById.get(edge.from)!;
    const target = nodesById.get(edge.to)!;
    const obstacles = curriculumGraphNodes.filter((node) => node.id !== edge.from && node.id !== edge.to);
    const route = routeSemanticEdge(source, target, obstacles);
    const label = placeEdgeLabel(route, { width: 76, height: 20 }, [source, target, ...obstacles]);

    assert.equal([source, target, ...obstacles].some((node) => rectsIntersect(label, node)), false, `${edge.edgeId} label crosses node`);
    for (let index = 0; index < route.points.length - 1; index += 1) {
      assert.equal(segmentIntersectsRect(route.points[index], route.points[index + 1], label), false, `${edge.edgeId} label crosses route`);
    }
  }
});

test('placeEdgeLabel keeps the label clear of graph nodes and route segments', () => {
  const obstacles = [{ x: 250, y: 80, width: 120, height: 180 }];
  const route = routeSemanticEdge(
    { x: 80, y: 120, width: 120, height: 60 },
    { x: 430, y: 260, width: 140, height: 60 },
    obstacles,
  );
  const label = placeEdgeLabel(route, { width: 76, height: 20 }, obstacles);

  assert.equal(obstacles.some((rect) => rectsIntersect(label, rect)), false);
  for (let index = 0; index < route.points.length - 1; index += 1) {
    assert.equal(segmentIntersectsRect(route.points[index], route.points[index + 1], label), false);
  }
});

function pointOnBoundary(point: GraphPoint, rect: GraphRect): boolean {
  const onVertical = (point.x === rect.x || point.x === rect.x + rect.width)
    && point.y >= rect.y && point.y <= rect.y + rect.height;
  const onHorizontal = (point.y === rect.y || point.y === rect.y + rect.height)
    && point.x >= rect.x && point.x <= rect.x + rect.width;
  return onVertical || onHorizontal;
}

function segmentIntersectsRect(start: GraphPoint, end: GraphPoint, rect: GraphRect): boolean {
  if (start.x === end.x) {
    return start.x > rect.x && start.x < rect.x + rect.width
      && Math.max(start.y, end.y) > rect.y && Math.min(start.y, end.y) < rect.y + rect.height;
  }
  return start.y > rect.y && start.y < rect.y + rect.height
    && Math.max(start.x, end.x) > rect.x && Math.min(start.x, end.x) < rect.x + rect.width;
}

function rectsIntersect(a: GraphRect, b: GraphRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y;
}
