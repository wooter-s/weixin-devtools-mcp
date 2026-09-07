# 电商购物自动化示例

## 场景描述

演示如何自动化小程序电商购物流程，包括商品搜索、选择、加入购物车和结算。

## 测试目标

1. 搜索指定商品
2. 选择商品规格
3. 加入购物车
4. 进入购物车页面
5. 修改商品数量
6. 进行结算流程

## 页面结构假设

### 首页
- 搜索框：`input[placeholder="搜索商品"]`
- 搜索按钮：`button[data-testid="search-btn"]`
- 商品列表：`.product-list .product-item`

### 商品详情页
- 商品标题：`.product-title`
- 价格：`.product-price`
- 规格选择：`.spec-selector`
- 数量选择：`.quantity-selector`
- 加入购物车：`button[data-testid="add-to-cart"]`

### 购物车页面
- 商品列表：`.cart-item`
- 数量调整：`.quantity-control`
- 结算按钮：`button[data-testid="checkout"]`

## 自动化流程实现

### 阶段1：连接和初始化

```json
{
  "name": "connect_devtools",
  "arguments": {
    "projectPath": "/Users/user/shopping-miniprogram"
  }
}
```

```json
{
  "name": "get_page_snapshot",
  "arguments": {}
}
```

### 阶段2：商品搜索

#### 1. 查找搜索框

```json
{
  "name": "find_elements",
  "arguments": {
    "locator": {
      "kind": "selector",
      "value": "input[placeholder*='搜索']"
    }
  }
}
```

#### 2. 点击搜索框

```json
{
  "name": "click",
  "arguments": {
    "target": {
      "kind": "selector",
      "value": "input[placeholder*='搜索']"
    }
  }
}
```

#### 3. 等待搜索框获得焦点

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

#### 4. 输入搜索关键词

```json
{
  "name": "input_text",
  "arguments": {
    "target": {
      "kind": "selector",
      "value": "input[placeholder*='搜索']"
    },
    "mode": "replace",
    "text": "无线耳机"
  }
}
```

#### 5. 点击搜索按钮

```json
{
  "name": "click",
  "arguments": {
    "target": {
      "kind": "testId",
      "value": "search-btn"
    }
  }
}
```

#### 6. 等待搜索结果加载

```json
{
  "name": "wait_for",
  "arguments": {
    "target": {
      "kind": "selector",
      "value": ".product-list .product-item"
    },
    "timeout": 8000
  }
}
```

### 阶段3：选择商品

#### 1. 查找商品列表

```json
{
  "name": "find_elements",
  "arguments": {
    "locator": {
      "kind": "selector",
      "value": ".product-list .product-item"
    }
  }
}
```

#### 2. 点击第一个商品

```json
{
  "name": "click",
  "arguments": {
    "target": {
      "kind": "selector",
      "value": ".product-list .product-item",
      "index": 0
    }
  }
}
```

#### 3. 等待商品详情页加载

```json
{
  "name": "wait_for",
  "arguments": {
    "target": {
      "kind": "selector",
      "value": ".product-detail-page"
    },
    "timeout": 5000
  }
}
```

### 阶段4：商品详情操作

#### 1. 获取商品信息

```json
{
  "name": "find_elements",
  "arguments": {
    "locator": {
      "kind": "selector",
      "value": ".product-title"
    }
  }
}
```

```json
{
  "name": "find_elements",
  "arguments": {
    "locator": {
      "kind": "selector",
      "value": ".product-price"
    }
  }
}
```

#### 2. 选择商品规格（如颜色、尺寸）

```json
{
  "name": "find_elements",
  "arguments": {
    "locator": {
      "kind": "selector",
      "value": ".spec-selector .spec-option"
    }
  }
}
```

```json
{
  "name": "click",
  "arguments": {
    "target": {
      "kind": "selector",
      "value": ".spec-option[data-value='red']"
    }
  }
}
```

```json
{
  "name": "wait_for",
  "arguments": {
    "target": {
      "kind": "selector",
      "value": ".spec-option[data-value='red'].selected"
    },
    "timeout": 2000
  }
}
```

#### 3. 调整商品数量

```json
{
  "name": "find_elements",
  "arguments": {
    "locator": {
      "kind": "selector",
      "value": ".quantity-selector .plus-btn"
    }
  }
}
```

```json
{
  "name": "click",
  "arguments": {
    "target": {
      "kind": "selector",
      "value": ".quantity-selector .plus-btn"
    }
  }
}
```

#### 4. 验证数量更新

```json
{
  "name": "wait_for",
  "arguments": {
    "target": {
      "kind": "selector",
      "value": ".quantity-input[value='2']"
    },
    "timeout": 2000
  }
}
```

### 阶段5：加入购物车

#### 1. 点击加入购物车按钮

```json
{
  "name": "click",
  "arguments": {
    "target": {
      "kind": "testId",
      "value": "add-to-cart"
    }
  }
}
```

#### 2. 等待加入成功提示

```json
{
  "name": "wait_for",
  "arguments": {
    "target": {
      "kind": "selector",
      "value": ".toast-success"
    },
    "text": "已加入购物车",
    "timeout": 3000
  }
}
```

#### 3. 等待提示消失

```json
{
  "name": "wait_for",
  "arguments": {
    "target": {
      "kind": "selector",
      "value": ".toast-success"
    },
    "disappear": true,
    "timeout": 5000
  }
}
```

