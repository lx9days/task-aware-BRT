import assert from "node:assert/strict";
import { buildLayout, datasets, summarizeTree } from "../layout.js";

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
  const midpoint = (left.x + right.x) / 2;

  assert.ok(
    approxEqual(root.x, midpoint),
    "center alignment should place root at the midpoint of its first and last child"
  );
}

{
  const weightedLayout = buildLayout("weighted", {
    scenario: "node-identify",
    alignment: "weighted",
    lambda: 0.85,
    weightInfluence: 1.4
  });
  const root = getNode(weightedLayout, "A");
  const target = getNode(weightedLayout, "B");

  assert.ok(
    approxEqual(root.x, target.x),
    "high-weight alignment should place the root directly on the highest-weight child"
  );
}

{
  const subtreeLayout = buildLayout("weighted", {
    scenario: "subtree-identify",
    alignment: "subtree",
    lambda: 0.85,
    weightInfluence: 1.4
  });
  const root = getNode(subtreeLayout, "A");
  const target = getNode(subtreeLayout, "B");

  assert.ok(
    approxEqual(root.x, target.x),
    "largest-subtree alignment should place the root directly on the largest child subtree"
  );
}

{
  const deepestLayout = buildLayout("unbalanced", {
    scenario: "path-following",
    alignment: "deepest",
    lambda: 0.35,
    weightInfluence: 1.25
  });
  const root = getNode(deepestLayout, "A");
  const target = getNode(deepestLayout, "C");

  assert.ok(
    approxEqual(root.x, target.x),
    "deepest-subtree alignment should place the root directly on the deepest child subtree"
  );
}

{
  const stats = summarizeTree(datasets.balanced.root);

  assert.equal(stats.nodeCount, 7, "balanced tree should have 7 nodes");
  assert.equal(stats.maxDepth, 2, "balanced tree depth should be 2");
  assert.equal(stats.leafCount, 4, "balanced tree should have 4 leaves");
}

{
  const weightedChoice = buildLayout("weightVsSize", {
    scenario: "node-identify",
    alignment: "weighted",
    lambda: 0.5,
    weightInfluence: 1
  });
  const subtreeChoice = buildLayout("weightVsSize", {
    scenario: "subtree-identify",
    alignment: "subtree",
    lambda: 0.5,
    weightInfluence: 1
  });

  assert.ok(
    approxEqual(getNode(weightedChoice, "A").x, getNode(weightedChoice, "B").x),
    "weight-vs-size dataset should align to the high-weight child in weighted mode"
  );
  assert.ok(
    approxEqual(getNode(subtreeChoice, "A").x, getNode(subtreeChoice, "D").x),
    "weight-vs-size dataset should align to the large subtree child in subtree mode"
  );
}

{
  const subtreeChoice = buildLayout("wideVsDeep", {
    scenario: "subtree-compare",
    alignment: "subtree",
    lambda: 0.5,
    weightInfluence: 1
  });
  const deepestChoice = buildLayout("wideVsDeep", {
    scenario: "path-following",
    alignment: "deepest",
    lambda: 0.5,
    weightInfluence: 1
  });

  assert.ok(
    approxEqual(getNode(subtreeChoice, "A").x, getNode(subtreeChoice, "B").x),
    "wide-vs-deep dataset should align to the wider left subtree in subtree mode"
  );
  assert.ok(
    approxEqual(getNode(deepestChoice, "A").x, getNode(deepestChoice, "G").x),
    "wide-vs-deep dataset should align to the deeper right subtree in deepest mode"
  );
}

{
  const combLayout = buildLayout("combTree", {
    scenario: "path-following",
    alignment: "subtree",
    lambda: 0.5,
    weightInfluence: 1
  });

  assert.ok(combLayout.nodes.length >= 10, "comb tree should produce a longer path dataset");
  assert.ok(
    approxEqual(getNode(combLayout, "A").x, getNode(combLayout, "C").x),
    "comb tree should align the root to the larger subtree child in subtree mode"
  );
}

{
  const weightedLayout = buildLayout("cascadingConflict", {
    scenario: "node-identify",
    alignment: "weighted",
    lambda: 0.5,
    weightInfluence: 1
  });
  const subtreeLayout = buildLayout("cascadingConflict", {
    scenario: "subtree-identify",
    alignment: "subtree",
    lambda: 0.5,
    weightInfluence: 1
  });

  assert.ok(
    approxEqual(getNode(weightedLayout, "AA").x, getNode(weightedLayout, "AB").x),
    "cascading conflict tree should send the root to the high-weight child in weighted mode"
  );
  assert.ok(
    approxEqual(getNode(subtreeLayout, "AA").x, getNode(subtreeLayout, "AD").x),
    "cascading conflict tree should send the root to the large subtree child in subtree mode"
  );
  assert.ok(
    approxEqual(getNode(weightedLayout, "AD").x, getNode(weightedLayout, "AE").x),
    "cascading conflict tree should keep following high-weight short branches in weighted mode"
  );
  assert.ok(
    approxEqual(getNode(subtreeLayout, "AD").x, getNode(subtreeLayout, "AG").x),
    "cascading conflict tree should keep following large subtrees in subtree mode"
  );
}

{
  const weightedLayout = buildLayout("triForkConflict", {
    scenario: "node-compare",
    alignment: "weighted",
    lambda: 0.5,
    weightInfluence: 1
  });
  const subtreeLayout = buildLayout("triForkConflict", {
    scenario: "subtree-compare",
    alignment: "subtree",
    lambda: 0.5,
    weightInfluence: 1
  });

  assert.ok(
    approxEqual(getNode(weightedLayout, "BA").x, getNode(weightedLayout, "BB").x),
    "tri-fork tree should align the root to the heavy left branch in weighted mode"
  );
  assert.ok(
    approxEqual(getNode(subtreeLayout, "BA").x, getNode(subtreeLayout, "BH").x),
    "tri-fork tree should align the root to the large right branch in subtree mode"
  );
}

{
  const weightedLayout = buildLayout("alternatingConflict", {
    scenario: "path-following",
    alignment: "weighted",
    lambda: 0.5,
    weightInfluence: 1
  });
  const subtreeLayout = buildLayout("alternatingConflict", {
    scenario: "path-following",
    alignment: "subtree",
    lambda: 0.5,
    weightInfluence: 1
  });

  assert.ok(
    approxEqual(getNode(weightedLayout, "CA").x, getNode(weightedLayout, "CB").x),
    "alternating conflict tree should align the root to the high-weight shortcut in weighted mode"
  );
  assert.ok(
    approxEqual(getNode(subtreeLayout, "CA").x, getNode(subtreeLayout, "CC").x),
    "alternating conflict tree should align the root to the deeper branch in subtree mode"
  );
  assert.ok(
    approxEqual(getNode(weightedLayout, "CC").x, getNode(weightedLayout, "CD").x),
    "alternating conflict tree should keep preferring the short heavy branch at deeper levels in weighted mode"
  );
  assert.ok(
    approxEqual(getNode(subtreeLayout, "CC").x, getNode(subtreeLayout, "CE").x),
    "alternating conflict tree should keep preferring the deeper branch at deeper levels in subtree mode"
  );
}

console.log("layout tests passed");
