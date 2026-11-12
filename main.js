import { datasets } from "./layout.js";
import {
  createIncrementalLayoutSession,
  listNodes,
  taskModes,
  updateIncrementalLayoutSession
} from "./taskAwareLayout.js";

const d3 = window.d3;
const elements = Object.fromEntries([
  "task-buttons", "dataset-select", "compare-controls", "compare-a", "compare-b",
  "trace-controls", "trace-target", "policy-task", "policy-ordering",
  "policy-alignment", "policy-objective", "policy-stop", "policy-actions",
  "policy-region", "selection-note", "original-tree", "aware-tree",
  "original-metrics", "aware-metrics", "aware-description", "reset-layout",
  "reset-view"
].map((id) => [id, document.getElementById(id)]));

const state = { datasetId: "mediumIrregular", mode: "overview", nodeAId: null, nodeBId: null, targetId: null };
const viewportState = new Map();
let nextCompareSlot = "nodeAId";
let session = createIncrementalLayoutSession(state.datasetId);
let animation = null;
let animationFrameId = 0;
let latestAware = updateIncrementalLayoutSession(session, { mode: "overview" });

function copyPointMap(source) {
  return new Map([...source].map(([id, point]) => [id, { ...point }]));
}

function getViewport(svgElement) {
  if (!viewportState.has(svgElement.id)) {
    viewportState.set(svgElement.id, {
      initialized: false,
      userInteracted: false,
      tx: 0,
      ty: 0,
      scale: 1,
      suppressClickUntil: 0,
      pointerId: null,
      lastPointerX: 0,
      lastPointerY: 0,
      movedDistance: 0
    });
  }
  return viewportState.get(svgElement.id);
}

function fitViewportToLayout(svgElement, layout) {
  const camera = getViewport(svgElement);
  const width = Math.max(svgElement.clientWidth, 320);
  const height = Math.max(svgElement.clientHeight, 440);
  const padding = 48;
  const scale = Math.max(0.08, Math.min(
    (width - 2 * padding) / Math.max(layout.bounds.width, 1),
    (height - 2 * padding) / Math.max(layout.bounds.height, 1),
    1.2
  ));
  camera.scale = scale;
  camera.tx = (width - layout.bounds.width * scale) / 2 - (layout.bounds.minX - 120) * scale;
  camera.ty = (height - layout.bounds.height * scale) / 2;
  camera.initialized = true;
  camera.userInteracted = false;
  svgElement.classList.remove("is-panning");
}

function applyViewportTransform(svgElement) {
  const camera = getViewport(svgElement);
  const viewport = svgElement.querySelector("g.viewport");
  if (!viewport || !camera.initialized) {
    return;
  }
  viewport.setAttribute("transform", `translate(${camera.tx},${camera.ty}) scale(${camera.scale})`);
}

function resetAllViewports() {
  viewportState.forEach((camera) => {
    camera.initialized = false;
    camera.userInteracted = false;
    camera.pointerId = null;
    camera.movedDistance = 0;
  });
  [elements["original-tree"], elements["aware-tree"]].forEach((svgElement) => {
    if (svgElement) {
      svgElement.classList.remove("is-panning");
    }
  });
}

function isSuppressedClick(svgElement) {
  return performance.now() < getViewport(svgElement).suppressClickUntil;
}

function updateSingleCanvas(svgElement) {
  if (svgElement === elements["aware-tree"]) {
    const frame = captureCurrentFrame();
    session.display = copyPointMap(frame.positions);
    draw(svgElement, materializeDisplayLayout(frame.layout, frame.positions), frame.opacity);
    return;
  }
  draw(svgElement, {
    ...latestAware.baseline,
    task: latestAware.task,
    policy: latestAware.aware.policy
  });
}

function updateVisibleCanvases() {
  updateSingleCanvas(elements["original-tree"]);
  updateSingleCanvas(elements["aware-tree"]);
}

