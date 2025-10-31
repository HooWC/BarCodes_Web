const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const { 
  processSingleRecord,
  fillPdfForm, 
  templateMapping,
  savePdfToReman,
  PART_TYPE_MAPPING
} = require('./PDF_ERP_FILE_FOXPRO');

const {
  processRecordsByJobId,
  processRecordsByJobIdAndPart,
  getFirstCserialNoByJobId,
  getAllDataByJobId
} = require('./TEST_REPORT_FILE');

const app = express();
const PORT = process.env.PORT || 5202;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// 创建数据库连接池
let pool;

async function initializeDb() {
  try {
    pool = await new sql.ConnectionPool(dbConfig).connect();
    //console.log('Database connection pool initialized successfully');
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
}

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'PDF Generation API Service is running',
    timestamp: new Date().toISOString()
  });
});

// 获取支持的模板列表
app.get('/templates', (req, res) => {
  res.json({
    success: true,
    templates: Object.keys(templateMapping),
    message: 'Supported part type templates'
  });
});

// 条码查询端点：根据 cserial_no 返回六个模板是否已存在
app.post('/itx-barcode-data', async (req, res) => {
  const cserial_no = (req.body && req.body.cserial_no) || req.query.cserial_no;

  if (!cserial_no) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameter',
      message: 'Please provide cserial_no as query parameter'
    });
  }

  const allowedParts = [
    'ALTERNATOR',
    'BRAKE SYSTEM',
    'INTERCOOLER',
    'RADIATOR',
    'STARTER MOTOR',
    'TURBOCHARGER'
  ];

  try {
    const request = pool.request();
    request.input('cserial_no', sql.VarChar, cserial_no);

    // 先查询 dsoi 表，确认是否存在该 chassis no
    const dsoiQuery = `
      SELECT * FROM dsoi
      WHERE cserial_no = @cserial_no
    `;
    
    const dsoiResult = await request.query(dsoiQuery);
    
    // 如果 dsoi 表中没有找到，返回错误
    if (!dsoiResult.recordset || dsoiResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Chassis number not found',
        message: `Cannot find this chassis no: ${cserial_no}`,
        cserial_no: cserial_no
      });
    }

    // 如果找到了，继续查询 import_reman_part_ERP
    const query = `
      SELECT DISTINCT reman_part
      FROM import_reman_part_ERP
      WHERE cserial_no = @cserial_no
    `;

    const result = await request.query(query);
    const presentPartsSet = new Set(
      (result.recordset || [])
        .map(r => (r.reman_part || '').toString().trim().toUpperCase())
    );

    const parts = allowedParts.map(name => ({
      name,
      exists: presentPartsSet.has(name)
    }));

    res.json({
      success: true,
      cserial_no,
      total_found: parts.filter(p => p.exists).length,
      existing: parts.filter(p => p.exists).map(p => p.name),
      missing: parts.filter(p => !p.exists).map(p => p.name),
      parts
    });
  } catch (error) {
    console.error('Error querying barcode data:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Error occurred while querying barcode data'
    });
  }
});

