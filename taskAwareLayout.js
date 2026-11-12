import { buildLayout, datasets } from "./layout.js";

export const taskModes = {
  overview: {
    id: "overview",
    label: "Overview / Standard BRT",
    ordering: "保持原始兄弟顺序",
    alignment: "父节点位于首尾孩子跨度内的默认中点",
    objective: "标准 BRT 基线，不执行局部增量优化"
  },
  compare: {
    id: "compare",
    label: "Compare",
    ordering: "优先尝试 sibling swap / insertion 让目标分支更适合并置比较",
    alignment: "允许局部 anchor(alpha) 偏向比较分支",
    objective: "优先对应结构外形一致，兼顾邻近性与布局稳定"
  },
  trace: {
    id: "trace",
    label: "Trace",
    ordering: "优先让路径孩子位于更清晰的位置",
    alignment: "优先让路径父子更连续",
    objective: "min continuity + ambiguity + tidy + movement"
  }
};

export const defaultConfig = {
  radius: 3,
  sigma: 1.5,
  focusDepthForCompare: 3,
  compareShapeLoss: "log",
  compareMovementScale: 0.25,
  compareOrderScale: 0.5,
  compareCenterScale: 0.5,
  traceOptimizeWindow: 4,
  anchorStep: 0.1,
  gapStepRatio: 0.25,
  maxGapRatio: 2,
  maxMovableNodes: 200,
  maxEditableParents: 24,
  maxMetricTerms: 1000,
  maxCandidatesPerScan: 48,
  maxCandidateEvaluationsPerEvent: 128,
  maxAcceptedActions: 8,
  maxScans: 9,
  optimizeBudgetMs: 48,
  epsilon: 1e-4,
  numericTolerance: 1e-6,
  thetaMinDegrees: 15,
  lambdaCenter: 0.1,
  lambdaSpace: 0.05,
  lambdaMove: 0.3,
  lambdaOrder: 0.1,
  animationDurationMs: 180,
  taskProfiles: {
    compare: { correspondence: 2, alignment: 1.2, ordering: 0.8, proximity: 0.35 },
    trace: { continuity: 1, ambiguity: 0.8 }
  }
};

function now() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }

  return Date.now();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function pairKey(leftId, rightId) {
  return `${leftId}__${rightId}`;
}

function normalizeRoot(node) {
  return {
    ...node,
    orderPolicy: node.orderPolicy || "free",
    precedence: Array.isArray(node.precedence) ? node.precedence.map((pair) => [...pair]) : [],
    children: (node.children || []).map(normalizeRoot)
  };
}

function listTreeNodes(root, depth = 0, result = []) {
  result.push({ id: root.id, label: root.label || root.id, depth });
  (root.children || []).forEach((child) => listTreeNodes(child, depth + 1, result));
  return result;
}

function copyPointMap(source) {
  return new Map([...source].map(([id, point]) => [id, { ...point }]));
}

function clonePolicy(policy) {
  return {
    order: new Map([...policy.order].map(([id, childIds]) => [id, [...childIds]])),
    anchor: new Map(policy.anchor),
    gapExtra: new Map(policy.gapExtra)
  };
}

function sameOrder(left = [], right = []) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function createIndex(root, baseline) {
  const baselineMap = new Map(baseline.nodes.map((node) => [node.id, node]));
  const nodeMap = new Map();
  const preorder = [];
  const subtreeNodes = new Map();
  const subtreeRange = new Map();
  const parent = new Map();
  const depth = new Map();

  function visit(node, parentId = null, currentDepth = 0) {
    const layoutNode = baselineMap.get(node.id);
    const width = Math.max(28, (layoutNode?.radius || 18) * 2 + 8);
    const height = Math.max(28, (layoutNode?.radius || 18) * 2 + 8);
    const children = (node.children || []).map((child) => child.id);
    const info = {
      id: node.id,
      label: node.label || node.id,
      parentId,
      children,
      depth: currentDepth,
      weight: Number.isFinite(node.weight) ? node.weight : 1,
      radius: layoutNode?.radius || 18,
      width,
      height,
      orderPolicy: node.orderPolicy || "free",
      precedence: Array.isArray(node.precedence) ? node.precedence.map((pair) => [...pair]) : [],
      x: layoutNode?.x || 0,
      y: layoutNode?.y || currentDepth * 140,
      subtreeSize: layoutNode?.subtreeSize || 1
    };
    parent.set(node.id, parentId);
    depth.set(node.id, currentDepth);
    nodeMap.set(node.id, info);
    preorder.push(node.id);
    const start = preorder.length - 1;
    let ids = [node.id];
    (node.children || []).forEach((child) => {
      ids = ids.concat(visit(child, node.id, currentDepth + 1));
    });
    subtreeNodes.set(node.id, ids);
    subtreeRange.set(node.id, [start, preorder.length - 1]);
    return ids;
  }

  visit(root);

  return {
    root,
    rootId: root.id,
    nodeMap,
    preorder,
    subtreeNodes,
    subtreeRange,
    parent,
    depth,
    treeVersion: 1
  };
}

function createDefaultPolicy(index) {
  const order = new Map();
  const anchor = new Map();
  for (const info of index.nodeMap.values()) {
    order.set(info.id, [...info.children]);
    if (info.children.length > 0) {
      anchor.set(info.id, 0.5);
    }
  }
  return { order, anchor, gapExtra: new Map(index.initialGapExtra || []) };
}

// Encode the clearance already present in standard BRT, without moving it.
// This lets local contour packing reproduce the baseline and shrink existing
// spare space incrementally instead of compacting every editable parent at once.
function captureInitialClearance(index, positions, minGap) {
  const gaps = new Map();
  const cache = new Map();
  for (const node of index.nodeMap.values()) {
    const contour = new Map();
    const firstX = node.children.length ? positions.get(node.children[0]).x : 0;
    node.children.forEach((id, offset) => {
      const geometry = buildRigidGeometry(index, positions, id, cache);
      const actual = positions.get(id).x - firstX;
      if (offset > 0) {
        let required = 0;
        for (const [depth, entry] of geometry.contour) {
          const existing = contour.get(depth);
          if (existing) required = Math.max(required, existing.max + minGap - entry.min);
        }
        gaps.set(pairKey(node.children[offset - 1], id), Math.max(0, actual - required));
      }
      mergeContour(contour, geometry.contour, actual, 0);
    });
  }
  return gaps;
}

function buildInitialPositions(index) {
  return new Map([...index.nodeMap.values()].map((info) => [
    info.id,
    { x: info.x, y: info.y }
  ]));
}

function getNode(index, id) {
  return id ? index.nodeMap.get(id) || null : null;
}

function isAncestor(index, ancestorId, nodeId) {
  let current = nodeId;
  while (current) {
    if (current === ancestorId) {
      return true;
    }
    current = index.parent.get(current) || null;
  }
  return false;
}

function lca(index, leftId, rightId) {
  const seen = new Set();
  let current = leftId;
  while (current) {
    seen.add(current);
    current = index.parent.get(current) || null;
  }
  current = rightId;
  while (current) {
    if (seen.has(current)) {
      return current;
    }
    current = index.parent.get(current) || null;
  }
  return null;
}