function installPanZoom(svgElement) {
  const camera = getViewport(svgElement);
  if (camera.installed) {
    return;
  }
  camera.installed = true;

  svgElement.addEventListener("wheel", (event) => {
    event.preventDefault();
    const current = getViewport(svgElement);
    if (!current.initialized) {
      return;
    }
    const rect = svgElement.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const zoomFactor = Math.exp(-event.deltaY * 0.0015);
    const nextScale = Math.min(12, Math.max(0.04, current.scale * zoomFactor));
    if (Math.abs(nextScale - current.scale) < 1e-6) {
      return;
    }
    const scaleRatio = nextScale / current.scale;
    current.tx = pointerX - scaleRatio * (pointerX - current.tx);
    current.ty = pointerY - scaleRatio * (pointerY - current.ty);
    current.scale = nextScale;
    current.userInteracted = true;
    applyViewportTransform(svgElement);
  }, { passive: false });

  svgElement.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    if (typeof event.target?.closest === "function" && event.target.closest(".tree-node")) {
      return;
    }
    const current = getViewport(svgElement);
    current.pointerId = event.pointerId;
    current.lastPointerX = event.clientX;
    current.lastPointerY = event.clientY;
    current.movedDistance = 0;
    svgElement.classList.add("is-panning");
    svgElement.setPointerCapture(event.pointerId);
  });

  svgElement.addEventListener("pointermove", (event) => {
    const current = getViewport(svgElement);
    if (current.pointerId !== event.pointerId) {
      return;
    }
    const deltaX = event.clientX - current.lastPointerX;
    const deltaY = event.clientY - current.lastPointerY;
    if (deltaX === 0 && deltaY === 0) {
      return;
    }
    current.tx += deltaX;
    current.ty += deltaY;
    current.lastPointerX = event.clientX;
    current.lastPointerY = event.clientY;
    current.movedDistance += Math.hypot(deltaX, deltaY);
    current.userInteracted = true;
    applyViewportTransform(svgElement);
  });

  const stopPan = (event) => {
    const current = getViewport(svgElement);
    if (current.pointerId !== event.pointerId) {
      return;
    }
    if (current.movedDistance > 6) {
      current.suppressClickUntil = performance.now() + 180;
    }
    current.pointerId = null;
    current.movedDistance = 0;
    svgElement.classList.remove("is-panning");
    if (svgElement.hasPointerCapture(event.pointerId)) {
      svgElement.releasePointerCapture(event.pointerId);
    }
  };

  svgElement.addEventListener("pointerup", stopPan);
  svgElement.addEventListener("pointercancel", stopPan);
  svgElement.addEventListener("lostpointercapture", () => {
    const current = getViewport(svgElement);
    current.pointerId = null;
    current.movedDistance = 0;
    svgElement.classList.remove("is-panning");
  });
}

function choices(select, nodes, selected) {
  select.replaceChildren();
  for (const node of nodes) {
    const option = document.createElement("option");
    option.value = node.id;
    option.textContent = `${"　".repeat(node.depth || 0)}${node.label} (${node.id})`;
    select.appendChild(option);
  }
  select.value = selected;
}

function syncSelection() {
  const nodes = listNodes(datasets[state.datasetId].root);
  const ids = new Set(nodes.map((node) => node.id));
  const root = datasets[state.datasetId].root;
  const topChildren = (root.children || []).map((child) => child.id);
  if (!ids.has(state.nodeAId)) {
    state.nodeAId = topChildren[0] || nodes[0]?.id || null;
  }
  if (!ids.has(state.nodeBId) || state.nodeBId === state.nodeAId) {
    state.nodeBId = topChildren.find((id) => id !== state.nodeAId)
      || nodes.find((node) => node.id !== state.nodeAId)?.id
      || state.nodeAId;
  }
  if (!ids.has(state.targetId)) {
    state.targetId = nodes.at(-1)?.id || null;
  }
  choices(elements["compare-a"], nodes, state.nodeAId);
  choices(elements["compare-b"], nodes, state.nodeBId);
  choices(elements["trace-target"], nodes, state.targetId);
}

function buildTask() {
  return {
    mode: state.mode,
    nodeAId: state.nodeAId,
    nodeBId: state.nodeBId,
    targetId: state.targetId
  };
}

