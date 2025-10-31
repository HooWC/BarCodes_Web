let html5QrcodeScanner = null;

        const startBtn = document.getElementById('startBtn');
        const stopBtn = document.getElementById('stopBtn');
        const resultDiv = document.getElementById('result');
        const manualInput = document.getElementById('manualCserial');
        const manualSubmit = document.getElementById('manualSubmit');

        async function goWithCserial(cserial){
            const val = (cserial || '').trim();
            if (!val) return;
            try {
                if (html5QrcodeScanner) {
                    await html5QrcodeScanner.stop().catch(() => {});
                    startBtn.disabled = false;
                    stopBtn.disabled = true;
                }
                const resp = await fetch('http://localhost:5202/itx-barcode-data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cserial_no: val })
                });
                const data = await resp.json();
                if (!resp.ok || (data && !data.success)) {
                    if (resp.status === 404 || (data && data.error === 'Chassis number not found')) {
                        alert(data.message || `Cannot find this chassis no: ${val}`);
                        return;
                    }
                    throw new Error(data.message || `API error ${resp.status}`);
                }
                sessionStorage.setItem('itxBarcodeResult', JSON.stringify(data));
                sessionStorage.setItem('itxCserialNo', val);
                window.location.href = './views/turnPage.html';
            } catch (err) {
                console.error(err);
                alert(err.message || 'Template status query failed, please try again.');
            }
        }

        // 扫描成功回调
        function onScanSuccess(decodedText, decodedResult) {
            console.log(`扫描成功: ${decodedText}`, decodedResult);
            
            // 显示结果
            if (resultDiv) {
                resultDiv.className = 'success-result';
                resultDiv.textContent = decodedText;
            }

            // 使用扫描到的序列号前进
            goWithCserial(decodedText);
        }

        // 扫描失败回调
        function onScanError(error) {
            console.error('扫描失败:', error);
            if (resultDiv) {
                resultDiv.className = 'error-result';
                resultDiv.textContent = error.message;
            }
        }

        // 手动提交
        if (manualSubmit) {
            manualSubmit.addEventListener('click', function(e){
                e.preventDefault();
                const val = manualInput ? manualInput.value : '';
                goWithCserial(val);
            });
        }
        if (manualInput) {
            manualInput.addEventListener('keydown', function(e){
                if (e.key === 'Enter') {
                    e.preventDefault();
                    goWithCserial(manualInput.value);
                }
            });
        }

        // 开始扫描按钮点击事件
        if (startBtn) {
            startBtn.addEventListener('click', function() {
                // 确保存在扫码容器
                let readerEl = document.getElementById('reader');
                if (!readerEl) {
                    readerEl = document.createElement('div');
                    readerEl.id = 'reader';
                    document.querySelector('.scanner-container')?.appendChild(readerEl);
                }
                html5QrcodeScanner = new Html5Qrcode('reader');
                
                const rect = readerEl.getBoundingClientRect();
                const width = Math.floor(rect.width || 0);
                const height = Math.floor(rect.height || 0);
                const fallbackWidth = 480;
                const fallbackHeight = 320;
                const useFallback = width < 50 || height < 50;
                const cfgWidth = useFallback ? fallbackWidth : width;
                const cfgHeight = useFallback ? fallbackHeight : height;
                const config = {
                    fps: 10,
                    qrbox: { width: cfgWidth, height: cfgHeight },
                    aspectRatio: cfgWidth / Math.max(1, cfgHeight)
                };

                // 启动相机扫描
                html5QrcodeScanner.start(
                    { facingMode: "environment" },
                    config,
                    onScanSuccess,
                    onScanError
                ).then(() => {
                    startBtn.disabled = true;
                    stopBtn.disabled = false;
                    if (resultDiv) {
                        resultDiv.className = 'no-result';
                        resultDiv.textContent = 'Scanning...';
                    }
                }).catch(err => {
                    alert(`Cannot start camera: ${err}`);
                    console.error('Camera start failed:', err, 'config used:', config);
                });
            });
        }