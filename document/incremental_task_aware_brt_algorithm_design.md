# Interaction-driven / Task-conditioned Incremental BRT：算法设计 Prompt

> **重要：本文件为算法设计基准文档。在没有用户明确指令的情况下，不得随意修改、重写、覆盖或删除本文件内容。**

版本：v1.0；日期：2026-09-22。面向：负责工程实现的 coder agent。

## 0. 实现任务与研究边界

请在现有项目架构内实现一个 **local greedy incremental BRT** 原型：以标准 BRT（Buchheim 改进的 Reingold–Tilford tidy-tree）生成初始布局，由显式分析任务和交互焦点驱动局部 O/A/S 调整，生成稳定、可解释、可复现的目标布局。

先阅读项目说明、现有布局、数据模型、渲染和交互代码，复用现有模块；下文接口是逻辑契约，不要求另建一套技术栈。本轮设计交付不要求立即实现算法。后续实现时，不得以工程便利为由静默更改本文件定义；偏差写入独立实现记录，研究定义冲突须提交用户决定。

核心分工：**Task 决定优化哪些 perceptual metrics；Interaction 决定在哪里优化。** 权重随树上的区域变化，而不是只使用全树统一权重。第一版只实现显式 Compare 与 Trace，不做任务自动推断、强化学习、模拟退火、通用约束求解器或全局多目标优化。

本文给出可实现的几何代理指标和默认启发式，不宣称其已经证实能提高人的任务表现，也不宣称文献中不存在同类方法。标准 BRT 是基线；修改父子对齐后的布局是受约束的 BRT 扩展，不再声称满足经典 tidy 的全部对称性与居中性质。

## 1. 简单算法流程描述

算法思想：先得到标准 BRT 布局，再将任务需求转换为局部几何损失。用户选择比较对象或追踪路径后，在焦点及有限邻域提高相应指标权重；只试少量局部操作，保留能改善目标且满足硬约束的操作。每轮还惩罚相对上一目标布局的移动，最后动画呈现新目标。

1. **初始化**：校验树，建立索引与节点尺寸，以标准 BRT 计算初始位置，保存初始顺序和布局。
2. **确定任务与焦点**：Compare 选择两个待比较子树；Trace 选择终点（默认根到终点）或指定祖先与后代。
3. **选择区域**：提取局部可编辑区域、会被联动移动的节点、固定边界；超预算则缩小区域或保持现状。
4. **构建权重场**：按任务选择指标，按到焦点的树距离衰减，生成 W(region, metric)。
5. **局部贪心搜索**：产生 sibling swap/insertion、parent–child anchor adjustment、local spacing increase/decrease 候选，局部重布局并验证约束。
6. **评估与接受**：比较任务损失、tidy 软约束及相对上一布局的移动代价，只接受严格改善的可行候选；达到时间、操作或迭代预算立即停止。
7. **提交与动画**：原子提交最优可行目标，使用连续动画呈现；新交互到来时取消过期计算并重新取当前显示状态作为动画起点。

```text
Tree → Standard BRT → Previous target layout
                         ↓
Explicit Task → Metric profile ─┐
Interaction → Focus / Region ──┼→ W(region, metric)
                              ↓
                 Bounded O/A/S candidates
                              ↓
             Local layout → Hard-constraint check
                              ↓
        Task loss + Tidy loss + Stability cost
                              ↓
              Greedy accept / Budget stop
                              ↓
                   Commit target → Animate
```

## 2. 输入、输出和不变量

### 2.1 输入和坐标约定

- 输入为单棵有根树，稳定 nodeId、父子关系、原始 children 顺序、节点包围盒、可选语义排序约束及 Compare 对应关系。
- MVP 使用自上而下布局：x 为水平位置，y 由 depth 唯一决定。采用固定层距 H，要求 H ≥ 最大节点高度 + verticalGap。节点尺寸包括标签占用空间。
- 节点尺寸在一轮优化内固定；统一使用布局坐标，摄像机缩放不改变指标值。
- 边使用父底部中心到子顶部中心的直线；如项目采用折线/曲线，必须根据实际路由切线重定义 Trace 指标，不能直接沿用直线公式却声称测量渲染路径。

输出为新目标坐标、O/A/S 参数、受影响节点集、损失分解、预算统计和停止原因。可无改动返回，禁止为制造视觉反馈而接受劣化动作。

