# Test Report API 使用说明

## 概述

Test Report JOB已经成功整合到foxpro_api JOB项目中，现在可以通过API接口来生成测试报告。

## 新增的API端点

### 1. 生成测试报告
**POST** `/generate-test-report`

根据提供的job_id生成测试报告，会自动：
- 获取该job_id的第一个cserial_no
- 处理该job_id的所有相关记录
- 为每条记录生成PDF测试报告
- 更新数据库中的tr_path字段

**请求参数：**
```json
{
  "job_id": "12345"
}
```

**响应示例：**
```json
{
  "success": true,
  "message": "Test report generation completed",
  "data": {
    "job_id": "12345",
    "first_cserial_no": "ABC123",
    "total_processed": 5,
    "successful": 4,
    "failed": 1,
    "results": [
      {
        "pk": 123,
        "cserial_no": "ABC123",
        "filePath": "V:\\TESTREPORT\\ABC123\\STARTER_123.pdf",
        "success": true
      }
    ]
  }
}
```

### 2. 获取第一个cserial_no
**GET** `/get-first-cserial/:job_id`

获取指定job_id的第一个cserial_no。

**响应示例：**
```json
{
  "success": true,
  "data": {
    "job_id": "12345",
    "first_cserial_no": "ABC123"
  }
}
```

### 3. 获取job的所有数据
**GET** `/get-job-data/:job_id`

获取指定job_id的所有相关数据。

**响应示例：**
```json
{
  "success": true,
  "data": {
    "job_id": "12345",
    "total_records": 5,
    "records": [
      {
        "pk": 123,
        "cserial_no": "ABC123",
        "reman_part": "STARTER",
        "job_id": "12345",
        // ... 其他字段
      }
    ]
  }
}
```

## 使用示例

### 使用curl测试API

```bash
# 生成测试报告
curl -X POST http://localhost:5202/generate-test-report \
  -H "Content-Type: application/json" \
  -d '{"job_id": "12345"}'

# 获取第一个cserial_no
curl http://localhost:5202/get-first-cserial/12345

# 获取job数据
curl http://localhost:5202/get-job-data/12345
```

### 使用Node.js测试

```javascript
const axios = require('axios');

async function generateTestReport(jobId) {
  try {
    const response = await axios.post('http://localhost:5202/generate-test-report', {
      job_id: jobId
    });
    console.log('Test report generated:', response.data);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

// 使用示例
generateTestReport('12345');
```

## 文件结构

```
foxpro_api JOB/
├── server.js                    # 主服务器文件（已更新）
├── PDF_ERP_FILE_FOXPRO.js      # PDF生成核心功能
├── TEST_REPORT_FILE.js         # 测试报告生成功能（新增）
├── pdf_template/               # PDF模板文件夹
├── test_api.js                 # API测试脚本（新增）
└── README_TEST_REPORT.md       # 本说明文件
```

## 功能特点

1. **自动获取第一个cserial_no**：根据job_id自动获取第一个cserial_no
2. **批量处理**：处理指定job_id的所有相关记录
3. **PDF生成**：为每条记录生成PDF测试报告
4. **数据库更新**：自动更新数据库中的tr_path字段
5. **错误处理**：完善的错误处理和日志记录
6. **API接口**：提供RESTful API接口供外部调用

## 注意事项

1. 确保数据库连接正常
2. 确保V:\TESTREPORT目录存在且有写入权限
3. 确保pdf_template文件夹中有可用的PDF模板文件
4. 测试报告只处理reman_part不是'RADIATOR'和'INTERCOOLER'的记录
5. 只处理complete_status为1且tr_path为NULL的记录

## 启动服务器

```bash
cd "foxpro_api JOB"
npm install
node server.js
```

服务器将在端口5202上启动。
