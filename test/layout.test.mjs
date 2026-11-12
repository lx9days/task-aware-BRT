import assert from "node:assert/strict";
import { buildLayout, datasets, summarizeTree } from "../layout.js";
import {
  createIncrementalLayoutSession,
  originalBrt,
  taskAwareBrt,
  updateIncrementalLayoutSession
} from "../taskAwareLayout.js";

function getNode(layout, id) {
  const node = layout.nodes.find((item) => item.id === id);
  assert.ok(node, `expected node ${id} to exist`);
  return node;
}

function approxEqual(left, right, epsilon = 1e-6) {
  return Math.abs(left - right) <= epsilon;
}

{
  const layout = buildLayout("balanced", {
    scenario: "tree-identify",
    alignment: "center",
    lambda: 0.85,
    weightInfluence: 0.8
  });
  const root = getNode(layout, "A");
  const left = getNode(layout, "B");
  const right = getNode(layout, "C");
  assert.ok(approxEqual(root.x, (left.x + right.x) / 2));
}

{
  const stats = summarizeTree(datasets.largeIrregular.root);
  assert.ok(stats.nodeCount >= 240);
  assert.ok(stats.maxBreadth >= 95 && stats.maxBreadth <= 110);
  assert.ok(stats.maxDepth >= 8);
}

{
  const baseline = originalBrt("balanced");
  const overview = taskAwareBrt("balanced", { mode: "overview" });
  assert.deepEqual(
    overview.nodes.map((node) => [node.id, node.x]),
    baseline.nodes.map((node) => [node.id, node.x])
  );
}

{
  const session = createIncrementalLayoutSession("triForkConflict", { optimizeBudgetMs: 80 });
  const before = updateIncrementalLayoutSession(session, { mode: "overview" });
  const compare = updateIncrementalLayoutSession(session, { mode: "compare", nodeAId: "BB", nodeBId: "BH" });
  assert.ok(compare.aware.report.acceptedActions.length > 0, "compare should accept local actions");
  assert.ok(compare.aware.metrics.task < before.baselineMetrics.task || compare.aware.metrics.task < compare.aware.report.lossesBefore.task);
  assert.ok(compare.aware.report.acceptedActions.some((action) => action.type === "anchor" || action.type === "gap"));
}

{
  const session = createIncrementalLayoutSession("balanced", { optimizeBudgetMs: 80 });
  const trace = updateIncrementalLayoutSession(session, { mode: "trace", targetId: "F" });
  assert.deepEqual(trace.aware.policy.path, ["A", "C", "F"]);
  assert.ok(trace.aware.report.acceptedActions.length > 0, "trace should accept local actions on balanced tree");
  assert.ok(trace.aware.metrics.task <= trace.aware.report.lossesBefore.task + 1e-9);
}

{
  const session = createIncrementalLayoutSession("balanced", { optimizeBudgetMs: 80 });
  const invalid = updateIncrementalLayoutSession(session, { mode: "compare", nodeAId: "A", nodeBId: "B" });
  assert.equal(invalid.aware.report.acceptedActions.length, 0);
  assert.equal(invalid.aware.report.stopReason, "missing-correspondence");
}

{
  const sourceOrder = datasets.triForkConflict.root.children.map((node) => node.id);
  const session = createIncrementalLayoutSession("triForkConflict", { optimizeBudgetMs: 80 });
  updateIncrementalLayoutSession(session, { mode: "compare", nodeAId: "BB", nodeBId: "BH" });
  assert.deepEqual(datasets.triForkConflict.root.children.map((node) => node.id), sourceOrder, "input data should remain immutable");
}

// Use a generous deadline for algorithm regressions; wall-clock performance
// is checked separately so scheduler jitter cannot change the expected result.
for (const [nodeAId, nodeBId] of [["MA", "MB"], ["MA1", "MB1"]]) {
  const session = createIncrementalLayoutSession("mediumIrregular", { optimizeBudgetMs: 5000 });
  const previous = new Map(session.target);
  const result = updateIncrementalLayoutSession(session, { mode: "compare", nodeAId, nodeBId });
  const report = result.aware.report;
  assert.ok(report.changedIds.length > 0, `${nodeAId}/${nodeBId} should change layout`);
  assert.ok(report.lossesAfter.task < report.lossesBefore.task, "comparison must improve task loss");
  assert.ok(report.lossesAfter.J < report.lossesBefore.J, "comparison must improve total loss");
  if (nodeAId === "MA1") {
    assert.ok(report.region.editableParents.has("MA") && report.region.editableParents.has("MB"),
      "both connecting paths must be editable");
  }
  for (const id of report.changedIds) assert.ok(report.region.movableNodes.has(id));
  for (const id of report.region.blockRoots) assert.deepEqual(session.target.get(id), previous.get(id));
  for (const node of result.aware.nodes) assert.equal(node.y, previous.get(node.id).y);
}

{
  const session = createIncrementalLayoutSession("largeIrregular", { optimizeBudgetMs: 5000 });
  const previous = new Map(session.target);
  const { report } = updateIncrementalLayoutSession(session, {
    mode: "compare", nodeAId: "HP019", nodeBId: "MG145"
  }).aware;
  assert.ok(report.region.movableNodes.size <= session.config.maxMovableNodes);
  for (const root of report.region.blockRoots) {
    for (const id of session.index.subtreeNodes.get(root)) assert.ok(report.region.movableNodes.has(id));
  }
  for (const id of report.region.fixedBoundaryNodes) assert.deepEqual(session.target.get(id), previous.get(id));
  for (const id of report.changedIds) assert.ok(report.region.movableNodes.has(id));
}

{
  const session = createIncrementalLayoutSession("mediumIrregular", { maxMovableNodes: 0 });
  const previous = new Map(session.target);
  const result = updateIncrementalLayoutSession(session, { mode: "compare", nodeAId: "MA1", nodeBId: "MB1" });
  assert.equal(result.aware.report.changedIds.length, 0);
  assert.deepEqual(session.target, previous);
}

// Measure actual root-relative geometry, independently of weighted objective
// values, so a weight change alone cannot pass the shape regression.
for (const [nodeAId, nodeBId] of [["MA", "MB"], ["MA1", "MB1"]]) {
  const session = createIncrementalLayoutSession("mediumIrregular", { optimizeBudgetMs: 5000 });
  const before = new Map(session.target);
  const result = updateIncrementalLayoutSession(session, { mode: "compare", nodeAId, nodeBId });
  const matches = result.task.compare.matches;
  const shapeError = (positions) => matches.reduce((sum, { a, b }) => sum + Math.abs(
    (positions.get(a).x - positions.get(nodeAId).x) -
    (positions.get(b).x - positions.get(nodeBId).x)
  ), 0) / matches.length;
  assert.ok(shapeError(session.target) < shapeError(before), "root-relative shape error must decrease");
  assert.equal(result.aware.report.metricVersions.compareShape, "log-v2");
}

console.log("layout tests passed");