### 2.2 硬约束

1. hierarchy：不改 nodeId、父子关系、节点数，不把节点移动到另一父节点。
2. level：depth 和该层 y 不变。
3. non-overlap / minimum separation：节点包围盒不重叠，同层相邻节点边界距离 ≥ minGap；相邻兄弟子树在共同深度上的轮廓也须满足此间距。
4. semantic order：严格有序父节点禁止重排；部分顺序使用 precedence DAG 验证所有要求；无约束才允许任意兄弟重排。语义缺失时默认保持输入顺序，须由数据适配层明确标记可重排。
5. region boundary：活动区域之外节点的位置和局部参数不变；任何联动移动都必须计入区域和预算。
6. 可视拓扑：保持子树连续性，禁止新增边交叉或边穿过非端点节点。候选的几何验证不得仅检查节点中心。

经典“父位于最左/最右子节点中点”在本方案中为**软偏好**，否则 A 无法优化。硬约束要求父节点锚点处于直接孩子中心跨度内；单子节点默认与孩子对齐。镜像与同构子树完全一致不作为自适应布局的硬约束。不能把任何上述硬约束转成大权重惩罚后允许违反。

## 3. 数据结构与模块接口

以下为语言无关的 TypeScript 风格契约；按现有项目映射实现。

```ts
type TaskKind = 'Compare' | 'Trace';
type NodeId = string;
interface TreeNode {
  id: NodeId; parentId: NodeId | null; children: NodeId[];
  width: number; height: number;
  orderPolicy: 'fixed' | 'free' | 'partial';
  precedence: Array<[NodeId, NodeId]>; // 本节点的孩子之间的先后关系
}
interface TreeIndex {
  depth: Map<NodeId, number>;
  parent: Map<NodeId, NodeId | null>;
  preorder: NodeId[];
  subtreeRange: Map<NodeId, [number, number]>;
  // 另缓存 subtreeSize、逐层轮廓、LCA 查询所需结构
}
interface TaskContext {
  kind: TaskKind;
  compare?: { rootA: NodeId; rootB: NodeId;
              matches: Array<[NodeId, NodeId]> };
  trace?: { start: NodeId; end: NodeId; path: NodeId[] };
}
interface FocusState {
  seeds: NodeId[]; revision: number;
  source: 'selection' | 'path-selection' | 'hover';
}
interface LayoutPolicy {
  order: Map<NodeId, NodeId[]>;       // O：显示顺序，不修改原始数据
  anchor: Map<NodeId, number>;        // A：alpha ∈ [0,1]，默认 0.5
  gapExtra: Map<string, number>;      // S：相邻兄弟 ID 对 → 附加间距 ≥ 0
}
interface LayoutState {
  initial: Map<NodeId, Point>;        // 初始标准 BRT
  target: Map<NodeId, Point>;         // 最近提交的目标
  display: Map<NodeId, Point>;        // 当前实际显示，独立于 target
  policy: LayoutPolicy; revision: number; treeVersion: number;
}
interface Region {
  editableParents: Set<NodeId>;
  movableNodes: Set<NodeId>;
  fixedBoundaryNodes: Set<NodeId>;
  blockRoots: NodeId[];              // 不相交、根位置固定的完整子树块
}
interface MetricTerm {
  id: string; kind: MetricKind;
  support: NodeId[];                 // 几何依赖节点，可跨两个比较区域
  focusDistance: number; weight: number;
}
interface OptimizeResult {
  target: Map<NodeId, Point>; policy: LayoutPolicy;
  changedIds: NodeId[]; acceptedActions: Action[];
  lossesBefore: LossBreakdown; lossesAfter: LossBreakdown;
  stopReason: string; elapsedMs: number; evaluatedCount: number;
}
```

模块职责：