function pathBetweenAncestorAndNode(index, ancestorId, nodeId) {
  const path = [];
  let current = nodeId;
  while (current) {
    path.push(current);
    if (current === ancestorId) {
      return path.reverse();
    }
    current = index.parent.get(current) || null;
  }
  return null;
}

function pathToRoot(index, nodeId) {
  return pathBetweenAncestorAndNode(index, index.rootId, nodeId) || [];
}

function treeDistance(index, leftId, rightId) {
  const pivot = lca(index, leftId, rightId);
  if (!pivot) {
    return Number.POSITIVE_INFINITY;
  }
  return index.depth.get(leftId) + index.depth.get(rightId) - 2 * index.depth.get(pivot);
}

function structuralCompareMatches(index, rootAId, rootBId, maxRelativeDepth = 3) {
  const result = [];

  function visit(nodeAId, nodeBId, relativeDepth) {
    // Demo fallback: pair nodes by stable source-tree child index, not by current display order.
    result.push({ a: nodeAId, b: nodeBId, relativeDepth });
    if (relativeDepth >= maxRelativeDepth) {
      return;
    }
    const nodeA = getNode(index, nodeAId);
    const nodeB = getNode(index, nodeBId);
    const limit = Math.min(nodeA.children.length, nodeB.children.length);
    for (let offset = 0; offset < limit; offset += 1) {
      visit(nodeA.children[offset], nodeB.children[offset], relativeDepth + 1);
    }
  }

  visit(rootAId, rootBId, 0);
  return result;
}

function resolveTask(index, rawTask, config) {
  const mode = taskModes[rawTask?.mode] ? rawTask.mode : "overview";
  if (mode === "overview") {
    return {
      mode,
      kind: null,
      valid: false,
      stopReason: "empty-region",
      focus: { seeds: [], source: "selection", revision: 0 },
      summary: "保持标准 BRT。"
    };
  }

  if (mode === "compare") {
    const nodeA = getNode(index, rawTask?.nodeAId);
    const nodeB = getNode(index, rawTask?.nodeBId);
    if (!nodeA || !nodeB || nodeA.id === nodeB.id) {
      return {
        mode,
        kind: "Compare",
        valid: false,
        stopReason: "missing-correspondence",
        focus: { seeds: [], source: "selection", revision: 0 },
        summary: "请选择两个不同的比较子树根。"
      };
    }
    if (nodeA.depth !== nodeB.depth || isAncestor(index, nodeA.id, nodeB.id) || isAncestor(index, nodeB.id, nodeA.id)) {
      return {
        mode,
        kind: "Compare",
        valid: false,
        stopReason: "missing-correspondence",
        focus: { seeds: [nodeA.id, nodeB.id], source: "selection", revision: 0 },
        summary: "Compare 只支持同深度且互不包含的两个子树。"
      };
    }
    const pivot = lca(index, nodeA.id, nodeB.id);
    const pathA = pathBetweenAncestorAndNode(index, pivot, nodeA.id);
    const pathB = pathBetweenAncestorAndNode(index, pivot, nodeB.id);
    const branchAId = pathA?.[1];
    const branchBId = pathB?.[1];
    const matches = structuralCompareMatches(index, nodeA.id, nodeB.id, config.focusDepthForCompare)
      .slice(0, config.maxMetricTerms);
    if (!pivot || !branchAId || !branchBId || matches.length === 0) {
      return {
        mode,
        kind: "Compare",
        valid: false,
        stopReason: "missing-correspondence",
        focus: { seeds: [nodeA.id, nodeB.id], source: "selection", revision: 0 },
        summary: "当前选择无法生成有效的比较对应。"
      };
    }
    return {
      mode,
      kind: "Compare",
      valid: true,
      compare: {
        rootA: nodeA.id,
        rootB: nodeB.id,
        lcaId: pivot,
        branchAId,
        branchBId,
        paths: [pathA, pathB],
        matches
      },
      focus: {
        seeds: [...new Set([nodeA.id, nodeB.id, branchAId, branchBId])],
        source: "selection",
        revision: 0
      },
      summary: `比较 ${nodeA.id} 与 ${nodeB.id}，活动块根为 ${pivot}。`
    };
  }

  const endNode = getNode(index, rawTask?.targetId);
  if (!endNode) {
    return {
      mode,
      kind: "Trace",
      valid: false,
      stopReason: "unsupported-path",
      focus: { seeds: [], source: "selection", revision: 0 },
      summary: "请选择路径终点。"
    };
  }
  const fullPath = pathToRoot(index, endNode.id);
  if (!fullPath.length) {
    return {
      mode,
      kind: "Trace",
      valid: false,
      stopReason: "unsupported-path",
      focus: { seeds: [], source: "selection", revision: 0 },
      summary: "当前节点无法恢复根到节点的路径。"
    };
  }
  const optimizePath = fullPath.slice(Math.max(0, fullPath.length - (config.traceOptimizeWindow + 1)));
  return {
    mode,
    kind: "Trace",
    valid: true,
    trace: {
      start: fullPath[0],
      end: endNode.id,
      path: fullPath,
      optimizePath
    },
    focus: {
      seeds: optimizePath,
      source: "path-selection",
      revision: 0
    },
    summary: `追踪 ${fullPath.join(" → ")}。`
  };
}

function buildRegion(index, task, config) {
  if (!task.valid) {
    return {
      editableParents: new Set(),
      movableNodes: new Set(),
      fixedBoundaryNodes: new Set(index.preorder),
      blockRoots: [],
      focusDistance: new Map(),
      stopReason: task.stopReason || "empty-region"
    };
  }

  const editableParents = new Set();
  if (task.kind === "Compare") {
    editableParents.add(task.compare.lcaId);
    for (const path of task.compare.paths) {
      path.slice(0, -1).forEach((id) => editableParents.add(id));
    }
    for (const match of task.compare.matches) {
      if (match.relativeDepth > config.focusDepthForCompare) {
        continue;
      }
      const nodeA = getNode(index, match.a);
      const nodeB = getNode(index, match.b);
      if (nodeA.children.length) {
        editableParents.add(nodeA.id);
      }
      if (nodeB.children.length) {
        editableParents.add(nodeB.id);
      }
      let current = nodeA.parentId;
      while (current && current !== task.compare.lcaId && isAncestor(index, task.compare.rootA, current)) {
        editableParents.add(current);
        current = index.parent.get(current) || null;
      }
      current = nodeB.parentId;
      while (current && current !== task.compare.lcaId && isAncestor(index, task.compare.rootB, current)) {
        editableParents.add(current);
        current = index.parent.get(current) || null;
      }
    }
  } else if (task.kind === "Trace") {
    task.trace.optimizePath.slice(0, -1).forEach((id) => {
      if (getNode(index, id)?.children.length) {
        editableParents.add(id);
      }
    });
  }

  // Admit complete movement closures. If an ancestor is too large, try
  // smaller descendants instead; never truncate the contents of a subtree.
  const admitted = new Set();
  const limitedEditable = [];
  for (const id of editableParents) {
    if (limitedEditable.length >= config.maxEditableParents) break;
    const closure = index.subtreeNodes.get(id) || [];
    const additional = closure.filter((nodeId) => !admitted.has(nodeId));
    if (admitted.size + additional.length > config.maxMovableNodes) continue;
    limitedEditable.push(id);
    additional.forEach((nodeId) => admitted.add(nodeId));
  }
  const editableSet = new Set(limitedEditable);
  const blockRoots = limitedEditable.filter((id) =>
    !limitedEditable.some((other) => other !== id && isAncestor(index, other, id))
  );
  const movableNodes = new Set();
  blockRoots.forEach((rootId) => {
    for (const nodeId of index.subtreeNodes.get(rootId) || []) {
      if (movableNodes.size < config.maxMovableNodes) {
        movableNodes.add(nodeId);
      }
    }
  });
  const fixedBoundaryNodes = new Set(index.preorder.filter((id) => !movableNodes.has(id)));
  const focusDistance = new Map(
    limitedEditable.map((id) => [
      id,
      task.focus.seeds.length
        ? Math.min(...task.focus.seeds.map((seed) => treeDistance(index, id, seed)))
        : Number.POSITIVE_INFINITY
    ])
  );

  return {
    editableParents: editableSet,
    movableNodes,
    fixedBoundaryNodes,
    blockRoots,
    focusDistance,
    stopReason: blockRoots.length ? null : "empty-region"
  };
}

