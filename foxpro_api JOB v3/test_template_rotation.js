const fs = require('fs');
const path = require('path');

// 测试所有零件类型的模板轮换功能
function testAllPartTypes() {
  //console.log('=== 测试所有零件类型的模板轮换功能 ===\n');
  
  const configDir = './config';
  
  // 确保配置文件夹存在
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
    //console.log('创建配置文件夹: ./config');
  }
  
  // 零件类型到文件夹名称的映射
  const partTypes = [
    { name: 'ALTEMATOR', mapping: 'ALTEMATOR' },
    { name: 'BRAKE SYSTEM', mapping: 'BRAKE SYSTEM' },
    { name: 'STARTER MOTOR', mapping: 'STARTER MOTOR' },
    { name: 'TURBOCHARGER', mapping: 'TURBOCHARGER' }
  ];
  
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
        console.error(`Error reading config file:`, error);
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
      console.error(`Error saving config file:`, error);
    }
  }
  
  // 从实际文件夹加载模板列表
  function loadTemplateList(folderName) {
    const templateDir = path.join(__dirname, 'template', folderName);
    
    if (!fs.existsSync(templateDir)) {
      throw new Error(`Template directory not found: ${templateDir}`);
    }
    
    const templates = fs.readdirSync(templateDir)
      .filter(file => file.endsWith('.pdf'))
      .map(file => path.join(templateDir, file))
      .sort((a, b) => {
        const numA = parseInt(path.basename(a).replace('.pdf', '')) || 0;
        const numB = parseInt(path.basename(b).replace('.pdf', '')) || 0;
        return numA - numB;
      });
    
    return templates.map(t => path.basename(t));
  }
  
  // 对每个零件类型进行测试
  for (const partType of partTypes) {
    //console.log(`\n--- 测试 ${partType.name} ---`);
    
    // 从实际文件夹加载模板列表
    const templateList = loadTemplateList(partType.mapping);
    //console.log(`加载了 ${templateList.length} 个模板: ${templateList.join(', ')}`);
    
    // 执行5次调用来测试轮换
    //console.log(`执行5次调用测试:`);
    for (let i = 1; i <= 5; i++) {
      // 读取最后使用的模板编号
      const lastIndex = getLastTemplateIndex(partType.mapping);
      
      // 使用下一个模板（循环）
      const currentIndex = (lastIndex + 1) % templateList.length;
      const selectedTemplate = templateList[currentIndex];
      
      //console.log(`  调用 ${i}: 索引 ${lastIndex} → ${currentIndex}, 选择: ${selectedTemplate}`);
      
      // 保存新的模板编号
      saveLastTemplateIndex(partType.mapping, currentIndex);
    }
    
    // 显示配置文件
    const configFile = getConfigFilePath(partType.mapping);
    if (fs.existsSync(configFile)) {
      const data = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      //console.log(`  配置文件内容: ${JSON.stringify(data, null, 2)}`);
    }
  }
  
  //console.log('\n=== 测试完成 ===');
  //console.log(`\n配置文件保存在: ${path.resolve(configDir)}`);
  
  // 列出所有创建的配置文件
  const configFiles = fs.readdirSync(configDir).filter(file => file.endsWith('.json'));
  //console.log(`\n创建的配置文件:`);
  configFiles.forEach(file => {
    //console.log(`  - ${file}`);
  });
}

// 运行测试
if (require.main === module) {
  testAllPartTypes();
}

module.exports = { testAllPartTypes };