| 接口 | 职责 |
|---|---|
| validateAndIndex(tree) | 验证单根、无环、ID 唯一、语义顺序与节点尺寸，建立索引 |
| computeBaselineBRT(tree, sizes) | 保留原顺序、默认居中、最小间距，生成基线 |
| resolveTaskAndFocus(event, state) | 生成显式任务实例与焦点，不通过 hover 猜任务 |
| buildRegion(index, task, focus, budget) | 构建完整可移动块和固定边界，检查闭包预算 |
| buildMetricTerms(task, region, snapshot) | 固定本轮指标项、依赖集、归一化常数与权重 |
| generateActions(policy, region, task) | 确定性枚举少量 O/A/S 操作 |
| relayoutLocal(snapshot, action, region) | 在临时副本中实现参数修改、局部轮廓打包 |
| checkHardConstraints(candidate, boundary) | 检查完整变化闭包和边界，返回可行性与原因 |
| evaluate(candidate, frozenProblem) | 返回任务、tidy、movement、order 等损失分解 |
| optimizeLocal(frozenProblem, cancelToken) | 有预算的贪心接受，不读写动画状态 |
| commitAndAnimate(result, revision) | 检查版本后提交；动画可被新交互打断 |

## 4. 具体算法步骤

### 步骤 1：建立标准 BRT 基线

校验输入并调用已有标准 BRT；默认 alpha=0.5、gapExtra=0。如果现有实现只支持等尺寸节点，使用统一包围盒 maxWidth/maxHeight 作为 MVP 尺寸，不能忽略真实标签而声称无重叠。保存 initial、target、display 三份逻辑状态。初始条件不满足硬约束时先修复布局适配器，不启动局部优化。

### 步骤 2：解析任务实例

**Compare**：MVP 允许同深度、互不包含的两个子树。对应关系优先由数据提供的稳定语义键或用户显式 matches 给出；对应必须一对一。只纳入相对深度相同的匹配项。无有效对应时保持布局，报告 missing-correspondence，不以当前左右索引猜对应。未匹配节点保留并可高亮真实差异，不删除或合并以提高指标。自动树匹配、不同深度与祖先包含比较属于后续扩展。

**Trace**：单选节点时形成 root→node 路径；双端点模式要求 start 是 end 的祖先，沿 parent 索引恢复路径。MVP 不支持经 LCA 折返的任意节点对路径，非法输入返回 unsupported-path。路径过长时只优化终点附近的受限窗口，保留完整路径高亮并报告实际优化覆盖范围。

任务类型和任务实例分开：用户可以先切换 Compare/Trace，再选择目标。没有有效目标时仅更新工具模式，不执行全树优化。清空 focus 停止自适应并保留当前布局；“恢复标准 BRT”是独立显式操作，不在每次取消选择时全树回弹。

### 步骤 3：确定局部区域及依赖闭包

1. Compare 焦点种子取参与匹配的节点及两棵子树根；Trace 取所选路径节点。按树距离构建半径 r 的关注邻域。
2. 邻域只决定候选优先级，**不能直接当成完整移动集合**。移动子树根会影响全部后代，必须纳入预算。
3. MVP 选择少量互不重叠的完整子树块：固定每个块根的绝对坐标，允许调整块内孩子的 O/A/S。默认优先 focus 附近的小块，必要时使用兄弟的共同父节点作为块根。
4. 只有在某个父节点的全部子树重布局闭包可以容纳时，才允许该父节点的动作。根层或高出度动作超过预算时跳过；不得移动被截断子树的一部分。
5. 大 Compare 子树可只编辑其内部的小块；匹配指标的另一端可以固定在块外。双方不能都动不构成错误，是否改善由实际损失决定。
6. 固定块根的父边；缓存活动块外同层最近轮廓及相邻子树边界，作为不可穿越障碍。若局部扩张越界，拒绝候选，不递归推挤整棵树。
7. 固定本轮的 region、metric support、权重与归一化尺度；接受动作后只更新几何值，不改题目、扩大区域或降低难度。

### 步骤 4：构建空间变化权重场

树距离 d(u,v)=depth(u)+depth(v)−2depth(LCA(u,v))。对焦点集合 F，定义：

```text
dF(v) = min distanceTree(v, f), f ∈ F
q(v)  = exp(-dF(v)/sigma)    if dF(v) <= radius
        0                  otherwise
W(v,k) = base[k] + gain[k] * taskProfile[task,k] * q(v)
```

region 在实现中可以是节点、分支、路径三元组或对应关系，**不要求预先划分互斥矩形区域**。对一个指标项 i，使用 q_i=max(q(v):v∈support_i)，令 w_i=base[k]+gain[k]·profile[k]·q_i。Compare 跨两个区域的匹配项以两端的共同依赖集登记，只计一次。

