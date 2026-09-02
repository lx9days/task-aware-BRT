# Compact 2D Layered Graph Layout 原型实现需求文档

## 1. 项目背景

传统 layered graph drawing（分层图布局）通常采用 Sugiyama-style layout：

- 首先根据 DAG 的拓扑关系将节点划分到不同层（layer）。
- 每个 layer 中的节点排列在一条水平线上。
- 不同 layer 之间通过边连接。

形式：

```
Layer 0:
o o o o o o o o o o o

Layer 1:
o o o o o o o o o o o

Layer 2:
o o o o o o o o o o o
```

这种方法的问题：

当某一层节点数量非常大时，该层会产生严重的宽度爆炸（width explosion）。

例如：

```
Layer 0: 20 nodes
Layer 1: 500 nodes
Layer 2: 30 nodes
```

传统布局需要 Layer 1 占据非常大的水平空间。

目标：

设计一种 **Compact 2D Layered Graph Layout** 方法：

- 保留 layered graph 的层级语义；
- 将每个 layer 从一维水平线扩展为二维区域；
- 在二维空间中压缩节点分布；
- 同时优化 edge crossing 和整体布局宽度。


---

# 2. 核心思想

## 2.1 从 1D Layer 到 2D Layer Region

传统方法：

一个 layer 是：

```
L_i = {v1, v2, ..., vn}

所有节点:
y(v)=constant
```

即：

```
v1 v2 v3 v4 v5 v6 v7
---------------------
```

新的方法：

一个 layer 变成一个二维区域：

```
+----------------+
| o   o   o      |
|    o   o   o   |
| o       o      |
+----------------+
```

约束：

同一 layer 的节点必须位于同一个区域：

```
v ∈ Layer_i

=> position(v) ∈ Region_i
```

不同 layer 的区域仍然保持上下顺序：

```
Layer 0 region

        |
        v

Layer 1 region

        |
        v

Layer 2 region
```

因此仍然保持 hierarchical structure。


---

# 3. Space Filling Curve 的作用

Space Filling Curve（SFC）不是严格的网格布局。

不要实现：

```
node -> fixed Hilbert grid cell
```

而应该理解为：

```
node ordering / locality constraint
```

作用：

1. 提供一个初始二维排列；
2. 保持相邻节点在空间上的局部性；
3. 降低二维布局搜索空间。


例如：

原始 layer order:

```
v1 v2 v3 v4 v5 v6 v7 v8
```

经过 SFC：

```
v1 v2 v3
      v4
v7 v6 v5
      v8
```

但是节点之后仍然允许移动。


推荐：

使用 Hilbert curve 或 serpentine curve 作为初始化。


---

# 4. Layout Optimization Objective

最终布局目标：

同时优化：

1. Edge crossing 数量
2. Layer width
3. Edge length
4. Node overlap


目标函数：

```
Energy =

λ1 * CrossingCost

+
λ2 * WidthCost

+
λ3 * EdgeLengthCost

+
λ4 * OverlapPenalty

+
λ5 * SFC_LocalityCost
```


其中：

## Crossing Cost

减少不同 layer 之间 edge crossing。


## Width Cost

目标：

降低最大 layer 宽度。

例如：

传统：

```
width = 2000px
```

新的：

```
width = 500px
```


## SFC Locality Cost

保持 SFC 顺序附近节点尽量空间接近：

```
sum(distance(node_i,node_i+1))
```


---

# 5. 原型实现范围

第一版 prototype 不需要实现完整优化算法。

目标：

展示概念可行性。

实现三个 layout mode。


---

## Mode 1: Traditional Layered Layout (Baseline)

实现标准水平布局：

```
Layer 0

o o o o o o


Layer 1

o o o o o o o o o


Layer 2

o o o
```

功能：

- 节点按照 layer 排列；
- 使用直线 edge。


用于比较。


---

## Mode 2: SFC Compact Layer Layout

每层：

1. 根据 layer order 获取节点序列；
2. 使用 Hilbert / serpentine mapping；
3. 映射到二维 layer region。


示例：

```
Layer 1 region

+-------------+
| o o o       |
|     o o     |
| o o         |
+-------------+
```


边：

直接连接节点中心。


目标：

展示：

- width reduction
- compactness


---

## Mode 3: Optimized Compact Layout

在 Mode 2 基础上：

允许节点在 layer region 内移动。


优化：

```
reduce crossing
+
preserve compactness
```


简单实现：

可以使用：

- force-directed adjustment
- simulated annealing
- local search
- gradient optimization


不要求全局最优。


---

# 6. 数据结构设计


Graph:

```javascript
{
 nodes:[
   {
     id,
     layer,
     x,
     y
   }
 ],

 edges:[
   {
     source,
     target
   }
 ]
}
```


Layer:

```javascript
{
 id,
 nodes:[],
 region:{
    x,
    y,
    width,
    height
 }
}
```


---

# 7. Visualization Requirements


实现一个交互页面。


## 页面布局

左侧：

控制面板：

```
Layout:

( ) Traditional

( ) SFC Compact

( ) Optimized


Parameters:

Layer Width:
[slider]

SFC strength:
[slider]

Crossing weight:
[slider]

```

右侧：

graph canvas。


---

# 8. Interactive Features


## 8.1 Layout Switching

用户可以切换：

Traditional

↓

SFC Compact

↓

Optimized


观察变化。


---

## 8.2 Parameter Adjustment


调整：

### Compactness

控制 layer region 高度：

```
small height

more compact


large height

more freedom
```


### SFC strength

控制：

节点保持 SFC 顺序程度。


### Crossing weight

控制：

更关注 crossing 还是 compactness。


---

# 9. Evaluation Metrics Display


页面显示：

```
Nodes:
500


Layers:
5


Width:
Traditional:
2500 px

SFC:
700 px


Crossings:

Traditional:
320

SFC:
210
```


实时比较：

| Metric | Traditional | SFC |
|-|-|-|
| Width | | |
| Height | | |
| Crossing | | |
| Edge Length | | |


---

# 10. 推荐技术路线


Frontend:

推荐：

- React
- D3.js
- SVG Canvas


Graph rendering:

D3:

- node circle
- edge path
- drag interaction


Layout:

JavaScript implementation:


```
graph
 |
 +-- layer assignment
 |
 +-- initial ordering
 |
 +-- SFC mapping
 |
 +-- optimization
 |
 +-- render
```


---

# 11. 第一阶段最低实现目标

必须完成：

[ ] 生成 layered DAG 示例数据

[ ] Traditional layered layout

[ ] 每层二维 region

[ ] Hilbert/serpentine SFC placement

[ ] edge rendering

[ ] layout switching

[ ] width/crossing统计


---

# 12. 第二阶段增强目标

可选：

[ ] crossing minimization

[ ] node movement optimization

[ ] boundary port assignment

[ ] animated transition

[ ] random graph generator

[ ] benchmark comparison


---

# 13. 研究假设（用于后续论文）

核心假设：

传统 layered graph drawing 假设：

```
layer = 1D line
```

导致：

```
large layer
        |
        v
large width
```

本文探索：

```
layer = 2D region
```

使得：

```
large layer
        |
        v
compact representation
```

同时通过 crossing-aware optimization 保持 edge readability。


最终目标：

寻找：

```
compactness
        vs.
edge crossing
```

之间的最佳 trade-off。


---

# Prototype 的核心贡献展示

最终 Demo 应该能够回答：

> 当一个 layer 包含大量节点时，是否可以通过将 layer 从一维线扩展到二维空间，在显著降低布局宽度的同时保持甚至改善 edge crossing？

这就是整个原型需要证明的核心问题。