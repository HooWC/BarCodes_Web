/**
 * 测试job_id PDF生成的脚本
 */

const { processRecordsByJobId } = require('./TEST_REPORT_FILE');

async function testJobPDF() {
  try {
    console.log('Testing job_id PDF generation...\n');
    
    // 使用您提供的job_id进行测试
    const jobId = 'JO25-01413';
    
    console.log(`Testing with job_id: ${jobId}`);
    
    const result = await processRecordsByJobId(jobId);
    
    console.log('\n=== Test Result ===');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log(`\n✅ Test completed successfully!`);
      console.log(`Total records: ${result.results.length}`);
      console.log(`All records should have the same file path`);
      
      // 检查所有记录是否有相同的文件路径
      const filePaths = [...new Set(result.results.map(r => r.filePath))];
      if (filePaths.length === 1) {
        console.log(`✅ All records point to the same file: ${filePaths[0]}`);
      } else {
        console.log(`❌ Records have different file paths: ${filePaths.join(', ')}`);
      }
    } else {
      console.log(`\n❌ Test failed: ${result.error || result.message}`);
    }
    
  } catch (error) {
    console.error('Test error:', error);
  }
}

// 运行测试
if (require.main === module) {
  testJobPDF();
}

module.exports = { testJobPDF };