默认 radius=3、sigma=1.5、gain=1。任务 profile：Compare 的 correspondence=1、alignment=0.6、ordering=0.8；Trace 的 continuity=1、ambiguity=0.8；非当前任务指标权重为 0。以上为可配置启动值，不是实证最优值。tidy 和 stability 单列，避免与 task profile 混为一谈。

远离焦点的任务基础权重 MVP 为 0；背景形态靠固定边界与稳定性保留。不要对每个节点把 W 的指标权重归一化为和为 1，否则会抵消树距离衰减。

### 步骤 5：计算具体 metric

所有项定义为 **越低越好** 的无量纲 loss。设 sX=max(minGap+典型节点宽度,1)，在本轮开始时冻结；clamp01(t)=min(1,max(0,t))。尺度不得随候选布局变化，否则可通过拉伸/压缩分母作弊。下列指标是工程代理，配置与日志必须保留其定义版本。

**Compare / correspondence**：对匹配 (u,v)，根分别为 a,b：

```text
localX(u)=x(u)-x(a), localX(v)=x(v)-x(b)
l_corr(u,v)=clamp01(abs(localX(u)-localX(v))/sX)
```

衡量对应节点相对各自子树根的水平组织一致性。不能使用 abs(x(u)-x(v))，因为并排子树不应被迫占据同一绝对坐标。分层 y 不可调整，MVP 仅使用相同相对深度的匹配。

**Compare / alignment**：若 u↔v 且 parent(u)↔parent(v) 也匹配，比较父子偏移：

```text
l_align(u,v)=clamp01(abs((x(u)-x(parent(u)))
                         -(x(v)-x(parent(v))))/sX)
```

根匹配不生成此项。它与 correspondence 有相关性，分别记日志并保留消融开关，不能把二者说成独立实证因素。

**Compare / ordering consistency**：对相互匹配的父节点，收集其共同匹配的孩子。每一对匹配关系 (u1,v1)、(u2,v2)，若两侧孩子显示 rank 的先后符号不同，记 1，否则 0；对固定项集合求平均。不足两对则该指标不适用。固定语义顺序仍优先于降低此损失。

**Trace / path continuity**：对路径连续三节点 (p,v,c)，使用实际边端点定义沿路径向下的入边向量 e_in 与出边向量 e_out：

```text
theta = acos(clamp(dot(normalize(e_in),normalize(e_out)), -1, 1))
l_cont(p,v,c)=theta/pi
```

直线延续为 0，转折越大损失越高。路径不足两条边时无此项。零长度边视为几何错误，不能让 NaN 进入优化。

**Trace / branch ambiguity**：在路径分支节点 v，下一路径孩子为 c。对每个其他孩子 s，比较从 v 底部中心到 c/s 顶部中心的方向夹角 phi：

```text
l_amb(v,c)=max over s != c of max(0, 1-phi(v,c,s)/thetaMin)
thetaMin = 15 degrees  // 可配置代理阈值
```

无竞争孩子记 0；竞争出边角度越相似，损失越大。该指标只近似视觉分支歧义，不等价于认知难度。不将路径“越竖直越好”作为唯一 Trace 目标。

**聚合**：每类指标先固定项集合 I_k；C_task=Σ_k [Σ_(i∈I_k) w_i·l_i / max(1,|I_k|)]。不要除以 Σw_i，否则会消除局部关注强度。不存在的项报告 N/A，其目标贡献为 0；接受动作后不增删项。

为控制 ordering 成对项数量，超上限时按稳定 ID 的固定哈希排序选取固定样本，并记录 exact=false、样本 ID；不得每次候选重新采样。依赖一端固定在边界外的项也必须更新。

### 步骤 6：定义 O/A/S 与局部重布局

**O**：对合法兄弟顺序枚举相邻 swap，或把一个孩子插入当前 rank±1/±2 的位置。禁止跨父节点移动。候选顺序先检查 semantic order；重排整棵孩子子树，不能只交换根坐标。

**A**：每个父节点 p 使用 alpha_p∈[0,1]：

```text
xPreferred(p)=(1-alpha_p)*x(firstChild)+alpha_p*x(lastChild)
```

默认 0.5；候选为当前 alpha±0.1、0.5，以及焦点孩子在当前孩子跨度内对应的 alpha（跨度为零时仅 0.5）。截断到 [0,1] 并去重。这表示父子锚点政策，不是布局之后随意拖动父节点。

