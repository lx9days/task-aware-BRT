# Task-Aware Tidy Tree Layout：研究构想简述

## 1. 研究问题

经典 Reingold--Tilford（RT）、Walker 以及 Buchheim 改进的 tidy-tree
布局主要在给定树结构和 sibling order
的前提下生成紧凑、整洁的层次布局。传统方法通常采用固定的布局假设，例如保持既定的子树顺序，并将父节点放置在子节点范围的中间。

本工作的核心观点是：**不存在对所有分析任务都最优的单一树布局。不同的层级分析任务可能需要不同的空间组织，因此
subtree ordering 和 parent--child alignment
不应始终作为固定规则，而可以成为 task-dependent layout decisions。**

整体逻辑为：

``` text
User Task
    ↓
Spatial Requirement
    ↓
Task-specific Quality Metric
    ↓
Layout Strategy
    ↓
Subtree Ordering + Parent–Child Alignment
    ↓
Task-Aware BRT Layout
```

换言之，本工作关注从 **aesthetic-driven tree layout** 向 **task-driven
tree layout** 的转变。

------------------------------------------------------------------------

## 2. 核心方法

在 BRT/tidy-tree placement engine
的基础上，将两个传统上相对固定的布局决策显式参数化：

-   **Subtree Ordering**：决定 sibling/subtree 的左右顺序和邻接关系。
-   **Parent--Child Alignment**：决定父节点相对于 children/subtree
    的水平位置。

统一表示为：

\[ L = BRT(T,`\pi`{=tex}), `\qquad `{=tex}`\pi`{=tex}=(O,A) \]

其中 (O) 为 ordering policy，(A) 为 alignment policy。对于任务
(`\tau`{=tex})，寻找能够优化任务相关质量函数的布局策略：

\[ `\pi`{=tex}\^\* = `\arg`{=tex}`\min`{=tex}*{`\pi`{=tex}}
Q*{`\tau`{=tex}}(L(T,`\pi`{=tex})) \]

第一阶段原型不必直接求全局最优，可采用 **Task → Policy → BRT**
的规则/启发式实现；后续再发展为 ordering 与 alignment
的分阶段或迭代优化。

------------------------------------------------------------------------

## 3. 三类代表性任务

本工作不试图覆盖所有 tree visualization
tasks，而聚焦于**明显依赖空间组织的 hierarchical reasoning tasks**。

### 3.1 Structural Overview

目标：理解整棵树的整体层次、分支和平衡情况。

可能的质量指标：

\[ Q\_{overview} = `\alpha`{=tex},Width + `\beta`{=tex},Asymmetry +
`\gamma`{=tex},BalanceError \]

布局策略接近传统 BRT：

-   保持原始/语义 sibling order；
-   使用 midpoint parent alignment；
-   优先 compactness、symmetry 和整体结构可读性。

这一任务可作为传统 BRT 的自然 baseline。

### 3.2 Structural Comparison

目标：比较两个指定 subtree 的结构或属性。

核心空间需求是让比较对象形成容易建立 correspondence
的空间关系。候选指标包括：

\[ Q\_{compare} = `\alpha`{=tex},SubtreeDistance +
`\beta`{=tex},CorrespondenceError \]

布局策略：

-   通过 ordering 使目标 subtrees 更适合并置比较；
-   通过 alignment 强化目标结构之间的空间对应关系；
-   必要时允许 ancestor alignment 向比较目标偏移，而非始终采用所有
    children 的 midpoint。

### 3.3 Path Following

目标：沿 root-to-target 或 ancestor--descendant path 进行追踪。

候选指标：

\[ Q\_{path} = `\sum`{=tex}\_{(u,v)`\in `{=tex}P}\|x_u-x_v\| \]

也可加入 bend/curvature penalty。

布局策略：

-   ordering 使目标 path 所在的 child/subtree 处于更有利的位置；
-   alignment 尽量使 path 上连续 parent--child
    节点保持方向连续，降低水平偏移和转折。

------------------------------------------------------------------------

## 4. 主要创新点

### 4.1 从 universal aesthetic objective 转向 task-specific objective

传统 tidy-tree 算法主要追求紧凑、对称、无重叠等通用 aesthetic
properties。本工作提出：**树布局的 quality objective
应随用户任务变化。**

### 4.2 将固定布局假设转化为 task-dependent layout variables

不是简单提出一种新的 alignment rule，而是把：

``` text
Fixed Ordering
Fixed Alignment
```

转化为：

``` text
Task-dependent Ordering
Task-dependent Alignment
```

并研究 task、quality metric 与这些布局决策之间的映射关系。

### 4.3 建立 Task → Spatial Requirement → Metric → Layout Policy 的桥梁

贡献重点不只是算法参数化，而是解释：

> 为什么某个任务需要某种空间关系，以及如何把这种空间需求形式化为可优化的几何指标。

### 4.4 面向任务评价布局，而非只评价几何美学

除验证 quality metric 是否得到改善外，还需要通过用户实验验证 task
performance，例如：

-   completion time；
-   accuracy；
-   subjective confidence / preference；
-   必要时使用 eye-tracking 或 interaction cost。

因此评价链条为：

``` text
Layout Change
    ↓
Improved Task-specific Spatial Property
    ↓
Improved Human Task Performance
```