function materializeDisplayLayout(layout, positions) {
  const nodes = layout.nodes.map((node) => ({
    ...node,
    x: positions.get(node.id)?.x ?? node.x,
    y: positions.get(node.id)?.y ?? node.y
  }));
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const links = layout.links.map((edge) => ({
    source: nodeMap.get(edge.source.id),
    target: nodeMap.get(edge.target.id)
  }));
  const maxX = Math.max(...nodes.map((node) => node.x));
  const minX = Math.min(...nodes.map((node) => node.x));
  const maxY = Math.max(...nodes.map((node) => node.y));
  return {
    ...layout,
    nodes,
    links,
    bounds: {
      minX,
      maxX,
      minY: 0,
      maxY,
      width: maxX - minX + 240,
      height: maxY + 220
    }
  };
}

function captureCurrentFrame() {
  if (!animation) {
    return {
      layout: latestAware.aware,
      positions: copyPointMap(session.display),
      opacity: 1
    };
  }

  const elapsed = performance.now() - animation.startTime;
  const t = Math.max(0, Math.min(1, elapsed / animation.duration));
  if (animation.strategy === "fade") {
    const opacity = t < 0.5 ? 1 - t * 2 : (t - 0.5) * 2;
    const layout = t < 0.5 ? animation.startLayout : animation.endLayout;
    const positions = t < 0.5 ? animation.startPositions : animation.endPositions;
    return { layout, positions: copyPointMap(positions), opacity };
  }

  const positions = new Map();
  for (const node of animation.endLayout.nodes) {
    const start = animation.startPositions.get(node.id) || animation.endPositions.get(node.id);
    const end = animation.endPositions.get(node.id);
    const eased = 3 * t * t - 2 * t * t * t;
    positions.set(node.id, {
      x: start.x * (1 - eased) + end.x * eased,
      y: start.y
    });
  }
  return { layout: animation.endLayout, positions, opacity: 1 };
}

function updateAnimationFrame() {
  const frame = captureCurrentFrame();
  session.display = copyPointMap(frame.positions);
  draw(elements["aware-tree"], materializeDisplayLayout(frame.layout, frame.positions), frame.opacity);
  if (!animation) {
    return;
  }
  const finished = performance.now() - animation.startTime >= animation.duration;
  if (finished) {
    session.display = copyPointMap(animation.endPositions);
    latestAware.aware = animation.endLayout;
    animation = null;
    return;
  }
  animationFrameId = requestAnimationFrame(updateAnimationFrame);
}

function startAnimation(nextAware) {
  const current = captureCurrentFrame();
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = 0;
  }
  const hasReorder = nextAware.aware.report.acceptedActions.some((action) =>
    action.type === "swap" || action.type === "insert"
  );
  animation = {
    strategy: hasReorder ? "fade" : "interpolate",
    startTime: performance.now(),
    duration: session.config.animationDurationMs,
    startLayout: current.layout,
    endLayout: nextAware.aware,
    startPositions: copyPointMap(current.positions),
    endPositions: copyPointMap(session.target)
  };
  updateAnimationFrame();
}

function lossText(loss) {
  if (!loss) {
    return "无任务损失。";
  }
  const fields = [
    `J ${loss.J.toFixed(3)}`,
    `task ${loss.task.toFixed(3)}`,
    `center ${loss.center.toFixed(3)}`,
    `space ${loss.space.toFixed(3)}`,
    `move ${loss.move.toFixed(3)}`,
    `order ${loss.order.toFixed(3)}`
  ];
  if (loss.taskByFamily) {
    Object.entries(loss.taskByFamily).forEach(([family, value]) => {
      fields.push(`${family} ${value.toFixed(3)}`);
    });
  }
  return fields.join(" · ");
}

function describeActions(actions) {
  if (!actions.length) {
    return "无接受动作";
  }
  return actions.map((action) => {
    if (action.type === "anchor") {
      return `${action.parentId}:α→${action.alpha.toFixed(2)}`;
    }
    if (action.type === "gap") {
      return `${action.leftId}/${action.rightId}:gap→${action.gapExtra.toFixed(1)}`;
    }
    if (action.type === "swap") {
      return `${action.parentId}:swap(${action.leftId},${action.rightId})`;
    }
    return `${action.parentId}:insert(${action.childId}→${action.toIndex})`;
  }).join(" · ");
}