**S**：相邻兄弟子树之间所需空白为 minGap+extra，extra≥0；候选 extra±0.25*sX，默认上限 2*sX。减少只能撤销已有附加空白，不能低于 minGap。pair key 使用有序孩子 ID 对；重排后保留仍相邻的键，新增相邻对 extra=0，移除失效键，不把间距错误绑定到数组下标。

局部布局内核采用 BRT 风格的逐层轮廓打包：

1. 对活动块自底向上布局孩子，按 O 顺序安排孩子子树。
2. 放置下一个孩子时，对所有共同相对深度计算 leftPlacedContour + requiredGap − rightCandidateLeftContour 的最大正差，将该子树整体向右平移；轮廓包括节点宽度。
3. 按 A 得到父节点位置，更新含父节点的轮廓；单孩子父子中心一致。
4. 块完成后整体平移，使块根回到上一目标的固定绝对位置。
5. 合并块外未变坐标，检查固定边界、节点、边及语义约束。失败直接拒绝，不做可能把区域扩大到全树的自动修复。

初始布局必须调用标准 BRT；上述局部参数化内核需单独标识。优先扩展已有 BRT 的 separation/anchor 接口，若难以安全复用，MVP 可在小块内使用易验证的轮廓实现；不得据此宣称每次交互仍具有标准 BRT 的全树线性时间保证。

### 步骤 7：目标函数与稳定性

令 L_prev 为本次事件开始时最近提交的目标布局，在整轮搜索中固定：

```text
J(L)= C_task(L; W)
    + lambdaCenter * C_center(L)
    + lambdaSpace  * C_space(L)
    + lambdaMove   * C_move(L,L_prev)
    + lambdaOrder  * C_order(O,O_prev)
```

- C_center：对可编辑父节点，abs(x(parent)−孩子首尾中点)/sX 的均值，保留适度 tidy 居中偏好。
- C_space：活动块所有相邻兄弟 gapExtra/sX 的和除以固定相邻对数量，抑制无限扩张。
- C_move：对固定 movableNodes，Σ μ_v·((x_v−x_prev_v)/sX)^2 / max(1,|movableNodes|)。默认 μ_v=1；可配置关注范围外的缓冲节点 μ_v=2。y 不变。
- C_order：当前显示顺序相对 O_prev 的归一化逆序数，在固定可编辑父节点集合上求均值，抑制重复换位。

建议起始权重：lambdaCenter=0.1、lambdaSpace=0.05、lambdaMove=0.3、lambdaOrder=0.1；均进入配置与日志，不写死在渲染层。硬约束不属于 J 的可交易部分。

task benefit 定义为 C_task(L_prev)−C_task(L_candidate)。候选接受须同时满足：J 降低超过 epsilon，且 C_task 不比当前已接受布局增大超过数值容差。可保留任务损失相等但 tidy 改善的动作。报告净任务收益，避免仅靠形态变化声称任务改善。

**Optimization stability** 是目标函数中相对固定 L_prev 的代价，用于控制最后移动多少；**animation continuity** 是从显示状态到目标状态的时序过渡，用于控制怎样移动。平滑动画不能替代稳定性损失，移动损失也不能保证动画不跳变。禁止每接受一步就把 L_prev 更新为该步，否则小步累加可绕过稳定性惩罚。

### 步骤 8：候选评估与停止

默认采用确定性 first-improvement greedy。按任务优先级排序：Compare 先 O/A 后 S；Trace 先 A/S 后 O。同类按焦点距离、稳定 ID 排序，每接受一次动作就重新生成当前状态的候选，从头扫描。可使用固定配置切换 best-improvement，但不能混用而不记录。

每个候选在临时快照中评估：参数合法性 → 完整联动闭包 → 局部重布局 → 硬约束 → 完整受影响 metric → J。失败不修改当前 best。MVP 可完整重算活动区域的指标，先保证正确，再做依赖缓存。

建议启动预算（需实测调参）：

| 配置 | 默认值 |
|---|---:|
| maxMovableNodes | 200 |
| maxEditableParents | 24 |
| maxMetricTerms | 1000 |
| maxCandidatesPerScan | 48 |
| maxCandidateEvaluationsPerEvent | 128 |
| maxAcceptedActions | 8 |
| maxScans | 9 |
| optimizeBudgetMs | 8 |
| epsilon | 1e-4 |
| animationDurationMs | 180 |

