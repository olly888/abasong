# 本地 OCR 质量回放

内部验证工具，不增加司机端页面或操作。使用生产 `extractCandidates`；只读取已存在的本地 OCR 结果，不联网、不上传图片、不写业务库、不自动共享。

## 快速运行

在仓库根目录使用 Node24／项目 pnpm：

```sh
./scripts/dev ocr:evaluate .tooling/ocr-real/batch-01/manifest.json
```

清单必须在 `.tooling` 的子目录；含真实样本时文件权限须为0600。图片必须位于清单同目录内，大小不超过10MiB；清单最多50张／32MiB，每次观测最多600行。逐图 SHA256 必须与清单及观测一致；重复ID或图片摘要、越界路径、未声明授权／脱敏／核对真值均拒绝。`summary.json`原子替换、0600，不跟随旧摘要软链接。

输出只有白名单样本ID、供应商枚举、平台、计数、耗时和失败ID；不输出地址、密码、原始OCR、图片摘要。失败仅给通用错误。原图、清单、真值与日志都保持在忽略目录；真实资料不提交Git。

## 清单格式

以下仅为合成结构示例，摘要须替换为本地图片实际SHA256：

```json
{
  "version": 1,
  "samples": [{
    "id": "SYN-001",
    "kind": "synthetic",
    "carrier": "synthetic",
    "image": "SYN-001.png",
    "image_sha256": "<64 lowercase hex characters>",
    "authorized": true,
    "redacted": true,
    "truth_checked": true,
    "expected": [{ "address": "100 TEST Ave", "value": "0017#", "issues": [] }],
    "observations": [{
      "platform": "ios",
      "runtime": "simulator",
      "engine": "apple-vision",
      "image_sha256": "<same image SHA256>",
      "milliseconds": 200,
      "lines": [
        { "text": "100 TEST Ave", "x": 0.1, "y": 0.1, "width": 0.4, "height": 0.02, "confidence": 0.99 },
        { "text": "Gate code: 0017#", "x": 0.1, "y": 0.2, "width": 0.4, "height": 0.02, "confidence": 0.99 }
      ]
    }]
  }]
}
```

真实ID用`REAL-001`；carrier为`gofo|swiftx|speedx|uniuni|other`，不存司机名称或账号。授权用途、日期及脱敏检查记录另存本地；三个布尔字段是采集者声明，工具不能证明已获授权或独立复核。

坐标统一左上原点、0–1归一化。`platform`为`ios|android|macos`；runtime为`physical|simulator|host`，macos只允许host。iOS/macOS使用apple-vision，Android使用mlkit-latin。分平台／runtime统计，不把macOS当iPhone、不把模拟器当真机。观测和耗时须来自对应原生识别器；填入元数据本身不构成设备验收。

`expected`是人工核对真值；空数组为无密码负例。值确实不可辨认时用`null`并标注`请核对字符`，该图不进入完整密码精确计数分母。其他提示可用`缺少地址`、`地址对应不明`、`请核对地址`、`请核对字符`。完整值逐字比较含前导零、大小写、#/*；配对与提示逐条匹配，重复项计数；负例误提取单列。不根据小样本自动宣布发布就绪。

## 可重复的合成实验

macOS已安装Xcode时，可在**空目录**生成10张TEST图并实际运行macOS Vision：

```sh
swift -module-cache-path .tooling/swift-module-cache scripts/ocr/quality-lab.swift .tooling/ocr-lab/fresh-run
./scripts/dev ocr:evaluate .tooling/ocr-lab/fresh-run/manifest.json
```

该实验是macOS主机结果；双端App选图／识别可另外做有界功能核对，未捕获对应原生观测时不填充双端质量统计。CLI安全测试中的哈希字节向量不是识别图片，不计入样本准确率。

为命令追加 `--glendale` 可生成另一套 10 张中英混排合成图。摘要单独报告地址与码配对和核对提示一致率，能区分串码与低置信度提示。场景与现场验收边界见 [Glendale 样本回归](../../docs/technical/V3.5.1_DTL-04_Glendale脱敏样本回归.md)。
