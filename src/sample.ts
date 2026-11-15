export const sample = String.raw`# 线性方程组解的个数

对含有 (n) 个未知数的线性方程组，先比较系数矩阵和增广矩阵的秩：

[
\operatorname{rank}(A) \le \operatorname{rank}([A\mid b])
]

当两者秩不同时，方程组不相容；两者秩相同时，再和未知数个数比较。

## 三种结论

| 秩的关系 | 解的个数 |
| :--- | :--- |
| (r(A) < r([A\mid b])) | 无解 |
| (r(A) = r([A\mid b]) = n) | 唯一解 |
| (r(A) = r([A\mid b]) < n) | 无穷多解 |

### 1. 无解

[
\boxed{r(A) < r([A\mid b])}
]

### 2. 唯一解

[
\boxed{r(A) = r([A\mid b]) = n}
]

### 3. 无穷多解

[
\boxed{r(A) = r([A\mid b]) < n}
]

**记忆方法**：先判断有没有解，再判断有没有自由变量。
`
