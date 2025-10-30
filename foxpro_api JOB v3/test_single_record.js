/**
 * 测试单个记录生成PDF的脚本
 */

const { processRecordsByJobId } = require('./TEST_REPORT_FILE');

async function testSingleRecord() {
  try {
    console.log('Testing single record PDF generation...\n');
    
    // 使用您提供的job_id进行测试
    const jobId = 'JO25-01413';
    
    console.log(`Testing with job_id: ${jobId}`);
    
    const result = await processRecordsByJobId(jobId);
    
    console.log('\n=== Test Result ===');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log(`\n✅ Test completed successfully!`);
      console.log(`Total processed: ${result.results.length}`);
      console.log(`Successful: ${result.results.filter(r => r.success).length}`);
      console.log(`Failed: ${result.results.filter(r => !r.success).length}`);
    } else {
      console.log(`\n❌ Test failed: ${result.error || result.message}`);
    }
    
  } catch (error) {
    console.error('Test error:', error);
  }
}

// 运行测试
if (require.main === module) {
  testSingleRecord();
}

module.exports = { testSingleRecord };