function getFocusWeight(index, seeds, supportIds, config) {
  if (!seeds.length || !supportIds.length) {
    return 0;
  }
  let q = 0;
  for (const nodeId of supportIds) {
    if (!index.nodeMap.has(nodeId)) {
      continue;
    }
    const distance = Math.min(...seeds.map((seed) => treeDistance(index, nodeId, seed)));
    if (distance <= config.radius) {
      q = Math.max(q, Math.exp(-distance / config.sigma));
    }
  }
  return q;
}

function buildMetricTerms(index, task, region, config) {
  if (!task.valid) {
    return [];
  }

  const terms = [];
  const addTerm = (family, support, payload) => {
    if (terms.length >= config.maxMetricTerms) {
      return;
    }
    const weightBase = task.kind === "Compare"
      ? config.taskProfiles.compare[family] || 0
      : config.taskProfiles.trace[family] || 0;
    const q = getFocusWeight(index, task.focus.seeds, support, config);
    if (weightBase <= 0 || q <= 0) {
      return;
    }
    terms.push({
      id: `${family}:${terms.length}`,
      family,
      kind: task.kind,
      support,
      focusDistance: support.length
        ? Math.min(...support.map((nodeId) => Math.min(...task.focus.seeds.map((seed) => treeDistance(index, nodeId, seed)))))
        : Number.POSITIVE_INFINITY,
      weight: weightBase * q,
      payload
    });
  };

  if (task.kind === "Compare") {
    const matchLookup = new Map(task.compare.matches.map((match) => [match.a, match.b]));
    // The design doc does not define a direct subtree-proximity term; the demo keeps
    // one lightweight proxy so compare interactions visibly reward adjacency.
    addTerm("proximity", [task.compare.rootA, task.compare.rootB], {
      rootA: task.compare.rootA,
      rootB: task.compare.rootB
    });
    for (const match of task.compare.matches) {
      addTerm("correspondence", [match.a, match.b, task.compare.rootA, task.compare.rootB], match);
      const parentA = index.parent.get(match.a);
      const parentB = index.parent.get(match.b);
      if (parentA && parentB && matchLookup.get(parentA) === parentB) {
        addTerm("alignment", [match.a, match.b, parentA, parentB], { ...match, parentA, parentB });
      }
    }

    const parentPairs = new Map();
    for (const match of task.compare.matches) {
      const parentA = index.parent.get(match.a);
      const parentB = index.parent.get(match.b);
      if (!parentA || !parentB || matchLookup.get(parentA) !== parentB) {
        continue;
      }
      const key = `${parentA}__${parentB}`;
      const list = parentPairs.get(key) || [];
      list.push(match);
      parentPairs.set(key, list);
    }
    for (const [key, matches] of parentPairs) {
      if (matches.length >= 2) {
        const [parentA, parentB] = key.split("__");
        addTerm(
          "ordering",
          [parentA, parentB, ...matches.flatMap((match) => [match.a, match.b])],
          { parentA, parentB, matches }
        );
      }
    }
  }

  if (task.kind === "Trace") {
    const path = task.trace.path;
    for (let indexInPath = 0; indexInPath <= path.length - 3; indexInPath += 1) {
      const triplet = path.slice(indexInPath, indexInPath + 3);
      addTerm("continuity", triplet, { triplet });
    }
    for (let indexInPath = 0; indexInPath < path.length - 1; indexInPath += 1) {
      const parentId = path[indexInPath];
      const childId = path[indexInPath + 1];
      const siblings = getNode(index, parentId).children.filter((id) => id !== childId);
      if (siblings.length) {
        addTerm("ambiguity", [parentId, childId, ...siblings], { parentId, childId, siblings });
      }
    }
  }

  return terms;
}

function getPolicyChildren(index, policy, nodeId) {
  const original = getNode(index, nodeId)?.children || [];
  const next = policy.order.get(nodeId);
  if (!next || next.length !== original.length) {
    return [...original];
  }
  const valid = next.every((childId) => original.includes(childId));
  return valid ? [...next] : [...original];
}

function getGapExtra(policy, leftId, rightId) {
  return Math.max(0, policy.gapExtra.get(pairKey(leftId, rightId)) || 0);
}

function mergeContour(target, source, shiftX, depthOffset) {
  for (const [depth, entry] of source.entries()) {
    const nextDepth = depth + depthOffset;
    const shifted = { min: entry.min + shiftX, max: entry.max + shiftX };
    const current = target.get(nextDepth);
    if (!current) {
      target.set(nextDepth, shifted);
    } else {
      current.min = Math.min(current.min, shifted.min);
      current.max = Math.max(current.max, shifted.max);
    }
  }
}

function buildRigidGeometry(index, positions, nodeId, cache) {
  if (cache.has(nodeId)) {
    return cache.get(nodeId);
  }
  const info = getNode(index, nodeId);
  const rootPosition = positions.get(nodeId);
  const positionsRel = new Map();
  const contour = new Map();
  for (const descendantId of index.subtreeNodes.get(nodeId) || []) {
    const descendant = getNode(index, descendantId);
    const point = positions.get(descendantId);
    const relDepth = descendant.depth - info.depth;
    const relX = point.x - rootPosition.x;
    positionsRel.set(descendantId, relX);
    const halfWidth = descendant.width / 2;
    const current = contour.get(relDepth);
    if (!current) {
      contour.set(relDepth, { min: relX - halfWidth, max: relX + halfWidth });
    } else {
      current.min = Math.min(current.min, relX - halfWidth);
      current.max = Math.max(current.max, relX + halfWidth);
    }
  }
  const geometry = { positionsRel, contour };
  cache.set(nodeId, geometry);
  return geometry;
}

