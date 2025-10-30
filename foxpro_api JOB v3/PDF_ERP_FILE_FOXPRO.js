const sql = require("mssql");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { PDFDocument, PDFForm, StandardFonts, rgb } = require("pdf-lib");
const bwipjs = require('bwip-js');

// 数据库配置
const dbConfig = {
  user: "InfoHSA",
  password: "hsonline",
  server: "HSPDC",
  database: "InfoHSA",
  options: {
    trustServerCertificate: true,
    encrypt: false,
    cryptoCredentialsDetails: {
      minVersion: 'TLSv1',
    },
  },
};

// PDF模板映射
const templateMapping = {
  'ALTERNATOR': 'pdf_template/Alternator.pdf',
  'BRAKE': 'pdf_template/Brake.pdf',
  'BRAKE SYSTEM': 'pdf_template/Brake.pdf',
  'INTERCOOLER': 'pdf_template/Intercooler.pdf',
  'RADIATOR': 'pdf_template/Radiator.pdf',
  'STARTER MOTOR': 'pdf_template/Starter.pdf',
  'TURBOCHARGER': 'pdf_template/Turbocharger.pdf',
};

// 零件类型到缩写的映射
const PART_TYPE_MAPPING = {
  "STARTER MOTOR": "STARTER MOTOR",
  "ALTERNATOR": "ALTERNATOR",
  "ALTERNATOR MOTOR": "ALTERNATOR MOTOR",
  "BRAKE": "BRAKE SYSTEM",
  "BRAKE SYSTEM": "BRAKE SYSTEM",
  "INTERCOOLER": "INTERCOOLER",
  "RADIATOR": "RADIATOR",
  "TURBOCHARGER": "TURBOCHARGER",
  "TURBO": "TUR"
};

// 获取REMAN文件夹路径
function getRemanPath() {
  return "V:\\REMAN";
}

// 根据chassis no创建文件夹路径
function getChassisPath(chassisNo) {
  const remanPath = getRemanPath();
  const cleanChassisNo = chassisNo.replace(/\*/g, "").trim();
  return path.join(remanPath, cleanChassisNo);
}

// 处理数据，将数组转换为字符串
function processDataValue(value) {
  if (Array.isArray(value)) {
    // 如果是数组，取第一个非空值
    const nonEmptyValue = value.find(v => v !== null && v !== undefined && v !== '');
    return nonEmptyValue || value[0] || '';
  }
  if (value === null || value === undefined) {
    return '';
  }
  // 去除字符串末尾的空格
  return String(value).trim();
}

