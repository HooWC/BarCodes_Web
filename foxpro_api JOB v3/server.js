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

// 登录端点
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameters',
      message: 'Please provide email and password'
    });
  }

  // 固定密码
  const fixedPassword = 'itxerp';

  // 验证密码
  if (password !== fixedPassword) {
    return res.status(401).json({
      success: false,
      error: 'Invalid credentials',
      message: 'Invalid email or password'
    });
  }

  try {
    const request = pool.request();
    request.input('email', sql.VarChar, email);

    // 查询 ITX_User 表
    const query = `
      SELECT * FROM ITX_User
      WHERE Login = @email
    `;

    const result = await request.query(query);

    // 如果找不到用户
    if (!result.recordset || result.recordset.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials',
        message: 'Invalid email or password'
      });
    }

    // 登录成功
    const user = result.recordset[0];
    res.json({
      success: true,
      message: 'Login successful',
      user: {
        email: user.Login,
        // 可以添加其他用户信息
      }
    });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Error occurred during login'
    });
  }
});

// 获取用户信息端点
app.post('/get-user-info', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameter',
      message: 'Please provide email'
    });
  }

  try {
    const request = pool.request();
    request.input('email', sql.VarChar, email);

    // 查询 ITX_User 表
    const query = `
      SELECT * FROM ITX_User
      WHERE Login = @email
    `;

    const result = await request.query(query);

    // 如果找不到用户
    if (!result.recordset || result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        message: `User with email ${email} not found`
      });
    }

    // 返回用户信息
    const user = result.recordset[0];
    res.json({
      success: true,
      user: {
        email: user.Login || '',
        name: user.Name || '',
        manager: user.Manager || ''
      }
    });
  } catch (error) {
    console.error('Error getting user info:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message || 'Error occurred while getting user info'
    });
  }
});