function layoutEditableGeometry(index, nodeId, snapshotPositions, policy, editableParents, config, rigidCache) {
  const node = getNode(index, nodeId);
  if (node.children.length === 0) {
    return {
      positionsRel: new Map([[nodeId, 0]]),
      contour: new Map([[0, { min: -node.width / 2, max: node.width / 2 }]])
    };
  }

  if (!editableParents.has(nodeId)) {
    return buildRigidGeometry(index, snapshotPositions, nodeId, rigidCache);
  }

  const order = getPolicyChildren(index, policy, nodeId);
  const childLayouts = order.map((childId) =>
    layoutEditableGeometry(index, childId, snapshotPositions, policy, editableParents, config, rigidCache)
  );
  const childOffsets = [];
  const mergedContour = new Map();

  for (let indexInOrder = 0; indexInOrder < order.length; indexInOrder += 1) {
    const childId = order[indexInOrder];
    const childLayout = childLayouts[indexInOrder];
    let offset = 0;
    if (indexInOrder > 0) {
      const leftId = order[indexInOrder - 1];
      const gap = config.minGap + getGapExtra(policy, leftId, childId);
      let shift = 0;
      for (const [depth, contour] of childLayout.contour.entries()) {
        const existing = mergedContour.get(depth + 1);
        if (!existing) {
          continue;
        }
        shift = Math.max(shift, existing.max + gap - contour.min);
      }
      offset = shift;
    }
    childOffsets.push(offset);
    mergeContour(mergedContour, childLayout.contour, offset, 1);
  }

  let preferred = childOffsets[0];
  if (childOffsets.length > 1) {
    const alpha = clamp(policy.anchor.get(nodeId) ?? 0.5, 0, 1);
    preferred = (1 - alpha) * childOffsets[0] + alpha * childOffsets.at(-1);
  }

  const normalizedOffsets = childOffsets.map((offset) => offset - preferred);
  const positionsRel = new Map([[nodeId, 0]]);
  const contour = new Map([[0, { min: -node.width / 2, max: node.width / 2 }]]);
  for (let indexInOrder = 0; indexInOrder < order.length; indexInOrder += 1) {
    const childLayout = childLayouts[indexInOrder];
    const shiftX = normalizedOffsets[indexInOrder];
    for (const [descendantId, relX] of childLayout.positionsRel.entries()) {
      positionsRel.set(descendantId, relX + shiftX);
    }
    mergeContour(contour, childLayout.contour, shiftX, 1);
  }

  return { positionsRel, contour };
}

function relayoutLocal(index, snapshotPositions, policy, region, config) {
  const candidate = copyPointMap(snapshotPositions);
  const rigidCache = new Map();
  for (const blockRoot of region.blockRoots) {
    const geometry = layoutEditableGeometry(
      index,
      blockRoot,
      snapshotPositions,
      policy,
      region.editableParents,
      config,
      rigidCache
    );
    const anchorPoint = snapshotPositions.get(blockRoot);
    for (const [nodeId, relX] of geometry.positionsRel.entries()) {
      const current = candidate.get(nodeId);
      candidate.set(nodeId, { x: anchorPoint.x + relX, y: current.y });
    }
  }
  return candidate;
}

function orientation(ax, ay, bx, by, cx, cy) {
  const value = (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
  if (Math.abs(value) <= 1e-6) {
    return 0;
  }
  return value > 0 ? 1 : -1;
}

function onSegment(ax, ay, bx, by, cx, cy) {
  return (
    Math.min(ax, cx) - 1e-6 <= bx &&
    bx <= Math.max(ax, cx) + 1e-6 &&
    Math.min(ay, cy) - 1e-6 <= by &&
    by <= Math.max(ay, cy) + 1e-6
  );
}

function segmentsIntersect(first, second) {
  const [a1, a2, b1, b2] = [first.x1, first.y1, first.x2, first.y2];
  const [c1, c2, d1, d2] = [second.x1, second.y1, second.x2, second.y2];
  const o1 = orientation(a1, a2, b1, b2, c1, c2);
  const o2 = orientation(a1, a2, b1, b2, d1, d2);
  const o3 = orientation(c1, c2, d1, d2, a1, a2);
  const o4 = orientation(c1, c2, d1, d2, b1, b2);
  if (o1 !== o2 && o3 !== o4) {
    return true;
  }
  if (o1 === 0 && onSegment(a1, a2, c1, c2, b1, b2)) return true;
  if (o2 === 0 && onSegment(a1, a2, d1, d2, b1, b2)) return true;
  if (o3 === 0 && onSegment(c1, c2, a1, a2, d1, d2)) return true;
  if (o4 === 0 && onSegment(c1, c2, b1, b2, d1, d2)) return true;
  return false;
}

function pointInRect(px, py, rect) {
  return (
    px >= rect.left - 1e-6 &&
    px <= rect.right + 1e-6 &&
    py >= rect.top - 1e-6 &&
    py <= rect.bottom + 1e-6
  );
}

function segmentIntersectsRect(segment, rect) {
  if (pointInRect(segment.x1, segment.y1, rect) || pointInRect(segment.x2, segment.y2, rect)) {
    return true;
  }
  const edges = [
    { x1: rect.left, y1: rect.top, x2: rect.right, y2: rect.top },
    { x1: rect.right, y1: rect.top, x2: rect.right, y2: rect.bottom },
    { x1: rect.right, y1: rect.bottom, x2: rect.left, y2: rect.bottom },
    { x1: rect.left, y1: rect.bottom, x2: rect.left, y2: rect.top }
  ];
  return edges.some((edge) => segmentsIntersect(segment, edge));
}

function getEdgeSegment(index, positions, parentId, childId) {
  const parentNode = getNode(index, parentId);
  const childNode = getNode(index, childId);
  const parentPoint = positions.get(parentId);
  const childPoint = positions.get(childId);
  return {
    source: parentId,
    target: childId,
    x1: parentPoint.x,
    y1: parentPoint.y + parentNode.height / 2,
    x2: childPoint.x,
    y2: childPoint.y - childNode.height / 2
  };
}

function satisfiesPrecedence(order, precedence) {
  if (!precedence.length) {
    return true;
  }
  const rank = new Map(order.map((id, index) => [id, index]));
  return precedence.every(([before, after]) => (rank.get(before) ?? -1) < (rank.get(after) ?? -1));
}

function checkHardConstraints(index, positions, policy, region, config) {
  if (region.referencePositions) {
    for (const id of [...region.fixedBoundaryNodes, ...region.blockRoots]) {
      const before = region.referencePositions.get(id);
      const after = positions.get(id);
      if (Math.abs(before.x - after.x) > config.numericTolerance || before.y !== after.y) {
        return { ok: false, reason: `fixed-boundary:${id}` };
      }
    }
  }
  for (const [nodeId, point] of positions.entries()) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return { ok: false, reason: `invalid-position:${nodeId}` };
    }
  }

  for (const parentId of region.editableParents) {
    const parent = getNode(index, parentId);
    const order = getPolicyChildren(index, policy, parentId);
    if (parent.orderPolicy === "fixed" && !sameOrder(order, parent.children)) {
      return { ok: false, reason: `fixed-order:${parentId}` };
    }
    if (!satisfiesPrecedence(order, parent.precedence)) {
      return { ok: false, reason: `precedence:${parentId}` };
    }
    if (order.length > 0) {
      const xs = order.map((childId) => positions.get(childId).x);
      const minChild = Math.min(...xs);
      const maxChild = Math.max(...xs);
      const parentX = positions.get(parentId).x;
      if (parentX < minChild - 1e-6 || parentX > maxChild + 1e-6) {
        return { ok: false, reason: `anchor-span:${parentId}` };
      }
    }
  }

  const byDepth = new Map();
  for (const nodeId of index.preorder) {
    const node = getNode(index, nodeId);
    const point = positions.get(nodeId);
    const row = byDepth.get(node.depth) || [];
    row.push({
      id: nodeId,
      left: point.x - node.width / 2,
      right: point.x + node.width / 2
    });
    byDepth.set(node.depth, row);
  }
  for (const row of byDepth.values()) {
    row.sort((left, right) => left.left - right.left);
    for (let indexInRow = 1; indexInRow < row.length; indexInRow += 1) {
      const previous = row[indexInRow - 1];
      const current = row[indexInRow];
      if (current.left - previous.right < config.minGap - 1e-6) {
        return { ok: false, reason: `overlap:${previous.id}:${current.id}` };
      }
    }
  }

  const edges = [];
  for (const nodeId of index.preorder) {
    const node = getNode(index, nodeId);
    node.children.forEach((childId) => {
      edges.push(getEdgeSegment(index, positions, nodeId, childId));
    });
  }
  const edgeLayers = new Map();
  for (const edge of edges) {
    const depth = index.depth.get(edge.source);
    if (!edgeLayers.has(depth)) edgeLayers.set(depth, []);
    edgeLayers.get(depth).push(edge);
  }
  // Edges between different levels have disjoint vertical intervals.
  for (const layerEdges of edgeLayers.values()) {
    for (let edgeIndex = 0; edgeIndex < layerEdges.length; edgeIndex += 1) {
      for (let compareIndex = edgeIndex + 1; compareIndex < layerEdges.length; compareIndex += 1) {
        const first = layerEdges[edgeIndex];
        const second = layerEdges[compareIndex];
        if (Math.max(first.y1, first.y2) < Math.min(second.y1, second.y2) ||
            Math.max(second.y1, second.y2) < Math.min(first.y1, first.y2)) continue;
        if (first.source === second.source || first.source === second.target ||
            first.target === second.source || first.target === second.target) {
          continue;
        }
        if (segmentsIntersect(first, second)) {
          return { ok: false, reason: `edge-cross:${first.target}:${second.target}` };
        }
      }
    }
  }

  const rectangles = index.preorder.map((id) => {
    const node = getNode(index, id);
    const point = positions.get(id);
    return { id, left: point.x - node.width / 2, right: point.x + node.width / 2,
      top: point.y - node.height / 2, bottom: point.y + node.height / 2 };
  });
  for (const edge of edges) {
    for (const rect of rectangles) {
      const nodeId = rect.id;
      if (nodeId === edge.source || nodeId === edge.target) {
        continue;
      }
      if (rect.bottom < Math.min(edge.y1, edge.y2) ||
          rect.top > Math.max(edge.y1, edge.y2) ||
          rect.right < Math.min(edge.x1, edge.x2) ||
          rect.left > Math.max(edge.x1, edge.x2)) continue;
      if (segmentIntersectsRect(edge, rect)) {
        return { ok: false, reason: `edge-node:${edge.target}:${nodeId}` };
      }
    }
  }

  return { ok: true, reason: "ok" };
}

