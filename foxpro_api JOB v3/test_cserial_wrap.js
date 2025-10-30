/**
 * 测试 cserial_no 换行功能
 * 使用您的实际 cserial_no: YV2XZX0A2KB887314
 */

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');

// 复制 drawTextWithWrap 函数用于测试
function drawTextWithWrap(page, text, options) {
  const { x, y, size, font, color, maxWidth = 200, lineHeight = 1.2, rotate } = options;
  
  const avgCharWidth = size * 0.6;
  const maxCharsPerLine = Math.floor(maxWidth / avgCharWidth);
  
  // 调试信息
  console.log(`drawTextWithWrap: text="${text}", maxWidth=${maxWidth}, maxCharsPerLine=${maxCharsPerLine}`);
  
  // 对于没有空格的字符串（如cserial_no），按字符分割
  const words = text.split('');
  const lines = [];
  let currentLine = '';
  
  for (const word of words) {
    const testLine = currentLine ? `${currentLine}${word}` : word;
    
    if (testLine.length > maxCharsPerLine && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  console.log(`drawTextWithWrap: 分割成 ${lines.length} 行:`, lines);
  
  lines.forEach((line, index) => {
    const drawOptions = {
      x: x,
      y: y - (index * size * lineHeight),
      size: size,
      font: font,
      color: color
    };
    
    // 如果提供了rotate参数，添加旋转
    if (rotate !== undefined) {
      drawOptions.rotate = rotate;
    }
    
    page.drawText(line, drawOptions);
  });
  
  return y - (lines.length * size * lineHeight);
}

async function testCserialWrap() {
  try {
    // 创建一个新的PDF文档
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 400]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    
    // 您的实际 cserial_no
    const cserialNo = "YV2XZX0A2KB887314";
    
    console.log('测试 cserial_no:', cserialNo);
    console.log('cserial_no 长度:', cserialNo.length);
    
    // 测试不同的 maxWidth 值
    const testCases = [
      { maxWidth: 10, y: 350, label: "maxWidth: 10" },
      { maxWidth: 20, y: 300, label: "maxWidth: 20" },
      { maxWidth: 30, y: 250, label: "maxWidth: 30" },
      { maxWidth: 50, y: 200, label: "maxWidth: 50" }
    ];
    
    testCases.forEach((testCase, index) => {
      console.log(`\n--- 测试 ${testCase.label} ---`);
      
      // 添加标签
      page.drawText(testCase.label, {
        x: 10,
        y: testCase.y + 20,
        size: 8,
        font: font,
        color: rgb(0.5, 0.5, 0.5)
      });
      
      // 使用 drawTextWithWrap 绘制文本
      drawTextWithWrap(page, cserialNo, {
        x: 50,
        y: testCase.y,
        size: 9,
        font: font,
        color: rgb(0, 0, 0),
        maxWidth: testCase.maxWidth,
        lineHeight: 1.2
      });
    });
    
    // 保存PDF
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync('test_cserial_wrap_output.pdf', pdfBytes);
    
    console.log('\n✅ 测试完成！PDF已保存为 test_cserial_wrap_output.pdf');
    console.log('请检查PDF文件查看不同 maxWidth 值的换行效果');
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

// 运行测试
if (require.main === module) {
  testCserialWrap().catch(console.error);
}

module.exports = { testCserialWrap };
