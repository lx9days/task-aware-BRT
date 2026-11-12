export const alignmentModes = [
  { id: "center", label: "中点对齐" },
  { id: "weighted", label: "高权重节点对齐" },
  { id: "subtree", label: "大子树节点对齐" },
  { id: "deepest", label: "最深子树对齐" }
];

export const scenarios = {
  "tree-identify": {
    id: "tree-identify",
    label: "识别树平衡性",
    badge: "Identify Tree Balance",
    summary: "识别整棵树是否平衡、是否偏斜，以及整体层级是否均匀。",
    researchQuestion: "当任务是识别整棵树的整体平衡特征时，中点对齐是否最利于结构判断？",
    recommendedAlignment: "center",
    defaults: { lambda: 0.85, weightInfluence: 0.8 }
  },
  "tree-compare": {
    id: "tree-compare",
    label: "比较树形形态",
    badge: "Compare Tree Shape",
    summary: "比较两棵树或两种布局状态下的整体形态、平衡性和展开宽度。",
    researchQuestion: "当任务是比较整体树形差异时，中点对齐是否最能减少额外偏置？",
    recommendedAlignment: "center",
    defaults: { lambda: 0.8, weightInfluence: 0.85 }
  },
  "node-identify": {
    id: "node-identify",
    label: "识别关键节点",
    badge: "Identify Important Node",
    summary: "识别权重最高、最显著或最值得关注的节点。",
    researchQuestion: "当任务是找出最重要的节点时，高权重对齐是否更直接？",
    recommendedAlignment: "weighted",
    defaults: { lambda: 0.45, weightInfluence: 1.3 }
  },
  "node-compare": {
    id: "node-compare",
    label: "比较节点重要性",
    badge: "Compare Node Importance",
    summary: "比较两个候选节点在权重、显著性或优先级上的高低。",
    researchQuestion: "当任务是比较节点重要性时，高权重对齐是否更利于快速判断？",
    recommendedAlignment: "weighted",
    defaults: { lambda: 0.45, weightInfluence: 1.3 }
  },
  "subtree-identify": {
    id: "subtree-identify",
    label: "识别最大子树",
    badge: "Identify Largest Subtree",
    summary: "识别节点数最多、覆盖范围最大的子树。",
    researchQuestion: "当任务是找出最大的子树时，大子树对齐是否更容易直接暴露答案？",
    recommendedAlignment: "subtree",
    defaults: { lambda: 0.6, weightInfluence: 1 }
  },
  "subtree-compare": {
    id: "subtree-compare",
    label: "比较子树规模",
    badge: "Compare Subtree Size",
    summary: "比较两个子树在节点数量、覆盖范围和结构容量上的差异。",
    researchQuestion: "当任务是比较子树规模时，大子树对齐是否更利于形成清晰对照？",
    recommendedAlignment: "subtree",
    defaults: { lambda: 0.6, weightInfluence: 1 }
  },
  "path-following": {
    id: "path-following",
    label: "识别最长路径",
    badge: "Identify Longest Path",
    summary: "识别从根到叶的最长路径或最深延展方向。",
    researchQuestion: "当任务是识别最长路径时，最深子树对齐是否更自然？",
    recommendedAlignment: "deepest",
    defaults: { lambda: 0.35, weightInfluence: 1.25 }
  },
  "path-compare": {
    id: "path-compare",
    label: "比较路径长度",
    badge: "Compare Path Length",
    summary: "比较两条候选路径的深度、跳数或层级延展长度。",
    researchQuestion: "当任务是比较两条路径长度时，最深子树对齐是否更利于读出深度差异？",
    recommendedAlignment: "deepest",
    defaults: { lambda: 0.35, weightInfluence: 1.25 }
  }
};