function vectorAngle(left, right) {
  const leftLength = Math.hypot(left.x, left.y);
  const rightLength = Math.hypot(right.x, right.y);
  if (leftLength <= 1e-6 || rightLength <= 1e-6) {
    return Math.PI;
  }
  const dot = clamp((left.x * right.x + left.y * right.y) / (leftLength * rightLength), -1, 1);
  return Math.acos(dot);
}

function evaluateTerm(index, positions, policy, term, context) {
  const sX = context.sX;
  if (term.family === "correspondence") {
    const { a, b } = term.payload;
    const localA = positions.get(a).x - positions.get(context.task.compare.rootA).x;
    const localB = positions.get(b).x - positions.get(context.task.compare.rootB).x;
    const error = Math.abs(localA - localB) / sX;
    return context.config.compareShapeLoss === "clamped" ? clamp01(error) : Math.log1p(error);
  }

  if (term.family === "proximity") {
    const { rootA, rootB } = term.payload;
    return Math.log1p(Math.abs(positions.get(rootA).x - positions.get(rootB).x) / (context.sX * 3));
  }

  if (term.family === "alignment") {
    const { a, b, parentA, parentB } = term.payload;
    const deltaA = positions.get(a).x - positions.get(parentA).x;
    const deltaB = positions.get(b).x - positions.get(parentB).x;
    const error = Math.abs(deltaA - deltaB) / sX;
    return context.config.compareShapeLoss === "clamped" ? clamp01(error) : Math.log1p(error);
  }

  if (term.family === "ordering") {
    const { parentA, parentB, matches } = term.payload;
    const orderA = getPolicyChildren(index, policy, parentA);
    const orderB = getPolicyChildren(index, policy, parentB);
    const rankA = new Map(orderA.map((id, index) => [id, index]));
    const rankB = new Map(orderB.map((id, index) => [id, index]));
    let disagreements = 0;
    let comparisons = 0;
    for (let left = 0; left < matches.length; left += 1) {
      for (let right = left + 1; right < matches.length; right += 1) {
        const matchLeft = matches[left];
        const matchRight = matches[right];
        const signA = Math.sign((rankA.get(matchLeft.a) ?? 0) - (rankA.get(matchRight.a) ?? 0));
        const signB = Math.sign((rankB.get(matchLeft.b) ?? 0) - (rankB.get(matchRight.b) ?? 0));
        comparisons += 1;
        if (signA !== signB) {
          disagreements += 1;
        }
      }
    }
    return comparisons ? disagreements / comparisons : 0;
  }

  if (term.family === "continuity") {
    const [parentId, nodeId, childId] = term.payload.triplet;
    const incoming = getEdgeSegment(index, positions, parentId, nodeId);
    const outgoing = getEdgeSegment(index, positions, nodeId, childId);
    const inVector = { x: incoming.x2 - incoming.x1, y: incoming.y2 - incoming.y1 };
    const outVector = { x: outgoing.x2 - outgoing.x1, y: outgoing.y2 - outgoing.y1 };
    return vectorAngle(inVector, outVector) / Math.PI;
  }

  if (term.family === "ambiguity") {
    const { parentId, childId, siblings } = term.payload;
    const base = getEdgeSegment(index, positions, parentId, childId);
    const baseVector = { x: base.x2 - base.x1, y: base.y2 - base.y1 };
    const thetaMin = (context.config.thetaMinDegrees * Math.PI) / 180;
    let worst = 0;
    siblings.forEach((siblingId) => {
      const candidate = getEdgeSegment(index, positions, parentId, siblingId);
      const vector = { x: candidate.x2 - candidate.x1, y: candidate.y2 - candidate.y1 };
      const angle = vectorAngle(baseVector, vector);
      worst = Math.max(worst, Math.max(0, 1 - angle / thetaMin));
    });
    return worst;
  }

  return 0;
}