### 阶段6：进入购物车

#### 1. 查找购物车入口

```json
{
  "name": "find_elements",
  "arguments": {
    "locator": {
      "kind": "selector",
      "value": ".cart-icon, [data-testid='cart-btn']"
    }
  }
}
```

#### 2. 点击购物车图标

```json
{
  "name": "click",
  "arguments": {
    "target": {
      "kind": "selector",
      "value": ".cart-icon"
    }
  }
}
```

#### 3. 等待购物车页面加载

```json
{
  "name": "wait_for",
  "arguments": {
    "target": {
      "kind": "selector",
      "value": ".cart-page .cart-item"
    },
    "timeout": 5000
  }
}
```

### 阶段7：购物车操作

#### 1. 验证商品已添加

```json
{
  "name": "find_elements",
  "arguments": {
    "locator": {
      "kind": "selector",
      "value": ".cart-item"
    }
  }
}
```

#### 2. 修改商品数量

```json
{
  "name": "find_elements",
  "arguments": {
    "locator": {
      "kind": "selector",
      "value": ".cart-item .quantity-control .plus-btn"
    }
  }
}
```

```json
{
  "name": "click",
  "arguments": {
    "target": {
      "kind": "selector",
      "value": ".cart-item .quantity-control .plus-btn"
    }
  }
}
```

#### 3. 等待价格更新

```json
{
  "name": "wait_for",
  "arguments": {
    "target": {
      "kind": "selector",
      "value": ".total-price"
    },
    "timeout": 3000
  }
}
```

#### 4. 获取更新后的总价

```json
{
  "name": "find_elements",
  "arguments": {
    "locator": {
      "kind": "selector",
      "value": ".total-price"
    }
  }
}
```

### 阶段8：结算流程

#### 1. 点击结算按钮

```json
{
  "name": "click",
  "arguments": {
    "target": {
      "kind": "testId",
      "value": "checkout"
    }
  }
}
```

#### 2. 等待结算页面

```json
{
  "name": "wait_for",
  "arguments": {
    "target": {
      "kind": "selector",
      "value": ".checkout-page"
    },
    "timeout": 5000
  }
}
```

#### 3. 验证订单信息

```json
{
  "name": "find_elements",
  "arguments": {
    "locator": {
      "kind": "selector",
      "value": ".order-summary .order-item"
    }
  }
}
```

```json
{
  "name": "find_elements",
  "arguments": {
    "locator": {
      "kind": "selector",
      "value": ".order-total"
    }
  }
}
```

## 错误处理和边界情况

### 1. 商品缺货处理

```json
{
  "name": "find_elements",
  "arguments": {
    "locator": {
      "kind": "selector",
      "value": ".out-of-stock-notice"
    }
  }
}
```

如果发现缺货提示，选择其他商品：

```json
{
  "name": "find_elements",
  "arguments": {
    "locator": {
      "kind": "selector",
      "value": ".product-item:not(.out-of-stock)"
    }
  }
}
```

### 2. 规格选择验证

```json
{
  "name": "wait_for",
  "arguments": {
    "target": {
      "kind": "selector",
      "value": ".spec-required-tip"
    },
    "timeout": 1000
  }
}
```

如果出现规格选择提示，确保所有必需规格都已选择。

### 3. 购物车为空处理

```json
{
  "name": "find_elements",
  "arguments": {
    "locator": {
      "kind": "selector",
      "value": ".empty-cart-tip"
    }
  }
}
```

### 4. 网络错误重试

```json
{
  "name": "wait_for",
  "arguments": {
    "target": {
      "kind": "selector",
      "value": ".network-error, .loading-success"
    },
    "timeout": 10000
  }
}
```

## 性能优化建议

### 1. 批量查询

一次性查询多个相关元素：

```json
{
  "name": "find_elements",
  "arguments": {
    "locator": {
      "kind": "selector",
      "value": ".product-title, .product-price, .product-stock"
    }
  }
}
```

### 2. 条件等待

等待多个可能的状态：

```json
{
  "name": "wait_for",
  "arguments": {
    "target": {
      "kind": "selector",
      "value": ".success-message, .error-message"
    },
    "timeout": 8000
  }
}
```

### 3. 截图节点

在关键步骤添加截图，便于调试：

```json
{
  "name": "screenshot",
  "arguments": {
    "path": "/tmp/step-3-product-selected.png"
  }
}
```

## 测试验证点

1. **搜索功能**：验证搜索结果正确显示
2. **商品选择**：确认规格选择和数量调整
3. **购物车同步**：验证商品正确添加到购物车
4. **价格计算**：确认总价计算正确
5. **页面跳转**：验证各页面间导航正常

## 扩展场景

### 优惠券使用

```json
{
  "name": "find_elements",
  "arguments": {
    "locator": {
      "kind": "selector",
      "value": ".coupon-selector"
    }
  }
}
```

### 地址选择

```json
{
  "name": "wait_for",
  "arguments": {
    "target": {
      "kind": "selector",
      "value": ".address-list .address-item"
    },
    "timeout": 5000
  }
}
```

### 支付方式选择

```json
{
  "name": "find_elements",
  "arguments": {
    "locator": {
      "kind": "selector",
      "value": ".payment-method .method-option"
    }
  }
}
```