function createLargeIrregularTree() {
  let counter = 0;

  function nextId(prefix = "N") {
    counter += 1;
    return `${prefix}${String(counter).padStart(3, "0")}`;
  }

  function makeNode(prefix, weight, children = []) {
    const id = nextId(prefix);
    return { id, label: id, weight, children };
  }

  function makeLeaf(weight, prefix = "L") {
    return makeNode(prefix, weight);
  }

  function makeHeavySpine(length) {
    let tail = makeNode("HP", 2.1, [makeLeaf(1.35, "HS"), makeLeaf(1.1, "HS")]);

    for (let index = length - 1; index >= 0; index -= 1) {
      const children = [];

      if (index % 2 === 0) {
        children.push(makeLeaf(1.8 - index * 0.08, "HS"));
      }

      if (index === 2) {
        children.push(
          makeNode("HW", 2.4, [makeLeaf(1.2, "HS"), makeLeaf(1.05, "HS"), makeLeaf(0.92, "HS")])
        );
      }

      children.push(tail);
      tail = makeNode("HP", 7.8 - index * 0.38, children);
    }

    return tail;
  }

  function makeMegaCanopy() {
    const clusterSpecs = [
      [8],
      [3, 3],
      [2, 2, 2],
      [1, 1, 2, 2],
      [1, 1, 1, 2, 2],
      [1, 1, 1, 1, 2, 2],
      [1, 1, 1, 1, 1, 2, 2],
      [1, 1, 1, 1, 1, 1, 2, 2],
      [1, 1, 1, 1, 1, 1, 1, 2, 2]
    ];

    const branches = clusterSpecs.map((leafCounts, branchIndex) => {
      const clusters = leafCounts.map((leafCount, clusterIndex) => {
        const leaves = Array.from({ length: leafCount }, (_, leafIndex) =>
          makeLeaf(0.62 + ((branchIndex + clusterIndex + leafIndex) % 5) * 0.05, "MF")
        );
        return makeNode("MC", 0.84 + branchIndex * 0.03 + clusterIndex * 0.02, leaves);
      });

      return makeNode("MB", 0.96 + branchIndex * 0.04, clusters);
    });

    return makeNode("MG", 1.18, branches);
  }

  function makeRaggedFan() {
    const fanSpecs = [0, 1, 0, 3, 1, 4, 0, 2, 5, 1, 0, 3, 2, 1];
    const branches = fanSpecs.map((grandChildCount, index) => {
      if (grandChildCount === 0) {
        return makeLeaf(0.95 + (index % 4) * 0.08, "RF");
      }

      const grandChildren = Array.from({ length: grandChildCount }, (_, childIndex) => {
        if (grandChildCount >= 4 && childIndex === grandChildCount - 1) {
          return makeNode("RT", 1.12 + childIndex * 0.03, [makeLeaf(0.88, "RL"), makeLeaf(0.8, "RL")]);
        }

        return makeLeaf(0.82 + (childIndex % 3) * 0.07, "RL");
      });

      return makeNode("RF", 1.02 + index * 0.03, grandChildren);
    });

    return makeNode("RA", 1.35, branches);
  }

  function makeSparseDepthMix() {
    let trunk = makeNode("SD", 1.24, [makeLeaf(0.92, "SL")]);

    for (let index = 0; index < 7; index += 1) {
      const children = [];

      if (index % 3 !== 1) {
        children.push(makeLeaf(1.08 + index * 0.04, "SL"));
      }

      if (index === 3) {
        children.push(makeNode("SB", 1.6, [makeLeaf(1.05, "SL"), makeLeaf(0.94, "SL"), makeLeaf(0.9, "SL")]));
      }

      children.push(trunk);
      trunk = makeNode("SD", 1.42 - index * 0.06, children);
    }

    return trunk;
  }

  function makeAsymmetricCrown() {
    const specs = [
      [],
      [2],
      [1, 3],
      [],
      [2, 1, 4],
      [1],
      [5, 2]
    ];
    const branches = specs.map((clusterCounts, index) => {
      if (clusterCounts.length === 0) {
        return makeLeaf(1.1 + index * 0.05, "AC");
      }

      const children = clusterCounts.map((leafCount, clusterIndex) =>
        makeNode(
          "AK",
          1.02 + clusterIndex * 0.08,
          Array.from({ length: leafCount }, (_, leafIndex) => makeLeaf(0.86 + leafIndex * 0.06, "AL"))
        )
      );

      return makeNode("AC", 1.18 + index * 0.04, children);
    });

    return makeNode("AR", 1.58, branches);
  }

  return {
    id: "A",
    label: "A",
    weight: 1,
    children: [
      makeHeavySpine(8),
      makeMegaCanopy(),
      makeRaggedFan(),
      makeSparseDepthMix(),
      makeAsymmetricCrown()
    ]
  };
}