function inversionRatio(currentOrder, previousOrder) {
  if (currentOrder.length < 2 || previousOrder.length !== currentOrder.length) {
    return 0;
  }
  const rank = new Map(previousOrder.map((id, index) => [id, index]));
  let inversions = 0;
  let total = 0;
  for (let left = 0; left < currentOrder.length; left += 1) {
    for (let right = left + 1; right < currentOrder.length; right += 1) {
      total += 1;
      if ((rank.get(currentOrder[left]) ?? 0) > (rank.get(currentOrder[right]) ?? 0)) {
        inversions += 1;
      }
    }
  }
  return total ? inversions / total : 0;
}

function evaluate(index, positions, policy, problem) {
  const familyTotals = new Map();
  const familyCounts = new Map();
  for (const term of problem.metricTerms) {
    const loss = evaluateTerm(index, positions, policy, term, problem);
    familyTotals.set(term.family, (familyTotals.get(term.family) || 0) + term.weight * loss);
    familyCounts.set(term.family, (familyCounts.get(term.family) || 0) + 1);
  }
  const taskByFamily = {};
  let task = 0;
  for (const [family, total] of familyTotals.entries()) {
    const value = total / Math.max(1, familyCounts.get(family) || 0);
    taskByFamily[family] = value;
    task += value;
  }

  const centerTerms = [];
  regionLoop:
  for (const parentId of problem.region.editableParents) {
    const order = getPolicyChildren(index, policy, parentId);
    if (!order.length) {
      continue regionLoop;
    }
    const first = positions.get(order[0]).x;
    const last = positions.get(order.at(-1)).x;
    centerTerms.push(Math.abs(positions.get(parentId).x - (first + last) / 2) / problem.sX);
  }
  const center = centerTerms.length
    ? centerTerms.reduce((sum, value) => sum + value, 0) / centerTerms.length
    : 0;

  let spaceCount = 0;
  let spaceSum = 0;
  for (const parentId of problem.region.editableParents) {
    const order = getPolicyChildren(index, policy, parentId);
    for (let indexInOrder = 0; indexInOrder < order.length - 1; indexInOrder += 1) {
      spaceCount += 1;
      spaceSum += getGapExtra(policy, order[indexInOrder], order[indexInOrder + 1]) / problem.sX;
    }
  }
  const space = spaceCount ? spaceSum / spaceCount : 0;

  const moveTerms = [];
  for (const nodeId of problem.region.movableNodes) {
    const previous = problem.prevPositions.get(nodeId);
    const current = positions.get(nodeId);
    moveTerms.push(((current.x - previous.x) / problem.sX) ** 2);
  }
  const move = moveTerms.length
    ? moveTerms.reduce((sum, value) => sum + value, 0) / moveTerms.length
    : 0;

  const orderTerms = [];
  for (const parentId of problem.region.editableParents) {
    orderTerms.push(inversionRatio(
      getPolicyChildren(index, policy, parentId),
      getPolicyChildren(index, problem.prevPolicy, parentId)
    ));
  }
  const order = orderTerms.length
    ? orderTerms.reduce((sum, value) => sum + value, 0) / orderTerms.length
    : 0;

  const comparing = problem.task.kind === "Compare";
  const J = task
    + problem.config.lambdaCenter * (comparing ? problem.config.compareCenterScale : 1) * center
    + problem.config.lambdaSpace * space
    + problem.config.lambdaMove * (comparing ? problem.config.compareMovementScale : 1) * move
    + problem.config.lambdaOrder * (comparing ? problem.config.compareOrderScale : 1) * order;

  return { J, task, taskByFamily, center, space, move, order };
}

function getFocusedChildren(task, parentId) {
  if (task.kind === "Compare") {
    return task.compare.paths.flatMap((path) => {
      const offset = path.indexOf(parentId);
      return offset >= 0 && offset < path.length - 1 ? [path[offset + 1]] : [];
    });
  }
  if (task.kind === "Trace") {
    const indexInPath = task.trace.path.indexOf(parentId);
    if (indexInPath >= 0 && indexInPath < task.trace.path.length - 1) {
      return [task.trace.path[indexInPath + 1]];
    }
  }
  return [];
}

function generateActions(index, policy, positions, problem) {
  if (problem.config.maxCandidatesPerScan <= 0) return [];
  const actions = [];
  const shapeParents = new Set(problem.task.compare?.matches.flatMap(({ a, b }) => [a, b]) || []);
  const parents = [...problem.region.editableParents].sort((left, right) => {
    if (problem.task.kind === "Compare" && problem.config.compareShapeLoss === "log") {
      const shapePriority = Number(shapeParents.has(right)) - Number(shapeParents.has(left));
      if (shapePriority) return shapePriority;
    }
    const delta = (problem.region.focusDistance.get(left) || 0) - (problem.region.focusDistance.get(right) || 0);
    return delta || left.localeCompare(right);
  });
  const priority = problem.task.kind === "Compare"
    ? ["order", "anchor", "gap"]
    : ["anchor", "gap", "order"];

  const signatures = new Set();
  const push = (action) => {
    const signature = JSON.stringify(action);
    if (!signatures.has(signature)) {
      signatures.add(signature);
      actions.push(action);
    }
  };

  for (const family of priority) {
    for (const parentId of parents) {
      const node = getNode(index, parentId);
      const order = getPolicyChildren(index, policy, parentId);
      const focusedChildren = getFocusedChildren(problem.task, parentId);
      if (family === "order" && node.orderPolicy !== "fixed" && order.length > 1) {
        if (problem.task.kind === "Compare" && parentId === problem.task.compare.lcaId) {
          const firstIndex = order.indexOf(problem.task.compare.branchAId);
          const secondIndex = order.indexOf(problem.task.compare.branchBId);
          if (firstIndex >= 0 && secondIndex >= 0 && Math.abs(firstIndex - secondIndex) > 1) {
            push({
              family,
              type: "insert",
              parentId,
              childId: problem.task.compare.branchBId,
              toIndex: firstIndex + 1
            });
            push({
              family,
              type: "insert",
              parentId,
              childId: problem.task.compare.branchAId,
              toIndex: secondIndex
            });
          }
        }
        focusedChildren.forEach((childId) => {
          const currentIndex = order.indexOf(childId);
          if (currentIndex < 0) {
            return;
          }
          [-2, -1, 1, 2].forEach((offset) => {
            const toIndex = clamp(currentIndex + offset, 0, order.length - 1);
            if (toIndex !== currentIndex) {
              push({ family, type: "insert", parentId, childId, toIndex });
            }
          });
        });
        for (let indexInOrder = 0; indexInOrder < order.length - 1; indexInOrder += 1) {
          push({
            family,
            type: "swap",
            parentId,
            leftId: order[indexInOrder],
            rightId: order[indexInOrder + 1]
          });
        }
      }

      if (family === "anchor" && order.length > 0) {
        const currentAlpha = policy.anchor.get(parentId) ?? 0.5;
        const values = new Set([
          clamp(currentAlpha - problem.config.anchorStep / 4, 0, 1),
          clamp(currentAlpha + problem.config.anchorStep / 4, 0, 1),
          clamp(currentAlpha - problem.config.anchorStep, 0, 1),
          clamp(currentAlpha + problem.config.anchorStep, 0, 1),
          0.5
        ]);
        focusedChildren.forEach((childId) => {
          const childIndex = order.indexOf(childId);
          if (childIndex >= 0 && order.length > 1) {
            values.add(childIndex / (order.length - 1));
          }
        });
        [...values]
          .filter((value) => Math.abs(value - currentAlpha) > 1e-6)
          .sort((left, right) => Math.abs(left - currentAlpha) - Math.abs(right - currentAlpha))
          .forEach((alpha) => push({ family, type: "anchor", parentId, alpha }));
      }

      if (family === "gap" && order.length > 1) {
        const focusSet = new Set(focusedChildren);
        const adjacent = [];
        for (let indexInOrder = 0; indexInOrder < order.length - 1; indexInOrder += 1) {
          adjacent.push([order[indexInOrder], order[indexInOrder + 1]]);
        }
        adjacent.sort((left, right) => {
          const leftFocus = Number(focusSet.has(left[0]) || focusSet.has(left[1]));
          const rightFocus = Number(focusSet.has(right[0]) || focusSet.has(right[1]));
          return rightFocus - leftFocus || left[0].localeCompare(right[0]);
        });
        adjacent.forEach(([leftId, rightId]) => {
          const currentGap = getGapExtra(policy, leftId, rightId);
          const step = problem.config.gapStepRatio * problem.sX;
          const maxGap = Math.max(currentGap, problem.config.maxGapRatio * problem.sX);
          const nextValues = [clamp(currentGap + step, 0, maxGap), clamp(currentGap - step, 0, maxGap)];
          nextValues
            .filter((value) => Math.abs(value - currentGap) > 1e-6)
            .forEach((gapExtra) => push({ family, type: "gap", parentId, leftId, rightId, gapExtra }));
        });
      }
    }
  }

  // Reserve opportunities for every operation family. A wide parent's swaps
  // must not exhaust the scan before any alignment or spacing is evaluated.
  const queues = priority.map((family) => actions.filter((action) => action.family === family));
  const balanced = [];
  for (let offset = 0; queues.some((queue) => offset < queue.length); offset += 1) {
    for (const queue of queues) {
      if (queue[offset]) balanced.push(queue[offset]);
      if (balanced.length >= problem.config.maxCandidatesPerScan) return balanced;
    }
  }
  return balanced;
}