function describeRegion(report) {
  const region = report.region;
  return `editable ${region.editableParents.size} · movable ${region.movableNodes.size} · blocks ${region.blockRoots.join(", ") || "无"}`;
}

function handleNodeSelection(svgElement, node) {
  if (isSuppressedClick(svgElement)) {
    return;
  }
  if (state.mode === "trace") {
    state.targetId = node.id;
  } else if (state.mode === "compare") {
    state[nextCompareSlot] = node.id;
    nextCompareSlot = nextCompareSlot === "nodeAId" ? "nodeBId" : "nodeAId";
  }
  render();
}

function ensureViewport(svgElement, layout) {
  installPanZoom(svgElement);
  const camera = getViewport(svgElement);
  if (!camera.initialized) {
    fitViewportToLayout(svgElement, layout);
  }
}

function draw(svgElement, layout, opacity = 1) {
  ensureViewport(svgElement, layout);
  if (!d3) {
    drawWithoutD3(svgElement, layout, opacity);
    return;
  }
  const svg = d3.select(svgElement);
  const width = Math.max(svgElement.clientWidth, 320);
  const height = Math.max(svgElement.clientHeight, 440);
  svg.attr("viewBox", `0 0 ${width} ${height}`);
  const viewport = svg.selectAll("g.viewport").data([null]).join("g").attr("class", "viewport");
  const inner = viewport.selectAll("g.tree-content").data([null]).join("g").attr("class", "tree-content");
  inner.attr("opacity", opacity);
  applyViewportTransform(svgElement);
  inner.selectAll("path.edge").data(layout.links, (edge) => edge.target.id).join("path")
    .attr("class", (edge) => `edge${layout.policy.path.includes(edge.source.id) && layout.policy.path.includes(edge.target.id) ? " path-edge" : ""}`)
    .attr("d", (edge) => `M${edge.source.x},${edge.source.y} L${edge.target.x},${edge.target.y}`);
  const selected = new Set(layout.task.mode === "compare"
    ? [state.nodeAId, state.nodeBId]
    : layout.task.mode === "trace"
      ? layout.policy.path
      : []);
  const nodes = inner.selectAll("g.tree-node").data(layout.nodes, (node) => node.id).join("g")
    .attr("class", (node) => `tree-node${selected.has(node.id) ? " selected" : ""}`)
    .attr("transform", (node) => `translate(${node.x},${node.y})`)
    .on("pointerdown", (event) => {
      event.stopPropagation();
    })
    .on("click", (event, node) => {
      event.stopPropagation();
      handleNodeSelection(svgElement, node);
    });
  nodes.selectAll("circle").data((node) => [node]).join("circle").attr("r", (node) => node.radius);
  nodes.selectAll("text").data((node) => [node]).join("text")
    .attr("dy", (node) => node.radius + 17).text((node) => node.label);
  nodes.selectAll("title").data((node) => [node]).join("title")
    .text((node) => `${node.id} · 深度 ${node.depth} · 子树节点 ${node.subtreeSize}`);
}