// 自动换行文本绘制函数
function drawTextWithWrap(page, text, options) {
  const { x, y, size, font, color, maxWidth = 200, lineHeight = 1.2 } = options;
  
  // 计算单个字符的平均宽度（粗略估算）
  const avgCharWidth = size * 0.6;
  const maxCharsPerLine = Math.floor(maxWidth / avgCharWidth);
  
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    
    // 如果当前行加上新单词超过最大字符数，则换行
    if (testLine.length > maxCharsPerLine && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  
  // 添加最后一行
  if (currentLine) {
    lines.push(currentLine);
  }
  
  // 绘制每一行
  lines.forEach((line, index) => {
    page.drawText(line, {
      x: x,
      y: y - (index * size * lineHeight),
      size: size,
      font: font,
      color: color,
    });
  });
  
  // 返回下一行的y坐标
  return y - (lines.length * size * lineHeight);
}

// 生成条形码
async function generateBarcode(text) {
  try {
    //console.log('Generating barcode:', text);
    const buffer = await bwipjs.toBuffer({
      bcid: 'code128',       // Barcode type
      text: text,           // Text to encode
      scale: 3,             // Barcode scale
      height: 15,           // Barcode height
      textxalign: 'center', // Text horizontal alignment
      paddingwidth: 5,      // Left and right padding
      paddingheight: 5,     // Top and bottom padding
      monochrome: true,     // Monochrome
    });
    //console.log('Barcode generated successfully, buffer size:', buffer.length);
    return buffer;
  } catch (err) {
    console.error('Error generating barcode:', err);
    return null;
  }
}

// 绘制勾选符号
function drawCheckmark(page, x, y, size, color = rgb(0, 0, 0)) {
  // 绘制勾选符号的两条线
  const checkSize = size * 0.8;
  
  // 第一条线：从左下到中间
  page.drawLine({
    start: { x: x, y: y - checkSize * 0.3 },
    end: { x: x + checkSize * 0.4, y: y - checkSize * 0.7 },
    thickness: 1,
    color: color,
  });
  
  // 第二条线：从中间到右上
  page.drawLine({
    start: { x: x + checkSize * 0.4, y: y - checkSize * 0.7 },
    end: { x: x + checkSize, y: y },
    thickness: 1,
    color: color,
  });
}

function drawX(page, x, y, size, color = rgb(0, 0, 0)) {
  // 左上到右下
  page.drawLine({
    start: { x: x, y: y },
    end: { x: x + size, y: y - size },
    thickness: 1,
    color: color,
  });

  // 右上到左下
  page.drawLine({
    start: { x: x + size, y: y },
    end: { x: x, y: y - size },
    thickness: 1,
    color: color,
  });
}

// 在PDF上添加零件类型标记（已弃用，现在使用firstPage.drawText方式）
async function addPartTypeWatermark(pdfDoc, remanPart) {
  // 这个函数已经不再使用，零件类型标记现在通过firstPage.drawText添加
  // 保留此函数以维持向后兼容性
 // console.log('注意：addPartTypeWatermark函数已弃用，现在使用firstPage.drawText方式添加零件类型标记');
}

// 填写PDF表单
// 在PDF中嵌入图片
async function embedImageInPdf(pdfDoc, imageBuffer) {
  try {
    const image = await pdfDoc.embedPng(imageBuffer);
    return image;
  } catch (err) {
    //console.error('在PDF中嵌入图片时出错:', err);
    return null;
  }
}

// 加载签名图片
async function loadSignatureImage(pdfDoc, operatorName) {
  try {
    if (!operatorName || operatorName.trim() === '') {
      return null;
    }
    
    const signaturePath = `V:\\HSA\\CHECKLIST SIGN\\${operatorName.trim()}.png`;
    
    // 检查文件是否存在
    if (!fs.existsSync(signaturePath)) {
      console.log(`Signature image not found: ${signaturePath}`);
      return null;
    }
    
    // 读取图片文件
    const imageBuffer = fs.readFileSync(signaturePath);
    const image = await pdfDoc.embedPng(imageBuffer);
    
    console.log(`Signature image loaded: ${signaturePath}`);
    return image;
  } catch (error) {
    console.error(`Error loading signature image for ${operatorName}:`, error);
    return null;
  }
}

async function fillPdfForm(templatePath, data) {
  try {
    //console.log(`正在处理PDF模板: ${templatePath}`);
    
    // 读取PDF模板
    const existingPdfBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    
    // 获取表单
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    
    //console.log(`PDF表单包含 ${fields.length} 个字段:`);
    fields.forEach(field => {
      console.log(`- ${field.getName()}: ${field.constructor.name}`);
    });
    
    // 填写表单字段（根据你的数据库字段调整）
    try {
      // 表单字段映射，使用用户要求的字段
      const fieldMappings = {
        'chassis_no': processDataValue(data.cserial_no),
        'maker': `${processDataValue(data.maker)}`,
        'date_in': processDataValue(data.Date_In) ? new Date(processDataValue(data.Date_In)).toLocaleDateString('en-US') : 'N/A',
        'date_out': processDataValue(data.Date_Out) ? new Date(processDataValue(data.Date_Out)).toLocaleDateString('en-US') : 'N/A',
        'job_id': processDataValue(data.job_id),
        'reman_part': processDataValue(data.reman_part),
        'wo_no': processDataValue(data.wo_no),
        'OperatorNM': processDataValue(data.OperatorNM),
        'SupervisorNM': processDataValue(data.SupervisorNM),
        'pk': processDataValue(data.pk),
        'Cat1_dt': processDataValue(data.Cat1_dt),
        'Cat2_dt': processDataValue(data.Cat2_dt),
        'Cat3_dt': processDataValue(data.Cat3_dt),
        'Cat1_Status': processDataValue(data.Cat1_Status),
        'Cat2_Status': processDataValue(data.Cat2_Status),
        'Cat3_Status': processDataValue(data.Cat3_Status),
        // 也保留一些常见的字段名称以防PDF使用不同的命名
        'chassis': processDataValue(data.cserial_no),
        'make': processDataValue(data.maker),
        'fg_completedt': processDataValue(data.completedt) ? new Date(processDataValue(data.completedt)).toLocaleDateString('en-US') : 'N/A',
      };
      
      // 尝试填写表单字段
      for (const [fieldName, value] of Object.entries(fieldMappings)) {
        if (value !== undefined && value !== null) {
          try {
            const field = form.getTextField(fieldName);
            field.setText(String(value));
            //console.log(`已填写字段 ${fieldName}: ${value}`);
          } catch (e) {
            // 字段不存在或类型不匹配，跳过
            //console.log(`跳过字段 ${fieldName}: ${e.message}`);
          }
        }
      }
      
      // 即使有表单字段，也在PDF上添加零件类型标记
      if (fields.length > 0) {
        console.log('Add part type tags on PDFs with form fields');
        const pages = pdfDoc.getPages();
        const firstPage = pages[0];
        const { width, height } = firstPage.getSize();
        
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        
        // 零件类型标记
        const remanPartText = processDataValue(data.reman_part);
        const partAbbreviation = PART_TYPE_MAPPING[remanPartText.toUpperCase()] || "UNK";
        const partTypeDisplay = `[${partAbbreviation}]`;
        firstPage.drawText(partTypeDisplay, {
          x: 50,
          y: height - 50, // 更高的位置，避免与表单字段重叠
          size: 12,
          font: font,
          color: rgb(0, 0, 0),
        });
      }
      
      // 如果没有表单字段，我们可以在PDF上添加文本
      if (fields.length === 0) {
        //console.log('PDF has no form fields, will add text on first page');
        const pages = pdfDoc.getPages();
        const firstPage = pages[0];
        const { width, height } = firstPage.getSize();
        
        // 使用标准字体避免中文编码问题
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        
        await template_starter_motor(font, firstPage, height, data, pdfDoc);
        await template_intercooler(font, firstPage, height, data, pdfDoc);
        await template_turbocharger(font, firstPage, height, data, pdfDoc);
        await template_alternator(font, firstPage, height, data, pdfDoc);
        await template_radiator(font, firstPage, height, data, pdfDoc);
        await template_brake(font, firstPage, height, data, pdfDoc);
      }
      
    } catch (error) {
      console.error('Error filling out form:', error);
    }

    // 生成填写后的PDF
    const pdfBytes = await pdfDoc.save();
    return pdfBytes;
    
  } catch (error) {
    console.error('Error processing PDF:', error);
    throw error;
  }
}

// starter motor done
async function template_starter_motor(font, firstPage, height, data, pdfDoc){
  if(data.reman_part === 'STARTER MOTOR'){
    // WO NO
    firstPage.drawText(`${processDataValue(data.wo_no)}`, {
      x: 700,
      y: height - 30,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });

    // Chassis No
    firstPage.drawText(`${processDataValue(data.cserial_no)}`, {
      x: 508,
      y: height - 87,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });
    
    // Maker
    firstPage.drawText(`${processDataValue(data.maker)}`, {
      x: 47,
      y: height - 116,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });
    
    // Date In: 
    firstPage.drawText(`${processDataValue(data.Date_In) ? new Date(processDataValue(data.Date_In)).toLocaleDateString('en-GB') : 'N/A'}`, {
      x: 473,
      y: height - 116,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });
    
    // Date Out: 
    firstPage.drawText(`${processDataValue(data.Date_Out) ? new Date(processDataValue(data.Date_Out)).toLocaleDateString('en-GB') : 'N/A'}`, {
      x: 560,
      y: height - 116,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });

    // 生成并添加条形码
    const wo_no = processDataValue(data.wo_no);
    //console.log('工单号:', wo_no);
    if (wo_no) {
      try {
        //console.log('开始生成条形码...');
        const barcodeBuffer = await generateBarcode(wo_no);
        if (barcodeBuffer) {
          //console.log('开始嵌入条形码图片...');
          const barcodeImage = await pdfDoc.embedPng(barcodeBuffer);
          //console.log('条形码图片嵌入成功');
          
          const barcodeWidth = 140;  // 增加宽度
          const barcodeHeight = 30;   // 增加高度
          
          // 在页面顶部绘制条形码
          firstPage.drawImage(barcodeImage, {
            x: 540,
            y: height - 40,
            width: barcodeWidth,
            height: barcodeHeight,
          });
          
          //console.log('条形码绘制完成');
        } else {
          console.error('条形码生成失败');
        }
      } catch (err) {
        console.error('添加条形码时出错:', err);
        console.error(err.stack);
      }
    } else {
      console.log('没有找到工单号');
    }

     // Operator Name
     drawTextWithWrap(firstPage, `${processDataValue(data.OperatorNM)}`, {
       x: 147,
       y: height - 116,
       size: 9,
       font: font,
       color: rgb(0, 0, 0),
       maxWidth: 150, // 设置最大宽度
       lineHeight: 1.1
     });

     // Supervisor Name
     drawTextWithWrap(firstPage, `${processDataValue(data.SupervisorNM)}`, {
       x: 305,
       y: height - 116,
       size: 9,
       font: font,
       color: rgb(0, 0, 0),
       maxWidth: 150,
       lineHeight: 1.1
     });

     // Checked by
     drawTextWithWrap(firstPage, `${processDataValue(data.OperatorNM)}`, {
       x: 636,
       y: height - 109,
       size: 8,
       font: font,
       color: rgb(0, 0, 0),
       maxWidth: 90,
       lineHeight: 1.1
     });

      // 添加签名图片 - Operator
      try {
        const operatorSignature = await loadSignatureImage(pdfDoc, processDataValue(data.OperatorNM));
        if (operatorSignature) {
          firstPage.drawImage(operatorSignature, {
            x: 636,
            y: height - 100,
            width: 60,
            height: 20
          });
        }
      } catch (error) {
        console.error('Error adding operator signature:', error);
      }

     // Approved by
     drawTextWithWrap(firstPage, `${processDataValue(data.SupervisorNM)}`, {
       x: 720,
       y: height - 109,
       size: 8,
       font: font,
       color: rgb(0, 0, 0),
       maxWidth: 100,
       lineHeight: 1.1
     });

     // 添加签名图片 - Supervisor
     try {
      const supervisorSignature = await loadSignatureImage(pdfDoc, processDataValue(data.SupervisorNM));
      if (supervisorSignature) {
        firstPage.drawImage(supervisorSignature, {
          x: 720,
          y: height - 100,
          width: 60,
          height: 20
        });
      }
    } catch (error) {
      console.error('Error adding supervisor signature:', error);
    }

     const cat1Dt = processDataValue(data.Cat1_dt);
    const text1 = cat1Dt
      ? new Date(cat1Dt).getDate().toString().padStart(2, '0') + '/' +
        (new Date(cat1Dt).getMonth() + 1).toString().padStart(2, '0')
      : 'N/A';
      
    const positions_1 = [
      // Incoming Inspection / Core Management
      { x: 232, y: height - 181 },
      { x: 232, y: height - 196 },
      // Disassembly Process
      { x: 232, y: height - 224 },
      { x: 232, y: height - 239 },
      { x: 232, y: height - 254 },
      { x: 232, y: height - 269 },
      { x: 232, y: height - 284 },
      { x: 232, y: height - 299 },
      // Cleaning / Paint
      { x: 232, y: height - 327 },
      { x: 232, y: height - 342 },
      { x: 232, y: height - 357 },
      { x: 232, y: height - 372 },
      { x: 232, y: height - 387 },
      { x: 232, y: height - 402 },
    ];

    positions_1.forEach(pos => {
      drawTextWithWrap(firstPage, text1, { ...pos, size: 7 });
    });

    const cat2Dt = processDataValue(data.Cat2_dt);
    const text2 = cat2Dt
      ? new Date(cat2Dt).getDate().toString().padStart(2, '0') + '/' +
        (new Date(cat2Dt).getMonth() + 1).toString().padStart(2, '0')
      : 'N/A';
      
    const positions_2 = [
      // Remediate / Repair Activity
      { x: 232, y: height - 446 },
      { x: 232, y: height - 461 },
      { x: 232, y: height - 476 },
      { x: 232, y: height - 491 },
      { x: 232, y: height - 506 },
      { x: 232, y: height - 521 },
      // Re-assembly
      { x: 232, y: height - 564 }
    ];

    positions_2.forEach(pos => {
      drawTextWithWrap(firstPage, text2, { ...pos, size: 7 });
    });

    const cat3Dt = processDataValue(data.Cat3_dt);
    const text3 = cat3Dt
      ? new Date(cat3Dt).getDate().toString().padStart(2, '0') + '/' +
        (new Date(cat3Dt).getMonth() + 1).toString().padStart(2, '0')
      : 'N/A';
      
    const positions_3 = [
      // Alternator Assembly Inspection
      { x: 587, y: height - 438 },
      { x: 587, y: height - 453 },
      { x: 587, y: height - 468 },
      { x: 587, y: height - 486 },
    ];

    positions_3.forEach(pos => {
      drawTextWithWrap(firstPage, text3, { ...pos, size: 7 });
    });

    if(processDataValue(data.Cat1_Status)){
      // Part 1 ALL √
      drawCheckmark(firstPage, 272, height - 177, 7, rgb(0, 0, 0));
      drawCheckmark(firstPage, 272, height - 192, 7, rgb(0, 0, 0));

      drawCheckmark(firstPage, 272, height - 220, 7, rgb(0, 0, 0));
      drawCheckmark(firstPage, 272, height - 236, 7, rgb(0, 0, 0));
      drawCheckmark(firstPage, 272, height - 251, 7, rgb(0, 0, 0));
      drawCheckmark(firstPage, 272, height - 266, 7, rgb(0, 0, 0));
      drawCheckmark(firstPage, 272, height - 281, 7, rgb(0, 0, 0));
      drawCheckmark(firstPage, 272, height - 296, 7, rgb(0, 0, 0));

      drawCheckmark(firstPage, 272, height - 324, 7, rgb(0, 0, 0));
      drawCheckmark(firstPage, 272, height - 339, 7, rgb(0, 0, 0));
      drawCheckmark(firstPage, 272, height - 354, 7, rgb(0, 0, 0));
      drawCheckmark(firstPage, 272, height - 369, 7, rgb(0, 0, 0));
      drawCheckmark(firstPage, 272, height - 384, 7, rgb(0, 0, 0));
      drawCheckmark(firstPage, 272, height - 399, 7, rgb(0, 0, 0));
      // Part 1 ALL √
    }else{
      // Part 1 ALL X
      drawX(firstPage, 295, height - 176, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 191, 6, rgb(0, 0, 0));

      drawX(firstPage, 295, height - 219, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 235, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 250, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 265, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 280, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 295, 6, rgb(0, 0, 0));

      drawX(firstPage, 295, height - 323, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 338, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 353, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 368, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 383, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 398, 6, rgb(0, 0, 0));
      // Part 1 ALL X
    }
    
    if(processDataValue(data.Cat2_Status)){
      // Part 2 ALL √
      drawCheckmark(firstPage, 272, height - 441, 7, rgb(0, 0, 0));
      drawCheckmark(firstPage, 272, height - 456, 7, rgb(0, 0, 0));
      drawCheckmark(firstPage, 272, height - 471, 7, rgb(0, 0, 0));
      drawCheckmark(firstPage, 272, height - 486, 7, rgb(0, 0, 0));
      drawCheckmark(firstPage, 272, height - 501, 7, rgb(0, 0, 0));
      drawCheckmark(firstPage, 272, height - 516, 7, rgb(0, 0, 0));

      drawCheckmark(firstPage, 272, height - 559, 7, rgb(0, 0, 0)); 
      // Part 2 ALL √
    }else{
      // Part 2 All X
      drawX(firstPage, 295, height - 440, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 455, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 470, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 485, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 500, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 515, 6, rgb(0, 0, 0));

      drawX(firstPage, 295, height - 557, 6, rgb(0, 0, 0));
      // Part 2 All X
    }

     // Part 3 All OK
     // Last 1
    drawTextWithWrap(firstPage, `${processDataValue(data.Cat3_Status)}`, {
      x: 625,
      y: height - 438,
      size: 7
    });

    // Last 2
    drawTextWithWrap(firstPage, `${processDataValue(data.Cat3_Status)}`, {
      x: 625,
      y: height - 453,
      size: 7
    });

    // Last 3
    drawTextWithWrap(firstPage, `${processDataValue(data.Cat3_Status)}`, {
      x: 625,
      y: height - 468,
      size: 7
    });

    //  Last 4
    drawTextWithWrap(firstPage, `${processDataValue(data.Cat3_Status)}`, {
      x: 625,
      y: height - 486,
      size: 7
    });
     // Part 3 All OK

     firstPage.drawText(`${processDataValue(data.partno)}`, {
      x: 50,
      y: height - 87,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });

    const positions_4 = [
      // Incoming Inspection / Core Management
      { x: 312, y: height - 181 },
      { x: 312, y: height - 196 },
      // Disassembly Process
      { x: 312, y: height - 224 },
      { x: 312, y: height - 239 },
      { x: 312, y: height - 254 },
      { x: 312, y: height - 269 },
      { x: 312, y: height - 284 },
      { x: 312, y: height - 299 },
      // Cleaning / Paint
      { x: 312, y: height - 327 },
      { x: 312, y: height - 342 },
      { x: 312, y: height - 357 },
      { x: 312, y: height - 372 },
      { x: 312, y: height - 387 },
      { x: 312, y: height - 402 },
      // Remediate / Repair Activity
      { x: 312, y: height - 446 },
      { x: 312, y: height - 461 },
      { x: 312, y: height - 476 },
      { x: 312, y: height - 491 },
      { x: 312, y: height - 506 },
      { x: 312, y: height - 521 },
      // Re-assembly
      { x: 312, y: height - 564 },
      // Alternator Assembly Inspection
      { x: 651, y: height - 438 },
      { x: 651, y: height - 453 },
      { x: 651, y: height - 468 },
      { x: 651, y: height - 486 },
    ];
    
    for (let i = 0; i < positions_4.length; i++) {
      const prop = `Rem${i + 1}`;
      const position = positions_4[i];
      
      if (data[prop]) {
        const remText = processDataValue(data[prop]);
        drawTextWithWrap(firstPage, remText, { ...position, size: 8.5 });
      }
    }
  }
}

// intercooler done
async function template_intercooler(font, firstPage, height, data, pdfDoc){
  if(data.reman_part === 'INTERCOOLER'){
    // WO NO
    firstPage.drawText(`${processDataValue(data.wo_no)}`, {
      x: 710,
      y: height - 85,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });

    // Chassis No
    firstPage.drawText(`${processDataValue(data.cserial_no)}`, {
      x: 520,
      y: height - 129,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });
    
    // Maker
    firstPage.drawText(`${processDataValue(data.maker)}`, {
      x: 51,
      y: height - 159,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });
    
    // Date In: 
    firstPage.drawText(`${processDataValue(data.Date_In) ? new Date(processDataValue(data.Date_In)).toLocaleDateString('en-GB') : 'N/A'}`, {
      x: 485,
      y: height - 159,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });
    
    // Date Out: 
    firstPage.drawText(`${processDataValue(data.Date_Out) ? new Date(processDataValue(data.Date_Out)).toLocaleDateString('en-GB') : 'N/A'}`, {
      x: 575,
      y: height - 159,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });

    // 生成并添加条形码
    const wo_no = processDataValue(data.wo_no);
    //console.log('工单号:', wo_no);
    if (wo_no) {
      try {
        //console.log('开始生成条形码...');
        const barcodeBuffer = await generateBarcode(wo_no);
        if (barcodeBuffer) {
          //console.log('开始嵌入条形码图片...');
          const barcodeImage = await pdfDoc.embedPng(barcodeBuffer);
          //console.log('条形码图片嵌入成功');
          
          const barcodeWidth = 140;  // 增加宽度
          const barcodeHeight = 30;   // 增加高度
          
          // 在页面顶部绘制条形码
          firstPage.drawImage(barcodeImage, {
            x: 550,
            y: height - 95,
            width: barcodeWidth,
            height: barcodeHeight,
          });
          
          //console.log('条形码绘制完成');
        } else {
          console.error('条形码生成失败');
        }
      } catch (err) {
        console.error('添加条形码时出错:', err);
        console.error(err.stack);
      }
    } else {
      console.log('没有找到工单号');
    }

     // Operator Name
     drawTextWithWrap(firstPage, `${processDataValue(data.OperatorNM)}`, {
       x: 157,
       y: height - 159,
       size: 9,
       font: font,
       color: rgb(0, 0, 0),
       maxWidth: 150, // 设置最大宽度
       lineHeight: 1.1
     });

     // Supervisor Name
     drawTextWithWrap(firstPage, `${processDataValue(data.SupervisorNM)}`, {
       x: 314,
       y: height - 159,
       size: 9,
       font: font,
       color: rgb(0, 0, 0),
       maxWidth: 150,
       lineHeight: 1.1
     });

     // Checked by
     drawTextWithWrap(firstPage, `${processDataValue(data.OperatorNM)}`, {
       x: 650,
       y: height - 153,
       size: 8,
       font: font,
       color: rgb(0, 0, 0),
       maxWidth: 90,
       lineHeight: 1.1
     });

      // 添加签名图片 - Operator
      try {
        const operatorSignature = await loadSignatureImage(pdfDoc, processDataValue(data.OperatorNM));
        if (operatorSignature) {
          firstPage.drawImage(operatorSignature, {
            x: 650,
            y: height - 143,
            width: 60,
            height: 20
          });
        }
      } catch (error) {
        console.error('Error adding operator signature:', error);
      }

     // Approved by
     drawTextWithWrap(firstPage, `${processDataValue(data.SupervisorNM)}`, {
       x: 740,
       y: height - 153,
       size: 8,
       font: font,
       color: rgb(0, 0, 0),
       maxWidth: 100,
       lineHeight: 1.1
     });

     // 添加签名图片 - Supervisor
     try {
      const supervisorSignature = await loadSignatureImage(pdfDoc, processDataValue(data.SupervisorNM));
      if (supervisorSignature) {
        firstPage.drawImage(supervisorSignature, {
          x: 740,
          y: height - 143,
          width: 60,
          height: 20
        });
      }
    } catch (error) {
      console.error('Error adding supervisor signature:', error);
    }

     const cat1Dt = processDataValue(data.Cat1_dt);
    const text1 = cat1Dt
      ? new Date(cat1Dt).getDate().toString().padStart(2, '0') + '/' +
        (new Date(cat1Dt).getMonth() + 1).toString().padStart(2, '0')
      : 'N/A';
      
    const positions_1 = [
      // Incoming Inspection / Core Management
      { x: 241, y: height - 228 },
      { x: 241, y: height - 243 },
      // Disassembly Process
      { x: 241, y: height - 270 },
      { x: 241, y: height - 287 },
      { x: 241, y: height - 302 },
      // Cleaning / Paint
      { x: 241, y: height - 348 },
      { x: 241, y: height - 362 },
      { x: 241, y: height - 376 }
    ];

    positions_1.forEach(pos => {
      drawTextWithWrap(firstPage, text1, { ...pos, size: 7 });
    });

    const cat2Dt = processDataValue(data.Cat2_dt);
    const text2 = cat2Dt
      ? new Date(cat2Dt).getDate().toString().padStart(2, '0') + '/' +
        (new Date(cat2Dt).getMonth() + 1).toString().padStart(2, '0')
      : 'N/A';
      
    const positions_2 = [
      // Remediate / Repair Activity
      { x: 240, y: height - 421 },
      { x: 240, y: height - 436 },
      { x: 240, y: height - 451 },
      // Re-assembly
      { x: 240, y: height - 496 }
    ];

    positions_2.forEach(pos => {
      drawTextWithWrap(firstPage, text2, { ...pos, size: 7 });
    });

    const cat3Dt = processDataValue(data.Cat3_dt);
    const text3 = cat3Dt
      ? new Date(cat3Dt).getDate().toString().padStart(2, '0') + '/' +
        (new Date(cat3Dt).getMonth() + 1).toString().padStart(2, '0')
      : 'N/A';
      
    const positions_3 = [
      // Alternator Assembly Inspection
      { x: 602, y: height - 471 },
      { x: 602, y: height - 487 },
      { x: 602, y: height - 503 },
      { x: 602, y: height - 522 },
    ];

    positions_3.forEach(pos => {
      drawTextWithWrap(firstPage, text3, { ...pos, size: 7 });
    });

    if(processDataValue(data.Cat1_Status)){
      // Part 1 ALL √
      drawCheckmark(firstPage, 281, height - 225, 7, rgb(0, 0, 0));
      drawCheckmark(firstPage, 281, height - 240, 7, rgb(0, 0, 0));

      drawCheckmark(firstPage, 281, height - 267, 7, rgb(0, 0, 0));
      drawCheckmark(firstPage, 281, height - 284, 7, rgb(0, 0, 0));
      drawCheckmark(firstPage, 281, height - 299, 7, rgb(0, 0, 0));

      drawCheckmark(firstPage, 281, height - 345, 7, rgb(0, 0, 0));
      drawCheckmark(firstPage, 281, height - 359, 7, rgb(0, 0, 0));
      drawCheckmark(firstPage, 281, height - 373, 7, rgb(0, 0, 0));
      // Part 1 ALL √
    }else{
      // Part 1 ALL X
      drawX(firstPage, 305, height - 225, 6, rgb(0, 0, 0));
      drawX(firstPage, 305, height - 240, 6, rgb(0, 0, 0));

      drawX(firstPage, 305, height - 267, 6, rgb(0, 0, 0));
      drawX(firstPage, 305, height - 284, 6, rgb(0, 0, 0));
      drawX(firstPage, 305, height - 299, 6, rgb(0, 0, 0));

      drawX(firstPage, 305, height - 345, 6, rgb(0, 0, 0));
      drawX(firstPage, 305, height - 359, 6, rgb(0, 0, 0));
      drawX(firstPage, 305, height - 373, 6, rgb(0, 0, 0));
      // Part 1 ALL X
    }
    
    if(processDataValue(data.Cat2_Status)){
      // Part 2 ALL √
      drawCheckmark(firstPage, 281, height - 417, 7, rgb(0, 0, 0));
      drawCheckmark(firstPage, 281, height - 433, 7, rgb(0, 0, 0));
      drawCheckmark(firstPage, 281, height - 448, 7, rgb(0, 0, 0));

      drawCheckmark(firstPage, 281, height - 493, 7, rgb(0, 0, 0)); 
      // Part 2 ALL √
    }else{
      // Part 2 All X
      drawX(firstPage, 305, height - 417, 6, rgb(0, 0, 0));
      drawX(firstPage, 305, height - 433, 6, rgb(0, 0, 0));
      drawX(firstPage, 305, height - 448, 6, rgb(0, 0, 0));

      drawX(firstPage, 305, height - 493, 6, rgb(0, 0, 0));
      // Part 2 All X
    }
     
     // Part 3 All OK
     // Last 1
    drawTextWithWrap(firstPage, `${processDataValue(data.Cat3_Status)}`, {
      x: 641,
      y: height - 471,
      size: 7
    });

    // Last 2
    drawTextWithWrap(firstPage, `${processDataValue(data.Cat3_Status)}`, {
      x: 641,
      y: height - 487,
      size: 7
    });

    // Last 3
    drawTextWithWrap(firstPage, `${processDataValue(data.Cat3_Status)}`, {
      x: 641,
      y: height - 503,
      size: 7
    });

    //  Last 4
    drawTextWithWrap(firstPage, `${processDataValue(data.Cat3_Status)}`, {
      x: 641,
      y: height - 522,
      size: 7
    });
     // Part 3 All OK

     firstPage.drawText(`${processDataValue(data.partno)}`, {
      x: 57,
      y: height - 129,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });

    const positions_4 = [
      // Incoming Inspection / Core Management
      { x: 320, y: height - 228 },
      { x: 320, y: height - 243 },
      // Disassembly Process
      { x: 320, y: height - 270 },
      { x: 320, y: height - 287 },
      { x: 320, y: height - 302 },
      // Cleaning / Paint
      { x: 320, y: height - 348 },
      { x: 320, y: height - 362 },
      { x: 320, y: height - 376 },
      // Remediate / Repair Activity
      { x: 320, y: height - 421 },
      { x: 320, y: height - 436 },
      { x: 320, y: height - 451 },
      // Re-assembly
      { x: 320, y: height - 496 },
      // Alternator Assembly Inspection
      { x: 666, y: height - 471 },
      { x: 666, y: height - 487 },
      { x: 666, y: height - 503 },
      { x: 666, y: height - 522 },
    ];
    
    for (let i = 0; i < positions_4.length; i++) {
      const prop = `Rem${i + 1}`;
      const position = positions_4[i];
      
      if (data[prop]) {
        const remText = processDataValue(data[prop]);
        drawTextWithWrap(firstPage, remText, { ...position, size: 8.5 });
      }
    }
  }
}

// turbocharger done
async function template_turbocharger(font, firstPage, height, data, pdfDoc){
  if(data.reman_part === 'TURBOCHARGER'){
    // WO NO
    firstPage.drawText(`${processDataValue(data.wo_no)}`, {
      x: 700,
      y: height - 40,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });

    // Chassis No
    firstPage.drawText(`${processDataValue(data.cserial_no)}`, {
      x: 508,
      y: height - 85,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });
    
    // Maker
    firstPage.drawText(`${processDataValue(data.maker)}`, {
      x: 48,
      y: height - 114,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });
    
    // Date In: 
    firstPage.drawText(`${processDataValue(data.Date_In) ? new Date(processDataValue(data.Date_In)).toLocaleDateString('en-GB') : 'N/A'}`, {
      x: 473,
      y: height - 114,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });
    
    // Date Out: 
    firstPage.drawText(`${processDataValue(data.Date_Out) ? new Date(processDataValue(data.Date_Out)).toLocaleDateString('en-GB') : 'N/A'}`, {
      x: 560,
      y: height - 114,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });

    // 生成并添加条形码
    const wo_no = processDataValue(data.wo_no);
    //console.log('工单号:', wo_no);
    if (wo_no) {
      try {
        //console.log('开始生成条形码...');
        const barcodeBuffer = await generateBarcode(wo_no);
        if (barcodeBuffer) {
          //console.log('开始嵌入条形码图片...');
          const barcodeImage = await pdfDoc.embedPng(barcodeBuffer);
          //console.log('条形码图片嵌入成功');
          
          const barcodeWidth = 140;  // 增加宽度
          const barcodeHeight = 30;   // 增加高度
          
          // 在页面顶部绘制条形码
          firstPage.drawImage(barcodeImage, {
            x: 540,
            y: height - 50,
            width: barcodeWidth,
            height: barcodeHeight,
          });
          
          //console.log('条形码绘制完成');
        } else {
          console.error('条形码生成失败');
        }
      } catch (err) {
        console.error('添加条形码时出错:', err);
        console.error(err.stack);
      }
    } else {
      console.log('没有找到工单号');
    }

     // Operator Name
     drawTextWithWrap(firstPage, `${processDataValue(data.OperatorNM)}`, {
       x: 147,
       y: height - 114,
       size: 9,
       font: font,
       color: rgb(0, 0, 0),
       maxWidth: 150, // 设置最大宽度
       lineHeight: 1.1
     });

     // Supervisor Name
     drawTextWithWrap(firstPage, `${processDataValue(data.SupervisorNM)}`, {
       x: 304,
       y: height - 114,
       size: 9,
       font: font,
       color: rgb(0, 0, 0),
       maxWidth: 150,
       lineHeight: 1.1
     });

     // Checked by
     drawTextWithWrap(firstPage, `${processDataValue(data.OperatorNM)}`, {
       x: 636,
       y: height - 108,
       size: 8,
       font: font,
       color: rgb(0, 0, 0),
       maxWidth: 90,
       lineHeight: 1.1
     });

      // 添加签名图片 - Operator
      try {
        const operatorSignature = await loadSignatureImage(pdfDoc, processDataValue(data.OperatorNM));
        if (operatorSignature) {
          firstPage.drawImage(operatorSignature, {
            x: 636,
            y: height - 98,
            width: 60,
            height: 20
          });
        }
      } catch (error) {
        console.error('Error adding operator signature:', error);
      }

     // Approved by
     drawTextWithWrap(firstPage, `${processDataValue(data.SupervisorNM)}`, {
       x: 720,
       y: height - 108,
       size: 8,
       font: font,
       color: rgb(0, 0, 0),
       maxWidth: 100,
       lineHeight: 1.1
     });

     // 添加签名图片 - Supervisor
     try {
      const supervisorSignature = await loadSignatureImage(pdfDoc, processDataValue(data.SupervisorNM));
      if (supervisorSignature) {
        firstPage.drawImage(supervisorSignature, {
          x: 720,
          y: height - 98,
          width: 60,
          height: 20
        });
      }
    } catch (error) {
      console.error('Error adding supervisor signature:', error);
    }

     const cat1Dt = processDataValue(data.Cat1_dt);
    const text1 = cat1Dt
      ? new Date(cat1Dt).getDate().toString().padStart(2, '0') + '/' +
        (new Date(cat1Dt).getMonth() + 1).toString().padStart(2, '0')
      : 'N/A';
      
    const positions_1 = [
      // Incoming Inspection / Core Management
      { x: 232, y: height - 180 },
      { x: 232, y: height - 195 },
      // Disassembly Process
      { x: 232, y: height - 223 },
      { x: 232, y: height - 238 },
      { x: 232, y: height - 253 },
      { x: 232, y: height - 268 },
      { x: 232, y: height - 283 },
      { x: 232, y: height - 299 },
      // Cleaning / Paint
      { x: 232, y: height - 327 },
      { x: 232, y: height - 342 },
      { x: 232, y: height - 357 },
      { x: 232, y: height - 372 },
      { x: 232, y: height - 387 },
      { x: 232, y: height - 401 },
    ];

    positions_1.forEach(pos => {
      drawTextWithWrap(firstPage, text1, { ...pos, size: 7 });
    });

    const cat2Dt = processDataValue(data.Cat2_dt);
    const text2 = cat2Dt
      ? new Date(cat2Dt).getDate().toString().padStart(2, '0') + '/' +
        (new Date(cat2Dt).getMonth() + 1).toString().padStart(2, '0')
      : 'N/A';
      
    const positions_2 = [
      // Remediate / Repair Activity
      { x: 232, y: height - 445 },
      { x: 232, y: height - 460 },
      { x: 232, y: height - 475 },
      { x: 232, y: height - 490 },
      { x: 232, y: height - 505 },
      { x: 232, y: height - 520 },
      // Re-assembly
      { x: 232, y: height - 562 }
    ];

    positions_2.forEach(pos => {
      drawTextWithWrap(firstPage, text2, { ...pos, size: 7 });
    });

    const cat3Dt = processDataValue(data.Cat3_dt);
    const text3 = cat3Dt
      ? new Date(cat3Dt).getDate().toString().padStart(2, '0') + '/' +
        (new Date(cat3Dt).getMonth() + 1).toString().padStart(2, '0')
      : 'N/A';
      
    const positions_3 = [
      // Alternator Assembly Inspection
      { x: 587, y: height - 451 },
      { x: 587, y: height - 466 },
      { x: 587, y: height - 482 },
      { x: 587, y: height - 503 },
    ];

    positions_3.forEach(pos => {
      drawTextWithWrap(firstPage, text3, { ...pos, size: 7 });
    });

    if(processDataValue(data.Cat1_Status)){
      // Part 1 ALL √
     drawCheckmark(firstPage, 272, height - 176, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 191, 7, rgb(0, 0, 0));

     drawCheckmark(firstPage, 272, height - 219, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 234, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 249, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 264, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 279, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 294, 7, rgb(0, 0, 0));

     drawCheckmark(firstPage, 272, height - 322, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 337, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 352, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 367, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 382, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 397, 7, rgb(0, 0, 0));
     // Part 1 ALL √
    }else{
      // Part 1 ALL X
      drawX(firstPage, 295, height - 175, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 190, 6, rgb(0, 0, 0));

      drawX(firstPage, 295, height - 218, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 234, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 248, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 263, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 278, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 293, 6, rgb(0, 0, 0));

      drawX(firstPage, 295, height - 321, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 336, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 351, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 366, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 381, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 396, 6, rgb(0, 0, 0));
      // Part 1 ALL X
    }

     if(processDataValue(data.Cat2_Status)){
      // Part 2 ALL √
     drawCheckmark(firstPage, 272, height - 439, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 454, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 469, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 484, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 499, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 513, 7, rgb(0, 0, 0));

     drawCheckmark(firstPage, 272, height - 556, 7, rgb(0, 0, 0)); 
     // Part 2 ALL √
     }else{
      // Part 2 All X
     drawX(firstPage, 295, height - 439, 6, rgb(0, 0, 0));
     drawX(firstPage, 295, height - 454, 6, rgb(0, 0, 0));
     drawX(firstPage, 295, height - 469, 6, rgb(0, 0, 0));
     drawX(firstPage, 295, height - 484, 6, rgb(0, 0, 0));
     drawX(firstPage, 295, height - 499, 6, rgb(0, 0, 0));
     drawX(firstPage, 295, height - 513, 6, rgb(0, 0, 0));

     drawX(firstPage, 295, height - 556, 6, rgb(0, 0, 0));
     // Part 2 All X
     }

     // Part 3 All OK
     // Last 1
    drawTextWithWrap(firstPage, `${processDataValue(data.Cat3_Status)}`, {
      x: 628,
      y: height - 451,
      size: 7
    });

    // Last 2
    drawTextWithWrap(firstPage, `${processDataValue(data.Cat3_Status)}`, {
      x: 628,
      y: height - 466,
      size: 7
    });

    // Last 3
    drawTextWithWrap(firstPage, `${processDataValue(data.Cat3_Status)}`, {
      x: 628,
      y: height - 482,
      size: 7
    });

    //  Last 4
    drawTextWithWrap(firstPage, `${processDataValue(data.Cat3_Status)}`, {
      x: 628,
      y: height - 503,
      size: 7
    });
     // Part 3 All OK

     firstPage.drawText(`${processDataValue(data.partno)}`, {
      x: 50,
      y: height - 85,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });

    const positions_4 = [
      // Incoming Inspection / Core Management
      { x: 312, y: height - 180 },
      { x: 312, y: height - 195 },
      // Disassembly Process
      { x: 312, y: height - 223 },
      { x: 312, y: height - 238 },
      { x: 312, y: height - 253 },
      { x: 312, y: height - 268 },
      { x: 312, y: height - 283 },
      { x: 312, y: height - 299 },
      // Cleaning / Paint
      { x: 312, y: height - 327 },
      { x: 312, y: height - 342 },
      { x: 312, y: height - 357 },
      { x: 312, y: height - 372 },
      { x: 312, y: height - 387 },
      { x: 312, y: height - 401 },
      // Remediate / Repair Activity
      { x: 312, y: height - 445 },
      { x: 312, y: height - 460 },
      { x: 312, y: height - 475 },
      { x: 312, y: height - 490 },
      { x: 312, y: height - 505 },
      { x: 312, y: height - 520 },
      // Re-assembly
      { x: 312, y: height - 562 },
      // Alternator Assembly Inspection
      { x: 655, y: height - 451 },
      { x: 655, y: height - 466 },
      { x: 655, y: height - 482 },
      { x: 655, y: height - 503 },
    ];
    
    for (let i = 0; i < positions_4.length; i++) {
      const prop = `Rem${i + 1}`;
      const position = positions_4[i];
      
      if (data[prop]) {
        const remText = processDataValue(data[prop]);
        drawTextWithWrap(firstPage, remText, { ...position, size: 8.5 });
      }
    }
  }
}

// alternator done
async function template_alternator(font, firstPage, height, data, pdfDoc){
  if(data.reman_part === 'ALTERNATOR'){
    // WO NO
    firstPage.drawText(`${processDataValue(data.wo_no)}`, {
      x: 700,
      y: height - 40,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });

    // Chassis No
    firstPage.drawText(`${processDataValue(data.cserial_no)}`, {
      x: 508,
      y: height - 87,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });
    
    // Maker
    firstPage.drawText(`${processDataValue(data.maker)}`, {
      x: 50,
      y: height - 116,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });
    
    // Date In: 
    firstPage.drawText(`${processDataValue(data.Date_In) ? new Date(processDataValue(data.Date_In)).toLocaleDateString('en-GB') : 'N/A'}`, {
      x: 473,
      y: height - 116,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });
    
    // Date Out: 
    firstPage.drawText(`${processDataValue(data.Date_Out) ? new Date(processDataValue(data.Date_Out)).toLocaleDateString('en-GB') : 'N/A'}`, {
      x: 560,
      y: height - 116,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });
    
    // 生成并添加条形码
    const wo_no = processDataValue(data.wo_no);
    //console.log('工单号:', wo_no);
    if (wo_no) {
      try {
        //console.log('开始生成条形码...');
        const barcodeBuffer = await generateBarcode(wo_no);
        if (barcodeBuffer) {
          //console.log('开始嵌入条形码图片...');
          const barcodeImage = await pdfDoc.embedPng(barcodeBuffer);
          //console.log('条形码图片嵌入成功');
          
          const barcodeWidth = 140;  // 增加宽度
          const barcodeHeight = 30;   // 增加高度
          
          // 在页面顶部绘制条形码
          firstPage.drawImage(barcodeImage, {
            x: 540,
            y: height - 50,
            width: barcodeWidth,
            height: barcodeHeight,
          });
          
          //console.log('条形码绘制完成');
        } else {
          console.error('条形码生成失败');
        }
      } catch (err) {
        console.error('添加条形码时出错:', err);
        console.error(err.stack);
      }
    } else {
      console.log('没有找到工单号');
    }
     // Operator Name
     drawTextWithWrap(firstPage, `${processDataValue(data.OperatorNM)}`, {
       x: 147,
       y: height - 116,
       size: 9,
       font: font,
       color: rgb(0, 0, 0),
       maxWidth: 150, // 设置最大宽度
       lineHeight: 1.1
     });

     // Supervisor Name
     drawTextWithWrap(firstPage, `${processDataValue(data.SupervisorNM)}`, {
       x: 300,
       y: height - 116,
       size: 9,
       font: font,
       color: rgb(0, 0, 0),
       maxWidth: 150,
       lineHeight: 1.1
     });

     // Checked by
     drawTextWithWrap(firstPage, `${processDataValue(data.OperatorNM)}`, {
       x: 636,
       y: height - 109,
       size: 8,
       font: font,
       color: rgb(0, 0, 0),
       maxWidth: 90,
       lineHeight: 1.1
     });

      // 添加签名图片 - Operator
      try {
        const operatorSignature = await loadSignatureImage(pdfDoc, processDataValue(data.OperatorNM));
        if (operatorSignature) {
          firstPage.drawImage(operatorSignature, {
            x: 636,
            y: height - 100,
            width: 60,
            height: 20
          });
        }
      } catch (error) {
        console.error('Error adding operator signature:', error);
      }

     // Approved by
     drawTextWithWrap(firstPage, `${processDataValue(data.SupervisorNM)}`, {
       x: 720,
       y: height - 109,
       size: 8,
       font: font,
       color: rgb(0, 0, 0),
       maxWidth: 100,
       lineHeight: 1.1
     });

     // 添加签名图片 - Supervisor
     try {
      const supervisorSignature = await loadSignatureImage(pdfDoc, processDataValue(data.SupervisorNM));
      if (supervisorSignature) {
        firstPage.drawImage(supervisorSignature, {
          x: 720,
          y: height - 100,
          width: 60,
          height: 20
        });
      }
    } catch (error) {
      console.error('Error adding supervisor signature:', error);
    }

    const cat1Dt = processDataValue(data.Cat1_dt);
    const text1 = cat1Dt
      ? new Date(cat1Dt).getDate().toString().padStart(2, '0') + '/' +
        (new Date(cat1Dt).getMonth() + 1).toString().padStart(2, '0')
      : 'N/A';
      
    const positions_1 = [
      // Incoming Inspection / Core Management
      { x: 232, y: height - 181 },
      { x: 232, y: height - 196 },
      // Disassembly Process
      { x: 232, y: height - 224 },
      { x: 232, y: height - 239 },
      { x: 232, y: height - 254 },
      { x: 232, y: height - 269 },
      { x: 232, y: height - 284 },
      { x: 232, y: height - 299 },
      // Cleaning / Paint
      { x: 232, y: height - 327 },
      { x: 232, y: height - 342 },
      { x: 232, y: height - 357 },
      { x: 232, y: height - 372 },
      { x: 232, y: height - 387 },
      { x: 232, y: height - 402 },
      { x: 232, y: height - 417 },
    ];

    positions_1.forEach(pos => {
      drawTextWithWrap(firstPage, text1, { ...pos, size: 7 });
    });

    const cat2Dt = processDataValue(data.Cat2_dt);
    const text2 = cat2Dt
      ? new Date(cat2Dt).getDate().toString().padStart(2, '0') + '/' +
        (new Date(cat2Dt).getMonth() + 1).toString().padStart(2, '0')
      : 'N/A';
      
    const positions_2 = [
      // Remediate / Repair Activity
      { x: 232, y: height - 445 },
      { x: 232, y: height - 460 },
      { x: 232, y: height - 475 },
      { x: 232, y: height - 490 },
      { x: 232, y: height - 505 },
      { x: 232, y: height - 520 },
      { x: 232, y: height - 535 },
      // Re-assembly
      { x: 232, y: height - 564 }
    ];

    positions_2.forEach(pos => {
      drawTextWithWrap(firstPage, text2, { ...pos, size: 7 });
    });

    const cat3Dt = processDataValue(data.Cat3_dt);
    const text3 = cat3Dt
      ? new Date(cat3Dt).getDate().toString().padStart(2, '0') + '/' +
        (new Date(cat3Dt).getMonth() + 1).toString().padStart(2, '0')
      : 'N/A';
      
    const positions_3 = [
      // Alternator Assembly Inspection
      { x: 593, y: height - 443 },
      { x: 593, y: height - 457 },
      { x: 593, y: height - 472 },
      { x: 593, y: height - 486 },
    ];

    positions_3.forEach(pos => {
      drawTextWithWrap(firstPage, text3, { ...pos, size: 7 });
    });

    if(processDataValue(data.Cat1_Status)){
        // Part 1 ALL √
        drawCheckmark(firstPage, 272, height - 177, 7, rgb(0, 0, 0));
        drawCheckmark(firstPage, 272, height - 192, 7, rgb(0, 0, 0));

        drawCheckmark(firstPage, 272, height - 220, 7, rgb(0, 0, 0));
        drawCheckmark(firstPage, 272, height - 236, 7, rgb(0, 0, 0));
        drawCheckmark(firstPage, 272, height - 251, 7, rgb(0, 0, 0));
        drawCheckmark(firstPage, 272, height - 266, 7, rgb(0, 0, 0));
        drawCheckmark(firstPage, 272, height - 281, 7, rgb(0, 0, 0));
        drawCheckmark(firstPage, 272, height - 296, 7, rgb(0, 0, 0));

        drawCheckmark(firstPage, 272, height - 324, 7, rgb(0, 0, 0));
        drawCheckmark(firstPage, 272, height - 339, 7, rgb(0, 0, 0));
        drawCheckmark(firstPage, 272, height - 354, 7, rgb(0, 0, 0));
        drawCheckmark(firstPage, 272, height - 369, 7, rgb(0, 0, 0));
        drawCheckmark(firstPage, 272, height - 384, 7, rgb(0, 0, 0));
        drawCheckmark(firstPage, 272, height - 398, 7, rgb(0, 0, 0));
        drawCheckmark(firstPage, 272, height - 413, 7, rgb(0, 0, 0));
        // Part 1 ALL √
    }else{
        // Part 1 ALL X
        drawX(firstPage, 295, height - 176, 6, rgb(0, 0, 0));
        drawX(firstPage, 295, height - 191, 6, rgb(0, 0, 0));

        drawX(firstPage, 295, height - 219, 6, rgb(0, 0, 0));
        drawX(firstPage, 295, height - 235, 6, rgb(0, 0, 0));
        drawX(firstPage, 295, height - 250, 6, rgb(0, 0, 0));
        drawX(firstPage, 295, height - 265, 6, rgb(0, 0, 0));
        drawX(firstPage, 295, height - 280, 6, rgb(0, 0, 0));
        drawX(firstPage, 295, height - 295, 6, rgb(0, 0, 0));

        drawX(firstPage, 295, height - 323, 6, rgb(0, 0, 0));
        drawX(firstPage, 295, height - 338, 6, rgb(0, 0, 0));
        drawX(firstPage, 295, height - 353, 6, rgb(0, 0, 0));
        drawX(firstPage, 295, height - 368, 6, rgb(0, 0, 0));
        drawX(firstPage, 295, height - 383, 6, rgb(0, 0, 0));
        drawX(firstPage, 295, height - 398, 6, rgb(0, 0, 0));
        drawX(firstPage, 295, height - 412, 6, rgb(0, 0, 0));
        // Part 1 ALL X
    }
     
    if(processDataValue(data.Cat2_Status)){
      // Part 2 ALL √
      drawCheckmark(firstPage, 272, height - 441, 7, rgb(0, 0, 0));
      drawCheckmark(firstPage, 272, height - 456, 7, rgb(0, 0, 0));
      drawCheckmark(firstPage, 272, height - 471, 7, rgb(0, 0, 0));
      drawCheckmark(firstPage, 272, height - 486, 7, rgb(0, 0, 0));
      drawCheckmark(firstPage, 272, height - 501, 7, rgb(0, 0, 0));
      drawCheckmark(firstPage, 272, height - 516, 7, rgb(0, 0, 0));
      drawCheckmark(firstPage, 272, height - 531, 7, rgb(0, 0, 0));

      drawCheckmark(firstPage, 272, height - 559, 7, rgb(0, 0, 0)); 
      // Part 2 ALL √
    }else{
      // Part 2 All X
      drawX(firstPage, 295, height - 440, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 455, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 470, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 485, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 500, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 515, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 531, 6, rgb(0, 0, 0));

      drawX(firstPage, 295, height - 557, 6, rgb(0, 0, 0));
      // Part 2 All X
    }
     // Part 3 All OK
     // Last 1
    drawTextWithWrap(firstPage, `${processDataValue(data.Cat3_Status)}`, {
      x: 634,
      y: height - 443,
      size: 7
    });

    // Last 2
    drawTextWithWrap(firstPage, `${processDataValue(data.Cat3_Status)}`, {
      x: 634,
      y: height - 457,
      size: 7
    });

    // Last 3
    drawTextWithWrap(firstPage, `${processDataValue(data.Cat3_Status)}`, {
      x: 634,
      y: height - 472,
      size: 7
    });

    //  Last 4
    drawTextWithWrap(firstPage, `${processDataValue(data.Cat3_Status)}`, {
      x: 634,
      y: height - 486,
      size: 7
    });
     // Part 3 All OK

     firstPage.drawText(`${processDataValue(data.partno)}`, {
      x: 50,
      y: height - 86,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });

    const positions_4 = [
      // Incoming Inspection / Core Management
      { x: 311, y: height - 181 },
      { x: 311, y: height - 196 },
      // Disassembly Process
      { x: 311, y: height - 224 },
      { x: 311, y: height - 239 },
      { x: 311, y: height - 254 },
      { x: 311, y: height - 269 },
      { x: 311, y: height - 284 },
      { x: 311, y: height - 299 },
      // Cleaning / Paint
      { x: 311, y: height - 327 },
      { x: 311, y: height - 342 },
      { x: 311, y: height - 357 },
      { x: 311, y: height - 372 },
      { x: 311, y: height - 387 },
      { x: 311, y: height - 402 },
      { x: 311, y: height - 417 },
      // Remediate / Repair Activity
      { x: 311, y: height - 445 },
      { x: 311, y: height - 460 },
      { x: 311, y: height - 475 },
      { x: 311, y: height - 490 },
      { x: 311, y: height - 505 },
      { x: 311, y: height - 520 },
      { x: 311, y: height - 535 },
      // Re-assembly
      { x: 311, y: height - 564 },
      // Alternator Assembly Inspection
      { x: 662, y: height - 443 },
      { x: 662, y: height - 457 },
      { x: 662, y: height - 472 },
      { x: 662, y: height - 486 },
    ];
    
    for (let i = 0; i < positions_4.length; i++) {
      const prop = `Rem${i + 1}`;
      const position = positions_4[i];
      
      if (data[prop] && position) {
        const remText = processDataValue(data[prop]);
        drawTextWithWrap(firstPage, remText, { ...position, size: 8.5 });
      }
    }
  }
}

// radiator done
async function template_radiator(font, firstPage, height, data, pdfDoc){
  if(data.reman_part === 'RADIATOR'){
    // WO NO
    firstPage.drawText(`${processDataValue(data.wo_no)}`, {
      x: 700,
      y: height - 40,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });

    // Chassis No
    firstPage.drawText(`${processDataValue(data.cserial_no)}`, {
      x: 508,
      y: height - 101,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });
    
    // Maker
    firstPage.drawText(`${processDataValue(data.maker)}`, {
      x: 45,
      y: height - 130,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });
    
    // Date In: 
    firstPage.drawText(`${processDataValue(data.Date_In) ? new Date(processDataValue(data.Date_In)).toLocaleDateString('en-GB') : 'N/A'}`, {
      x: 467,
      y: height - 130,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });
    
    // Date Out: 
    firstPage.drawText(`${processDataValue(data.Date_Out) ? new Date(processDataValue(data.Date_Out)).toLocaleDateString('en-GB') : 'N/A'}`, {
      x: 558,
      y: height - 130,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });

    // 生成并添加条形码
    const wo_no = processDataValue(data.wo_no);
    //console.log('工单号:', wo_no);
    if (wo_no) {
      try {
        //console.log('开始生成条形码...');
        const barcodeBuffer = await generateBarcode(wo_no);
        if (barcodeBuffer) {
          //console.log('开始嵌入条形码图片...');
          const barcodeImage = await pdfDoc.embedPng(barcodeBuffer);
          //console.log('条形码图片嵌入成功');
          
          const barcodeWidth = 140;  // 增加宽度
          const barcodeHeight = 30;   // 增加高度
          
          // 在页面顶部绘制条形码
          firstPage.drawImage(barcodeImage, {
            x: 540,
            y: height - 50,
            width: barcodeWidth,
            height: barcodeHeight,
          });
          
          //console.log('条形码绘制完成');
        } else {
          console.error('条形码生成失败');
        }
      } catch (err) {
        console.error('添加条形码时出错:', err);
        console.error(err.stack);
      }
    } else {
      console.log('没有找到工单号');
    }

     // Operator Name
     drawTextWithWrap(firstPage, `${processDataValue(data.OperatorNM)}`, {
       x: 147,
       y: height - 130,
       size: 9,
       font: font,
       color: rgb(0, 0, 0),
       maxWidth: 150, // 设置最大宽度
       lineHeight: 1.1
     });

     // Supervisor Name
     drawTextWithWrap(firstPage, `${processDataValue(data.SupervisorNM)}`, {
       x: 300,
       y: height - 130,
       size: 9,
       font: font,
       color: rgb(0, 0, 0),
       maxWidth: 150,
       lineHeight: 1.1
     });

     // Checked by
     drawTextWithWrap(firstPage, `${processDataValue(data.OperatorNM)}`, {
       x: 636,
       y: height - 120,
       size: 8,
       font: font,
       color: rgb(0, 0, 0),
       maxWidth: 90,
       lineHeight: 1.1
     });

      // 添加签名图片 - Operator
      try {
        const operatorSignature = await loadSignatureImage(pdfDoc, processDataValue(data.OperatorNM));
        if (operatorSignature) {
          firstPage.drawImage(operatorSignature, {
            x: 636,
            y: height - 110,
            width: 60,
            height: 20
          });
        }
      } catch (error) {
        console.error('Error adding operator signature:', error);
      }

     // Approved by
     drawTextWithWrap(firstPage, `${processDataValue(data.SupervisorNM)}`, {
       x: 723,
       y: height - 120,
       size: 8,
       font: font,
       color: rgb(0, 0, 0),
       maxWidth: 100,
       lineHeight: 1.1
     });

     // 添加签名图片 - Supervisor
     try {
      const supervisorSignature = await loadSignatureImage(pdfDoc, processDataValue(data.SupervisorNM));
      if (supervisorSignature) {
        firstPage.drawImage(supervisorSignature, {
          x: 723,
          y: height - 110,
          width: 60,
          height: 20
        });
      }
    } catch (error) {
      console.error('Error adding supervisor signature:', error);
    }

    const cat1Dt = processDataValue(data.Cat1_dt);
    const text1 = cat1Dt
      ? new Date(cat1Dt).getDate().toString().padStart(2, '0') + '/' +
        (new Date(cat1Dt).getMonth() + 1).toString().padStart(2, '0')
      : 'N/A';
      
    const positions_1 = [
      // Incoming Inspection / Core Management
      { x: 232, y: height - 196 },
      { x: 232, y: height - 211 },
      // Disassembly Process
      { x: 232, y: height - 239 },
      { x: 232, y: height - 254 },
      { x: 232, y: height - 269 },
      { x: 232, y: height - 284 },
      { x: 232, y: height - 299 },
      { x: 232, y: height - 314 },
      // Cleaning / Paint
      { x: 232, y: height - 342 },
      { x: 232, y: height - 357 },
      { x: 232, y: height - 372 },
      { x: 232, y: height - 388 },
      { x: 232, y: height - 402 },
      { x: 232, y: height - 417 },
    ];

    positions_1.forEach(pos => {
      drawTextWithWrap(firstPage, text1, { ...pos, size: 7 });
    });

    const cat2Dt = processDataValue(data.Cat2_dt);
    const text2 = cat2Dt
      ? new Date(cat2Dt).getDate().toString().padStart(2, '0') + '/' +
        (new Date(cat2Dt).getMonth() + 1).toString().padStart(2, '0')
      : 'N/A';
      
    const positions_2 = [
      // Remediate / Repair Activity
      { x: 232, y: height - 445 },
      { x: 232, y: height - 460 },
      { x: 232, y: height - 475 },
      { x: 232, y: height - 490 },
      { x: 232, y: height - 505 },
      { x: 232, y: height - 520 },
      // Re-assembly
      { x: 232, y: height - 549 }
    ];

    positions_2.forEach(pos => {
      drawTextWithWrap(firstPage, text2, { ...pos, size: 7 });
    });

    const cat3Dt = processDataValue(data.Cat3_dt);
    const text3 = cat3Dt
      ? new Date(cat3Dt).getDate().toString().padStart(2, '0') + '/' +
        (new Date(cat3Dt).getMonth() + 1).toString().padStart(2, '0')
      : 'N/A';
      
    const positions_3 = [
      // Alternator Assembly Inspection
      { x: 585, y: height - 436 },
      { x: 585, y: height - 451 },
      { x: 585, y: height - 465 },
      { x: 585, y: height - 487 },
    ];

    positions_3.forEach(pos => {
      drawTextWithWrap(firstPage, text3, { ...pos, size: 7 });
    });

    if(processDataValue(data.Cat1_Status)){
      // Part 1 ALL √
     drawCheckmark(firstPage, 272, height - 192, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 207, 7, rgb(0, 0, 0));

     drawCheckmark(firstPage, 272, height - 236, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 251, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 266, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 281, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 296, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 311, 7, rgb(0, 0, 0));

     drawCheckmark(firstPage, 272, height - 339, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 354, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 369, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 384, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 398, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 413, 7, rgb(0, 0, 0));
     // Part 1 ALL √
    }else{
      // Part 1 ALL X
      drawX(firstPage, 295, height - 192, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 207, 6, rgb(0, 0, 0));

      drawX(firstPage, 295, height - 236, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 251, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 266, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 281, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 296, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 311, 6, rgb(0, 0, 0));

      drawX(firstPage, 295, height - 339, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 354, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 369, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 384, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 398, 6, rgb(0, 0, 0));
      drawX(firstPage, 295, height - 413, 6, rgb(0, 0, 0));
      // Part 1 ALL X
    }

     if(processDataValue(data.Cat2_Status)){
      // Part 2 ALL √
     drawCheckmark(firstPage, 272, height - 441, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 456, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 471, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 486, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 501, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 516, 7, rgb(0, 0, 0));

     drawCheckmark(firstPage, 272, height - 543, 7, rgb(0, 0, 0)); 
     // Part 2 ALL √
     }else{
      // Part 2 All X
     drawX(firstPage, 295, height - 440, 6, rgb(0, 0, 0));
     drawX(firstPage, 295, height - 455, 6, rgb(0, 0, 0));
     drawX(firstPage, 295, height - 470, 6, rgb(0, 0, 0));
     drawX(firstPage, 295, height - 485, 6, rgb(0, 0, 0));
     drawX(firstPage, 295, height - 500, 6, rgb(0, 0, 0));
     drawX(firstPage, 295, height - 515, 6, rgb(0, 0, 0));

     drawX(firstPage, 295, height - 543, 6, rgb(0, 0, 0));
     // Part 2 All X
     }

     // Part 3 All OK
     // Last 1
    drawTextWithWrap(firstPage, `${processDataValue(data.Cat3_Status)}`, {
      x: 620,
      y: height - 436,
      size: 7
    });

    // Last 2
    drawTextWithWrap(firstPage, `${processDataValue(data.Cat3_Status)}`, {
      x: 620,
      y: height - 451,
      size: 7
    });

    // Last 3
    drawTextWithWrap(firstPage, `${processDataValue(data.Cat3_Status)}`, {
      x: 620,
      y: height - 465,
      size: 7
    });

    //  Last 4
    drawTextWithWrap(firstPage, `${processDataValue(data.Cat3_Status)}`, {
      x: 620,
      y: height - 487,
      size: 7
    });
     // Part 3 All OK

     firstPage.drawText(`${processDataValue(data.partno)}`, {
      x: 50,
      y: height - 101,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });

    const positions_4 = [
      // Incoming Inspection / Core Management
      { x: 311, y: height - 196 },
      { x: 311, y: height - 211 },
      // Disassembly Process
      { x: 311, y: height - 239 },
      { x: 311, y: height - 254 },
      { x: 311, y: height - 269 },
      { x: 311, y: height - 284 },
      { x: 311, y: height - 299 },
      { x: 311, y: height - 314 },
      // Cleaning / Paint
      { x: 311, y: height - 342 },
      { x: 311, y: height - 357 },
      { x: 311, y: height - 372 },
      { x: 311, y: height - 388 },
      { x: 311, y: height - 402 },
      { x: 311, y: height - 417 },
      // Remediate / Repair Activity
      { x: 311, y: height - 445 },
      { x: 311, y: height - 460 },
      { x: 311, y: height - 475 },
      { x: 311, y: height - 490 },
      { x: 311, y: height - 505 },
      { x: 311, y: height - 520 },
      // Re-assembly
      { x: 311, y: height - 549 },
      // Alternator Assembly Inspection
      { x: 646, y: height - 436 },
      { x: 646, y: height - 451 },
      { x: 646, y: height - 465 },
      { x: 646, y: height - 487 },
    ];
    
    for (let i = 0; i < positions_4.length; i++) {
      const prop = `Rem${i + 1}`;
      const position = positions_4[i];
      
      if (data[prop]) {
        const remText = processDataValue(data[prop]);
        drawTextWithWrap(firstPage, remText, { ...position, size: 8.5 });
      }
    }
  }
}

// 保存PDF文件到REMAN文件夹（按chassis no分组）
async function savePdfToReman(pdfBytes, data) {
  try {
    // 获取必要的数据
    const chassisNo = processDataValue(data.cserial_no);
    const remanPart = processDataValue(data.reman_part);
    const pk = processDataValue(data.pk) || processDataValue(data.id_itx) || 'unknown';
    
    // 获取文件夹名称
    const folderName = PART_TYPE_MAPPING[remanPart.toUpperCase()] || remanPart;
    
    // 创建文件名：大写零件名称_pk
    const pdfFileName = `${remanPart.toUpperCase()}_${pk}.pdf`;
    
    // 获取chassis文件夹路径
    const chassisPath = getChassisPath(chassisNo);
    const partFolderPath = path.join(chassisPath, folderName);
    const filePath = path.join(partFolderPath, pdfFileName);
    
    //console.log(`Save Path: ${filePath}`);
    
    // 创建chassis文件夹（如果不存在）
    if (!fs.existsSync(chassisPath)) {
      fs.mkdirSync(chassisPath, { recursive: true });
      //console.log(`Create new folder: ${chassisPath}`);
    }
    
    // 创建零件类型文件夹（如果不存在）
    if (!fs.existsSync(partFolderPath)) {
      fs.mkdirSync(partFolderPath, { recursive: true });
      //console.log(`Create new part folder: ${partFolderPath}`);
    }
    
    // 覆盖旧的 PDF 文件：只删除以当前零件类型开头的 PDF
    try {
      if (fs.existsSync(partFolderPath)) {
        const files = fs.readdirSync(partFolderPath);
        
        // 根据零件类型确定文件名前缀
        let prefixMatch;
        const remanPartUpper = remanPart.toUpperCase();
        
        if (remanPartUpper === 'BRAKE SYSTEM' || remanPartUpper === 'BRAKE') {
          prefixMatch = 'BRAKE SYSTEM_';
        } else if (remanPartUpper === 'ALTERNATOR') {
          prefixMatch = 'ALTERNATOR_';
        } else if (remanPartUpper === 'INTERCOOLER') {
          prefixMatch = 'INTERCOOLER_';
        } else if (remanPartUpper === 'RADIATOR') {
          prefixMatch = 'RADIATOR_';
        } else if (remanPartUpper === 'TURBOCHARGER' || remanPartUpper === 'TURBO') {
          prefixMatch = 'TURBOCHARGER_';
        } else if (remanPartUpper === 'STARTER MOTOR' || remanPartUpper === 'STARTER') {
          prefixMatch = 'STARTER MOTOR_';
        } else {
          prefixMatch = `${remanPartUpper}_`;
        }
        
        const partTypePdfFiles = files.filter(file => 
          file.toUpperCase().startsWith(prefixMatch.toUpperCase()) && 
          file.toLowerCase().endsWith('.pdf') &&
          !file.toUpperCase().startsWith('TR_') // 不删除 TEST REPORT 的 PDF
        );
        
        // 只删除以当前零件类型开头的 PDF 文件
        partTypePdfFiles.forEach(file => {
          const oldFilePath = path.join(partFolderPath, file);
          try {
            fs.unlinkSync(oldFilePath);
            console.log(`已删除旧的 ${remanPartUpper} PDF 文件: ${file}`);
          } catch (error) {
            console.error(`删除旧文件失败: ${file}`, error);
          }
        });
        
        if (partTypePdfFiles.length > 0) {
          console.log(`已清理 ${partTypePdfFiles.length} 个旧的 ${remanPartUpper} PDF 文件`);
        }
      }
    } catch (error) {
      console.error('清理旧 PDF 文件时出错:', error);
    }
    
    // 保存新文件
    fs.writeFileSync(filePath, pdfBytes);
    console.log(`PDF saved to: ${filePath}`);

    // 更新数据库中的 file_path（只保存文件夹路径，不包含文件名）
    try {
      const dbConn = new sql.ConnectionPool(dbConfig);
      await dbConn.connect();
      
      const updateQuery = `
        UPDATE import_reman_part_ERP 
        SET file_path = @filePath 
        WHERE pk = @pk
      `;
      
      await dbConn.request()
        .input('filePath', sql.NVarChar, partFolderPath)
        .input('pk', sql.Int, data.pk)
        .query(updateQuery);
      
      //console.log(`数据库中的 file_path 已更新: pk=${data.pk}`);
      await dbConn.close();
    } catch (error) {
      console.error('Error updating database file_path:', error);
    }

    return partFolderPath;
    
  } catch (error) {
    console.error('Error while saving PDF file:', error);
    throw error;
  }
}

// brake done
async function template_brake(font, firstPage, height, data, pdfDoc){
  if(data.reman_part === 'BRAKE' || data.reman_part === 'BRAKE SYSTEM'){
    // WO NO
    firstPage.drawText(`${processDataValue(data.wo_no)}`, {
      x: 700,
      y: height - 40,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });

    // Chassis No
    firstPage.drawText(`${processDataValue(data.cserial_no)}`, {
      x: 508,
      y: height - 88,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });
    
    // Maker
    firstPage.drawText(`${processDataValue(data.maker)}`, {
      x: 46,
      y: height - 118,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });
    
    // Date In: 
    firstPage.drawText(`${processDataValue(data.Date_In) ? new Date(processDataValue(data.Date_In)).toLocaleDateString('en-GB') : 'N/A'}`, {
      x: 473,
      y: height - 118,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });
    
    // Date Out: 
    firstPage.drawText(`${processDataValue(data.Date_Out) ? new Date(processDataValue(data.Date_Out)).toLocaleDateString('en-GB') : 'N/A'}`, {
      x: 560,
      y: height - 118,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });

    // 生成并添加条形码
    const wo_no = processDataValue(data.wo_no);
    //console.log('工单号:', wo_no);
    if (wo_no) {
      try {
        //console.log('开始生成条形码...');
        const barcodeBuffer = await generateBarcode(wo_no);
        if (barcodeBuffer) {
          //console.log('开始嵌入条形码图片...');
          const barcodeImage = await pdfDoc.embedPng(barcodeBuffer);
          //console.log('条形码图片嵌入成功');
          
          const barcodeWidth = 140;  // 增加宽度
          const barcodeHeight = 30;   // 增加高度
          
          // 在页面顶部绘制条形码
          firstPage.drawImage(barcodeImage, {
            x: 540,
            y: height - 50,
            width: barcodeWidth,
            height: barcodeHeight,
          });
          
          //console.log('条形码绘制完成');
        } else {
          console.error('条形码生成失败');
        }
      } catch (err) {
        console.error('添加条形码时出错:', err);
        console.error(err.stack);
      }
    } else {
      console.log('没有找到工单号');
    }

     // Operator Name
     drawTextWithWrap(firstPage, `${processDataValue(data.OperatorNM)}`, {
       x: 147,
       y: height - 118,
       size: 9,
       font: font,
       color: rgb(0, 0, 0),
       maxWidth: 150, // 设置最大宽度
       lineHeight: 1.1
     });

     // Supervisor Name
     drawTextWithWrap(firstPage, `${processDataValue(data.SupervisorNM)}`, {
       x: 302,
       y: height - 118,
       size: 9,
       font: font,
       color: rgb(0, 0, 0),
       maxWidth: 150,
       lineHeight: 1.1
     });

     // Checked by
     drawTextWithWrap(firstPage, `${processDataValue(data.OperatorNM)}`, {
       x: 636,
       y: height - 110,
       size: 8,
       font: font,
       color: rgb(0, 0, 0),
       maxWidth: 90,
       lineHeight: 1.1
     });

     // 添加签名图片 - Operator
     try {
       const operatorSignature = await loadSignatureImage(pdfDoc, processDataValue(data.OperatorNM));
       if (operatorSignature) {
         firstPage.drawImage(operatorSignature, {
           x: 636,
           y: height - 100,
           width: 60,
           height: 20
         });
       }
     } catch (error) {
       console.error('Error adding operator signature:', error);
     }

     // Approved by
     drawTextWithWrap(firstPage, `${processDataValue(data.SupervisorNM)}`, {
       x: 720,
       y: height - 110,
       size: 8,
       font: font,
       color: rgb(0, 0, 0),
       maxWidth: 100,
       lineHeight: 1.1
     });

     // 添加签名图片 - Supervisor
     try {
       const supervisorSignature = await loadSignatureImage(pdfDoc, processDataValue(data.SupervisorNM));
       if (supervisorSignature) {
         firstPage.drawImage(supervisorSignature, {
           x: 720,
           y: height - 100,
           width: 60,
           height: 20
         });
       }
     } catch (error) {
       console.error('Error adding supervisor signature:', error);
     }

    const cat1Dt = processDataValue(data.Cat1_dt);
    const text1 = cat1Dt
      ? new Date(cat1Dt).getDate().toString().padStart(2, '0') + '/' +
        (new Date(cat1Dt).getMonth() + 1).toString().padStart(2, '0')
      : 'N/A';
      
    const positions_1 = [
      // Incoming Inspection / Core Management
      { x: 232, y: height - 183 },
      { x: 232, y: height - 200 },
      // Disassembly Process
      { x: 232, y: height - 228 },
      { x: 232, y: height - 243 },
      { x: 232, y: height - 258 },
      { x: 232, y: height - 273 },
      { x: 232, y: height - 288 },
      { x: 232, y: height - 304 },
      // Cleaning / Paint
      { x: 232, y: height - 333 },
      { x: 232, y: height - 348 },
      { x: 232, y: height - 363 },
      { x: 232, y: height - 378 },
      { x: 232, y: height - 394 },
      { x: 232, y: height - 409 },
    ];

    positions_1.forEach(pos => {
      drawTextWithWrap(firstPage, text1, { ...pos, size: 7 });
    });

    const cat2Dt = processDataValue(data.Cat2_dt);
    const text2 = cat2Dt
      ? new Date(cat2Dt).getDate().toString().padStart(2, '0') + '/' +
        (new Date(cat2Dt).getMonth() + 1).toString().padStart(2, '0')
      : 'N/A';
      
    const positions_2 = [
      // Remediate / Repair Activity
      { x: 232, y: height - 439 },
      { x: 232, y: height - 454 },
      { x: 232, y: height - 469 },
      { x: 232, y: height - 484 },
      { x: 232, y: height - 499 },
      { x: 232, y: height - 514 },
      // Re-assembly
      { x: 232, y: height - 543 }
    ];

    positions_2.forEach(pos => {
      drawTextWithWrap(firstPage, text2, { ...pos, size: 7 });
    });

    const cat3Dt = processDataValue(data.Cat3_dt);
    const text3 = cat3Dt
      ? new Date(cat3Dt).getDate().toString().padStart(2, '0') + '/' +
        (new Date(cat3Dt).getMonth() + 1).toString().padStart(2, '0')
      : 'N/A';
      
    const positions_3 = [
      // Alternator Assembly Inspection
      { x: 594, y: height - 428 },
      { x: 594, y: height - 443 },
      { x: 594, y: height - 458 },
      { x: 594, y: height - 480 },
    ];

    positions_3.forEach(pos => {
      drawTextWithWrap(firstPage, text3, { ...pos, size: 7 });
    });

    if(processDataValue(data.Cat1_Status)){
    // Part 1 ALL √
     drawCheckmark(firstPage, 272, height - 179, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 194, 7, rgb(0, 0, 0));

     drawCheckmark(firstPage, 272, height - 223, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 238, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 253, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 268, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 283, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 298, 7, rgb(0, 0, 0));

     drawCheckmark(firstPage, 272, height - 328, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 343, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 357, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 373, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 388, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 403, 7, rgb(0, 0, 0));
    // Part 1 ALL √
    }else{
     // Part 1 ALL X
     drawX(firstPage, 295, height - 179, 6, rgb(0, 0, 0));
     drawX(firstPage, 295, height - 194, 6, rgb(0, 0, 0));

     drawX(firstPage, 295, height - 223, 6, rgb(0, 0, 0));
     drawX(firstPage, 295, height - 238, 6, rgb(0, 0, 0));
     drawX(firstPage, 295, height - 253, 6, rgb(0, 0, 0));
     drawX(firstPage, 295, height - 268, 6, rgb(0, 0, 0));
     drawX(firstPage, 295, height - 283, 6, rgb(0, 0, 0));
     drawX(firstPage, 295, height - 298, 6, rgb(0, 0, 0));

     drawX(firstPage, 295, height - 328, 6, rgb(0, 0, 0));
     drawX(firstPage, 295, height - 343, 6, rgb(0, 0, 0));
     drawX(firstPage, 295, height - 357, 6, rgb(0, 0, 0));
     drawX(firstPage, 295, height - 373, 6, rgb(0, 0, 0));
     drawX(firstPage, 295, height - 388, 6, rgb(0, 0, 0));
     drawX(firstPage, 295, height - 403, 6, rgb(0, 0, 0));
     // Part 1 ALL X
    }

    if(processDataValue(data.Cat2_Status)){
     // Part 2 ALL √
     drawCheckmark(firstPage, 272, height - 433, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 448, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 463, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 478, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 493, 7, rgb(0, 0, 0));
     drawCheckmark(firstPage, 272, height - 508, 7, rgb(0, 0, 0));

     drawCheckmark(firstPage, 272, height - 537, 7, rgb(0, 0, 0)); 
     // Part 2 ALL √
    }else{
     // Part 2 All X
     drawX(firstPage, 295, height - 433, 6, rgb(0, 0, 0));
     drawX(firstPage, 295, height - 448, 6, rgb(0, 0, 0));
     drawX(firstPage, 295, height - 463, 6, rgb(0, 0, 0));
     drawX(firstPage, 295, height - 478, 6, rgb(0, 0, 0));
     drawX(firstPage, 295, height - 493, 6, rgb(0, 0, 0));
     drawX(firstPage, 295, height - 508, 6, rgb(0, 0, 0));

     drawX(firstPage, 295, height - 537, 6, rgb(0, 0, 0));
     // Part 2 All X
    }

     // Part 3 All OK
     // Last 1
    drawTextWithWrap(firstPage, `${processDataValue(data.Cat3_Status)}`, {
      x: 636,
      y: height - 428,
      size: 7
    });

    // Last 2
    drawTextWithWrap(firstPage, `${processDataValue(data.Cat3_Status)}`, {
      x: 636,
      y: height - 443,
      size: 7
    });

    // Last 3
    drawTextWithWrap(firstPage, `${processDataValue(data.Cat3_Status)}`, {
      x: 636,
      y: height - 458,
      size: 7
    });

    //  Last 4
    drawTextWithWrap(firstPage, `${processDataValue(data.Cat3_Status)}`, {
      x: 636,
      y: height - 480,
      size: 7
    });
     // Part 3 All OK

    firstPage.drawText(`${processDataValue(data.partno)}`, {
      x: 50,
      y: height - 88,
      size: 8,
      font: font,
      color: rgb(0, 0, 0),
    });

    const positions_4 = [
      // Incoming Inspection / Core Management
      { x: 311, y: height - 183 },
      { x: 311, y: height - 200 },
      // Disassembly Process
      { x: 311, y: height - 228 },
      { x: 311, y: height - 243 },
      { x: 311, y: height - 258 },
      { x: 311, y: height - 273 },
      { x: 311, y: height - 288 },
      { x: 311, y: height - 304 },
      // Cleaning / Paint
      { x: 311, y: height - 333 },
      { x: 311, y: height - 348 },
      { x: 311, y: height - 363 },
      { x: 311, y: height - 378 },
      { x: 311, y: height - 394 },
      { x: 311, y: height - 409 },
      // Remediate / Repair Activity
      { x: 311, y: height - 439 },
      { x: 311, y: height - 454 },
      { x: 311, y: height - 469 },
      { x: 311, y: height - 484 },
      { x: 311, y: height - 499 },
      { x: 311, y: height - 514 },
      // Re-assembly
      { x: 311, y: height - 543 },
      // Alternator Assembly Inspection
      { x: 664, y: height - 429 },
      { x: 664, y: height - 444 },
      { x: 664, y: height - 459 },
      { x: 664, y: height - 480 },
    ];
    
    for (let i = 0; i < positions_4.length; i++) {
      const prop = `Rem${i + 1}`;
      const position = positions_4[i];
      
      if (data[prop]) {
        const remText = processDataValue(data[prop]);
        drawTextWithWrap(firstPage, remText, { ...position, size: 8.5 });
      }
    }
  }
}

// 处理单条记录
async function processSingleRecord(data, recordIndex = 1, totalRecords = 1) {
  try {
    console.log(`\n=== Processing record ${recordIndex}/${totalRecords} ===`);
    
    // 获取reman_part并选择对应的PDF模板
    const remanPart = processDataValue(data.reman_part);
    //console.log(`Remanufactured part type: ${remanPart}`);
    
    if (!templateMapping[remanPart]) {
      console.error(`PDF template not found for: ${remanPart}`);
      //console.log("Available templates:", Object.keys(templateMapping));
      return false;
    }
    
    const templatePath = templateMapping[remanPart];
    //console.log(`Using PDF template: ${templatePath}`);
    
    // 检查模板文件是否存在
    if (!fs.existsSync(templatePath)) {
      console.error(`PDF template file does not exist: ${templatePath}`);
      return false;
    }
    
    // 填写PDF表单
    const filledPdfBytes = await fillPdfForm(templatePath, data);
    
    // 保存到REMAN文件夹
    const savedPath = savePdfToReman(filledPdfBytes, data);
    
    //console.log(`✅ Record ${recordIndex} processing completed!`);
    const jobId = processDataValue(data.job_id);
    const itxId = processDataValue(data.id_itx);
    const chassisNo = processDataValue(data.cserial_no);
    //console.log(`- Job ID: ${jobId}`);
    //console.log(`- ITX ID: ${itxId}`);
    console.log(`- Chassis No: ${chassisNo}`);
    //console.log(`- Remanufactured part: ${remanPart}`);
    //console.log(`- Save path: ${savedPath}`);
    
    return true;
  } catch (error) {
    console.error(`Error processing record ${recordIndex}:`, error);
    return false;
  }
}

// 主函数 - 处理单条记录
// STARTER MOTOR 43612 √
// INTERCOOLER 43610 √
// TURBOCHARGER 43613 √
// ALTERNATOR 43608 √
// RADIATOR 43611 √
// BRAKE SYSTEM 43609 √

// SQL
async function processPdfWithData() {
  const dbConn = new sql.ConnectionPool(dbConfig);
  
  try {
    // 连接数据库
    //console.log("Connecting to database...");
    await dbConn.connect();
    //console.log("Database connection successful");
    
    // 执行SQL查询获取所有未处理的记录
    //console.log("Querying unprocessed records...");
    const query = `
      SELECT * FROM import_reman_part_ERP WHERE file_path IS NULL 
      ORDER BY pk;
    `;
    
    const result = await dbConn.request().query(query);
    
    if (result.recordset.length === 0) {
      console.log("No records found to process");
      return;
    }
    
    console.log(`Find ${result.recordset.length} Records need to be processed`);
    
    let successCount = 0;
    let failCount = 0;
    
    // 处理每条记录
    for (let i = 0; i < result.recordset.length; i++) {
      const data = result.recordset[i];
      //console.log(`\n处理第 ${i + 1}/${result.recordset.length} 条记录`);
      //console.log(`工作编号: ${data.job_id}`);
      console.log(`Chassis number: ${data.cserial_no}`);
      //console.log(`零件类型: ${data.reman_part}`);
      
      try {
        const success = await processSingleRecord(data, i + 1, result.recordset.length);
        if (success) {
          successCount++;
          //console.log(`记录 ${i + 1} 处理成功`);
        } else {
          failCount++;
          //console.log(`记录 ${i + 1} 处理失败`);
        }
      } catch (error) {
        failCount++;
        //console.error(`处理记录 ${i + 1} 时出错:`, error);
      }
      
      // 添加延迟避免处理过快
      if (i < result.recordset.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    //console.log(`\n=== 批量处理完成 ===`);
    //console.log(`成功处理: ${successCount} 条`);
    //console.log(`处理失败: ${failCount} 条`);
    //console.log(`总计: ${result.recordset.length} 条`);
    
  } catch (error) {
    console.error("An error occurred during processing:", error);
  } finally {
    // 关闭数据库连接
    try {
      await dbConn.close();
      //console.log("The database connection is closed");
    } catch (error) {
      console.error("Error closing database connection:", error);
    }
  }
}

// 批量处理函数
async function processBatchPdfs(limit = 10) {
  const dbConn = new sql.ConnectionPool(dbConfig);
  
  try {
    // 连接数据库
    //console.log("Connecting to database...");
    await dbConn.connect();
    //console.log("Database connection successful");
    
    // 执行SQL查询获取多条记录
    //console.log(`正在查询最多 ${limit} 条记录...`);
    const query = `
      select TOP ${limit} j.*, d.* 
      from jobi_reman j 
      join dsoi d on j.job_id = d.job_id 
      where j.id_itx <> 0 
      order by j.id_itx desc
    `;
    
    const result = await dbConn.request().query(query);
    
    if (result.recordset.length === 0) {
      console.log("No matching records found");
      return;
    }
    
    //console.log(`Turn up ${result.recordset.length} records need to be processed`);
    
    let successCount = 0;
    let failCount = 0;
    
    // 处理每条记录
    for (let i = 0; i < result.recordset.length; i++) {
      const data = result.recordset[i];
      const success = await processSingleRecord(data, i + 1, result.recordset.length);
      
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
      
      // 添加延迟避免处理过快
      if (i < result.recordset.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`\n=== Batch processing completed ===`);
    //console.log(`successfully processed: ${successCount} `);
    //console.log(`Processing failed: ${failCount} `);
    //console.log(`Total: ${result.recordset.length} `);
    
  } catch (error) {
    console.error("Error during batch processing:", error);
  } finally {
    // 关闭数据库连接
    try {
      await dbConn.close();
      //console.log("The database connection is closed");
    } catch (error) {
      console.error("Error closing database connection:", error);
    }
  }
}

// 运行程序
if (require.main === module) {
  // 处理所有未生成PDF的记录
  processPdfWithData().catch(console.error);
}

module.exports = { 
  processPdfWithData, 
  processBatchPdfs,
  processSingleRecord,
  fillPdfForm, 
  templateMapping,
  addPartTypeWatermark,
  savePdfToReman,
  getChassisPath,
  PART_TYPE_MAPPING,
  drawTextWithWrap,
  drawCheckmark,
  loadSignatureImage
};