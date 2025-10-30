/**
 * 测试Test Report API的脚本
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:5202';

async function testAPI() {
  try {
    console.log('Testing Test Report API...\n');

    // 测试健康检查
    console.log('1. Testing health check...');
    const healthResponse = await axios.get(`${BASE_URL}/health`);
    console.log('Health check response:', healthResponse.data);

    // 测试获取第一个cserial_no
    console.log('\n2. Testing get first cserial_no...');
    const testJobId = '12345'; // 替换为实际的job_id
    try {
      const cserialResponse = await axios.get(`${BASE_URL}/get-first-cserial/${testJobId}`);
      console.log('First cserial_no response:', cserialResponse.data);
    } catch (error) {
      console.log('First cserial_no error (expected if no data):', error.response?.data || error.message);
    }

    // 测试获取job数据
    console.log('\n3. Testing get job data...');
    try {
      const jobDataResponse = await axios.get(`${BASE_URL}/get-job-data/${testJobId}`);
      console.log('Job data response:', jobDataResponse.data);
    } catch (error) {
      console.log('Job data error (expected if no data):', error.response?.data || error.message);
    }

    // 测试生成测试报告
    console.log('\n4. Testing generate test report...');
    try {
      const testReportResponse = await axios.post(`${BASE_URL}/generate-test-report`, {
        job_id: testJobId
      });
      console.log('Test report response:', testReportResponse.data);
    } catch (error) {
      console.log('Test report error (expected if no data):', error.response?.data || error.message);
    }

    console.log('\nAPI testing completed!');

  } catch (error) {
    console.error('Error testing API:', error.message);
  }
}

// 运行测试
if (require.main === module) {
  testAPI();
}

module.exports = { testAPI };
