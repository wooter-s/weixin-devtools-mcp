# 登录自动化示例

## 场景描述

演示如何使用 `find_elements`、统一 `target` 和 `wait_for` 自动化小程序登录流程。

## 小程序页面结构

假设登录页面包含以下元素：
- 用户名输入框：`input[placeholder="请输入用户名"]`
- 密码输入框：`input[placeholder="请输入密码"]`
- 登录按钮：`button[data-testid="login-btn"]`
- 错误提示：`.error-message`
- 加载状态：`.loading-spinner`

## 完整自动化流程

### 1. 连接到微信开发者工具

```json
{
  "name": "connect_devtools",
  "arguments": {
    "projectPath": "/Users/user/miniprogram-project"
  }
}
```

### 2. 获取当前页面状态

```json
{
  "name": "get_current_page",
  "arguments": {}
}
```

### 3. 查找登录表单元素

```json
{
  "name": "find_elements",
  "arguments": {
    "locator": {
      "kind": "selector",
      "value": "input[placeholder*='用户名']"
    }
  }
}
```

**响应示例**：
```json
{
  "pageRevision": 0,
  "count": 1,
  "elements": [
    {
      "ref": "ref_7f3a9c12d4e5b678_0",
      "tagName": "input",
      "position": {
        "left": 50,
        "top": 100,
        "width": 200,
        "height": 40
      }
    }
  ]
}
```

### 4. 查找密码输入框

```json
{
  "name": "find_elements",
  "arguments": {
    "locator": {
      "kind": "selector",
      "value": "input[placeholder*='密码']"
    }
  }
}
```

### 5. 查找登录按钮

```json
{
  "name": "find_elements",
  "arguments": {
    "locator": {
      "kind": "testId",
      "value": "login-btn"
    }
  }
}
```

### 6. 使用查询返回的 ref 点击用户名输入框

```json
{
  "name": "click",
  "arguments": {
    "target": {
      "kind": "ref",
      "ref": "ref_7f3a9c12d4e5b678_0"
    }
  }
}
```

### 7. 等待输入框获得焦点

```json
{
  "name": "wait_for",
  "arguments": {
    "target": {
      "kind": "selector",
      "value": "input:focus"
    },
    "timeout": 2000
  }
}
```

### 8. 输入用户名

```json
{
  "name": "input_text",
  "arguments": {
    "target": {
      "kind": "selector",
      "value": "input[placeholder*='用户名']"
    },
    "mode": "replace",
    "text": "alice"
  }
}
```

### 9. 点击密码输入框

```json
{
  "name": "click",
  "arguments": {
    "target": {
      "kind": "selector",
      "value": "input[placeholder*='密码']"
    }
  }
}
```

### 10. 输入密码

```json
{
  "name": "input_text",
  "arguments": {
    "target": {
      "kind": "selector",
      "value": "input[placeholder*='密码']"
    },
    "mode": "replace",
    "text": "secret-password"
  }
}
```

### 11. 点击登录按钮

```json
{
  "name": "click",
  "arguments": {
    "target": {
      "kind": "testId",
      "value": "login-btn"
    }
  }
}
```

### 12. 等待加载状态出现

```json
{
  "name": "wait_for",
  "arguments": {
    "target": {
      "kind": "selector",
      "value": ".loading-spinner"
    },
    "timeout": 3000
  }
}
```

### 13. 等待加载完成

```json
{
  "name": "wait_for",
  "arguments": {
    "target": {
      "kind": "selector",
      "value": ".loading-spinner"
    },
    "disappear": true,
    "timeout": 10000
  }
}
```

### 14. 检查登录结果

#### 成功场景 - 等待跳转到主页

```json
{
  "name": "wait_for",
  "arguments": {
    "target": {
      "kind": "selector",
      "value": ".home-page-indicator"
    },
    "timeout": 5000
  }
}
```

#### 失败场景 - 检查错误消息

```json
{
  "name": "find_elements",
  "arguments": {
    "locator": {
      "kind": "selector",
      "value": ".error-message"
    }
  }
}
```

### 15. 截图保存结果

```json
{
  "name": "screenshot",
  "arguments": {
    "path": "/tmp/login-result.png"
  }
}
```

## 错误处理策略

### 1. 元素未找到处理

先检查元素是否存在：

```json
{
  "name": "find_elements",
  "arguments": {
    "locator": {
      "kind": "testId",
      "value": "login-btn"
    }
  }
}
```

如果返回空数组，等待元素出现或检查页面状态：

```json
{
  "name": "wait_for",
  "arguments": {
    "target": {
      "kind": "testId",
      "value": "login-btn"
    },
    "timeout": 5000
  }
}
```

### 2. 登录失败处理

等待错误消息或成功跳转：

```json
{
  "name": "wait_for",
  "arguments": {
    "target": {
      "kind": "selector",
      "value": ".error-message, .home-page-indicator"
    },
    "timeout": 8000
  }
}
```

检查是哪种结果：

```json
{
  "name": "find_elements",
  "arguments": {
    "locator": {
      "kind": "selector",
      "value": ".error-message"
    }
  }
}
```

### 3. 网络超时处理

使用较长的超时时间等待网络请求：

```json
{
  "name": "wait_for",
  "arguments": {
    "target": {
      "kind": "selector",
      "value": ".loading-spinner"
    },
    "disappear": true,
    "timeout": 15000
  }
}
```

## 最佳实践总结

### 1. 稳定的选择器
- 优先使用 `testId` 或 `id` target。
- 将快照返回的 `ref` 视为 opaque 值，不解析其内容；页面变化后重新获取快照。
- 需要 CSS selector 时避免依赖元素位置（如 `:nth-child`），优先使用稳定属性或语义化 class。

### 2. 合理的等待时间
- 短操作：1-2秒
- 网络请求：5-10秒
- 页面跳转：3-8秒

### 3. 防御性编程
- 先查找元素，确认存在后再操作
- 使用适当的超时时间
- 处理多种可能的结果状态

### 4. 调试技巧
- 定期截图记录状态
- 使用页面快照了解结构
- 逐步验证每个步骤

## 变种场景

### 验证码登录
等待验证码输入框出现：

```json
{
  "name": "wait_for",
  "arguments": {
    "target": {
      "kind": "selector",
      "value": "input[placeholder*='验证码']"
    },
    "timeout": 3000
  }
}
```

查找验证码图片：

```json
{
  "name": "find_elements",
  "arguments": {
    "locator": {
      "kind": "selector",
      "value": ".captcha-image"
    }
  }
}
```

### 第三方登录
查找微信登录按钮：

```json
{
  "name": "find_elements",
  "arguments": {
    "locator": {
      "kind": "selector",
      "value": "button[data-type='wechat-login']"
    }
  }
}
```

等待授权页面：

```json
{
  "name": "wait_for",
  "arguments": {
    "target": {
      "kind": "selector",
      "value": ".auth-page"
    },
    "timeout": 8000
  }
}
```

### 记住密码功能
查找“记住密码”复选框：

```json
{
  "name": "find_elements",
  "arguments": {
    "locator": {
      "kind": "testId",
      "value": "remember-password"
    }
  }
}
```

点击复选框：

```json
{
  "name": "click",
  "arguments": {
    "target": {
      "kind": "testId",
      "value": "remember-password"
    }
  }
}
```