------------------------------------------------------------------------

## 5. Related Work

### 5.1 RT / Walker / Buchheim：Tidy Tree Layout

Reingold--Tilford 奠定 tidy-tree layout 的基本思想；Walker
将其扩展到一般多叉树；Buchheim、Jünger 和 Leipert 改进 Walker
的实现，使其达到真正的线性时间，同时保持相同的布局结果。

与本工作的关系：

-   这些方法提供底层 tidy-tree placement mechanism；
-   sibling ordering 通常被视为输入约束；
-   parent centering/alignment 主要遵循固定 aesthetic convention；
-   本工作不以重新解决 subtree separation 为主要目标，而是在其上层引入
    task-aware ordering/alignment policy。

### 5.2 Unordered Tree 与 Minimum-Width Layout

已有 graph drawing 工作研究当 sibling order 不受语义约束时，通过改变
subtree ordering 获得更小宽度的布局，并证明 minimum-width unordered tree
drawing 在多种条件下具有较高计算复杂度/NP-completeness。

与本工作的关系：

-   证明 **ordering 本身是非平凡的 layout optimization variable**；
-   但已有工作的主要 objective 是 width/compactness；
-   本工作关注的是由分析任务产生的 spatial objective，而不是仅以 minimum
    width 为目标。

### 5.3 Flexible Parent Alignment / Compact Layered Trees

已有工作已经质疑"父节点必须严格位于 children 中间"这一硬约束，并研究放松
centering constraint 以获得更紧凑的 layered tree layout。

与本工作的关系：

-   说明 flexible alignment 本身并非全新的想法；
-   因此本工作的 novelty 不能仅建立在"修改 midpoint alignment"上；
-   区别在于：alignment 的改变由 **task-specific spatial requirement**
    驱动，而不仅是 compactness。

### 5.4 Tree Visualization Task Taxonomy

Pandey et al., *A State-of-the-Art Survey of Tasks for Tree Design and
Evaluation With a Curated Task Dataset*（IEEE TVCG）系统调查了 tree
visualization tasks，并扩展 Multi-Level Task Typology，使 tree-specific
targets 得到更细致的描述。其任务空间包含 Identify、Compare、Summarize 等
actions，以及 Tree、Node、Subtree、Path 等 tree-specific targets。

与本工作的关系：

-   该工作提供 **task space / task abstraction 的理论基础**；
-   本工作不重新提出 tree task taxonomy；
-   而是在此基础上进一步研究：

``` text
Tree Task
    ↓
Spatial Requirement
    ↓
Layout Objective
    ↓
Adaptive Layout
```

### 5.5 Perceptual Principles for Spatial Organization

本工作还需要进一步系统检索和验证以下理论依据：

-   **proximity** 是否促进 subtree comparison；
-   **alignment / correspondence** 是否降低结构比较成本；
-   **continuity / low bending** 是否促进 hierarchical path following；
-   compactness、symmetry 等 aesthetic properties 与 structural overview
    performance 的关系。

这部分 related work 非常重要，因为它决定 Task → Metric
的映射是否具有理论和实证依据，而不是人为指定 heuristic。

------------------------------------------------------------------------

## 6. 本工作与 Related Work 的总体关系

可以概括为：

``` text
RT / Walker / Buchheim
        │
        │ 提供 tidy-tree placement engine
        ↓
Task-Aware BRT
        ↑
        │
        ├── Unordered-tree research
        │      → 证明 ordering 可以作为优化变量
        │
        ├── Flexible-alignment research
        │      → 证明 midpoint 并非必须是硬约束
        │
        ├── Tree task taxonomy
        │      → 提供 task abstraction
        │
        └── Perception / visualization research
               → 为 Task → Spatial Requirement → Metric 提供依据
```

已有工作分别研究了 **tree tasks、ordering、alignment、aesthetic
metrics**；本工作的目标是把这些部分连接起来，形成一个 **task-aware
tidy-tree layout framework**。

------------------------------------------------------------------------

## 7. 当前最核心的 Research Question

> **How can tidy tree layouts adapt subtree ordering and parent--child
> alignment to support different hierarchical reasoning tasks?**

进一步可以拆成：

1.  哪些 tree tasks 对 spatial organization 敏感？
2.  这些 tasks 分别对应哪些 perceptually meaningful spatial
    requirements？
3.  如何把这些 requirements 转化为 computable quality metrics？
4.  如何根据 metrics 优化 ordering 与 alignment？
5.  task-aware layouts 是否真正提高用户的 task accuracy / efficiency？

------------------------------------------------------------------------

## 8. 预期论文贡献

可以暂时概括为三点：

1.  **Conceptual contribution**：提出 task-aware tidy-tree layout，将
    tree layout 从 universal aesthetic optimization 扩展为 task-specific
    optimization。
2.  **Algorithmic contribution**：提出可根据 task objective 调整 subtree
    ordering 与 parent--child alignment 的 BRT-based layout framework。
3.  **Empirical contribution**：通过几何 metric evaluation
    与用户实验验证 task-specific layout 是否能够改善对应 hierarchical
    reasoning tasks。

> 当前最大的待验证环节不是 BRT 实现本身，而是 **Task → Spatial
> Requirement → Quality Metric** 的理论依据以及这些 metrics 对真实用户
> task performance 的预测能力。