// 主要的PDF生成端点
app.post('/generate-pdf', async (req, res) => {
  const { cserial_no, reman_part } = req.body;
  
  // 参数验证
  if (!cserial_no || !reman_part) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameters',
      message: 'Please provide cserial_no and reman_part parameters',
      required_params: ['cserial_no', 'reman_part']
    });
  }

  //console.log(`\n=== New PDF Generation Request ===`);
  //console.log(`Chassis No: ${cserial_no}`);
  //console.log(`Part Type: ${reman_part}`);
  //console.log(`Request Time: ${new Date().toISOString()}`);

  try {
    // 查询数据库
    //console.log('Querying database...');
    const query = `
      SELECT TOP 1 * FROM import_reman_part_ERP 
      WHERE cserial_no = @cserial_no 
      AND reman_part = @reman_part
      ORDER BY pk DESC
    `;
    
    const request = pool.request();
    request.input('cserial_no', sql.VarChar, cserial_no);
    request.input('reman_part', sql.VarChar, reman_part);
    
    const result = await request.query(query);
    
    if (result.recordset.length === 0) {
      console.log('No matching records found');
      return res.status(404).json({
        success: false,
        error: 'Record not found',
        message: `No record found with chassis number ${cserial_no} and part type ${reman_part}`,
        query_params: { cserial_no, reman_part }
      });
    }

    //console.log(`Found ${result.recordset.length} matching records`);
    
    // 处理第一条记录（如果有多条记录）
    const data = result.recordset[0];
    //console.log(`Processing record: Job ID = ${data.job_id}`);
    
    // 检查是否支持该零件类型的模板
    if (!templateMapping[reman_part.toUpperCase()]) {
      //console.log(`Unsupported part type: ${reman_part}`);
      return res.status(400).json({
        success: false,
        error: 'Unsupported part type',
        message: `Part type ${reman_part} has no corresponding PDF template`,
        supported_types: Object.keys(templateMapping)
      });
    }

    // 生成PDF
    //console.log('Starting PDF generation...');
    const success = await processSingleRecord(data, 1, 1);
    
    if (success) {
      //console.log('PDF generated successfully');
      
      // 构建文件路径信息
      const cleanChassisNo = cserial_no.replace(/\*/g, "").trim();
      const folderName = PART_TYPE_MAPPING[reman_part.toUpperCase()] || reman_part;
      const filePath = `V:\\REMAN\\${cleanChassisNo}\\${folderName}`;
      
      res.json({
        success: true,
        message: 'PDF generated successfully',
        data: {
          job_id: data.job_id,
          cserial_no: data.cserial_no,
          reman_part: data.reman_part,
          file_path: filePath,
          generated_at: new Date().toISOString()
        }
      });
    } else {
      console.log('PDF generation failed');
      res.status(500).json({
        success: false,
        error: 'PDF generation failed',
        message: 'Unknown error occurred while processing record'
      });
    }

  } catch (error) {
    console.error('Error during PDF generation:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Error occurred while processing request',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// 批量生成PDF端点
app.post('/generate-pdf-batch', async (req, res) => {
  const { records } = req.body;
  
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request format',
      message: 'Please provide records array containing cserial_no and reman_part'
    });
  }

  const results = [];
  let successCount = 0;
  let failCount = 0;

  try {
    for (let i = 0; i < records.length; i++) {
      const { cserial_no, reman_part } = records[i];

      try {
        const query = `
          SELECT * FROM import_reman_part_ERP 
          WHERE cserial_no = @cserial_no AND reman_part = @reman_part
        `;
        
        const request = pool.request();
        request.input('cserial_no', sql.VarChar, cserial_no);
        request.input('reman_part', sql.VarChar, reman_part);
        
        const result = await request.query(query);
        
        if (result.recordset.length === 0) {
          results.push({
            index: i + 1,
            cserial_no,
            reman_part,
            success: false,
            error: 'Record not found'
          });
          failCount++;
          continue;
        }

        const data = result.recordset[0];
        const success = await processSingleRecord(data, i + 1, records.length);
        
        if (success) {
          const cleanChassisNo = cserial_no.replace(/\*/g, "").trim();
          const folderName = PART_TYPE_MAPPING[reman_part.toUpperCase()] || reman_part;
          const filePath = `V:\\REMAN\\${cleanChassisNo}\\${folderName}`;
          
          results.push({
            index: i + 1,
            cserial_no,
            reman_part,
            job_id: data.job_id,
            success: true,
            file_path: filePath
          });
          successCount++;
        } else {
          results.push({
            index: i + 1,
            cserial_no,
            reman_part,
            success: false,
            error: 'PDF generation failed'
          });
          failCount++;
        }

      } catch (error) {
        console.error(`Error processing record ${i + 1}:`, error);
        results.push({
          index: i + 1,
          cserial_no,
          reman_part,
          success: false,
          error: error.message
        });
        failCount++;
      }

      // 添加延迟避免处理过快
      if (i < records.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    //console.log(`\n=== Batch Processing Completed ===`);
    //console.log(`Success: ${successCount}, Failed: ${failCount}, Total: ${records.length}`);

    res.json({
      success: true,
      message: 'Batch processing completed',
      summary: {
        total: records.length,
        success: successCount,
        failed: failCount
      },
      results: results
    });

  } catch (error) {
    console.error('Error during batch processing:', error);
    res.status(500).json({
      success: false,
      error: 'Batch processing failed',
      message: error.message
    });
  }
});

// 错误处理中间件
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Server internal error',
    message: 'Unknown error occurred while processing request'
  });
});

// Test Report API端点 - 根据job_id生成测试报告
app.post('/generate-test-report', async (req, res) => {
  const { job_id, reman_part } = req.body;
  
  // 参数验证
  if (!job_id) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameter',
      message: 'Please provide job_id parameter'
    });
  }
  if (reman_part) {
    //console.log(`Part Type: ${reman_part}`);
  }
  //console.log(`Request Time: ${new Date().toISOString()}`);

  try {
    // 验证reman_part参数
    if (!reman_part) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter',
        message: 'Please provide both job_id and reman_part parameters'
      });
    }

    // 获取第一个cserial_no
    const firstCserialNo = await getFirstCserialNoByJobId(job_id, reman_part);
    
    if (!firstCserialNo) {
      return res.status(404).json({
        success: false,
        error: 'No records found',
        message: `No records found with job_id: ${job_id} and reman_part: ${reman_part}`
      });
    }

    //console.log(`First cserial_no: ${firstCserialNo}`);

    // 处理该job_id和reman_part的记录
    const result = await processRecordsByJobIdAndPart(job_id, reman_part);
    
    if (result.success) {
      res.json({
        success: true,
        message: reman_part ? `Test report generation completed for ${reman_part}` : 'Test report generation completed',
        data: {
          job_id: job_id,
          reman_part: reman_part || null,
          first_cserial_no: firstCserialNo,
          total_processed: result.results.length,
          successful: result.results.filter(r => r.success).length,
          failed: result.results.filter(r => !r.success).length,
          results: result.results
        }
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Test report generation failed',
        message: result.error || 'Unknown error occurred',
        details: result.details || 'No additional details available'
      });
    }

  } catch (error) {
    console.error('Error during test report generation:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Error occurred while processing request'
    });
  }
});