function applyAction(index, policy, action) {
  const next = clonePolicy(policy);
  if (action.type === "swap") {
    const order = getPolicyChildren(index, next, action.parentId);
    const leftIndex = order.indexOf(action.leftId);
    const rightIndex = order.indexOf(action.rightId);
    if (leftIndex >= 0 && rightIndex >= 0) {
      [order[leftIndex], order[rightIndex]] = [order[rightIndex], order[leftIndex]];
      next.order.set(action.parentId, order);
    }
    return next;
  }
  if (action.type === "insert") {
    const order = getPolicyChildren(index, next, action.parentId);
    const fromIndex = order.indexOf(action.childId);
    if (fromIndex >= 0) {
      const [childId] = order.splice(fromIndex, 1);
      const nextIndex = clamp(action.toIndex, 0, order.length);
      order.splice(nextIndex, 0, childId);
      next.order.set(action.parentId, order);
    }
    return next;
  }
  if (action.type === "anchor") {
    next.anchor.set(action.parentId, clamp(action.alpha, 0, 1));
    return next;
  }
  if (action.type === "gap") {
    const key = pairKey(action.leftId, action.rightId);
    if (action.gapExtra <= 1e-6) {
      next.gapExtra.delete(key);
    } else {
      next.gapExtra.set(key, action.gapExtra);
    }
    return next;
  }
  return next;
}

function diffChangedIds(index, previous, next) {
  const changed = [];
  for (const nodeId of index.preorder) {
    if (Math.abs(previous.get(nodeId).x - next.get(nodeId).x) > 1e-6) {
      changed.push(nodeId);
    }
  }
  return changed;
}

function freezeProblem(index, task, region, prevPositions, prevPolicy, config) {
  const rootNode = getNode(index, index.rootId);
  const sX = Math.max(config.minGap + rootNode.width, 1);
  return {
    index,
    task,
    region: { ...region, referencePositions: prevPositions },
    prevPositions,
    prevPolicy,
    metricTerms: buildMetricTerms(index, task, region, config),
    sX,
    config
  };
}

function optimizeLocal(problem) {
  const start = now();
  let bestPositions = copyPointMap(problem.prevPositions);
  let bestPolicy = clonePolicy(problem.prevPolicy);
  let bestLoss = evaluate(problem.index, bestPositions, bestPolicy, problem);
  const acceptedActions = [];
  const rejectionCounts = new Map();
  let evaluatedCount = 0;
  let stopReason = problem.region.stopReason || "no-improvement";

  for (let scan = 0; scan < problem.config.maxScans; scan += 1) {
    const actions = generateActions(problem.index, bestPolicy, bestPositions, problem);
    let accepted = false;
    for (const action of actions) {
      if (now() - start > problem.config.optimizeBudgetMs) {
        stopReason = "time-budget";
        return {
          target: bestPositions,
          policy: bestPolicy,
          changedIds: diffChangedIds(problem.index, problem.prevPositions, bestPositions),
          acceptedActions,
          lossesBefore: evaluate(problem.index, problem.prevPositions, problem.prevPolicy, problem),
          lossesAfter: bestLoss,
          stopReason,
          elapsedMs: now() - start,
          evaluatedCount,
          rejectionCounts
        };
      }
      if (evaluatedCount >= problem.config.maxCandidateEvaluationsPerEvent) {
        stopReason = "candidate-budget";
        return {
          target: bestPositions,
          policy: bestPolicy,
          changedIds: diffChangedIds(problem.index, problem.prevPositions, bestPositions),
          acceptedActions,
          lossesBefore: evaluate(problem.index, problem.prevPositions, problem.prevPolicy, problem),
          lossesAfter: bestLoss,
          stopReason,
          elapsedMs: now() - start,
          evaluatedCount,
          rejectionCounts
        };
      }
      if (acceptedActions.length >= problem.config.maxAcceptedActions) {
        stopReason = "action-budget";
        return {
          target: bestPositions,
          policy: bestPolicy,
          changedIds: diffChangedIds(problem.index, problem.prevPositions, bestPositions),
          acceptedActions,
          lossesBefore: evaluate(problem.index, problem.prevPositions, problem.prevPolicy, problem),
          lossesAfter: bestLoss,
          stopReason,
          elapsedMs: now() - start,
          evaluatedCount,
          rejectionCounts
        };
      }

      const candidatePolicy = applyAction(problem.index, bestPolicy, action);
      const candidatePositions = relayoutLocal(problem.index, bestPositions, candidatePolicy, problem.region, problem.config);
      evaluatedCount += 1;
      const feasibility = checkHardConstraints(problem.index, candidatePositions, candidatePolicy, problem.region, problem.config);
      if (!feasibility.ok) {
        rejectionCounts.set(feasibility.reason, (rejectionCounts.get(feasibility.reason) || 0) + 1);
        continue;
      }
      const candidateLoss = evaluate(problem.index, candidatePositions, candidatePolicy, problem);
      if (
        candidateLoss.J < bestLoss.J - problem.config.epsilon &&
        candidateLoss.task <= bestLoss.task + problem.config.numericTolerance
      ) {
        bestPolicy = candidatePolicy;
        bestPositions = candidatePositions;
        bestLoss = candidateLoss;
        acceptedActions.push(action);
        accepted = true;
        stopReason = "no-improvement";
        break;
      }
    }
    if (!accepted) {
      stopReason = scan === problem.config.maxScans - 1 ? "scan-budget" : "no-improvement";
      break;
    }
  }

  return {
    target: bestPositions,
    policy: bestPolicy,
    changedIds: diffChangedIds(problem.index, problem.prevPositions, bestPositions),
    acceptedActions,
    lossesBefore: evaluate(problem.index, problem.prevPositions, problem.prevPolicy, problem),
    lossesAfter: bestLoss,
    stopReason,
    elapsedMs: now() - start,
    evaluatedCount,
    rejectionCounts
  };
}