function createMediumIrregularTree() {
  const node = (id, children = [], weight = 1) => ({ id, label: id, weight, children });
  const crown = (prefix, counts) => node(prefix, counts.map((count, branch) =>
    node(`${prefix}${branch + 1}`, Array.from({ length: count }, (_, leaf) =>
      node(`${prefix}${branch + 1}-${leaf + 1}`, [], 0.8 + leaf * 0.1)
    ), 1.1 + branch * 0.15)
  ));

  // Stable IDs and asymmetric branches support repeatable Compare/Trace selections.
  let spine = node("MD6", [node("MD6-L"), node("MD6-R")]);
  for (let depth = 5; depth >= 1; depth -= 1) {
    const side = node(`MD${depth}-S`, depth % 2 === 0
      ? [node(`MD${depth}-S1`), node(`MD${depth}-S2`)]
      : []);
    spine = node(`MD${depth}`, depth % 2 === 0 ? [spine, side] : [side, spine], 1.8);
  }

  return node("M", [
    crown("MA", [2, 4, 1, 3]),
    crown("MB", [3, 1, 4, 2]),
    crown("MC", [1, 0, 5, 2, 0]),
    spine,
    crown("ME", [2, 1, 3])
  ]);
}

export const datasets = {
  mediumIrregular: {
    id: "mediumIrregular",
    label: "中等规模不均匀树（72 节点）",
    description: "72 个节点，包含两棵可比较子树 MA/MB、宽分支 MC、交替侧枝深链 MD1 和紧凑子树 ME。可比较 MA 与 MB，或追踪 MD6-L。",
    root: createMediumIrregularTree()
  },
  largeIrregular: {
    id: "largeIrregular",
    label: "大规模不均匀树",
    description: "包含爆发宽层、深链、重权重短支和超大子树，最大层约 100 个节点。",
    root: createLargeIrregularTree()
  },
  balanced: {
    id: "balanced",
    label: "对称树",
    description: "结构基本对称，适合观察中点对齐的稳定性。",
    root: {
      id: "A",
      label: "A",
      weight: 1,
      children: [
        {
          id: "B",
          label: "B",
          weight: 1.1,
          children: [
            { id: "D", label: "D", weight: 1 },
            { id: "E", label: "E", weight: 1.05 }
          ]
        },
        {
          id: "C",
          label: "C",
          weight: 1,
          children: [
            { id: "F", label: "F", weight: 0.95 },
            { id: "G", label: "G", weight: 1 }
          ]
        }
      ]
    }
  },
  unbalanced: {
    id: "unbalanced",
    label: "右深链树",
    description: "右侧主路径很长，适合观察主路径节点对齐。",
    root: {
      id: "A",
      label: "A",
      weight: 1,
      children: [
        {
          id: "B",
          label: "B",
          weight: 0.9,
          children: [{ id: "H", label: "H", weight: 0.8 }]
        },
        {
          id: "C",
          label: "C",
          weight: 1.4,
          children: [
            {
              id: "D",
              label: "D",
              weight: 1.3,
              children: [
                {
                  id: "E",
                  label: "E",
                  weight: 1.25,
                  children: [{ id: "F", label: "F", weight: 1.15 }]
                }
              ]
            }
          ]
        }
      ]
    }
  },
  weighted: {
    id: "weighted",
    label: "左强权重树",
    description: "左侧分支规模和权重都更强，适合看高权重与主导分支对齐。",
    root: {
      id: "A",
      label: "A",
      weight: 1,
      children: [
        {
          id: "B",
          label: "B",
          weight: 3.4,
          children: [
            {
              id: "I",
              label: "I",
              weight: 1.9,
              children: [
                { id: "J", label: "J", weight: 1.1 },
                { id: "K", label: "K", weight: 1.05 }
              ]
            },
            { id: "L", label: "L", weight: 1.4 },
            { id: "M", label: "M", weight: 1.2 }
          ]
        },
        {
          id: "C",
          label: "C",
          weight: 0.7,
          children: [
            { id: "N", label: "N", weight: 0.8 },
            { id: "O", label: "O", weight: 0.7 }
          ]
        }
      ]
    }
  },
  weightVsSize: {
    id: "weightVsSize",
    label: "权重规模冲突树",
    description: "左侧节点权重极高但子树很小，右侧子树很大但单点权重低。",
    root: {
      id: "A",
      label: "A",
      weight: 1,
      children: [
        {
          id: "B",
          label: "B",
          weight: 5.2,
          children: [{ id: "C", label: "C", weight: 4.4 }]
        },
        {
          id: "D",
          label: "D",
          weight: 0.9,
          children: [
            { id: "E", label: "E", weight: 0.8 },
            { id: "F", label: "F", weight: 0.8 },
            {
              id: "G",
              label: "G",
              weight: 0.85,
              children: [
                { id: "H", label: "H", weight: 0.75 },
                { id: "I", label: "I", weight: 0.72 }
              ]
            }
          ]
        }
      ]
    }
  },
  wideVsDeep: {
    id: "wideVsDeep",
    label: "宽浅深长树",
    description: "左侧很宽但浅，右侧很窄却很深，适合比较子树规模与主路径策略。",
    root: {
      id: "A",
      label: "A",
      weight: 1,
      children: [
        {
          id: "B",
          label: "B",
          weight: 1.1,
          children: [
            { id: "C", label: "C", weight: 0.95 },
            { id: "D", label: "D", weight: 0.95 },
            { id: "E", label: "E", weight: 0.95 },
            { id: "F", label: "F", weight: 0.95 },
            { id: "L", label: "L", weight: 0.95 }
          ]
        },
        {
          id: "G",
          label: "G",
          weight: 1.3,
          children: [
            {
              id: "H",
              label: "H",
              weight: 1.25,
              children: [
                {
                  id: "I",
                  label: "I",
                  weight: 1.2,
                  children: [
                    {
                      id: "J",
                      label: "J",
                      weight: 1.15,
                      children: [{ id: "K", label: "K", weight: 1.1 }]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  },
  twinCompetition: {
    id: "twinCompetition",
    label: "双峰竞争树",
    description: "左右两棵大子树相互竞争，但其中一侧含有更高权重节点。",
    root: {
      id: "A",
      label: "A",
      weight: 1,
      children: [
        {
          id: "B",
          label: "B",
          weight: 1.2,
          children: [
            { id: "C", label: "C", weight: 1 },
            {
              id: "D",
              label: "D",
              weight: 3.3,
              children: [{ id: "E", label: "E", weight: 1.1 }]
            },
            { id: "F", label: "F", weight: 1 }
          ]
        },
        {
          id: "G",
          label: "G",
          weight: 1.1,
          children: [
            { id: "H", label: "H", weight: 1 },
            {
              id: "I",
              label: "I",
              weight: 1,
              children: [
                { id: "J", label: "J", weight: 0.95 },
                { id: "K", label: "K", weight: 0.95 }
              ]
            },
            { id: "L", label: "L", weight: 1 }
          ]
        }
      ]
    }
  },
  cascadingConflict: {
    id: "cascadingConflict",
    label: "层层冲突树",
    description: "从根到深层反复制造高权重小分支与大子树低权重分支的冲突，整体轮廓变化会更明显。",
    root: {
      id: "AA",
      label: "A",
      weight: 1,
      children: [
        {
          id: "AB",
          label: "B",
          weight: 6.2,
          children: [{ id: "AC", label: "C", weight: 3.8 }]
        },
        {
          id: "AD",
          label: "D",
          weight: 0.95,
          children: [
            { id: "AE", label: "E", weight: 3.4 },
            { id: "AF", label: "F", weight: 0.82 },
            {
              id: "AG",
              label: "G",
              weight: 0.9,
              children: [
                { id: "AH", label: "H", weight: 2.8 },
                {
                  id: "AI",
                  label: "I",
                  weight: 0.78,
                  children: [
                    { id: "AJ", label: "J", weight: 0.72 },
                    { id: "AK", label: "K", weight: 0.7 },
                    { id: "AL", label: "L", weight: 0.68 }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  },
  triForkConflict: {
    id: "triForkConflict",
    label: "三叉冲突树",
    description: "根节点有三个方向完全不同的候选分支，让中点、高权重和大子树三种对齐出现大幅分离。",
    root: {
      id: "BA",
      label: "A",
      weight: 1,
      children: [
        {
          id: "BB",
          label: "B",
          weight: 7.2,
          children: [{ id: "BC", label: "C", weight: 3.5 }]
        },
        {
          id: "BD",
          label: "D",
          weight: 1.8,
          children: [
            { id: "BE", label: "E", weight: 1.2 },
            { id: "BF", label: "F", weight: 1.15 },
            { id: "BG", label: "G", weight: 1.1 }
          ]
        },
        {
          id: "BH",
          label: "H",
          weight: 0.9,
          children: [
            { id: "BI", label: "I", weight: 2.6 },
            {
              id: "BJ",
              label: "J",
              weight: 0.8,
              children: [
                { id: "BK", label: "K", weight: 0.78 },
                { id: "BL", label: "L", weight: 0.76 },
                {
                  id: "BM",
                  label: "M",
                  weight: 0.74,
                  children: [
                    { id: "BN", label: "N", weight: 0.72 },
                    { id: "BO", label: "O", weight: 0.7 }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  },
  alternatingConflict: {
    id: "alternatingConflict",
    label: "交替冲突梯树",
    description: "每一层都同时放置一个高权重短支和一个低权重大子树，能把不同规则的整体走向彻底拉开。",
    root: {
      id: "CA",
      label: "A",
      weight: 1,
      children: [
        { id: "CB", label: "B", weight: 6.8 },
        {
          id: "CC",
          label: "C",
          weight: 0.92,
          children: [
            { id: "CD", label: "D", weight: 5.5 },
            {
              id: "CE",
              label: "E",
              weight: 0.84,
              children: [
                { id: "CF", label: "F", weight: 4.6 },
                {
                  id: "CG",
                  label: "G",
                  weight: 0.8,
                  children: [
                    { id: "CH", label: "H", weight: 3.9 },
                    {
                      id: "CI",
                      label: "I",
                      weight: 0.76,
                      children: [
                        { id: "CJ", label: "J", weight: 0.72 },
                        { id: "CK", label: "K", weight: 0.7 }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  },
  combTree: {
    id: "combTree",
    label: "梳状树",
    description: "主干很长，每层都挂一个小侧枝，适合放大主路径对齐的效果。",
    root: {
      id: "A",
      label: "A",
      weight: 1,
      children: [
        { id: "B", label: "B", weight: 0.9 },
        {
          id: "C",
          label: "C",
          weight: 1.4,
          children: [
            { id: "D", label: "D", weight: 0.85 },
            {
              id: "E",
              label: "E",
              weight: 1.3,
              children: [
                { id: "F", label: "F", weight: 0.82 },
                {
                  id: "G",
                  label: "G",
                  weight: 1.2,
                  children: [
                    { id: "H", label: "H", weight: 0.8 },
                    {
                      id: "I",
                      label: "I",
                      weight: 1.1,
                      children: [{ id: "J", label: "J", weight: 0.78 }]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  }
};

function cloneTree(node) {
  return {
    id: node.id,
    label: node.label,
    weight: normalizeWeight(node.weight),
    children: (node.children || []).map(cloneTree)
  };
}

function normalizeWeight(weight) {
  return Number.isFinite(weight) && weight > 0 ? weight : 1;
}

function midpoint(children) {
  if (children.length === 1) {
    return children[0].prelim;
  }

  return (children[0].prelim + children[children.length - 1].prelim) / 2;
}

function pickChild(children, scoreAccessor) {
  return [...children].sort((left, right) => {
    const delta = scoreAccessor(right) - scoreAccessor(left);

    if (delta !== 0) {
      return delta;
    }

    return left.number - right.number;
  })[0];
}

function getHighestWeightChild(children) {
  return pickChild(children, (child) => child.weight);
}

function getLargestSubtreeChild(children) {
  return pickChild(children, (child) => child.subtreeSize);
}

function getDeepestSubtreeChild(children) {
  return pickChild(children, (child) => child.branchDepth);
}

function getAnchorChild(children, options) {
  if (options.alignment === "weighted") {
    return getHighestWeightChild(children);
  }

  if (options.alignment === "subtree") {
    return getLargestSubtreeChild(children);
  }

  if (options.alignment === "deepest") {
    return getDeepestSubtreeChild(children);
  }

  return null;
}

function createBrtTree(node, parent = null, number = 1) {
  const current = {
    id: node.id,
    label: node.label,
    weight: normalizeWeight(node.weight),
    parent,
    parentId: parent ? parent.id : null,
    number,
    children: [],
    prelim: 0,
    mod: 0,
    change: 0,
    shift: 0,
    thread: null,
    ancestor: null,
    lmostSibling: null,
    depth: parent ? parent.depth + 1 : 0
  };

  current.children = (node.children || []).map((child, index) => createBrtTree(child, current, index + 1));
  current.ancestor = current;
  current.lmostSibling = parent && number > 1 ? null : null;
  current.children.forEach((child, index) => {
    child.lmostSibling = index > 0 ? current.children[0] : null;
  });
  current.subtreeSize = 1 + current.children.reduce((sum, child) => sum + child.subtreeSize, 0);
  current.leafCount =
    current.children.length === 0
      ? 1
      : current.children.reduce((sum, child) => sum + child.leafCount, 0);
  current.pathScore =
    current.weight +
    current.children.reduce((best, child) => Math.max(best, child.pathScore), 0) +
    current.subtreeSize * 0.15;
  current.branchDepth =
    current.children.length === 0
      ? 0
      : 1 + Math.max(...current.children.map((child) => child.branchDepth));

  return current;
}

function leftSibling(node) {
  if (!node.parent || node.number <= 1) {
    return null;
  }

  return node.parent.children[node.number - 2];
}

function nextLeft(node) {
  return node.children.length > 0 ? node.children[0] : node.thread;
}

function nextRight(node) {
  return node.children.length > 0 ? node.children[node.children.length - 1] : node.thread;
}

function moveSubtree(leftNode, rightNode, shift) {
  const subtrees = rightNode.number - leftNode.number;

  if (subtrees <= 0) {
    return;
  }

  rightNode.change -= shift / subtrees;
  rightNode.shift += shift;
  leftNode.change += shift / subtrees;
  rightNode.prelim += shift;
  rightNode.mod += shift;
}

function executeShifts(node) {
  let shift = 0;
  let change = 0;

  for (let index = node.children.length - 1; index >= 0; index -= 1) {
    const child = node.children[index];
    child.prelim += shift;
    child.mod += shift;
    change += child.change;
    shift += child.shift + change;
  }
}

function ancestor(vil, node, defaultAncestor) {
  return vil.ancestor.parent === node.parent ? vil.ancestor : defaultAncestor;
}

function getAlignmentTarget(node, options) {
  const centerX = midpoint(node.children);
  const targetIds = options.alignmentTargets?.[node.id];

  if (targetIds?.length) {
    const targets = node.children.filter((child) => targetIds.includes(child.id));

    if (targets.length) {
      return targets.reduce((sum, child) => sum + child.prelim, 0) / targets.length;
    }
  }

  const anchorChild = getAnchorChild(node.children, options);

  if (options.alignment === "center") {
    return centerX;
  }

  return anchorChild ? anchorChild.prelim : centerX;
}

function apportion(node, defaultAncestor, distance) {
  const leftNode = leftSibling(node);

  if (!leftNode) {
    return defaultAncestor;
  }

  let innerRight = node;
  let outerRight = node;
  let innerLeft = leftNode;
  let outerLeft = node.lmostSibling;
  let shiftInnerRight = innerRight.mod;
  let shiftOuterRight = outerRight.mod;
  let shiftInnerLeft = innerLeft.mod;
  let shiftOuterLeft = outerLeft.mod;

  while (nextRight(innerLeft) && nextLeft(innerRight)) {
    innerLeft = nextRight(innerLeft);
    innerRight = nextLeft(innerRight);
    outerLeft = nextLeft(outerLeft);
    outerRight = nextRight(outerRight);
    outerRight.ancestor = node;

    const shift =
      innerLeft.prelim +
      shiftInnerLeft -
      (innerRight.prelim + shiftInnerRight) +
      distance;

    if (shift > 0) {
      const pivot = ancestor(innerLeft, node, defaultAncestor);
      moveSubtree(pivot, node, shift);
      shiftInnerRight += shift;
      shiftOuterRight += shift;
    }

    shiftInnerLeft += innerLeft.mod;
    shiftInnerRight += innerRight.mod;
    shiftOuterLeft += outerLeft.mod;
    shiftOuterRight += outerRight.mod;
  }

  if (nextRight(innerLeft) && !nextRight(outerRight)) {
    outerRight.thread = nextRight(innerLeft);
    outerRight.mod += shiftInnerLeft - shiftOuterRight;
  } else if (nextLeft(innerRight) && !nextLeft(outerLeft)) {
    outerLeft.thread = nextLeft(innerRight);
    outerLeft.mod += shiftInnerRight - shiftOuterLeft;
    defaultAncestor = node;
  }

  return defaultAncestor;
}

function firstWalk(node, options, distance) {
  if (node.children.length === 0) {
    const sibling = leftSibling(node);
    node.prelim = sibling ? sibling.prelim + distance : 0;
    return;
  }

  let defaultAncestor = node.children[0];

  node.children.forEach((child) => {
    firstWalk(child, options, distance);
    defaultAncestor = apportion(child, defaultAncestor, distance);
  });

  executeShifts(node);

  const target = getAlignmentTarget(node, options);
  const sibling = leftSibling(node);

  if (sibling) {
    node.prelim = sibling.prelim + distance;
    node.mod = node.prelim - target;
  } else {
    node.prelim = target;
  }
}

function secondWalk(node, modifier, depth, positionedNodes, links) {
  const xRaw = node.prelim + modifier;
  const positioned = {
    id: node.id,
    label: node.label,
    weight: node.weight,
    parentId: node.parentId,
    childIds: node.children.map((child) => child.id),
    depth,
    subtreeSize: node.subtreeSize,
    leafCount: node.leafCount,
    pathScore: node.pathScore,
    branchDepth: node.branchDepth,
    xRaw,
    centerX: midpoint(node.children.length > 0 ? node.children : [node]),
    semanticX: xRaw
  };

  positionedNodes.push(positioned);

  node.children.forEach((child) => {
    links.push({ source: node.id, target: child.id });
    secondWalk(child, modifier + node.mod, depth + 1, positionedNodes, links);
  });
}

function normalizeLayout(nodes) {
  const minX = Math.min(...nodes.map((node) => node.xRaw));
  const shift = minX < 0 ? -minX : 0;

  if (shift === 0) {
    return;
  }

  nodes.forEach((node) => {
    node.xRaw += shift;
  });
}

function flatten(node, list, links) {
  list.push(node);
  node.children.forEach((child) => {
    links.push({ source: node, target: child });
    flatten(child, list, links);
  });
}

export function summarizeTree(root) {
  const annotated = createBrtTree(cloneTree(root));
  const nodes = [];
  const links = [];
  flatten(annotated, nodes, links);

  const internalNodes = nodes.filter((node) => node.children.length > 0);
  const avgBranching =
    internalNodes.length === 0
      ? 0
      : internalNodes.reduce((sum, node) => sum + node.children.length, 0) / internalNodes.length;
  const levelCounts = new Map();

  nodes.forEach((node) => {
    levelCounts.set(node.depth, (levelCounts.get(node.depth) || 0) + 1);
  });

  return {
    nodeCount: nodes.length,
    maxDepth: Math.max(...nodes.map((node) => node.depth)),
    leafCount: nodes.filter((node) => node.children.length === 0).length,
    avgBranchingFactor: avgBranching,
    maxSubtreeSize: Math.max(...nodes.map((node) => node.subtreeSize)),
    maxBreadth: Math.max(...levelCounts.values())
  };
}

export function buildLayout(datasetId, options = {}) {
  const dataset = datasets[datasetId] || datasets.balanced;
  const scenarioConfig = scenarios[options.scenario] || scenarios["tree-identify"];
  const resolvedOptions = {
    alignment: options.alignment || scenarioConfig.recommendedAlignment,
    scenario: options.scenario || scenarioConfig.id,
    lambda: Number.isFinite(options.lambda) ? options.lambda : scenarioConfig.defaults.lambda,
    weightInfluence: Number.isFinite(options.weightInfluence)
      ? options.weightInfluence
      : scenarioConfig.defaults.weightInfluence,
    levelGap: Number.isFinite(options.levelGap) ? options.levelGap : 140,
    siblingGap: Number.isFinite(options.siblingGap) ? options.siblingGap : 124,
    alignmentTargets: options.alignmentTargets || {}
  };

  const sourceRoot = options.root || dataset.root;
  const tree = createBrtTree(cloneTree(sourceRoot));
  firstWalk(tree, resolvedOptions, 1);

  const positionedNodes = [];
  const rawLinks = [];
  secondWalk(tree, 0, 0, positionedNodes, rawLinks);
  normalizeLayout(positionedNodes);

  positionedNodes.forEach((node) => {
    node.x = 120 + node.xRaw * resolvedOptions.siblingGap;
    node.y = 100 + node.depth * resolvedOptions.levelGap;
    node.radius = 14 + Math.min(14, Math.sqrt(node.subtreeSize) * 3 + node.weight * 1.8);
  });

  const nodeMap = new Map(positionedNodes.map((node) => [node.id, node]));
  const positionedLinks = rawLinks.map((link) => ({
    source: nodeMap.get(link.source),
    target: nodeMap.get(link.target)
  }));

  const maxX = Math.max(...positionedNodes.map((node) => node.x));
  const minX = Math.min(...positionedNodes.map((node) => node.x));
  const maxY = Math.max(...positionedNodes.map((node) => node.y));

  return {
    dataset,
    options: resolvedOptions,
    nodes: positionedNodes,
    links: positionedLinks,
    stats: summarizeTree(sourceRoot),
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

export function buildInsight(layout) {
  const scenario = scenarios[layout.options.scenario];
  const recommended = scenario.recommendedAlignment;
  const isMatching = recommended === layout.options.alignment;
  const mode = layout.options.alignment;

  let emphasis = "父节点保持在子节点区间的中心，整体更稳定。";

  if (mode === "weighted") {
    emphasis = "父节点直接对齐到权重最高的子节点。";
  } else if (mode === "subtree") {
    emphasis = "父节点直接对齐到子树规模最大的子节点。";
  } else if (mode === "deepest") {
    emphasis = "父节点直接对齐到向下延展最深的子节点。";
  }

  return {
    title: scenario.label,
    badge: scenario.badge,
    summary: scenario.summary,
    researchQuestion: scenario.researchQuestion,
    recommendation: alignmentModes.find((item) => item.id === recommended)?.label || recommended,
    note: isMatching
      ? "当前策略与任务推荐一致。"
      : "当前策略与任务推荐不一致，这正适合用来比较视觉偏差。",
    emphasis
  };
}
