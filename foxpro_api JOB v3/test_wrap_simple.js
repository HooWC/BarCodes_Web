/**
 * 简单测试文本换行功能
 * 使用一个很长的字符串来测试换行
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
  
  // 如果文本包含空格，按单词分割；否则按字符分割
  let words;
  if (text.includes(' ')) {
    words = text.split(' ');
  } else {
    // 对于没有空格的字符串（如cserial_no），按字符分割
    words = text.split('');
  }
  
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

async function testWrap() {
  try {
    // 创建一个新的PDF文档
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 400]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    
    // 测试长字符串
    const longText = "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
    
    console.log('测试文本:', longText);
    console.log('文本长度:', longText.length);
    
    // 使用 drawTextWithWrap 绘制文本
    drawTextWithWrap(page, longText, {
      x: 50,
      y: 350,
      size: 12,
      font: font,
      color: rgb(0, 0, 0),
      maxWidth: 50,  // 设置较小的宽度强制换行
      lineHeight: 1.2
    });
    
    // 保存PDF
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync('test_wrap_output.pdf', pdfBytes);
    
    console.log('✅ 测试完成！PDF已保存为 test_wrap_output.pdf');
    console.log('请检查PDF文件查看换行效果');
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

// 运行测试
if (require.main === module) {
  testWrap().catch(console.error);
}

module.exports = { testWrap };