计时覆盖区域构建、指标构建和优化，而不仅是最后搜索循环；初始化索引和标准 BRT 单独计时。所有昂贵遍历须有节点/项上限与取消检查。对长路径不要先完整展开再截断；用父索引有界取窗口，完整高亮由独立渲染机制处理。预算在候选前后与内部循环检查；中途未完成验证的候选丢弃。

停止原因：no-improvement、time-budget、candidate-budget、action-budget、scan-budget、cancelled、empty-region、missing-correspondence、unsupported-path。超时返回本轮最后一个完整验证的 best，零动作时原样返回。8ms 是软目标，不是平台无关保证；记录 p50/p95/p99 及超预算次数。调小闭包或候选数优先于上复杂优化器。

### 步骤 9：提交、并发事件与动画

- selection、task change、path change 触发；hover 布局默认关闭，启用时要求停留 120ms 且 focus 实际改变；pan/zoom 只改变相机，不重布局。
- 每次新事件递增 revision，取消旧任务；同一帧事件合并，仅处理最新状态。treeVersion、尺寸版本和 revision 不匹配的结果不得提交。
- 本轮 L_prev 取已提交 target；动画起点取提交瞬间的 display。新事件发生在动画中时，从当时实际显示状态继续，不能从旧目标重新起步。
- 保序移动采用所有节点相同的进度 e(t)=3t²−2t³，x(t)=(1−e)x_display+e*x_target，y 固定。不得独立错峰插值破坏间距。固定顺序且端点可行时同层间距为线性约束，统一插值可保持它；边交叉/边穿节点仍需单独验证，不能只凭该结论推断全部约束。
- **O 重排不能直接做同层横向插值**：交换兄弟会在途中相撞。MVP 对重排使用整个可见树的淡出→不可见时原子切换布局→淡入，总时长使用同一动画预算，始终只显示一份几何布局；不移动层级绕路，也不同时叠加两套可交互节点。此时位置不插值，但可见性连续，避免可见的瞬移和碰撞；目标位移仍计入稳定性代价。
- 保序路径若不能证明/检查动画几何可行，也采用上述淡出淡入。动画期间若再来事件，维护当前透明度阶段，在零透明度时切换到最新合法目标，不重置为不透明造成闪烁。
- 每个可见帧保持 hierarchy、level、minimum separation 和语义顺序；淡出期间禁用节点命中或使用当帧唯一显示布局。产品若要求重排也必须全程不消失且连续运动，需要单独讨论扩展，不能在 MVP 中悄悄放宽 level 或 non-overlap。

## 5. 核心伪代码

```text
onInteraction(event):
    revision += 1
    cancelPreviousJob()
    ctx, focus = resolveTaskAndFocus(event)
    if not valid(ctx): return unchanged(reason)
    prev = immutableSnapshot(committedTarget, policy, treeVersion)
    deadline = monotonicNow() + config.optimizeBudgetMs
    region = buildBoundedRegion(index, ctx, focus, config, deadline)
    problem = freezeProblem(prev, ctx, focus, region, config, deadline)
    if problem incomplete: return unchanged("time-budget")
    result = optimizeLocal(problem, cancellationToken(revision))
    if revision != currentRevision or prev.treeVersion != treeVersion: return
    if result has validated changes:
        commit(result.target, result.policy)  // 一次性更新逻辑目标
        animateFromCurrentDisplay(result)   // 选择保序插值或淡出淡入
    recordEventAndResult(result)

optimizeLocal(problem, token):
    best = problem.prev
    bestLoss = evaluate(best, problem)
    counters = zero()
    repeat up to maxScans:
        accepted = false
        for action in boundedDeterministicCandidates(best, problem):
            if cancelled or anyBudgetReached: return validatedBest(reason)
            candidate = relayoutLocal(copyOnWrite(best), action, problem.region)
            counters.evaluated += 1
            if candidate incomplete: return validatedBest("time-budget")
            if not checkHardConstraints(candidate, problem): continue
            loss = evaluate(candidate, problem) // prev、W、项集合均固定
            if cancelled or deadline reached: return validatedBest(reason)
            if loss.J < bestLoss.J - epsilon
               and loss.task <= bestLoss.task + numericTolerance:
                best = candidate
                bestLoss = loss
                counters.accepted += 1
                accepted = true
                break
        if not accepted: return validatedBest("no-improvement")
    return validatedBest("scan-budget")
```

