/**
 * 测试修复后的 generate-test-report API
 * 现在所有API都必须提供 job_id 和 reman_part 两个参数
 */

const axios = require('axios');

const API_BASE_URL = 'http://localhost:5202';

// 测试数据
const testData = {
  job_id: "JO25-01414",
  reman_part: "STARTER MOTOR"
};

async function testAPI() {
  console.log('=== 测试修复后的 generate-test-report API ===\n');

  try {
    // 测试1: 只提供 job_id (应该失败)
    console.log('测试1: 只提供 job_id (应该失败)');
    console.log('请求数据:', { job_id: testData.job_id });
    
    const response1 = await axios.post(`${API_BASE_URL}/generate-test-report`, {
      job_id: testData.job_id
    });
    
    console.log('响应状态:', response1.status);
    console.log('响应数据:', JSON.stringify(response1.data, null, 2));
    console.log('---\n');

  } catch (error) {
    console.log('测试1结果 (预期失败):', error.response?.data || error.message);
    console.log('---\n');
  }

  try {
    // 测试2: 提供 job_id 和 reman_part (应该成功)
    console.log('测试2: 提供 job_id 和 reman_part (应该成功)');
    console.log('请求数据:', testData);
    
    const response2 = await axios.post(`${API_BASE_URL}/generate-test-report`, testData);
    
    console.log('响应状态:', response2.status);
    console.log('响应数据:', JSON.stringify(response2.data, null, 2));
    console.log('---\n');

  } catch (error) {
    console.error('测试2失败:', error.response?.data || error.message);
    console.log('---\n');
  }

  try {
    // 测试3: 测试新的 GET 端点
    console.log('测试3: 测试 GET /get-first-cserial/:job_id/:reman_part');
    const getResponse = await axios.get(`${API_BASE_URL}/get-first-cserial/${testData.job_id}/${testData.reman_part}`);
    console.log('GET响应状态:', getResponse.status);
    console.log('GET响应数据:', JSON.stringify(getResponse.data, null, 2));
    console.log('---\n');

  } catch (error) {
    console.error('GET测试失败:', error.response?.data || error.message);
    console.log('---\n');
  }

  try {
    // 测试4: 测试健康检查
    console.log('测试4: 健康检查');
    const healthResponse = await axios.get(`${API_BASE_URL}/health`);
    console.log('健康检查响应:', JSON.stringify(healthResponse.data, null, 2));
    console.log('---\n');

  } catch (error) {
    console.error('健康检查失败:', error.response?.data || error.message);
  }
}

// 运行测试
if (require.main === module) {
  testAPI().catch(console.error);
}

module.exports = { testAPI };
