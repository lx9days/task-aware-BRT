# Adaptive Alignment for Tree Layout: Research Prototype Specification

## 1. 项目背景

传统树布局算法（如 Reingold–Tilford Tree Layout 和 Buchheim 的改进版本）通常采用固定的父节点对齐策略：

\[
x(parent)=\frac{x(firstChild)+x(lastChild)}{2}
\]

即：

> 父节点默认位于所有子节点范围的中心位置。

这种策略保证了经典树布局的重要美学性质：

- 对称性（symmetry）
- 子树独立性（subtree independence）
- 紧凑布局（compactness）
- 节点层级清晰

然而，该规则隐含假设：

> 所有子节点具有相同的重要性和视觉权重。

在真实分析场景中，这个假设可能不成立。例如：

- 一个组织结构树中，不同部门的重要程度不同；
- 一个知识图谱中，不同分支关注度不同；
- 一个文件系统中，不同目录规模差异巨大；
- 一个分类树中，某些路径可能是用户主要关注路径。

因此，固定中心对齐可能不是所有任务下的最优策略。

---

# 2. 研究目标

探索：

> 树布局中的父节点对齐策略是否应该从固定规则转变为可适应的数据驱动或任务驱动规则。

目标：

设计并比较多种 alignment strategy，研究不同场景下哪种布局更加有效。

---

# 3. 基础算法

以 Buchheim Reingold–Tilford（BRT）算法作为基础布局算法。

默认：

```
parent.x = midpoint(firstChild.x, lastChild.x)
```

即：

```
          A

     B    C    D

```

A 位于 B 和 D 的中间。

---

# 4. 可探索的 Alignment Strategies

## 4.1 Standard Center Alignment（Baseline）

传统 RT/BRT：

```
          A

     B    C    D
```

公式：

\[
x_A=\frac{x_B+x_D}{2}
\]

优点：

- 对称
- 稳定
- 符合经典美学

缺点：

- 不考虑节点重要性
- 不考虑用户任务


---

## 4.2 Weighted Alignment

根据子节点权重调整父节点位置。

公式：

\[
x_A=
\frac{\sum_i w_i x_i}{\sum_i w_i}
\]

其中：

w 可以表示：

- 子树大小
- 节点数量
- 用户关注度
- 数据重要性


示例：

```
          A


 B                 C

weight=10       weight=1
```

父节点更靠近 B。


---

## 4.3 Subtree-size Alignment

根据子树规模决定中心。

例如：

```
          A


     B          C


  (large)    (small)
```

大型子树获得更大布局权重。


---

## 4.4 Task-aware Alignment

根据用户任务选择布局策略。

### Overview Task

目标：

快速理解整体结构。

使用：

Center Alignment


---

### Path Following Task

目标：

沿主要路径阅读。

可能采用：

Main-path Alignment


例如：

```
A
|
B
|
C
|
D
```


---

### Comparison Task

目标：

比较两个分支。

保持：

Balanced Alignment


---

# 5. Adaptive Alignment Model

提出一个连续控制模型：

\[
x_p=
\lambda x_{center}
+
(1-\lambda)x_{semantic}
\]


其中：

λ 控制传统中心规则和语义规则之间的比例。


例如：

λ = 1：

```
center alignment
```


λ = 0：

```
semantic alignment
```


λ 可以根据：

- 数据结构
- 用户任务
- 用户交互行为

动态调整。


---

# 6. Prototype 页面需求

实现一个交互式树布局实验页面。

## 页面目标

展示不同 alignment strategy 对同一棵树的影响。


---

# 7. 功能需求

## 7.1 Tree Visualization

显示：

- hierarchical tree
- node
- edge
- labels


支持：

- 缩放
- 平移
- hover


---

## 7.2 Alignment Strategy Selector

提供切换：

```
[ Center Alignment ]

[ Weighted Alignment ]

[ Subtree Size Alignment ]

[ Task-aware Alignment ]

[ Adaptive Alignment ]
```


切换后实时重新布局。


---

## 7.3 Parameter Control

提供 slider：

### Lambda

控制：

center ↔ semantic

范围：

```
0 ----------- 1
semantic     center
```


---

### Weight Factor

控制权重影响程度。


---

## 7.4 Tree Statistics

显示：

- node count
- depth
- subtree size
- branching factor


---

# 8. 推荐测试数据

## Example 1: Balanced Tree

测试传统 RT：

```
          A

      B       C

    D E     F G
```


---

## Example 2: Unbalanced Tree

测试偏斜结构：

```
              A

        B          C

                  D

                  E

                  F
```


---

## Example 3: Weighted Tree

模拟重要节点：

```
              A


      B              C


  many nodes      few nodes
```


---

# 9. 希望观察的问题

通过 prototype 验证：

1. Center alignment 是否总是视觉最佳？

2. 当子树规模差异增加时，用户是否更喜欢偏移后的父节点？

3. 不同任务是否需要不同 alignment？

4. 是否存在一种 adaptive strategy 可以超过固定 RT？

---

# 10. 后续 IEEE VIS 研究方向

潜在论文方向：

## Beyond Centering: Adaptive Alignment Strategies for Hierarchical Tree Visualization


核心贡献：

1. 重新审视 RT/BRT 中长期使用的 center alignment 假设。

2. 提出 alignment strategy family。

3. 根据数据和任务自动选择布局规则。

4. 通过用户实验验证不同 alignment 对理解效率的影响。


---

# Implementation Notes for Coding Agent

推荐技术：

- D3.js
- SVG rendering
- Buchheim tree layout implementation


代码结构：

```
src/
 ├── treeLayout.js
 ├── alignment/
 │    ├── center.js
 │    ├── weighted.js
 │    ├── subtree.js
 │    └── adaptive.js
 ├── visualization.js
 └── controls.js
```


核心接口：

```javascript
layout(tree, {
    alignment: "center",
    lambda: 0.5,
    weightFunction: "subtreeSize"
})
```


输出：

```javascript
[
 {
   id,
   x,
   y,
   parent
 }
]
```

用于 SVG 绘制树。