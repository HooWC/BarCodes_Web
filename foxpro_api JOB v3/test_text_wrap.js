/**
 * 测试文本自动换行功能
 * 使用长文本测试 ALTERNATOR 和 STARTER MOTOR 的自动换行
 */

const { processRecordsByJobIdAndPart } = require('./TEST_REPORT_FILE');

async function testTextWrap() {
  console.log('=== 测试文本自动换行功能 ===\n');

  // 测试数据 - 使用长文本
  const testData = {
    job_id: "JO25-01414",
    reman_part: "STARTER MOTOR"
  };

  try {
    console.log('测试 STARTER MOTOR 的自动换行功能...');
    console.log('Job ID:', testData.job_id);
    console.log('Part Type:', testData.reman_part);
    
    const result = await processRecordsByJobIdAndPart(testData.job_id, testData.reman_part);
    
    if (result.success) {
      console.log('✅ PDF 生成成功！');
      console.log('处理结果:', result.results);
    } else {
      console.log('❌ PDF 生成失败:', result.error);
    }

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }
}

// 运行测试
if (require.main === module) {
  testTextWrap().catch(console.error);
}

module.exports = { testTextWrap };