function drawWithoutD3(svgElement, layout, opacity = 1) {
  const namespace = "http://www.w3.org/2000/svg";
  const create = (tag) => document.createElementNS(namespace, tag);
  const width = Math.max(svgElement.clientWidth, 320);
  const height = Math.max(svgElement.clientHeight, 440);
  svgElement.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svgElement.replaceChildren();
  const viewport = create("g");
  viewport.setAttribute("class", "viewport");
  const inner = create("g");
  inner.setAttribute("class", "tree-content");
  inner.setAttribute("opacity", String(opacity));
  viewport.appendChild(inner);
  svgElement.appendChild(viewport);
  applyViewportTransform(svgElement);
  for (const edge of layout.links) {
    const path = create("path");
    const onPath = layout.policy.path.includes(edge.source.id) && layout.policy.path.includes(edge.target.id);
    path.setAttribute("class", `edge${onPath ? " path-edge" : ""}`);
    path.setAttribute("d", `M${edge.source.x},${edge.source.y} L${edge.target.x},${edge.target.y}`);
    inner.appendChild(path);
  }
  const selected = new Set(layout.task.mode === "compare"
    ? [state.nodeAId, state.nodeBId]
    : layout.task.mode === "trace"
      ? layout.policy.path
      : []);
  for (const node of layout.nodes) {
    const group = create("g");
    group.setAttribute("class", `tree-node${selected.has(node.id) ? " selected" : ""}`);
    group.setAttribute("transform", `translate(${node.x},${node.y})`);
    const circle = create("circle");
    circle.setAttribute("r", node.radius);
    const label = create("text");
    label.setAttribute("dy", node.radius + 17);
    label.textContent = node.label;
    const title = create("title");
    title.textContent = `${node.id} · 深度 ${node.depth} · 子树节点 ${node.subtreeSize}`;
    group.append(circle, label, title);
    group.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    group.addEventListener("click", (event) => {
      event.stopPropagation();
      handleNodeSelection(svgElement, node);
    });
    inner.appendChild(group);
  }
}

function resetSession() {
  session = createIncrementalLayoutSession(state.datasetId);
  latestAware = updateIncrementalLayoutSession(session, { mode: "overview" });
  animation = null;
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = 0;
  }
  resetAllViewports();
}

function render() {
  syncSelection();
  if (session.datasetId !== state.datasetId) {
    resetSession();
  }
  const task = buildTask();
  const nextAware = updateIncrementalLayoutSession(session, task);
  latestAware = nextAware;

  elements["compare-controls"].hidden = state.mode !== "compare";
  elements["trace-controls"].hidden = state.mode !== "trace";
  elements["policy-task"].textContent = nextAware.task.mode;
  elements["policy-ordering"].textContent = nextAware.aware.policy.ordering;
  elements["policy-alignment"].textContent = nextAware.aware.policy.alignment;
  elements["policy-objective"].textContent = nextAware.aware.policy.objective;
  elements["policy-stop"].textContent = nextAware.aware.report.stopReason;
  elements["policy-actions"].textContent = describeActions(nextAware.aware.report.acceptedActions);
  elements["policy-region"].textContent = describeRegion(nextAware.aware.report);
  elements["selection-note"].textContent = nextAware.aware.report.summary;
  elements["aware-description"].textContent = `${taskModes[state.mode].label} · ${nextAware.aware.report.acceptedActions.length} 个接受动作`;
  elements["original-metrics"].textContent = lossText(nextAware.baselineMetrics);
  elements["aware-metrics"].textContent = lossText(nextAware.aware.metrics);

  draw(elements["original-tree"], {
    ...nextAware.baseline,
    task: nextAware.task,
    policy: nextAware.aware.policy
  });
  startAnimation(nextAware);

  for (const button of elements["task-buttons"].querySelectorAll("button")) {
    button.setAttribute("aria-pressed", button.dataset.mode === state.mode ? "true" : "false");
  }
}

for (const mode of Object.values(taskModes)) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.mode = mode.id;
  button.textContent = mode.label;
  button.addEventListener("click", () => {
    state.mode = mode.id;
    render();
  });
  elements["task-buttons"].appendChild(button);
}

choices(
  elements["dataset-select"],
  Object.values(datasets).map((dataset) => ({ id: dataset.id, label: dataset.label, depth: 0 })),
  state.datasetId
);
elements["dataset-select"].addEventListener("change", () => {
  state.datasetId = elements["dataset-select"].value;
  resetSession();
  render();
});
for (const [id, field] of [["compare-a", "nodeAId"], ["compare-b", "nodeBId"], ["trace-target", "targetId"]]) {
  elements[id].addEventListener("change", () => {
    state[field] = elements[id].value;
    render();
  });
}
elements["reset-layout"].addEventListener("click", () => {
  state.mode = "overview";
  resetSession();
  render();
});
elements["reset-view"].addEventListener("click", () => {
  resetAllViewports();
  updateVisibleCanvases();
});
window.addEventListener("resize", () => {
  resetAllViewports();
  render();
});
render();
