const d3 = window.d3;

const alignmentModes = [
  { id: "center", label: "中点对齐" },
  { id: "weighted", label: "高权重节点对齐" },
  { id: "subtree", label: "大子树节点对齐" },
  { id: "deepest", label: "最深子树对齐" }
];

const scenarios = {
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

const taskActions = [
  {
    id: "identify",
    label: "识别",
    summary: "面向单个目标或单个结构特征的判断。"
  },
  {
    id: "compare",
    label: "比较",
    summary: "面向两个或多个候选目标之间的对照。"
  }
];

const taskTargets = [
  {
    id: "tree",
    label: "树",
    summary: "关注整棵树的整体形态与平衡。"
  },
  {
    id: "node",
    label: "节点",
    summary: "关注单个节点的重要性或显著性。"
  },
  {
    id: "subtree",
    label: "子树",
    summary: "关注分支规模、覆盖范围与局部结构容量。"
  },
  {
    id: "path",
    label: "路径",
    summary: "关注最长路径、跳数与层级深度。"
  }
];

const scenarioMatrix = {
  tree: {
    identify: "tree-identify",
    compare: "tree-compare"
  },
  node: {
    identify: "node-identify",
    compare: "node-compare"
  },
  subtree: {
    identify: "subtree-identify",
    compare: "subtree-compare"
  },
  path: {
    identify: "path-following",
    compare: "path-compare"
  }
};

const scenarioGuides = {
  "tree-identify": {
    demands: [
      "整体轮廓要尽量稳定，便于读出树是否平衡、偏斜或展开不均。",
      "父节点位置最好不要引入额外偏置，让观察重点留在结构本身。",
      "左右宽度与层级分布需要保持可直接比较。"
    ],
    limitation:
      "当前 demo 还没有直接优化 compactness，只是先通过父节点锚点变化观察整体轮廓。"
  },
  "tree-compare": {
    demands: [
      "不同布局状态之间的整体宽度、平衡性和展开方向要容易对照。",
      "父节点位置应尽量中性，减少不必要的视觉偏移。",
      "整体层级关系需要保持稳定，方便做轮廓比较。"
    ],
    limitation:
      "当前 demo 还没有引入真正的任务目标加权，只先用对齐方式观察整体形态差异。"
  },
  "node-identify": {
    demands: [
      "重要节点要更容易成为视觉锚点，便于快速定位。",
      "局部结构不应把注意力过多拉回父节点中点。",
      "需要让高权重或高显著节点更早进入观察路径。"
    ],
    limitation:
      "当前 demo 还没有加入局部强调或显著性强化，只先观察父节点朝关键节点偏移是否有帮助。"
  },
  "node-compare": {
    demands: [
      "候选节点之间的相对重要性要更容易读出。",
      "布局应帮助视线更快落到被比较的关键节点上。",
      "无关分支带来的视觉干扰需要尽量减少。"
    ],
    limitation:
      "当前 demo 还没有控制局部分离或标签强调，只先用锚点偏移观察节点比较是否更直接。"
  },
  "subtree-identify": {
    demands: [
      "主导子树的体量、覆盖范围和结构容量要更容易暴露。",
      "父节点位置应帮助读出哪一侧是更大的子树。",
      "子树边界与展开宽度关系需要尽量清楚。"
    ],
    limitation:
      "当前 demo 还没有显式分配更多子树空间，只先观察父节点对齐到大子树后的轮廓变化。"
  },
  "subtree-compare": {
    demands: [
      "被比较子树之间要更容易形成对照。",
      "理想状态下需要更强的 separation、alignment 和 symmetry。",
      "节点数与覆盖范围的差异应尽量直接可见。"
    ],
    limitation:
      "当前 demo 还没有真的拉开子树间距，只先通过大子树对齐观察比较是否更顺手。"
  },
  "path-following": {
    demands: [
      "主路径要更连续，视线能够顺着层级自然向下跟踪。",
      "最深延展方向需要尽量明确，减少分支干扰。",
      "布局应帮助快速识别哪条根到叶路径最长。"
    ],
    limitation:
      "当前 demo 还没有优化 path continuity 或路径周围留白，只先观察最深分支对齐的效果。"
  },
  "path-compare": {
    demands: [
      "两条候选路径的深度差异要更容易读出。",
      "需要更清楚的纵向延展感和路径分离感。",
      "父节点位置应帮助比较不同路径的终点深度。"
    ],
    limitation:
      "当前 demo 还没有直接控制路径分离和连续性，只先用最深分支对齐做第一轮观察。"
  }
};

const taskReference = {
  "tree-identify": {
    metrics: ["整体稳定性", "平衡性可读性", "轮廓中性"],
    approximation: "先用中点对齐，尽量减少父节点额外偏移，让观察重点留在整体结构。"
  },
  "tree-compare": {
    metrics: ["整体形态对照", "展开宽度比较", "层级关系稳定"],
    approximation: "先用中点对齐作为基线，避免因为锚点偏移干扰不同树形之间的比较。"
  },
  "node-identify": {
    metrics: ["关键节点显著性", "视觉锚点清晰度", "定位效率"],
    approximation: "先用高权重节点对齐，把父节点拉向更重要的分支，观察关键节点是否更快进入视线。"
  },
  "node-compare": {
    metrics: ["候选节点重要性比较", "注意力聚焦", "无关分支干扰控制"],
    approximation: "先用高权重节点对齐，让视线更早落到可能被比较的关键节点附近。"
  },
  "subtree-identify": {
    metrics: ["主导子树体量感", "覆盖范围可读性", "结构容量暴露"],
    approximation: "先用大子树对齐，把父节点拉向规模更大的分支，观察主导子树是否更容易被识别。"
  },
  "subtree-compare": {
    metrics: ["子树 separation", "子树 alignment", "局部 symmetry"],
    approximation: "先用大子树对齐做第一轮近似，让父节点更偏向主要子树，再观察比较是否更直接。"
  },
  "path-following": {
    metrics: ["路径连续性", "最深方向清晰度", "分支干扰抑制"],
    approximation: "先用最深子树对齐，把父节点向主路径偏移，观察最长路径方向是否更自然。"
  },
  "path-compare": {
    metrics: ["路径深度对照", "纵向延展感", "路径分离感"],
    approximation: "先用最深子树对齐近似路径任务，帮助读出不同候选路径的终点深度差异。"
  }
};

const extraLayoutFactors = [
  "子树间距：overview 可以更紧凑，subtree comparison 可以把目标子树拉开。",
  "层间距：depth 和 path 任务通常更需要更大的纵向间隔。",
  "子树空间分配：给重要子树或目标路径更多横向预算。",
  "子树顺序：在兄弟顺序没有语义约束时，可尝试把更重要或更大的子树放到更利于观察的位置。",
  "分支几何：调整边的走向和连续性，帮助路径跟踪。",
  "标签显隐与局部强调：根据任务突出关键节点、子树或路径。"
];

const datasets = {
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

function normalizeWeight(weight) {
  return Number.isFinite(weight) && weight > 0 ? weight : 1;
}

function cloneTree(node) {
  return {
    id: node.id,
    label: node.label,
    weight: normalizeWeight(node.weight),
    children: (node.children || []).map(cloneTree)
  };
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

function summarizeTree(root) {
  const annotated = createBrtTree(cloneTree(root));
  const nodes = [];
  const links = [];
  flatten(annotated, nodes, links);

  const internalNodes = nodes.filter((node) => node.children.length > 0);
  const avgBranching =
    internalNodes.length === 0
      ? 0
      : internalNodes.reduce((sum, node) => sum + node.children.length, 0) / internalNodes.length;

  return {
    nodeCount: nodes.length,
    maxDepth: Math.max(...nodes.map((node) => node.depth)),
    leafCount: nodes.filter((node) => node.children.length === 0).length,
    avgBranchingFactor: avgBranching,
    maxSubtreeSize: Math.max(...nodes.map((node) => node.subtreeSize))
  };
}

function buildLayout(datasetId, options = {}) {
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
    siblingGap: Number.isFinite(options.siblingGap) ? options.siblingGap : 124
  };

  const tree = createBrtTree(cloneTree(dataset.root));
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
    stats: summarizeTree(dataset.root),
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

function buildInsight(layout) {
  const scenario = scenarios[layout.options.scenario];
  const recommended = scenario.recommendedAlignment;
  const isMatching = recommended === layout.options.alignment;
  const mode = layout.options.alignment;

  let emphasis = "父节点保持在子节点区间的中心，整体更稳定。";

  if (mode === "weighted") {
    emphasis = "父节点会向高权重分支偏移，更强调语义重要性。";
  } else if (mode === "subtree") {
    emphasis = "父节点会向规模更大的子树靠近，适合突出结构差异。";
  } else if (mode === "deepest") {
    emphasis = "父节点会向最深延展分支靠近，适合突出长路径阅读。";
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

function getScenarioId(actionId, targetId) {
  return scenarioMatrix[targetId]?.[actionId] || "tree-identify";
}

function applyScenarioSelection(nextState, scenarioId) {
  const scenario = scenarios[scenarioId];
  nextState.scenario = scenarioId;
  nextState.alignment = scenario.recommendedAlignment;
  nextState.lambda = scenario.defaults.lambda;
  nextState.weightInfluence = scenario.defaults.weightInfluence;
}

const initialScenarioId = getScenarioId("identify", "tree");
const state = {
  dataset: "weighted",
  action: "identify",
  target: "tree",
  scenario: initialScenarioId,
  alignment: scenarios[initialScenarioId].recommendedAlignment,
  lambda: scenarios[initialScenarioId].defaults.lambda,
  weightInfluence: scenarios[initialScenarioId].defaults.weightInfluence
};

const dom = {
  actionButtons: document.getElementById("action-buttons"),
  targetButtons: document.getElementById("target-buttons"),
  taskLine: document.getElementById("task-line"),
  taskSummary: document.getElementById("task-summary"),
  taskDemands: document.getElementById("task-demands"),
  taskAlignmentRole: document.getElementById("task-alignment-role"),
  taskLimitation: document.getElementById("task-limitation"),
  taskReferenceBody: document.getElementById("task-reference-body"),
  extraFactors: document.getElementById("extra-factors"),
  datasetButtons: document.getElementById("dataset-buttons"),
  alignmentButtons: document.getElementById("alignment-buttons"),
  statsLine: document.getElementById("stats-line"),
  tooltip: document.getElementById("tooltip"),
  svg: document.getElementById("tree-svg")
};

const svg = d3.select(dom.svg);
const viewport = svg.select(".viewport");
const linkLayer = viewport.select(".links");
const nodeLayer = viewport.select(".nodes");

let hoveredId = null;
let currentLayout = null;
let shouldFitView = true;

const zoom = d3
  .zoom()
  .scaleExtent([0.45, 2.8])
  .on("zoom", (event) => {
    viewport.attr("transform", event.transform);
  });

svg.call(zoom).on("dblclick.zoom", null);

function getAlignmentExplanation(alignmentId, scenarioId) {
  if (alignmentId === "center") {
    return "父节点保持在子节点中点。";
  }

  if (alignmentId === "weighted") {
    return "父节点直接对齐到权重最高的子节点。";
  }

  if (alignmentId === "subtree") {
    return "父节点直接对齐到子树规模最大的子节点。";
  }

  if (alignmentId === "deepest") {
    return "父节点直接对齐到向下延展最深的子节点。";
  }
  return "";
}

function getAlignmentRole(alignmentId) {
  if (alignmentId === "center") {
    return "当前先用中点对齐，让父节点尽量保持中性位置，便于观察整体轮廓和基线结构。";
  }

  if (alignmentId === "weighted") {
    return "当前先用高权重节点对齐，把父节点拉向更重要的分支，观察关键节点是否更快成为视觉锚点。";
  }

  if (alignmentId === "subtree") {
    return "当前先用大子树对齐，把父节点拉向规模更大的分支，观察子树体量差异是否更容易被读出。";
  }

  if (alignmentId === "deepest") {
    return "当前先用最深子树对齐，把父节点拉向更深的分支，观察主路径方向是否更明确。";
  }

  return "";
}

function updateTaskGuide() {
  const scenario = scenarios[state.scenario];
  const guide = scenarioGuides[state.scenario];
  const alignmentLabel =
    alignmentModes.find((item) => item.id === state.alignment)?.label || state.alignment;
  const isRecommended = state.alignment === scenario.recommendedAlignment;

  dom.taskSummary.textContent = scenario.summary;
  dom.taskDemands.innerHTML = "";

  guide.demands.forEach((demand) => {
    const item = document.createElement("li");
    item.textContent = demand;
    dom.taskDemands.appendChild(item);
  });

  dom.taskAlignmentRole.textContent = `${alignmentLabel}：${getAlignmentRole(state.alignment)}${
    isRecommended ? " 这也是当前任务的推荐观察方式。" : " 这不是当前任务的默认推荐，更适合拿来做对照。"
  }`;
  dom.taskLimitation.textContent = guide.limitation;
}

function renderTaskReference() {
  dom.taskReferenceBody.innerHTML = "";

  Object.values(scenarios).forEach((scenario) => {
    const reference = taskReference[scenario.id];
    const recommendedAlignment =
      alignmentModes.find((item) => item.id === scenario.recommendedAlignment)?.label ||
      scenario.recommendedAlignment;
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${scenario.label}</td>
      <td>${reference.metrics.join(" / ")}</td>
      <td>${recommendedAlignment}</td>
      <td>${reference.approximation}</td>
    `;

    dom.taskReferenceBody.appendChild(row);
  });

  dom.extraFactors.innerHTML = "";
  extraLayoutFactors.forEach((factor) => {
    const item = document.createElement("li");
    item.textContent = factor;
    dom.extraFactors.appendChild(item);
  });
}

function buildButton(container, items, activeId, onClick) {
  container.innerHTML = "";

  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `option-button${item.id === activeId ? " active" : ""}`;
    button.innerHTML = `
      <span class="option-button__label">${item.label}</span>
      ${item.meta ? `<span class="option-button__meta">${item.meta}</span>` : ""}
    `;
    button.addEventListener("click", () => onClick(item.id));
    container.appendChild(button);
  });
}

function updateControls() {
  buildButton(
    dom.actionButtons,
    taskActions.map((item) => ({
      id: item.id,
      label: item.label,
      meta: item.id === state.action ? item.summary : ""
    })),
    state.action,
    (actionId) => {
      state.action = actionId;
      applyScenarioSelection(state, getScenarioId(state.action, state.target));
      render();
    }
  );

  buildButton(
    dom.targetButtons,
    taskTargets.map((item) => ({
      id: item.id,
      label: item.label,
      meta: item.id === state.target ? item.summary : ""
    })),
    state.target,
    (targetId) => {
      state.target = targetId;
      applyScenarioSelection(state, getScenarioId(state.action, state.target));
      render();
    }
  );

  const currentScenario = scenarios[state.scenario];
  const currentRecommendation =
    alignmentModes.find((item) => item.id === currentScenario.recommendedAlignment)?.label ||
    currentScenario.recommendedAlignment;
  dom.taskLine.textContent = `当前任务：${currentScenario.label}。推荐对齐：${currentRecommendation}。`;
  updateTaskGuide();

  buildButton(
    dom.datasetButtons,
    Object.values(datasets).map((item) => ({
      id: item.id,
      label: item.label,
      meta: item.id === state.dataset ? item.description : ""
    })),
    state.dataset,
    (datasetId) => {
      state.dataset = datasetId;
      hoveredId = null;
      hideTooltip();
      shouldFitView = true;
      render();
    }
  );

  buildButton(
    dom.alignmentButtons,
    alignmentModes.map((item) => ({
      id: item.id,
      label: item.label,
      meta:
        item.id === state.alignment
          ? getAlignmentExplanation(item.id, state.scenario)
          : ""
    })),
    state.alignment,
    (alignmentId) => {
      state.alignment = alignmentId;
      render();
    }
  );
}

function updateStats(stats) {
  const currentDataset = datasets[state.dataset];
  dom.statsLine.textContent = `当前数据：${currentDataset.label}。节点总数 ${stats.nodeCount}，最大深度 ${stats.maxDepth}，叶节点数 ${stats.leafCount}，平均分支度 ${stats.avgBranchingFactor.toFixed(2)}，最大子树规模 ${stats.maxSubtreeSize}。`;
}

function currentEmphasisSet(nodes) {
  const emphasis = new Set();
  const root = nodes.find((node) => node.parentId === null);
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const getChildren = (node) => (node.childIds || []).map((id) => nodeMap.get(id)).filter(Boolean);

  if (!root) {
    return emphasis;
  }

  if (state.alignment !== "center") {
    emphasis.add(root.id);
    const targetChild = getAnchorChild(getChildren(root), state);
    if (targetChild) {
      emphasis.add(targetChild.id);
    }
  }

  return emphasis;
}

function showTooltip(event, node) {
  dom.tooltip.classList.remove("hidden");
  dom.tooltip.innerHTML = `
    <strong>${node.label}</strong>
    <p>depth ${node.depth} · weight ${node.weight.toFixed(2)} · subtree ${node.subtreeSize}</p>
  `;
  dom.tooltip.style.left = `${event.offsetX + 18}px`;
  dom.tooltip.style.top = `${event.offsetY + 18}px`;
}

function hideTooltip() {
  dom.tooltip.classList.add("hidden");
}

function linkPath(link) {
  const sourceX = link.source.x;
  const sourceY = link.source.y + link.source.radius * 0.15;
  const targetX = link.target.x;
  const targetY = link.target.y - link.target.radius * 0.75;

  return `M ${sourceX} ${sourceY} L ${targetX} ${targetY}`;
}

function fitToView(layout) {
  const rect = dom.svg.getBoundingClientRect();

  if (!rect.width || !rect.height) {
    return;
  }

  const padding = 100;
  const scale = Math.min(
    (rect.width - padding) / layout.bounds.width,
    (rect.height - padding) / layout.bounds.height,
    1.15
  );

  const tx = rect.width / 2 - (layout.bounds.minX + layout.bounds.width / 2) * scale;
  const ty = rect.height / 2 - (layout.bounds.minY + layout.bounds.height / 2) * scale + 30;
  const transform = d3.zoomIdentity.translate(tx, ty).scale(scale);

  svg.transition().duration(720).call(zoom.transform, transform);
}

function renderTree(layout) {
  const emphasisSet = currentEmphasisSet(layout.nodes);
  const transition = d3.transition().duration(680).ease(d3.easeCubicInOut);

  const links = linkLayer.selectAll(".link-path").data(layout.links, (link) => link.target.id);

  links
    .enter()
    .append("path")
    .attr("class", "link-path")
    .attr("d", linkPath)
    .style("opacity", 0)
    .merge(links)
    .transition(transition)
    .style("opacity", 1)
    .attr("d", linkPath);

  links.exit().transition(transition).style("opacity", 0).remove();

  const nodes = nodeLayer.selectAll(".node-group").data(layout.nodes, (node) => node.id);

  const nodeEnter = nodes
    .enter()
    .append("g")
    .attr("class", "node-group")
    .attr("transform", (node) => `translate(${node.x}, ${node.y})`)
    .style("opacity", 0)
    .on("mouseenter", (event, node) => {
      hoveredId = node.id;
      showTooltip(event, node);
      renderTree(currentLayout);
    })
    .on("mousemove", (event, node) => {
      showTooltip(event, node);
    })
    .on("mouseleave", () => {
      hoveredId = null;
      hideTooltip();
      renderTree(currentLayout);
    });

  nodeEnter.append("circle").attr("class", "node-shell");
  nodeEnter.append("circle").attr("class", "node-core");
  nodeEnter.append("text").attr("dy", 5).text((node) => node.label);

  nodeEnter
    .merge(nodes)
    .classed("is-emphasis", (node) => emphasisSet.has(node.id))
    .classed("is-hovered", (node) => node.id === hoveredId)
    .transition(transition)
    .style("opacity", 1)
    .attr("transform", (node) => `translate(${node.x}, ${node.y})`);

  nodeEnter
    .merge(nodes)
    .select(".node-shell")
    .transition(transition)
    .attr("r", (node) => node.radius + 5);

  nodeEnter
    .merge(nodes)
    .select(".node-core")
    .transition(transition)
    .attr("r", (node) => node.radius);

  nodeEnter
    .merge(nodes)
    .select("text")
    .transition(transition)
    .attr("dy", (node) => node.radius + 18);

  nodes.exit().transition(transition).style("opacity", 0).remove();

  if (shouldFitView) {
    fitToView(layout);
    shouldFitView = false;
  }
}

function render() {
  updateControls();
  currentLayout = buildLayout(state.dataset, state);
  updateStats(currentLayout.stats);
  renderTree(currentLayout);
}

window.addEventListener("resize", () => {
  shouldFitView = true;
  if (currentLayout) {
    renderTree(currentLayout);
  }
});

renderTaskReference();
render();