所有返回路径保证源数据与已提交布局未被候选污染；返回日志须区分“本轮内接受”与“最终提交”，过期结果可以完成计算但不可显示。

## 6. MVP 范围、实施顺序与验收

### MVP 范围

必须包含：单树、已知节点尺寸、固定层距、标准 BRT 初始化；显式 Compare/Trace；明确对应关系与祖先后代路径；局部 W；O/A/S 三类候选；有界贪心；硬约束拒绝；固定上一目标的 movement cost；版本取消、动画与日志。

暂不包含：全局 Compare/Trace 无目标搜索、自动语义匹配、多任务同时激活、任意节点对路径、动态结构编辑、折叠展开优化、多树视图、复杂边路由、机器学习调权。结构/尺寸改变时取消任务并重新生成合法基线，不强行用本局部优化器解决。Overview 仅为标准 BRT 基线，不额外引入新任务模型。

### 实施顺序

1. 找到项目现有数据和 BRT 接口，完成基线复现与硬约束验证器。
2. 实现任务/focus 解析、合法区域闭包与固定边界。
3. 实现 metric/W 及独立损失可视化或调试输出。
4. 实现 A/S 候选和局部内核，再接入受语义限制的 O 候选。
5. 接入预算贪心、revision 取消、目标提交和两类动画。
6. 加入针对性测试、事件回放与性能记录，按测量结果调整预算。

### 必须验证的用例

- 单节点、链、星形、高出度、不平衡深树、不同尺寸节点；无效树在入口拒绝。
- 无 focus / 无 matches 不产生虚构收益；一个匹配不计算 ordering；单边 Trace 不计算连续转角。
- 手工 Compare 匹配样例：左右相反时 ordering loss 高，合法换位后降低；对子树整体平移不改变 root-relative correspondence。
- 手工 Trace 样例：直线转角为零，折返增大；竞争分支夹角变小则 ambiguity 增大。
- fixed/partial/free 三类顺序；冲突操作拒绝，不能以任务收益覆盖语义约束。
- 边界拥挤时扩张拒绝；子树后代纳入移动成本；区域外坐标逐项不变；拒绝候选不污染状态。
- 每次接受 J 严格下降且硬约束通过；L_prev 全程固定；候选预算/零预算返回合法旧布局。
- 动画中连续切换任务，过期结果不提交，显示不回跳；重排不发生可见节点穿越。
- 对保序插值验证节点间距不变量并检查边碰撞；对淡出淡入确认同一时刻仅一份可见/可交互几何。
- 固定事件、配置和候选数量预算时重放一致；受实际时钟截止影响的生产运行不保证逐位一致，日志保存实际接受动作以重放目标。

### 实验变量与记录

至少保留标准 BRT、固定全局权重（同样局部候选预算）、空间变化 W、禁用 movement、分别禁用 O/A/S 的配置开关。比较 W 的消融应保持其平均强度可比，避免把总体权重增大误认为空间机制收益。

每事件记录数据版本、任务、focus、区域规模、匹配/路径覆盖率、metric 版本、配置、优化前后各项 loss、总位移/最大位移、顺序变化、拒绝原因计数、候选数、接受动作、优化耗时、停止原因和动画策略。初始布局时间、事件优化时间与动画帧耗时分开统计。

工程验收以约束正确、指标计算正确、局部性、预算可控和可复现为准。几何 loss 改善只支持“优化了定义的代理指标”；是否降低 Compare/Trace 的完成时间或错误率，需要后续用户实验，不能写成已验证结论。

## 7. 给 coder agent 的交付要求

交付实现代码、相关验证结果、运行方式、配置说明、演示数据以及独立的实现偏差记录。报告实际修改位置及尚未支持的范围。不得擅自扩大为全局优化、换掉 BRT 基线、推断用户任务或放松硬约束。若无可行改善，保留当前布局是合格结果。

**再次强调：本文件是算法设计基准。除非用户明确要求修改本文，否则将实现说明、问题和后续建议写入其他文件，不得覆盖本文件。**