// 新增：提交清单端点
app.post('/submit-checklist', async (req, res) => {
  const body = req.body || {};
  const {
    job_id,
    cserial_no,
    reman_part,              // 例如 'ALTERNATOR'
    date_in,                 // Date_In (YYYY-MM-DD)
    date_out,                // Date_Out (YYYY-MM-DD)
    operator_name,           // OperatorNM
    supervisor_name,         // SupervisorNM
    section1_dates = [],     // 第一部分所有日期数组（字符串）
    section2_dates = [],     // 第二部分所有日期数组
    section3_dates = [],     // 第三部分所有日期数组
    section1_radios = [],    // 第一部分所有 pass/fail 数组
    section2_radios = [],    // 第二部分所有 pass/fail 数组
    section3_radios = [],    // 第三部分所有 pass/fail 数组
    remarks = []             // remark 文本数组（按顺序）
  } = body;

  if (!cserial_no || !reman_part) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameters',
      message: 'cserial_no and reman_part are required'
    });
  }

  try {
    const request = pool.request();
    request.input('cserial_no', sql.VarChar, cserial_no);

    // 取 dsoi 的 make 与 mgroup_id 以及 job_id
    const dsoiQuery = `SELECT TOP 1 job_id, make, mgroup_id FROM dsoi WHERE cserial_no = @cserial_no`;
    const dsoiResult = await request.query(dsoiQuery);
    if (!dsoiResult.recordset || dsoiResult.recordset.length === 0) {
      return res.status(400).json({ success: false, error: 'Invalid cserial_no', message: 'dsoi not found for given cserial_no' });
    }
    const { job_id: dsoi_job_id, make, mgroup_id } = dsoiResult.recordset[0];
    const finalJobId = job_id || dsoi_job_id || null;
    if (!finalJobId) {
      return res.status(400).json({ success: false, error: 'Missing job_id', message: 'job_id not found in dsoi' });
    }
    const makeTrim = (make || '').trim();
    const mgroupTrim = (mgroup_id || '').trim();
    const maker = `${makeTrim}/${mgroupTrim}`;

    // 取 partno
    const partnoReq = pool.request();
    partnoReq.input('mgroup_id', sql.VarChar, mgroupTrim);
    partnoReq.input('reman_part', sql.VarChar, reman_part);
    const partnoQuery = `SELECT TOP 1 partno FROM mmgroup_partno WHERE mgroup_id = @mgroup_id AND reman_part = @reman_part`;
    const partnoRes = await partnoReq.query(partnoQuery);
    const partno = (partnoRes.recordset && partnoRes.recordset[0] && partnoRes.recordset[0].partno) || null;

    // 生成下一个 wo_no（格式 WH/MO_E/101xxxxx）
    const woReq = pool.request();
    const lastWoQuery = `
      SELECT TOP 1 wo_no FROM import_reman_part_ERP
      WHERE wo_no LIKE 'WH/MO_E/101%'
      ORDER BY CASE WHEN ISNUMERIC(RIGHT(wo_no, 8)) = 1 THEN CAST(RIGHT(wo_no, 8) AS INT) ELSE 0 END DESC
    `;
    const lastWoRes = await woReq.query(lastWoQuery);
    let nextWo = 'WH/MO_E/10100001';
    if (lastWoRes.recordset && lastWoRes.recordset.length > 0) {
      const last = lastWoRes.recordset[0].wo_no || 'WH/MO_E/10100000';
      const num = parseInt(last.slice(-8), 10) || 0;
      const newNum = (num + 1).toString().padStart(8, '0');
      nextWo = `WH/MO_E/101${newNum}`;
    }

    // 计算 Cat 状态与日期
    const toDate = (s) => (s ? new Date(s) : null);
    const maxDate = (arr) => {
      const ds = arr.map(toDate).filter(Boolean);
      if (ds.length === 0) return null;
      return new Date(Math.max.apply(null, ds));
    };
    const fmtDateTime = (d) => d ? new Date(d) : null;

    const Cat1_dt = maxDate(section1_dates);
    const Cat2_dt = maxDate(section2_dates);
    const Cat3_dt = maxDate(section3_dates);

    const anyFail = (arr) => (arr || []).some(v => (v || '').toLowerCase() === 'fail');
    const allPassOrEmpty = (arr) => (arr || []).length > 0 && (arr || []).every(v => (v || '').toLowerCase() === 'pass');

    const Cat1_Status = allPassOrEmpty(section1_radios) && !anyFail(section1_radios) ? 1 : 0; // bit
    const Cat2_Status = allPassOrEmpty(section2_radios) && !anyFail(section2_radios) ? 1 : 0; // bit
    const Cat3_Status = !anyFail(section3_radios) && (section3_radios || []).length > 0 ? 'OK' : 'NG';

    // Remarks 映射到 Rem1..Rem27
    const remCols = {};
    for (let i = 1; i <= 27; i++) {
      remCols[`Rem${i}`] = remarks[i - 1] || null;
    }

    // 插入 import_reman_part_ERP
    const insReq = pool.request();
    insReq.input('job_id', sql.VarChar, finalJobId);
    insReq.input('cserial_no', sql.VarChar, cserial_no);
    insReq.input('reman_part', sql.VarChar, reman_part);
    insReq.input('complete_status', sql.VarChar, '1');
    insReq.input('completedt', sql.DateTime, fmtDateTime(date_out));
    insReq.input('wo_no', sql.VarChar, nextWo);
    insReq.input('maker', sql.VarChar, maker);
    insReq.input('partno', sql.VarChar, partno);
    insReq.input('OperatorNM', sql.VarChar, operator_name || null);
    insReq.input('SupervisorNM', sql.VarChar, supervisor_name || null);
    insReq.input('Date_In', sql.DateTime, fmtDateTime(date_in));
    insReq.input('Date_Out', sql.DateTime, fmtDateTime(date_out));
    insReq.input('Cat1_dt', sql.DateTime, Cat1_dt);
    insReq.input('Cat1_Status', sql.Bit, Cat1_Status);
    insReq.input('Cat2_dt', sql.DateTime, Cat2_dt);
    insReq.input('Cat2_Status', sql.Bit, Cat2_Status);
    insReq.input('Cat3_dt', sql.DateTime, Cat3_dt);
    insReq.input('Cat3_Status', sql.VarChar, Cat3_Status);
    insReq.input('file_path', sql.NVarChar, null);
    insReq.input('tr_path', sql.NVarChar, null);

    for (let i = 1; i <= 27; i++) {
      insReq.input(`Rem${i}`, sql.NVarChar, remCols[`Rem${i}`]);
    }

    const insertSql = `
      INSERT INTO import_reman_part_ERP (
        job_id, cserial_no, reman_part, complete_status, completedt,
        wo_no, maker, partno,
        OperatorNM, SupervisorNM,
        Date_In, Date_Out,
        Cat1_dt, Cat1_Status,
        Cat2_dt, Cat2_Status,
        Cat3_dt, Cat3_Status,
        Rem1, Rem2, Rem3, Rem4, Rem5, Rem6, Rem7, Rem8, Rem9, Rem10,
        Rem11, Rem12, Rem13, Rem14, Rem15, Rem16, Rem17, Rem18, Rem19, Rem20,
        Rem21, Rem22, Rem23, Rem24, Rem25, Rem26, Rem27,
        file_path, tr_path
      ) VALUES (
        @job_id, @cserial_no, @reman_part, @complete_status, @completedt,
        @wo_no, @maker, @partno,
        @OperatorNM, @SupervisorNM,
        @Date_In, @Date_Out,
        @Cat1_dt, @Cat1_Status,
        @Cat2_dt, @Cat2_Status,
        @Cat3_dt, @Cat3_Status,
        @Rem1, @Rem2, @Rem3, @Rem4, @Rem5, @Rem6, @Rem7, @Rem8, @Rem9, @Rem10,
        @Rem11, @Rem12, @Rem13, @Rem14, @Rem15, @Rem16, @Rem17, @Rem18, @Rem19, @Rem20,
        @Rem21, @Rem22, @Rem23, @Rem24, @Rem25, @Rem26, @Rem27,
        @file_path, @tr_path
      );
    `;

    await insReq.query(insertSql);

    // 异步生成 PDF 与 测试报告（不阻塞响应）
    (async () => {
      try {
        const getReq = pool.request();
        getReq.input('cserial_no', sql.VarChar, cserial_no);
        getReq.input('reman_part', sql.VarChar, reman_part);
        const getSql = `SELECT TOP 1 * FROM import_reman_part_ERP WHERE cserial_no=@cserial_no AND reman_part=@reman_part ORDER BY pk DESC`;
        const getRes = await getReq.query(getSql);
        if (getRes.recordset && getRes.recordset[0]) {
          const dataRow = getRes.recordset[0];
          try { await processSingleRecord(dataRow, 1, 1); } catch (e) { console.error('generate-pdf (async) failed:', e); }
        }
      } catch (e) { console.error('post-insert fetch for pdf failed:', e); }

      try {
        if (finalJobId) {
          await processRecordsByJobIdAndPart(finalJobId, reman_part);
        }
      } catch (e) { console.error('generate-test-report (async) failed:', e); }
    })();

    return res.status(200).json({ success: true, message: 'Checklist saved', wo_no: nextWo, job_id: finalJobId });
  } catch (error) {
    console.error('Error submitting checklist:', error);
    return res.status(500).json({ success: false, error: 'Internal server error', message: error.message || 'Submit failed' });
  }
});

// 获取清单记录端点
app.post('/get-checklist', async (req, res) => {
  const { cserial_no, reman_part } = req.body || {};
  if (!cserial_no || !reman_part) {
    return res.status(400).json({ success: false, error: 'Missing parameters', message: 'cserial_no and reman_part are required' });
  }
  try {
    const request = pool.request();
    request.input('cserial_no', sql.VarChar, cserial_no);
    request.input('reman_part', sql.VarChar, reman_part);
    const query = `
      SELECT TOP 1 * FROM import_reman_part_ERP
      WHERE cserial_no = @cserial_no AND reman_part = @reman_part
      ORDER BY pk DESC
    `;
    const result = await request.query(query);
    if (!result.recordset || result.recordset.length === 0) {
      return res.status(404).json({ success: false, error: 'Not found', message: 'No checklist found' });
    }
    return res.json({ success: true, record: result.recordset[0] });
  } catch (e) {
    console.error('Error get-checklist:', e);
    return res.status(500).json({ success: false, error: 'Internal server error', message: e.message || 'Failed to get checklist' });
  }
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
      'POST /login',
      'POST /get-user-info',
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