function materializeLayout(index, positions, policy, dataset, task, report) {
  const nodes = index.preorder.map((nodeId) => {
    const node = getNode(index, nodeId);
    const point = positions.get(nodeId);
    return {
      id: node.id,
      label: node.label,
      parentId: node.parentId,
      childIds: getPolicyChildren(index, policy, node.id),
      depth: node.depth,
      subtreeSize: node.subtreeSize,
      weight: node.weight,
      radius: node.radius,
      width: node.width,
      height: node.height,
      x: point.x,
      y: point.y
    };
  });
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const links = [];
  nodes.forEach((node) => {
    node.childIds.forEach((childId) => {
      links.push({ source: nodeMap.get(node.id), target: nodeMap.get(childId) });
    });
  });
  const maxX = Math.max(...nodes.map((node) => node.x));
  const minX = Math.min(...nodes.map((node) => node.x));
  const maxY = Math.max(...nodes.map((node) => node.y));
  return {
    dataset,
    task,
    policy: {
      mode: task.mode,
      path: task.trace?.path || [],
      optimizePath: task.trace?.optimizePath || [],
      compareBranches: task.compare
        ? {
            lcaId: task.compare.lcaId,
            branchAId: task.compare.branchAId,
            branchBId: task.compare.branchBId
          }
        : null,
      ordering: taskModes[task.mode].ordering,
      alignment: taskModes[task.mode].alignment,
      objective: taskModes[task.mode].objective
    },
    nodes,
    links,
    bounds: {
      minX,
      maxX,
      minY: 0,
      maxY,
      width: maxX - minX + 240,
      height: maxY + 220
    },
    metrics: report.lossesAfter,
    report
  };
}

function defaultAnimationStrategy(result, previousPolicy) {
  const reorder = [...previousPolicy.order.keys()].some((parentId) =>
    !sameOrder(previousPolicy.order.get(parentId), result.policy.order.get(parentId))
  );
  return reorder ? "fade" : "interpolate";
}

export function createIncrementalLayoutSession(datasetId, overrides = {}) {
  const config = { ...defaultConfig, ...overrides };
  const dataset = datasets[datasetId] || datasets.balanced;
  const root = normalizeRoot(dataset.root);
  const baseline = buildLayout(dataset.id, { root, alignment: "center" });
  const index = createIndex(root, baseline);
  const minGap = Math.max(18, Math.round((baseline.options?.siblingGap || 124) * 0.18));
  config.minGap = Number.isFinite(overrides.minGap) ? overrides.minGap : minGap;
  const initial = buildInitialPositions(index);
  index.initialGapExtra = captureInitialClearance(index, initial, config.minGap);
  const policy = createDefaultPolicy(index);
  return {
    datasetId: dataset.id,
    dataset,
    root,
    baseline,
    index,
    config,
    initial,
    target: copyPointMap(initial),
    display: copyPointMap(initial),
    policy,
    revision: 0,
    treeVersion: 1,
    lastTask: resolveTask(index, { mode: "overview" }, config),
    lastResult: null
  };
}

export function updateIncrementalLayoutSession(session, rawTask = { mode: "overview" }) {
  session.revision += 1;
  const task = resolveTask(session.index, rawTask, session.config);
  const region = buildRegion(session.index, task, session.config);
  const taskContext = { ...task, mode: task.mode };
  const previousPolicy = clonePolicy(session.policy);

  let result;
  if (!task.valid || region.stopReason) {
    const frozen = freezeProblem(
      session.index,
      taskContext,
      region,
      session.target,
      session.policy,
      session.config
    );
    const unchangedLoss = evaluate(session.index, session.target, session.policy, frozen);
    result = {
      target: copyPointMap(session.target),
      policy: clonePolicy(session.policy),
      changedIds: [],
      acceptedActions: [],
      lossesBefore: unchangedLoss,
      lossesAfter: unchangedLoss,
      stopReason: region.stopReason || task.stopReason || "empty-region",
      elapsedMs: 0,
      evaluatedCount: 0,
      rejectionCounts: new Map()
    };
  } else {
    const frozen = freezeProblem(
      session.index,
      taskContext,
      region,
      session.target,
      session.policy,
      session.config
    );
    result = optimizeLocal(frozen);
    session.target = copyPointMap(result.target);
    session.policy = clonePolicy(result.policy);
  }

  const awareLayout = materializeLayout(session.index, session.target, session.policy, session.dataset, taskContext, {
    ...result,
    metricVersions: { proximity: "proximity-log-v2", spacing: "baseline-clearance-v1",
      compareShape: session.config.compareShapeLoss === "clamped" ? "clamped-v1" : "log-v2" },
    region,
    summary: task.summary,
    revision: session.revision,
    animationStrategy: defaultAnimationStrategy(result, previousPolicy),
    task
  });
  const baselineFrozen = freezeProblem(
    session.index,
    taskContext,
    region,
    session.initial,
    createDefaultPolicy(session.index),
    session.config
  );
  const baselineMetrics = evaluate(
    session.index,
    session.initial,
    createDefaultPolicy(session.index),
    baselineFrozen
  );
  session.lastTask = taskContext;
  session.lastResult = awareLayout;
  return { aware: awareLayout, baseline: session.baseline, baselineMetrics, task: taskContext };
}

export function originalBrt(datasetId) {
  return buildLayout(datasetId, { alignment: "center" });
}

export function taskAwareBrt(datasetId, task = { mode: "overview" }) {
  const session = createIncrementalLayoutSession(datasetId);
  return updateIncrementalLayoutSession(session, task).aware;
}

export function evaluateLayout(layout) {
  return layout.metrics || null;
}

export function listNodes(root) {
  return listTreeNodes(root);
}