// Test Report API端点 - 根据job_id和reman_part生成特定零件类型的测试报告
app.post('/generate-test-report-by-part', async (req, res) => {
  const { job_id, reman_part } = req.body;
  
  // 参数验证
  if (!job_id || !reman_part) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameters',
      message: 'Please provide job_id and reman_part parameters',
      required_params: ['job_id', 'reman_part']
    });
  }

  try {
    // 获取第一个cserial_no
    const firstCserialNo = await getFirstCserialNoByJobId(job_id, reman_part);
    
    if (!firstCserialNo) {
      return res.status(404).json({
        success: false,
        error: 'No records found',
        message: `No records found with job_id: ${job_id} and reman_part: ${reman_part}`
      });
    }

    //console.log(`First cserial_no: ${firstCserialNo}`);

    // 处理该job_id和reman_part的记录
    const result = await processRecordsByJobIdAndPart(job_id, reman_part);
    
    if (result.success) {
      res.json({
        success: true,
        message: `Test report generation completed for ${reman_part}`,
        data: {
          job_id: job_id,
          reman_part: reman_part,
          first_cserial_no: firstCserialNo,
          total_processed: result.results.length,
          successful: result.results.filter(r => r.success).length,
          failed: result.results.filter(r => !r.success).length,
          results: result.results
        }
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Test report generation failed',
        message: result.error || 'Unknown error occurred',
        details: result.details || 'No additional details available'
      });
    }

  } catch (error) {
    console.error('Error during test report generation:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// 获取job_id和reman_part的第一个cserial_no
app.get('/get-first-cserial/:job_id/:reman_part', async (req, res) => {
  const { job_id, reman_part } = req.params;
  
  try {
    const firstCserialNo = await getFirstCserialNoByJobId(job_id, reman_part);
    
    if (firstCserialNo) {
      res.json({
        success: true,
        data: {
          job_id: job_id,
          reman_part: reman_part,
          first_cserial_no: firstCserialNo
        }
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'No records found',
        message: `No records found with job_id: ${job_id} and reman_part: ${reman_part}`
      });
    }
  } catch (error) {
    console.error('Error getting first cserial_no:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// 获取job_id和reman_part的所有数据
app.get('/get-job-data/:job_id/:reman_part', async (req, res) => {
  const { job_id, reman_part } = req.params;
  
  try {
    const allData = await getAllDataByJobId(job_id, reman_part);
    
    if (allData.length > 0) {
      res.json({
        success: true,
        data: {
          job_id: job_id,
          reman_part: reman_part,
          total_records: allData.length,
          records: allData
        }
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'No records found',
        message: `No records found with job_id: ${job_id} and reman_part: ${reman_part}`
      });
    }
  } catch (error) {
    console.error('Error getting job data:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

// 404 处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    message: `Path ${req.method} ${req.path} does not exist`,
    available_endpoints: [
      'GET /health',
      'GET /templates', 
      'POST /itx-barcode-data',
      'POST /generate-pdf',
      'POST /generate-pdf-batch',
      'POST /generate-test-report',
      'POST /generate-test-report-by-part',
      'GET /get-first-cserial/:job_id/:reman_part',
      'GET /get-job-data/:job_id/:reman_part'
    ]
  });
});

// 启动服务器
async function startServer() {
  try {
    // 初始化数据库连接
    await initializeDb();
    
    // 启动HTTP服务器
    app.listen(PORT, () => {
      //console.log(`\n=== PDF Generation API Server Started Successfully ===`);
      console.log(`Port: ${PORT}`);
      //console.log(`Health check: http://localhost:${PORT}/health`);
      //console.log(`Supported templates: http://localhost:${PORT}/templates`);
      //console.log(`Main endpoint: POST http://localhost:${PORT}/generate-pdf`);
      //console.log(`Batch endpoint: POST http://localhost:${PORT}/generate-pdf-batch`);
      //console.log(`Start time: ${new Date().toISOString()}`);
      //console.log(`==============================\n`);
    });

  } catch (error) {
    console.error('Server startup failed:', error);
    process.exit(1);
  }
}

// 优雅关闭
process.on('SIGINT', async () => {
  //console.log('\nShutting down server...');
  if (pool) {
    await pool.close();
    //console.log('Database connection pool closed');
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  //console.log('\nReceived termination signal, shutting down server...');
  if (pool) {
    await pool.close();
    //console.log('Database connection pool closed');
  }
  process.exit(0);
});

// 启动服务器
if (require.main === module) {
  startServer().catch(console.error);
}

module.exports = app;