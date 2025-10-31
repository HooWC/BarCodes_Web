/**
 * 自动生成测试报告PDF文件
 * 每20分钟自动执行一次
 * 从数据库获取最多700条记录
 * 顺序选择模板生成PDF
 */

const sql = require("mssql");
const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb, degrees } = require("pdf-lib");

// 数据库配置
const dbConfig = {
  user: "api_hsa_user",           
  password: "1F9UXy$H31w6zg8X;H[9", 
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

// 模板列表缓存
const templateLists = {};
// 配置文件夹路径
const configDir = path.join(__dirname, 'config');

// 确保配置文件夹存在
if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir, { recursive: true });
}

// 获取配置文件路径
function getConfigFilePath(folderName) {
  return path.join(configDir, `${folderName}_last_template.json`);
}

// 读取最后使用的模板编号
function getLastTemplateIndex(folderName) {
  const configFile = getConfigFilePath(folderName);
  
  if (fs.existsSync(configFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      return data.lastTemplateIndex || 0;
    } catch (error) {
      console.error(`Error reading config file for ${folderName}:`, error);
      return 0;
    }
  }
  return 0;
}

// 保存最后使用的模板编号
function saveLastTemplateIndex(folderName, index) {
  const configFile = getConfigFilePath(folderName);
  
  try {
    const data = {
      lastTemplateIndex: index,
      lastUpdated: new Date().toISOString()
    };
    fs.writeFileSync(configFile, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error saving config file for ${folderName}:`, error);
  }
}

// 根据零件类型获取顺序模板文件
function getTemplate(remanPart) {
  // 零件类型到文件夹名称的映射
  const partTypeMapping = {
    'ALTERNATOR': 'ALTEMATOR',
    'BRAKE': 'BRAKE SYSTEM',
    'BRAKE SYSTEM': 'BRAKE SYSTEM',
    'STARTER MOTOR': 'STARTER MOTOR',
    'STARTER': 'STARTER MOTOR',
    'TURBOCHARGER': 'TURBOCHARGER'
  };
  
  // 获取对应的文件夹名称
  const folderName = partTypeMapping[remanPart.toUpperCase()] || 'ALTEMATOR';
  const templateDir = path.join(__dirname, 'template', folderName);
  
  // 检查文件夹是否存在
  if (!fs.existsSync(templateDir)) {
    throw new Error(`Template directory not found: ${templateDir}`);
  }
  
  // 如果该零件类型还没有加载模板列表，加载并排序
  if (!templateLists[folderName]) {
    const templates = fs.readdirSync(templateDir)
      .filter(file => file.endsWith('.pdf'))
      .map(file => path.join(templateDir, file))
      .sort((a, b) => {
        // 提取文件名中的数字进行数字排序
        const numA = parseInt(path.basename(a).replace('.pdf', '')) || 0;
        const numB = parseInt(path.basename(b).replace('.pdf', '')) || 0;
        return numA - numB;
      });
    
    if (templates.length === 0) {
      throw new Error(`No PDF templates found in directory: ${templateDir}`);
    }
    
    //console.log(`Loaded ${templates.length} templates for ${folderName}: ${templates.map(t => path.basename(t)).join(', ')}`);
    
    templateLists[folderName] = templates;
  }
  
  // 读取最后使用的模板编号
  const lastIndex = getLastTemplateIndex(folderName);
  
  // 使用下一个模板（循环）
  const currentIndex = (lastIndex + 1) % templateLists[folderName].length;
  const selectedTemplate = templateLists[folderName][currentIndex];
  
  //console.log(`[${remanPart}] Last used: ${lastIndex}, Next: ${currentIndex}/${templateLists[folderName].length - 1}, Selected template: ${path.basename(selectedTemplate)}`);
  
  // 保存新的模板编号
  saveLastTemplateIndex(folderName, currentIndex);
  
  return selectedTemplate;
}

// 处理数据值
function processDataValue(value) {
  if (Array.isArray(value)) {
    const nonEmptyValue = value.find(v => v !== null && v !== undefined && v !== '');
    return nonEmptyValue || value[0] || '';
  }
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

// 自动换行文本绘制函数
function drawTextWithWrap(page, text, options) {
  const { x, y, size, font, color, maxWidth = 200, lineHeight = 1.2, rotate } = options;
  
  const avgCharWidth = size * 0.6;
  const maxCharsPerLine = Math.floor(maxWidth / avgCharWidth);
  
  // 调试信息
  //console.log(`drawTextWithWrap: text="${text}", maxWidth=${maxWidth}, maxCharsPerLine=${maxCharsPerLine}`);
  
  // 对于没有空格的字符串（如cserial_no），按字符分割
  const words = text.split('');
  const lines = [];
  let currentLine = '';
  
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    
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

function formatDateTime(dateString) {
  const date = new Date(dateString);
  
  // 获取日期部分
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  
  // 随机选择一个时间段
  // 选项1: 早上9点到下午1点 (9:00 AM - 1:00 PM)
  // 选项2: 下午2点到下午5点 (2:00 PM - 5:00 PM)
  const useMorningSlot = Math.random() > 0.5;
  
  let hours, minutes, ampm;
  
  if (useMorningSlot) {
    // 早上9点到下午1点 (9 AM - 1 PM)
    // 生成 9, 10, 11, 12, 1 中的随机小时
    const hourOptions = [9, 10, 11, 12, 13]; // 13 是下午1点
    hours = hourOptions[Math.floor(Math.random() * hourOptions.length)];
    
    if (hours === 13) {
      hours = 1;
      ampm = 'PM';
    } else if (hours === 12) {
      ampm = 'PM';
    } else {
      ampm = 'AM';
    }
  } else {
    // 下午2点到下午5点 (2 PM - 5 PM)
    hours = Math.floor(Math.random() * 4) + 2; // 2, 3, 4, 5
    ampm = 'PM';
  }
  
  minutes = Math.floor(Math.random() * 60); // 0-59
  
  // 格式化为两位数
  const formattedHours = hours.toString().padStart(2, '0');
  const formattedMinutes = minutes.toString().padStart(2, '0');
  
  return `${day}/${month}/${year} ${formattedHours}:${formattedMinutes} ${ampm}`;
}

// 为job_id生成PDF文件
async function generatePDFForJob(data, jobId) {
  try {
    // 根据零件类型选择模板
    const remanPart = processDataValue(data.reman_part);
    //console.log(`\nProcessing pk=${data.pk}, remanPart=${remanPart}`);
    const templatePath = getTemplate(remanPart);
    
    // 读取PDF模板
    const templateBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(templateBytes);
    
    // 获取第一页
    const pages = pdfDoc.getPages();
    
    if (pages.length === 0) {
      throw new Error('PDF template has no pages');
    }
    
    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();
    
    // 嵌入字体
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    
    // 在第一页添加基本信息
    const partKey = remanPart.toUpperCase();

    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    if (partKey === 'ALTERNATOR') {
      firstPage.drawText(`${processDataValue(data.maker.split('/')[1])}`, {
        x:598,
        y: height - 381,
        size: 9,
        font: font,
        color: rgb(0, 0, 0)
      });

      drawTextWithWrap(firstPage,`${processDataValue(data.cserial_no)}`, {
        x: 598,
        y: height - 407,
        size: 9,
        font: font,
        color: rgb(0, 0, 0),
        maxWidth: 110,     
        lineHeight: 1
      });

    } else if (partKey === 'BRAKE SYSTEM') {
      firstPage.drawText(`${processDataValue(data.cserial_no)}`, {
        x: 262,
        y: height - 51,
        size: 10,
        font: fontBold,
        color: rgb(0, 0, 0)
      });

      firstPage.drawText(`${processDataValue(data.cserial_no)}`, {
        x: 122,
        y: height - 187,
        size: 9,
        font: fontBold,
        color: rgb(0, 0, 0)
      });

      firstPage.drawText(`${formatDateTime(data.Cat3_dt)}`, {
        x: 38,
        y: height - 746,
        size: 9,
        font: font,
        color: rgb(0, 0, 0)
      });

    } else if (partKey === 'STARTER MOTOR') {
      firstPage.drawText(`${processDataValue(data.maker.split('/')[1])}`, {
        x: 672,
        y: height - 333,
        size: 11,
        font: font,
        color: rgb(0, 0, 0)
    });

    firstPage.drawText(`${processDataValue(data.cserial_no)}`, {
        x: 672,
        y: height - 365,
        size: 11,
        font: font,
        color: rgb(0, 0, 0)
      });

    } else if (partKey === 'TURBOCHARGER') {
      firstPage.drawText(`${processDataValue(data.maker.split('/')[1])}`, {
        x: 248,
        y: height - 442,
        size: 10,
        font: font,
        color: rgb(0, 0, 0)
      });

      firstPage.drawText(`${processDataValue(data.cserial_no)}`, {
        x: 457,
        y: height - 442,
        size: 10,
        font: font,
        color: rgb(0, 0, 0)
      });

    } 

    // 保存PDF
    const pdfBytes = await pdfDoc.save();
    
     // 创建保存路径 - 和PDF文件保存在同一个文件夹
     const basePath = "V:\\REMAN";
     if (!fs.existsSync(basePath)) {
       fs.mkdirSync(basePath, { recursive: true });
     }
     
     // 使用cserial_no创建文件夹
     const chassisNo = processDataValue(data.cserial_no).trim();
     const chassisPath = path.join(basePath, chassisNo);
     if (!fs.existsSync(chassisPath)) {
       fs.mkdirSync(chassisPath, { recursive: true });
     }
     
     // 根据零件类型创建子文件夹
     const partType = processDataValue(data.reman_part);
     const partFolderPath = path.join(chassisPath, partType);
     if (!fs.existsSync(partFolderPath)) {
       fs.mkdirSync(partFolderPath, { recursive: true });
     }
     
     // 使用job_id作为文件名
     const fileName = `TR_${data.pk}.pdf`;
     const filePath = path.join(partFolderPath, fileName);
    
    // 覆盖旧的 PDF 文件：只删除以 TR_ 开头的 PDF
    try {
      if (fs.existsSync(partFolderPath)) {
        const files = fs.readdirSync(partFolderPath);
        const trPdfFiles = files.filter(file => 
          file.toUpperCase().startsWith('TR_') && 
          file.toLowerCase().endsWith('.pdf')
        );
        
        // 只删除以 TR_ 开头的 PDF 文件
        trPdfFiles.forEach(file => {
          const oldFilePath = path.join(partFolderPath, file);
          try {
            fs.unlinkSync(oldFilePath);
            //console.log(`已删除旧的 TEST REPORT PDF 文件: ${file}`);
          } catch (error) {
            console.error(`删除旧文件失败: ${file}`, error);
          }
        });
        
        if (trPdfFiles.length > 0) {
          //console.log(`已清理 ${trPdfFiles.length} 个旧的 TEST REPORT PDF 文件`);
        }
      }
    } catch (error) {
      console.error('清理旧 PDF 文件时出错:', error);
    }
    
    // 保存新文件
    fs.writeFileSync(filePath, pdfBytes);
    
    return filePath;
  } catch (error) {
    console.error('Error while generating PDF:', error);
    throw error;
  }
}


// 根据job_id和reman_part获取第一个cserial_no
async function getFirstCserialNoByJobId(jobId, remanPart) {
  try {
    const pool = await sql.connect(dbConfig);
    const result = await pool.request()
      .input('jobId', sql.VarChar, jobId)
      .input('remanPart', sql.VarChar, remanPart)
      .query(`
        SELECT TOP 1 cserial_no 
        FROM import_reman_part_ERP 
        WHERE job_id = @jobId 
        AND reman_part = @remanPart
        AND (reman_part != 'RADIATOR' AND reman_part != 'INTERCOOLER')
        ORDER BY pk ASC
      `);
    
    if (result.recordset.length > 0) {
      return result.recordset[0].cserial_no;
    }
    return null;
  } catch (error) {
    console.error('Error getting first cserial_no:', error);
    throw error;
  }
}

// 根据job_id和reman_part获取所有数据
async function getAllDataByJobId(jobId, remanPart) {
  try {
    const pool = await sql.connect(dbConfig);
    const result = await pool.request()
      .input('jobId', sql.VarChar, jobId)
      .input('remanPart', sql.VarChar, remanPart)
      .query(`
        SELECT * 
        FROM import_reman_part_ERP 
        WHERE job_id = @jobId
        AND reman_part = @remanPart
        AND (reman_part != 'RADIATOR' AND reman_part != 'INTERCOOLER')
      `);
    
    return result.recordset;
  } catch (error) {
    console.error('Error getting all data by job_id and reman_part:', error);
    throw error;
  }
}

// 处理指定job_id的所有记录
async function processRecordsByJobId(jobId, remanPartFilter = null) {
  //console.log(`processRecordsByJobId called with: jobId=${jobId}, remanPartFilter=${remanPartFilter}`);
  let pool = null;
  
  try {
    // 连接数据库
    pool = await sql.connect(dbConfig);
    
    // 获取指定job_id的记录
    const req = pool.request().input('jobId', sql.VarChar, jobId);
    let selectSql;
    
    if (remanPartFilter) {
      // 如果指定了零件类型，只查询该类型的记录
      /* selectSql = `
        SELECT * FROM import_reman_part_ERP 
        WHERE job_id = @jobId 
        AND complete_status = 1 
        AND tr_path IS NULL 
        AND reman_part = @remanPart
        AND (reman_part != 'RADIATOR' AND reman_part != 'INTERCOOLER')`;
      req.input('remanPart', sql.VarChar, remanPartFilter); */

      selectSql = `
        SELECT * FROM import_reman_part_ERP 
        WHERE job_id = @jobId 
        AND complete_status = 1
        AND reman_part = @remanPart
        AND (reman_part != 'RADIATOR' AND reman_part != 'INTERCOOLER')`;
      req.input('remanPart', sql.VarChar, remanPartFilter);
    } else {
      // 如果没有指定零件类型，使用原来的逻辑（排除RADIATOR和INTERCOOLER）
      /* selectSql = `
        SELECT * FROM import_reman_part_ERP 
        WHERE job_id = @jobId 
        AND complete_status = 1 
        AND tr_path IS NULL 
        AND reman_part = @remanPart
        AND (reman_part != 'RADIATOR' AND reman_part != 'INTERCOOLER')`; */

        selectSql = `
        SELECT * FROM import_reman_part_ERP 
        WHERE job_id = @jobId 
        AND complete_status = 1
        AND reman_part = @remanPart
        AND (reman_part != 'RADIATOR' AND reman_part != 'INTERCOOLER')`;
    }
    const result = await req.query(selectSql);
    
    if (result.recordset.length === 0) {
      //(`No records found for job_id: ${jobId}${remanPartFilter ? `, reman_part: ${remanPartFilter}` : ''}`);
      return { success: false, message: 'No records found' };
    }
    
    console.log(`Found ${result.recordset.length} records for job_id: ${jobId}${remanPartFilter ? `, reman_part: ${remanPartFilter}` : ''}`);
    //console.log(`Query used: ${selectSql}`);
    //console.log(`remanPartFilter value: ${remanPartFilter}`);
    
    // 调试：显示所有找到的记录
    if (remanPartFilter) {
      //console.log('Records found with remanPartFilter:');
      result.recordset.forEach((record, index) => {
        //console.log(`  Record ${index + 1}: pk=${record.pk}, reman_part=${record.reman_part}, cserial_no=${record.cserial_no}`);
      });
    } else {
      console.log('No remanPartFilter provided - this should not happen when called from processRecordsByJobIdAndPart');
    }
    
    // 只生成一个PDF文件，使用第一条记录的数据
    const firstRecord = result.recordset[0];
    let filePath = null;
    
    // 计算文件夹路径
    const basePath = "V:\\REMAN";
    const chassisNo = processDataValue(firstRecord.cserial_no).trim();
    const chassisPath = path.join(basePath, chassisNo);
    const partType = processDataValue(firstRecord.reman_part);
    const partFolderPath = path.join(chassisPath, partType);
    
    try {
      filePath = await generatePDFForJob(firstRecord, jobId);
      //console.log(`Successfully generated PDF: ${filePath}`);
      
      // 更新记录的tr_path为文件夹路径（不包含文件名）
      const upd = pool.request()
        .input('filePath', sql.NVarChar, partFolderPath)
        .input('jobId', sql.VarChar, jobId);
      
      let updateSql;
      if (remanPartFilter) {
        // 如果指定了零件类型，只更新该类型的那一条记录
        /* updateSql = `
          UPDATE import_reman_part_ERP 
          SET tr_path = @filePath 
          WHERE job_id = @jobId 
          AND complete_status = 1 
          AND tr_path IS NULL
          AND reman_part = @remanPart`;
        upd.input('remanPart', sql.VarChar, remanPartFilter); */

        updateSql = `
          UPDATE import_reman_part_ERP 
          SET tr_path = @filePath 
          WHERE job_id = @jobId 
          AND complete_status = 1
          AND reman_part = @remanPart`;
        upd.input('remanPart', sql.VarChar, remanPartFilter);
      } else {
        // 如果没有指定零件类型，使用原来的逻辑（排除RADIATOR和INTERCOOLER）
        /* updateSql = `
          UPDATE import_reman_part_ERP 
          SET tr_path = @filePath 
          WHERE job_id = @jobId 
          AND complete_status = 1 
          AND tr_path IS NULL
          AND reman_part = @remanPart
          AND (reman_part != 'RADIATOR' AND reman_part != 'INTERCOOLER')`; */

          updateSql = `
          UPDATE import_reman_part_ERP 
          SET tr_path = @filePath 
          WHERE job_id = @jobId 
          AND complete_status = 1
          AND reman_part = @remanPart
          AND (reman_part != 'RADIATOR' AND reman_part != 'INTERCOOLER')`;
      }
      const updateResult = await upd.query(updateSql);
      
      //console.log(`Updated ${updateResult.rowsAffected} records with tr_path`);
      //console.log(`Update SQL: ${updateSql}`);
      if (remanPartFilter) {
        //console.log(`Update parameters: jobId=${jobId}, remanPart=${remanPartFilter}, filePath=${partFolderPath}`);
      }
      
      // 返回找到的记录
      const results = result.recordset.map(record => ({
        pk: record.pk,
        cserial_no: record.cserial_no,
        filePath: partFolderPath,
        success: true
      }));
      
      return { success: true, results: results };
      
    } catch (error) {
      console.error(`Error generating PDF for job_id ${jobId}:`, error);
      return { 
        success: false, 
        error: error.message || 'PDF generation failed',
        details: error.toString()
      };
    }
    
  } catch (error) {
    console.error('Error processing records:', error);
    return { 
      success: false, 
      error: error.message || 'Database processing failed',
      details: error.toString()
    };
  } finally {
    if (pool) {
      try {
        await pool.close();
      } catch (error) {
        console.error('Error closing database connection:', error);
      }
    }
  }
}

// 仅按 job_id 与指定 reman_part 生成与更新
async function processRecordsByJobIdAndPart(jobId, remanPart) {
  //console.log(`processRecordsByJobIdAndPart called with: jobId=${jobId}, remanPart=${remanPart}`);
  return await processRecordsByJobId(jobId, remanPart);
}

// 主处理函数
async function processRecords() {
  let pool = null;
  
  try {
    // 连接数据库
    pool = await sql.connect(dbConfig);
    
    // 查询需要处理的记录
    /* const result = await pool.request().query(`
      SELECT * FROM import_reman_part_ERP 
      WHERE complete_status = 1 
      AND tr_path IS NULL 
      AND (reman_part != 'RADIATOR' AND reman_part != 'INTERCOOLER')
    `); */

    const result = await pool.request().query(`
      SELECT * FROM import_reman_part_ERP 
      WHERE complete_status = 1
      AND (reman_part != 'RADIATOR' AND reman_part != 'INTERCOOLER')
    `);
    
    if (result.recordset.length === 0) {
      //console.log('There are no records to process');
      return;
    }
    
    //console.log(`Found ${result.recordset.length} records to process`);
    
    // 处理每条记录
    for (const record of result.recordset) {
      try {
        const filePath = await generatePDFForJob(record, record.job_id); // Pass job_id to generatePDFForJob
        //console.log(`Successfully generated PDF: ${filePath}`);
      } catch (error) {
        console.error(`Error processing record ${record.pk}:`, error);
      }
      
      // 添加延迟避免处理过快
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
  } catch (error) {
    console.error('Error processing records:', error);
  } finally {
    if (pool) {
      try {
        await pool.close();
      } catch (error) {
        console.error('Error closing database connection:', error);
      }
    }
  }
}

// 自动执行函数
async function autoRun() {
  //console.log('The automatic generation of test report program has started...');
  //console.log('Press Ctrl+C to terminate the program');
  
  while (true) {
    try {
      //console.log('\n' + new Date().toLocaleString() + ' - Start processing records...');
      await processRecords();
      //console.log('\nWait 20 minutes before the next processing...');
      await new Promise(resolve => setTimeout(resolve, 20 * 60 * 1000)); // 20分钟
    } catch (error) {
      console.error('Error processing records:', error);
      console.log('Wait 20 minutes before the next processing...');
      await new Promise(resolve => setTimeout(resolve, 20 * 60 * 1000));
    }
  }
}

// 启动程序
if (require.main === module) {
  autoRun().catch(console.error);
}

module.exports = {
  processRecords,
  processRecordsByJobId,
  processRecordsByJobIdAndPart,
  generatePDFForJob,
  getTemplate,
  getFirstCserialNoByJobId,
  getAllDataByJobId
};
