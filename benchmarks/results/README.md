# Benchmark results

结果按 `v<release>/` 保存；需要区分多台真实环境时，再在版本目录下增加 `<environment-id>/`。禁止提交手工编造或仅用于展示的 baseline/optimized 数值。

可提交文件包括脱敏后的 environment、原始 JSONL、aggregate JSON 和 comparison JSON/Markdown。失败截图、完整日志、请求头及请求体不得提交。

合成结果必须显式标记 `synthetic/non-authoritative`；协议静态结果必须列出覆盖和未覆盖场景，不能用局部 PASS 代表完整真实工作负载。
